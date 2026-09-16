import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Keeps the browser on one origin in development, so the auth cookie is
      // first-party and no CORS preflight is needed for the API.
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
