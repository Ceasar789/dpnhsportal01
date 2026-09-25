// ============================================
// FILE: playwright.config.js
// End-to-end tests: a real browser, a real login, the real Supabase.
//
// ── Read this before running ─────────────────────────────────────────────
//
// These run against whatever database your .env points at. There is no test
// instance, so that is your LIVE one. Every spec under e2e/ is therefore
// READ-ONLY by design: it logs in, navigates and asserts, and never creates,
// edits or deletes a row. The moment a spec needs to write, give it its own
// Supabase project — do not let it write here.
//
// They need the seeded accounts from archives/phase4-03 and phase4-05, and
// they need `npx playwright install chromium` once per machine.
//
// One worker, no parallelism: sixty concurrent logins against a free tier is
// the congestion this project already spent a session fixing, and a flaky
// suite that blames the app for its own load teaches nothing.
// ============================================

import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

export default defineConfig({
  testDir: './e2e',
  // Supabase auth over a free tier is not fast. A tight timeout here reports
  // a slow login as a broken one.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // Reuses a dev server you already have running, so `npm run dev` in one
  // terminal and the tests in another costs one startup, not one per run.
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
