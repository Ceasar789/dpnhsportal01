// U3: runs e2e/admin-final-users-form.spec.js against the admin-final mock
// mode (no credentials, no real backend), the same server setup as
// playwright.admin-final.config.js.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4178;

export default defineConfig({
  testDir: './e2e',
  testMatch: /admin-final-users-form\.spec\.js/,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report/admin-users' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'admin-users-chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: `npm run dev --workspace frontend -- --mode admin-final-e2e --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
