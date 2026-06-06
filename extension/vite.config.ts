import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // The side panel's index.html is the entry point for the UI build.
  // The service worker is built separately via esbuild (see package.json build:sw).
  root: 'src/sidepanel',
  publicDir: resolve(__dirname, 'public'),

  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/sidepanel/index.html'),
    },
  },
});
