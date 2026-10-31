import { defineConfig } from 'vite';

// Relative base so the same build serves from GitHub Pages (/reentry/) and locally.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
