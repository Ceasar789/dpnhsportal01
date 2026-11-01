import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import tailwindConfig from './tailwind.config.js';

const frontendRoot = fileURLToPath(new URL('./', import.meta.url));
const backendRoot = fileURLToPath(new URL('../backend/', import.meta.url));
const previewRoot = fileURLToPath(new URL('./worksheet-draft-preview/', import.meta.url));
const previewPort = Number(process.env.WORKSHEET_VQA_PORT || 4182);

export default defineConfig({
  root: previewRoot,
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss({ ...tailwindConfig, content: [
    `${frontendRoot.replaceAll('\\', '/')}src/**/*.{js,jsx,ts,tsx}`,
    `${previewRoot.replaceAll('\\', '/')}**/*.{js,jsx,html}`,
  ] }), autoprefixer()] } },
  envDir: false,
  server: {
    host: '127.0.0.1', port: previewPort, strictPort: true, hmr: false, proxy: undefined,
    fs: { allow: [frontendRoot, backendRoot] },
  },
});
