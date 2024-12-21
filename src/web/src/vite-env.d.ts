/// <reference types="vite/client" />

/**
 * Environment variable interface for type-safe access to Vite environment variables
 * @version Vite 4.4.0
 */
interface ImportMetaEnv {
  /** Application title from environment */
  readonly VITE_APP_TITLE: string;
  /** API endpoint URL */
  readonly VITE_API_URL: string;
  /** WebSocket endpoint URL */
  readonly VITE_WS_URL: string;
  /** AI service endpoint URL */
  readonly VITE_AI_SERVICE_URL: string;
  /** Integration hub endpoint URL */
  readonly VITE_INTEGRATION_HUB_URL: string;
}

/**
 * Enhanced ImportMeta interface with Vite-specific properties
 * @version Vite 4.4.0
 */
interface ImportMeta {
  /** Environment variables */
  readonly env: ImportMetaEnv;
  /** Hot module replacement context */
  readonly hot: ViteHotContext;
}

/**
 * Interface for static image imports with metadata
 */
interface StaticImageImport {
  /** Image source URL */
  src: string;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Image format (e.g., 'png', 'jpeg') */
  format: string;
  /** Base64 placeholder for lazy loading */
  placeholder: string;
  /** Base64 blur hash for progressive loading */
  blurDataURL: string;
}

/**
 * Interface for generic static asset imports
 */
interface StaticAssetImport {
  /** Asset source URL */
  src: string;
  /** Asset size in bytes */
  size: number;
  /** Asset MIME type */
  type: string;
}

/**
 * Enhanced SVG import declaration with accessibility support
 */
declare module '*.svg' {
  import * as React from 'react';
  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & {
      title?: string;
      desc?: string;
    }
  >;
  const src: string;
  export default src;
}

/**
 * Image format declarations with metadata support
 */
declare module '*.png' {
  const value: StaticImageImport;
  export default value;
}

declare module '*.jpg' {
  const value: StaticImageImport;
  export default value;
}

declare module '*.jpeg' {
  const value: StaticImageImport;
  export default value;
}

declare module '*.gif' {
  const value: StaticImageImport;
  export default value;
}

/**
 * Next-gen image format declarations with optimization hints
 */
declare module '*.webp' {
  const value: StaticImageImport;
  export default value;
}

declare module '*.avif' {
  const value: StaticImageImport;
  export default value;
}

/**
 * Style module declarations with type safety
 */
declare module '*.css' {
  const classes: {
    readonly [key: string]: string;
  };
  export default classes;
}

declare module '*.scss' {
  const classes: {
    readonly [key: string]: string;
  };
  export default classes;
}

/**
 * JSON module declaration for static imports
 */
declare module '*.json' {
  const value: any;
  export default value;
}