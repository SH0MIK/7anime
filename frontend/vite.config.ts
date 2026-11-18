import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(import.meta.dirname, '../');
  const env = loadEnv(mode, rootDir, '');
  const backendPort = env.PORT || env.BACKEND_PORT || '5000';
  const backendTarget = env.VITE_BACKEND_URL || `http://localhost:${backendPort}`;

  return {
    envDir: '../',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@/src': path.resolve(import.meta.dirname, './src'),
        '@': path.resolve(import.meta.dirname, './src'),
        '@shared': path.resolve(import.meta.dirname, '../shared'),
        '@7anime/shared': path.resolve(import.meta.dirname, '../shared/types/index.ts'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
