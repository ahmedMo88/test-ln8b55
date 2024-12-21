// External imports with version specifications
import { jest } from '@jest/globals'; // ^29.7.0
import nock from 'nock'; // ^13.3.3
import { faker } from '@faker-js/faker'; // ^8.1.0
import { Readable } from 'stream';
import { createHash } from 'crypto';

// Internal imports
import { EmailConnector } from '../../src/connectors/email';
import { StorageConnector } from '../../src/connectors/storage';
import { ConnectionModel, ConnectionStatus } from '../../src/models/connection.model';
import { ServiceType, AuthType } from '../../src/config/integrations';
import { OAuthService } from '../../src/services/oauth.service';

// Test configuration constants
const TEST_CONFIG = {
  timeout: 30000,
  retries: 3,
  concurrency: 5,
  rateLimits: {
    email: 100,
    storage: 1000
  }
};

// Mock data generator functions
const generateMockConnection = (serviceType: ServiceType): ConnectionModel => {
  return {
    id: faker.string.uuid(),
    userId: faker.string.uuid(),
    serviceType,
    authType: AuthType.OAUTH2,
    credentials: {
      accessToken: faker.string.alphanumeric(64),
      refreshToken: faker.string.alphanumeric(64),
      expiresAt: new Date(Date.now() + 3600000),
      version: 1,
      lastRotated: new Date()
    },
    status: ConnectionStatus.CONNECTED,
    rateLimitRemaining: 100,
    rateLimitReset: new Date(Date.now() + 3600000),
    validateCredentials: jest.fn().mockResolvedValue(true),
    updateRateLimit: jest.fn(),
    updateStatus: jest.fn()
  } as unknown as ConnectionModel;
};

describe('Integration Service Connectors', () => {
  let emailConnector: EmailConnector;
  let storageConnector: StorageConnector;
  let mockOAuthService: jest.Mocked<OAuthService>;
  let mockEmailConnection: ConnectionModel;
  let mockStorageConnection: ConnectionModel;

  beforeAll(() => {
    // Configure nock for HTTP mocking
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });

  beforeEach(() => {
    // Reset all mocks and prepare test environment
    jest.clearAllMocks();
    nock.cleanAll();

    // Initialize mock connections
    mockEmailConnection = generateMockConnection(ServiceType.EMAIL);
    mockStorageConnection = generateMockConnection(ServiceType.CLOUD_STORAGE);

    // Initialize mock OAuth service
    mockOAuthService = {
      refreshAccessToken: jest.fn(),
      validateTokenHealth: jest.fn()
    } as unknown as jest.Mocked<OAuthService>;

    // Initialize connectors
    emailConnector = new EmailConnector(mockEmailConnection, mockOAuthService);
    storageConnector = new StorageConnector(mockStorageConnection);
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  describe('EmailConnector Integration Tests', () => {
    it('should handle concurrent email operations within rate limits', async () => {
      // Configure mock API responses
      nock('https://gmail.googleapis.com')
        .post('/gmail/v1/users/me/messages/send')
        .times(TEST_CONFIG.concurrency)
        .reply(200, { id: faker.string.uuid() });

      // Generate test emails
      const testEmails = Array.from({ length: TEST_CONFIG.concurrency }, () => ({
        to: [faker.internet.email()],
        from: faker.internet.email(),
        subject: faker.lorem.sentence(),
        body: faker.lorem.paragraph()
      }));

      // Execute concurrent email operations
      const startTime = Date.now();
      const results = await Promise.all(
        testEmails.map(email => emailConnector.sendEmail(email))
      );

      // Validate results and performance
      const duration = Date.now() - startTime;
      expect(results).toHaveLength(TEST_CONFIG.concurrency);
      expect(duration).toBeLessThan(TEST_CONFIG.timeout);
      expect(mockEmailConnection.updateRateLimit).toHaveBeenCalledTimes(TEST_CONFIG.concurrency);
    });

    it('should handle email listing with pagination and filtering', async () => {
      // Configure mock API response
      nock('https://gmail.googleapis.com')
        .get('/gmail/v1/users/me/messages')
        .query(true)
        .reply(200, {
          messages: Array.from({ length: 10 }, () => ({
            id: faker.string.uuid(),
            threadId: faker.string.uuid()
          })),
          nextPageToken: faker.string.alphanumeric(16)
        });

      const filter = {
        subject: 'Test',
        from: faker.internet.email(),
        after: new Date(Date.now() - 86400000),
        hasAttachment: true
      };

      const result = await emailConnector.listEmails(filter);
      expect(result).toHaveLength(10);
      expect(mockEmailConnection.validateCredentials).toHaveBeenCalled();
    });

    it('should handle email retrieval with security validation', async () => {
      const messageId = faker.string.uuid();
      const mockEmail = {
        id: messageId,
        threadId: faker.string.uuid(),
        payload: {
          headers: [
            { name: 'Subject', value: faker.lorem.sentence() },
            { name: 'From', value: faker.internet.email() }
          ]
        }
      };

      nock('https://gmail.googleapis.com')
        .get(`/gmail/v1/users/me/messages/${messageId}`)
        .query(true)
        .reply(200, mockEmail);

      const result = await emailConnector.getEmail(messageId);
      expect(result).toMatchObject(mockEmail);
      expect(mockEmailConnection.validateCredentials).toHaveBeenCalled();
    });
  });

  describe('StorageConnector Integration Tests', () => {
    it('should handle file upload with integrity verification', async () => {
      const testFile = Buffer.from(faker.lorem.paragraphs());
      const fileName = `test-${faker.string.uuid()}.txt`;
      const checksum = createHash('sha256').update(testFile).digest('hex');

      nock('https://www.googleapis.com')
        .post('/upload/drive/v3/files')
        .reply(200, {
          id: faker.string.uuid(),
          name: fileName,
          mimeType: 'text/plain',
          size: testFile.length,
          checksum
        });

      const result = await storageConnector.uploadFile(testFile, fileName, {
        tags: { purpose: 'test' },
        encryption: true
      });

      expect(result.name).toBe(fileName);
      expect(result.size).toBe(testFile.length);
      expect(result.checksum).toBe(checksum);
    });

    it('should handle concurrent file operations with rate limiting', async () => {
      const fileIds = Array.from({ length: TEST_CONFIG.concurrency }, () => faker.string.uuid());
      
      // Mock API responses for concurrent operations
      fileIds.forEach(id => {
        nock('https://www.googleapis.com')
          .get(`/drive/v3/files/${id}`)
          .reply(200, {
            id,
            name: `file-${id}.txt`,
            mimeType: 'text/plain',
            size: faker.number.int({ min: 1000, max: 10000 })
          });
      });

      const startTime = Date.now();
      const results = await Promise.all(
        fileIds.map(id => storageConnector.downloadFile(id))
      );

      const duration = Date.now() - startTime;
      expect(results).toHaveLength(TEST_CONFIG.concurrency);
      expect(duration).toBeLessThan(TEST_CONFIG.timeout);
      expect(mockStorageConnection.updateRateLimit).toHaveBeenCalled();
    });

    it('should handle file listing with enhanced filtering', async () => {
      const mockFiles = Array.from({ length: 20 }, () => ({
        id: faker.string.uuid(),
        name: faker.system.fileName(),
        mimeType: faker.system.mimeType(),
        size: faker.number.int({ min: 1000, max: 1000000 }),
        createdTime: faker.date.past().toISOString(),
        modifiedTime: faker.date.recent().toISOString()
      }));

      nock('https://www.googleapis.com')
        .get('/drive/v3/files')
        .query(true)
        .reply(200, {
          files: mockFiles,
          nextPageToken: faker.string.alphanumeric(16)
        });

      const result = await storageConnector.listFiles({
        pageSize: 20,
        recursive: true,
        includeTrash: false
      });

      expect(result.files).toHaveLength(20);
      expect(result.nextPageToken).toBeDefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle rate limit errors gracefully', async () => {
      nock('https://gmail.googleapis.com')
        .post('/gmail/v1/users/me/messages/send')
        .reply(429, {}, {
          'Retry-After': '30',
          'X-RateLimit-Reset': (Date.now() + 30000).toString()
        });

      await expect(emailConnector.sendEmail({
        to: [faker.internet.email()],
        from: faker.internet.email(),
        subject: faker.lorem.sentence(),
        body: faker.lorem.paragraph()
      })).rejects.toThrow('Rate limit exceeded');

      expect(mockEmailConnection.updateRateLimit).toHaveBeenCalledWith(
        0,
        expect.any(Date)
      );
    });

    it('should handle authentication failures with token refresh', async () => {
      mockEmailConnection.validateCredentials.mockResolvedValueOnce(false);
      mockOAuthService.refreshAccessToken.mockResolvedValueOnce({
        access_token: faker.string.alphanumeric(64),
        token_type: 'Bearer',
        expires_in: 3600,
        issued_at: Date.now()
      });

      nock('https://gmail.googleapis.com')
        .post('/gmail/v1/users/me/messages/send')
        .reply(200, { id: faker.string.uuid() });

      const result = await emailConnector.sendEmail({
        to: [faker.internet.email()],
        from: faker.internet.email(),
        subject: faker.lorem.sentence(),
        body: faker.lorem.paragraph()
      });

      expect(result).toBeDefined();
      expect(mockOAuthService.refreshAccessToken).toHaveBeenCalled();
    });
  });
});