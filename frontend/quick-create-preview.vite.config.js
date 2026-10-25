import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('./', import.meta.url));
const previewRoot = fileURLToPath(new URL('./quick-create-preview/', import.meta.url));

// Local synthetic fixture. No app env files, authentication, API proxy, or database import.
export default defineConfig({
  root: previewRoot,
  plugins: [react()],
  envDir: false,
  server: {
    host: '127.0.0.1', port: 4179, strictPort: true, hmr: false, proxy: undefined,
    fs: { allow: [frontendRoot] },
  },
});
