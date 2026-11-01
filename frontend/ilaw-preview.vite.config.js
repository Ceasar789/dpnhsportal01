import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('./', import.meta.url));
const previewRoot = fileURLToPath(new URL('./ilaw-preview/', import.meta.url));

// Local-only document fixture. Do not load the app's .env files or live proxies.
export default defineConfig({
  root: previewRoot,
  plugins: [react()],
  envDir: false,
  server: {
    host: '127.0.0.1',
    port: 4178,
    strictPort: true,
    hmr: false,
    proxy: undefined,
    fs: { allow: [frontendRoot] },
  },
});
