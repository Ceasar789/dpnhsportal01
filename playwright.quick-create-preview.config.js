import { defineConfig, devices } from '@playwright/test';

const PORT = 4179;

export default defineConfig({
  testDir: './e2e',
  testMatch: /quick-create-preview\.spec\.js/,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, serviceWorkers: 'block', trace: 'off', video: 'off' },
  projects: [{ name: 'quick-create-local-chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: `npm run dev --workspace frontend -- --config quick-create-preview.vite.config.js --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
