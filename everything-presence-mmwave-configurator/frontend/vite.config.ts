/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  base: './',
  build: {
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:42069',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:42069',
        ws: true,
      },
    },
  },
});
