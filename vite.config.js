import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000';
  // `npm run dev:https`: self-signed HTTPS so phones on the same Wi-Fi may use camera/microphone (calls).
  const https = mode === 'https' || env.VITE_HTTPS === 'true';

  return {
    plugins: [react(), tailwindcss(), ...(https ? [basicSsl()] : [])],
    server: {
      port: 5173,
      strictPort: true,
      // Also reachable from other devices on the same network (http://<this PC's IP>:5173).
      host: true,
      // Same-origin in development: the refresh cookie (SameSite=Strict, path /api/auth)
      // and the Socket.IO handshake both go through the dev server.
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false },
        '/socket.io': { target: apiTarget, ws: true, changeOrigin: false },
        '/uploads': { target: apiTarget, changeOrigin: false },
      },
    },
  };
});
