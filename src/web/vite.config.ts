// Vite configuration v4.4.0
// React plugin v4.0.0

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // React plugin configuration with Fast Refresh and automatic JSX runtime
  plugins: [
    react({
      fastRefresh: true,
      jsxRuntime: 'automatic'
    })
  ],

  // Path alias configuration for cleaner imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },

  // Development server configuration
  server: {
    port: 3000,
    host: true, // Listen on all local IPs
    proxy: {
      // API proxy configuration
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false
      },
      // WebSocket proxy for real-time updates
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true
      }
    }
  },

  // Production build configuration
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser',
    // Browser compatibility targets based on technical specifications
    target: [
      'chrome90',
      'firefox88', 
      'safari14',
      'edge90'
    ],
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal loading
        manualChunks: {
          // Core vendor dependencies
          vendor: [
            'react',
            'react-dom',
            '@mui/material'
          ],
          // State management bundle
          redux: [
            '@reduxjs/toolkit',
            'react-redux'
          ]
        }
      }
    }
  },

  // Preview server configuration
  preview: {
    port: 3000,
    host: true
  },

  // Test environment configuration
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts']
  }
});