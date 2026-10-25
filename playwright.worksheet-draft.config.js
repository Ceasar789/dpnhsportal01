import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.WORKSHEET_VQA_PORT || 4182);

export default defineConfig({
  testDir: './e2e',
  testMatch: /worksheet-draft-preview\.spec\.js/,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, serviceWorkers: 'block' },
  projects: [{ name: 'worksheet-draft-chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'npx vite --config frontend/worksheet-draft-preview.vite.config.js',
    url: `http://127.0.0.1:${PORT}`, reuseExistingServer: true, timeout: 60_000,
  },
});
