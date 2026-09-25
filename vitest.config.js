import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Mirrors vite.config.js's react() plugin so .jsx files transform the same
// way under test as they do in the real app (automatic JSX runtime — many
// components, e.g. src/components/Avatar.jsx, use JSX without importing
// React, which only compiles with the automatic runtime). Without this,
// vitest falls back to esbuild's default classic transform and every such
// component throws "ReferenceError: React is not defined" on render — a
// false failure caused by the test config, not a real bug in the app.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
  },
});
