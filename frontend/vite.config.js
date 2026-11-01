import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend allows CORS from CLIENT_URL (default http://localhost:5173).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Keep the heavy libraries out of the main bundle so the first page loads faster.
        manualChunks: {
          charts: ['recharts'],
          scanner: ['html5-qrcode'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'axios'],
        },
      },
    },
  },
});
