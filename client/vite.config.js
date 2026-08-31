import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api to the Express backend so the client can use
// same-origin relative URLs. In production, set VITE_API_BASE_URL.
export default defineConfig({
  plugins: [react()],
  // Read VITE_* vars from the repo-root .env (single source of truth).
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: { recharts: ['recharts'], react: ['react', 'react-dom', 'react-router-dom'] },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
