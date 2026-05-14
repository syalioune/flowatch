import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['bpmn-js', 'dmn-js'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'bpmn': ['bpmn-js'],
          'dmn': ['dmn-js'],
          'react': ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Proxy Flowable REST to avoid CORS when running both locally
    proxy: {
      '/flowable-rest': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
