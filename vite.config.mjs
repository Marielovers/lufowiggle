import { defineConfig } from 'vite';

// wlipsync (used by live2d-web) compiles its WASM module with top-level await.
// Vite's dependency optimizer and production builder have SEPARATE targets.
// Keep BOTH on esnext so esbuild does not transform or reject that await.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173 },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
      supported: { 'top-level-await': true },
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
});
