import { defineConfig, devices } from '@playwright/test';

// S3: the student's file/link submissions, against the isolated profile mocks
// plus e2e/task-submissions-mock-fixture.js. Its own config, so the profile
// suite's testMatch stays as it is.
const PORT = 4174;

export default defineConfig({
  testDir: './e2e',
  testMatch: /student-submissions\.spec\.js/,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report/submissions' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'submissions-chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
  webServer: {
    command: `npm run dev --workspace frontend -- --mode profile-e2e --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
