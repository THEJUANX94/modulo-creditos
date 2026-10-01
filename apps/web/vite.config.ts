import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// La web habla con la API por el mismo origen (ADR 0021): en desarrollo, Vite reenvía /api a la
// API; en Docker lo hace Nginx. La cookie SameSite=Strict del refresh viaja sin CORS.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
