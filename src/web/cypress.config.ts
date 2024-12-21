// Cypress configuration v13.0.0
import { defineConfig } from 'cypress';

export default defineConfig({
  // E2E Testing Configuration
  e2e: {
    baseUrl: 'http://localhost:3000',
    specPattern: 'cypress/integration/**/*.spec.ts',
    supportFile: 'cypress/support/index.ts',
    videosFolder: 'cypress/videos',
    screenshotsFolder: 'cypress/screenshots',
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 30000,
    retries: {
      runMode: 2,      // Retry failed tests twice in CI
      openMode: 0      // No retries in interactive mode
    },
    setupNodeEvents(on, config) {
      // Register event listeners and plugins
      on('before:browser:launch', (browser, launchOptions) => {
        // Ensure consistent browser behavior
        if (browser.name === 'chrome' && browser.isHeadless) {
          launchOptions.args.push('--disable-gpu');
          launchOptions.args.push('--no-sandbox');
          return launchOptions;
        }
      });

      // Configure code coverage reporting
      if (config.env.coverage) {
        require('@cypress/code-coverage/task')(on, config);
      }

      return config;
    }
  },

  // Component Testing Configuration
  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite'
    },
    specPattern: 'src/**/*.cy.{js,jsx,ts,tsx}',
    setupNodeEvents(on, config) {
      // Component testing specific event handlers
      if (config.env.coverage) {
        require('@cypress/code-coverage/task')(on, config);
      }
      return config;
    }
  },

  // Environment Variables
  env: {
    // API endpoint for integration tests
    apiUrl: 'http://localhost:8080/api/v1',
    
    // Code coverage configuration
    coverage: false,
    codeCoverage: {
      url: 'http://localhost:8080/__coverage__'
    }
  },

  // Video Recording Configuration
  video: true,
  videoCompression: 32,
  videoUploadOnPasses: false,

  // Screenshot Configuration
  screenshotOnRunFailure: true,
  trashAssetsBeforeRuns: true,

  // Security and Performance Settings
  chromeWebSecurity: false,  // Required for cross-origin testing
  watchForFileChanges: true,
  numTestsKeptInMemory: 50,
  experimentalMemoryManagement: true,

  // Reporter Configuration
  reporter: 'cypress-multi-reporters',
  reporterOptions: {
    configFile: 'reporter-config.json'
  },

  // TypeScript Configuration
  typescript: true,
  videosFolder: 'cypress/videos',
  screenshotsFolder: 'cypress/screenshots',
  downloadsFolder: 'cypress/downloads',
  fixturesFolder: 'cypress/fixtures',

  // Retry and Timeout Settings
  defaultCommandTimeout: 10000,
  execTimeout: 60000,
  taskTimeout: 60000,
  pageLoadTimeout: 30000,
  requestTimeout: 10000,
  responseTimeout: 30000,

  // Browser Configuration
  viewportWidth: 1280,
  viewportHeight: 720,
  blockHosts: [
    '*.google-analytics.com',
    '*.doubleclick.net'
  ],

  // Test Isolation Settings
  testIsolation: true,
  experimentalSessionAndOrigin: true,

  // Snapshot Settings
  snapshotConfig: {
    updateSnapshots: false,
    threshold: 0.1
  }
});