import { defineConfig, devices } from '@playwright/test';

// Phase 5 (autorun): the Teacher, Student and security flows of this run, plus the two mocked
// suites (profile-browser, admin-final-browser), against PRODUCTION BUILDS served statically by
// `vite preview` (SPA fallback). Every network request goes to the isolated .invalid mocks of
// e2e/profile-mock-fixture.js / admin-final-mock-fixture.js: no real login, no real Supabase.
//
//   npx playwright test --config playwright.autorun.config.js
//
// The builds go to e2e-report/ (git-ignored). AUTORUN_SKIP_BUILD=1 serves builds made beforehand.
const PROFILE_PORT = 4174; // the port profile-mock-fixture.js allows (PROFILE_E2E_BASE_URL)
const ADMIN_PORT = 4178; // the port admin-final-mock-fixture.js allows (ADMIN_FINAL_BASE_URL)
const serve = (mode, dir, port) => ({
  command: `${process.env.AUTORUN_SKIP_BUILD === '1' ? '' : `npx vite build --mode ${mode} --outDir ${dir} --emptyOutDir && `}`
    + `npx vite preview --mode ${mode} --outDir ${dir} --host 127.0.0.1 --port ${port} --strictPort`,
  cwd: './frontend',
  url: `http://127.0.0.1:${port}`,
  reuseExistingServer: false,
  timeout: 240_000,
});

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report/autorun' }]],
  use: { serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' },
  projects: [
    { name: 'autorun-profile', testMatch: /(?:autorun-[a-z]+|profile-browser)\.spec\.js/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: `http://127.0.0.1:${PROFILE_PORT}` } },
    { name: 'autorun-admin', testMatch: /admin-final-browser\.spec\.js/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: `http://127.0.0.1:${ADMIN_PORT}` } },
  ],
  webServer: [serve('profile-e2e', '../e2e-report/dist-profile-e2e', PROFILE_PORT), serve('admin-final-e2e', '../e2e-report/dist-admin-final-e2e', ADMIN_PORT)],
});
