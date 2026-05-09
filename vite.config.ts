import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load env file based on mode
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = env.VITE_API_BASE || 'http://localhost:8000';
  
  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/v1': {
          target: apiBase,
          changeOrigin: true,
        },
      },
    },
  };
});
