/**
 * Jest Configuration for Web Frontend Application
 * Version: 29.7.0
 * 
 * This configuration file sets up Jest testing environment for the no-code workflow
 * automation platform's frontend application. It includes comprehensive settings for:
 * - TypeScript integration with ts-jest
 * - DOM testing environment with jsdom
 * - Module resolution and path aliases
 * - Asset mocking for non-JS/TS files
 * - Coverage thresholds and reporting
 * - Test file patterns and extensions
 */

import type { Config } from 'jest';

const jestConfig: Config = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',

  // Use jsdom for DOM environment simulation
  testEnvironment: 'jsdom',

  // Define root directory for tests
  roots: ['<rootDir>/src'],

  // Module name mapping for path aliases and assets
  moduleNameMapper: {
    // Map @ alias to src directory for consistent imports
    '^@/(.*)$': '<rootDir>/src/$1',
    
    // Mock CSS modules
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    
    // Mock static assets
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/src/__mocks__/fileMock.ts'
  },

  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],

  // Test file pattern matching
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.[jt]sx?$',

  // Supported file extensions
  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
    'node'
  ],

  // Coverage collection configuration
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    // Exclude type definition files
    '!src/**/*.d.ts',
    // Exclude Vite environment types
    '!src/vite-env.d.ts',
    // Exclude entry point
    '!src/main.tsx',
    // Exclude barrel files
    '!src/**/index.ts',
    // Exclude type definitions
    '!src/types/**/*'
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // TypeScript transformation configuration
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },

  // Global configuration for ts-jest
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json'
    }
  }
};

export default jestConfig;