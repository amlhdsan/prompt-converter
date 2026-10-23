import { defineConfig } from 'vite';
// Default base "./" works for localhost, Docker, any static host and Tauri.
// For GitHub Pages set BASE_PATH=/prompt-converter/ (done in the optional workflow).
export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
