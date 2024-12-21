// External imports with version specifications
import axios, { AxiosInstance } from 'axios'; // ^1.5.0
import FormData from 'form-data'; // ^4.0.0
import { createHash } from 'crypto'; // built-in
import { Readable } from 'stream'; // built-in

// Internal imports
import { ConnectionModel, ConnectionStatus } from '../models/connection.model';
import { ServiceType } from '../config/integrations';

/**
 * Interface representing cloud storage file metadata with enhanced properties
 */
export interface StorageFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  checksum: string;
  createdAt: Date;
  modifiedAt: Date;
  path: string;
  tags: Record<string, string>;
  permissions: string[];
}

/**
 * Interface for configuring storage operations with advanced options
 */
export interface StorageOperationOptions {
  folderId?: string;
  recursive?: boolean;
  pageSize?: number;
  pageToken?: string;
  includeTrash?: boolean;
  chunkSize?: number;
  encryption?: boolean;
  tags?: Record<string, string>;
}

/**
 * Constants for storage operations with enterprise-grade configurations
 */
const STORAGE_CONSTANTS = {
  MAX_FILE_SIZE: 1073741824, // 1GB
  DEFAULT_CHUNK_SIZE: 8388608, // 8MB
  MAX_RETRIES: 3,
  RATE_LIMIT_WINDOW: 3600000, // 1 hour in ms
  RATE_LIMIT_MAX_REQUESTS: 1000,
  ALLOWED_MIME_TYPES: ['*'],
  API_TIMEOUT: 300000, // 5 minutes
  UPLOAD_TIMEOUT: 3600000, // 1 hour
} as const;

/**
 * Enhanced cloud storage service integration with advanced features
 */
export class StorageConnector {
  private readonly axiosInstance: AxiosInstance;
  private rateLimitWindow: number = 0;
  private requestCount: number = 0;

  constructor(
    private readonly connection: ConnectionModel,
    private readonly retryDelay: number = 1000
  ) {
    if (connection.serviceType !== ServiceType.CLOUD_STORAGE) {
      throw new Error('Invalid service type for storage connector');
    }

    this.axiosInstance = axios.create({
      timeout: STORAGE_CONSTANTS.API_TIMEOUT,
      maxContentLength: STORAGE_CONSTANTS.MAX_FILE_SIZE,
      validateStatus: (status) => status < 500,
    });

    // Configure request interceptors
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        await this.checkRateLimit();
        await this.connection.validateCredentials();
        
        if (this.connection.status !== ConnectionStatus.CONNECTED) {
          throw new Error(`Connection is not active: ${this.connection.status}`);
        }

        config.headers.Authorization = `Bearer ${this.connection.credentials.accessToken}`;
        return config;
      }
    );

    // Configure response interceptors
    this.axiosInstance.interceptors.response.use(
      async (response) => {
        await this.updateRateLimits(response);
        return response;
      },
      async (error) => {
        if (error.response?.status === 429) {
          await this.handleRateLimit(error.response);
        }
        throw error;
      }
    );
  }

  /**
   * Enhanced file upload with streaming and chunking support
   */
  async uploadFile(
    fileData: Buffer | Readable,
    fileName: string,
    options: StorageOperationOptions = {}
  ): Promise<StorageFile> {
    try {
      // Validate file size and generate checksum
      const fileSize = Buffer.isBuffer(fileData) ? fileData.length : 
        (fileData as any).readableLength;
      
      if (fileSize > STORAGE_CONSTANTS.MAX_FILE_SIZE) {
        throw new Error('File size exceeds maximum allowed size');
      }

      const checksum = await this.calculateChecksum(fileData);
      const chunkSize = options.chunkSize || STORAGE_CONSTANTS.DEFAULT_CHUNK_SIZE;

      // Initialize upload session for large files
      const sessionUrl = await this.initializeUploadSession(fileName, fileSize);
      let uploadedBytes = 0;

      // Stream file in chunks
      while (uploadedBytes < fileSize) {
        const chunk = Buffer.isBuffer(fileData) ?
          fileData.slice(uploadedBytes, uploadedBytes + chunkSize) :
          await this.readChunk(fileData, chunkSize);

        await this.uploadChunk(sessionUrl, chunk, uploadedBytes, fileSize);
        uploadedBytes += chunk.length;
      }

      // Finalize upload and get file metadata
      const fileMetadata = await this.finalizeUpload(sessionUrl, {
        name: fileName,
        checksum,
        tags: options.tags || {},
        folderId: options.folderId,
      });

      return this.mapToStorageFile(fileMetadata);
    } catch (error) {
      throw this.enhanceError(error, 'File upload failed');
    }
  }

  /**
   * Download file with streaming support and integrity verification
   */
  async downloadFile(
    fileId: string,
    options: StorageOperationOptions = {}
  ): Promise<Readable> {
    try {
      const response = await this.axiosInstance.get(`/files/${fileId}`, {
        responseType: 'stream',
        timeout: STORAGE_CONSTANTS.DOWNLOAD_TIMEOUT,
      });

      const stream = response.data as Readable;
      
      if (options.encryption) {
        return this.encryptStream(stream);
      }

      return stream;
    } catch (error) {
      throw this.enhanceError(error, 'File download failed');
    }
  }

  /**
   * List files with enhanced filtering and pagination
   */
  async listFiles(
    options: StorageOperationOptions = {}
  ): Promise<{ files: StorageFile[]; nextPageToken?: string }> {
    try {
      const response = await this.axiosInstance.get('/files', {
        params: {
          pageSize: options.pageSize || 100,
          pageToken: options.pageToken,
          folderId: options.folderId,
          includeTrash: options.includeTrash,
          recursive: options.recursive,
        },
      });

      return {
        files: response.data.files.map(this.mapToStorageFile),
        nextPageToken: response.data.nextPageToken,
      };
    } catch (error) {
      throw this.enhanceError(error, 'Failed to list files');
    }
  }

  /**
   * Delete file with optional permanent deletion
   */
  async deleteFile(
    fileId: string,
    permanent: boolean = false
  ): Promise<void> {
    try {
      await this.axiosInstance.delete(`/files/${fileId}`, {
        params: { permanent },
      });
    } catch (error) {
      throw this.enhanceError(error, 'File deletion failed');
    }
  }

  // Private helper methods
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    if (now - this.rateLimitWindow > STORAGE_CONSTANTS.RATE_LIMIT_WINDOW) {
      this.rateLimitWindow = now;
      this.requestCount = 0;
    }

    if (this.requestCount >= STORAGE_CONSTANTS.RATE_LIMIT_MAX_REQUESTS) {
      throw new Error('Rate limit exceeded');
    }

    this.requestCount++;
  }

  private async updateRateLimits(response: any): Promise<void> {
    const remaining = parseInt(response.headers['x-ratelimit-remaining'] || '0');
    const reset = parseInt(response.headers['x-ratelimit-reset'] || '0');

    await this.connection.updateRateLimit(
      remaining,
      new Date(reset * 1000)
    );
  }

  private async calculateChecksum(data: Buffer | Readable): Promise<string> {
    const hash = createHash('sha256');
    
    if (Buffer.isBuffer(data)) {
      hash.update(data);
    } else {
      for await (const chunk of data) {
        hash.update(chunk);
      }
    }

    return hash.digest('hex');
  }

  private mapToStorageFile(fileData: any): StorageFile {
    return {
      id: fileData.id,
      name: fileData.name,
      mimeType: fileData.mimeType,
      size: parseInt(fileData.size),
      checksum: fileData.checksum,
      createdAt: new Date(fileData.createdTime),
      modifiedAt: new Date(fileData.modifiedTime),
      path: fileData.path || '/',
      tags: fileData.tags || {},
      permissions: fileData.permissions || [],
    };
  }

  private enhanceError(error: any, message: string): Error {
    const enhancedError = new Error(
      `${message}: ${error.message || 'Unknown error'}`
    );
    enhancedError.stack = error.stack;
    return enhancedError;
  }
}