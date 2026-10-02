// UX-054 — a failed read must not read as "there is no data".
//
// supabase-js reports an HTTP failure as { data, error }, which every
// fetcher handles. A NETWORK failure throws instead, and that rejection
// used to escape withRetry and the fetcher above it, so no error flag was
// ever set and the screen sat on its empty state. The user is told there is
// nothing there when the truth is that nothing arrived.
//
// withRetry now normalises a throw into the same { data, error }. The unit
// tests in src/lib/supabaseRetry.test.js prove the mechanism — including
// that a throw is retried the same number of times as a returned error, and
// that recovery mid-retry works; five of them fail with the try/catch
// removed. What follows is the same thing measured through the UI.
//
// Two things this spec does NOT claim, both written up in
// docs/ux-workarounds.md:
//
//   * Registrar and faculty are not covered. e2e/helpers.js has a student,
//     a teacher and an admin, and no credentials exist for the other two.
//     Their fetchers go through the same withRetry, so the fix reaches
//     them — but that is reasoning, not measurement.
//   * route.abort() does not always produce a throw. On some queries the
//     supabase promise never settles at all, and no try/catch can rescue a
//     promise that neither resolves nor rejects.
import { test, expect } from '@playwright/test';
import {
  ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin,
  loginAsStudent, openAdminTab,
} from './helpers.js';

const http500 = () => (route) => route.fulfill({
  status: 500,
  contentType: 'application/json',
  body: JSON.stringify({ message: 'intercepted by the e2e suite' }),
});

test.describe('a failed read is reported, not rendered as emptiness', () => {
  // 500, not abort — and that choice is the finding, not a convenience.
  // route.abort() turned out to be NON-DETERMINISTIC here: the same test
  // passed on one run and hung on the next, because an aborted supabase
  // query sometimes rejects and sometimes leaves a promise that never
  // settles at all. A flaky test is worse than no test, and no try/catch
  // can rescue a promise that neither resolves nor rejects.
  //
  // So the mechanism is proven deterministically in the unit tests, and
  // these measure what the UI does with an error that actually arrives.
  test('admin · subjects · server error — message, and Retry works', async ({ page }) => {
    test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

    let down = true;
    await page.route('**/rest/v1/subjects**', async (route) => (
      down ? http500()(route) : route.continue()
    ));

    await loginAsAdmin(page);
    await openAdminTab(page, 'Teaching Load');

    await expect(page.getByText(/could not load subjects/i)).toBeVisible({ timeout: 15_000 });
    const retry = page.getByRole('button', { name: /^Retry$/ }).first();
    await expect(retry).toBeVisible();

    // A Retry that does not recover is decoration.
    down = false;
    await retry.click();
    await expect(page.getByText(/could not load subjects/i)).toHaveCount(0, { timeout: 15_000 });
  });

  test('admin · sections · server error — names sections, and Retry works', async ({ page }) => {
    test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

    let down = true;
    await page.route('**/rest/v1/sections?select**', async (route) => (
      down ? http500()(route) : route.continue()
    ));

    await loginAsAdmin(page);
    await openAdminTab(page, 'Schedules');

    await expect(page.getByText(/could not load sections/i)).toBeVisible({ timeout: 15_000 });
    const retry = page.getByRole('button', { name: /retry sections/i });
    await expect(retry).toBeVisible();

    down = false;
    await retry.click();
    await expect(page.getByText(/could not load sections/i)).toHaveCount(0, { timeout: 15_000 });
  });

  // 500 rather than abort: worksheet_submissions is one of the queries
  // whose promise never settles when the request is aborted, so there is
  // nothing for the try/catch to catch. See the note at the top.
  test('student · tasks · server error — message and Retry', async ({ page }) => {
    await page.route('**/rest/v1/worksheet_submissions**', http500());
    await loginAsStudent(page);
    await page.goto('/student-dashboard/tasks');

    await expect(page.getByText(/could not load your tasks/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /^Retry$/ }).first()).toBeVisible();
  });

  // Recorded as a failing expectation would be, but as a passing assertion
  // of the CURRENT behaviour, so the suite stays a signal: the teacher's
  // worksheet list swallows a failed read and renders its empty state.
  // That is UX-048 in a dashboard this overhaul has not reached yet. When
  // the teacher dashboard is done, this assertion inverts.
  test('teacher · worksheets · a failed read is still swallowed (known)', async ({ page }) => {
    const { loginAsTeacher } = await import('./helpers.js');
    await page.route('**/rest/v1/worksheets**', http500());
    await loginAsTeacher(page);
    await page.goto('/teacher-dashboard/worksheets');
    await page.waitForTimeout(4000);

    const text = await page.evaluate(() => document.body.innerText);
    expect(text, 'if this now reports the failure, invert this test')
      .toContain('No worksheets found');
  });
});
