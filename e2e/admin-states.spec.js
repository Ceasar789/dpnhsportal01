// Phase 3a — loading, empty, error, retry.
//
// The audit's complaint was not that these screens looked wrong. It was
// that they ASSERTED things while still fetching: zeros, "No recent
// activity", "No teachers yet. Create them in User Management first." An
// empty state rendered during a fetch is not a neutral blank — it is a
// wrong answer, delivered confidently.
//
// The 300ms rule is NOT tested here. Sampling a live page for a loading
// line and asserting it never appeared tests the network, not the rule;
// that is src/lib/useDelayedFlag.test.js, with a fake clock.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

test.describe('admin data states', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  // The route goes on BEFORE login, so it is already in place when the
  // dashboard mounts and fires its fetches. Installing it afterwards and
  // reloading was the first attempt: the reload races the Supabase session
  // restore and every case timed out waiting for a sidebar that was not
  // there yet.
  //
  // Safe for these four tables because login touches none of them. The
  // teachers case needs a narrower pattern — see that test.
  const stall = (ms = 4000) => async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  };
  // A 500, not route.abort(). An aborted request makes supabase-js THROW,
  // and withRetry has no try/catch, so the rejection escapes the fetcher
  // and the error flag is never set — the UI just sits empty. That is a
  // real gap, it predates this phase, and it is recorded in
  // docs/ux-workarounds.md rather than silently widened into Phase 3a.
  // An HTTP error is what the finding describes and what supabase-js
  // returns as { error }.
  const fail = () => (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'intercepted by the e2e suite' }),
  });

  test('the Overview says it is loading rather than reporting no activity', async ({ page }) => {
    await page.route('**/rest/v1/activity_logs**', stall());
    await loginAsAdmin(page);
    // Deliberately NOT openAdminTab. It used to wait for networkidle, which
    // waited out the very stall this test depends on; it now waits for the
    // tab heading, which this test also does not want to wait for. Overview
    // is the landing tab, so no navigation is needed at all.

    // The old behaviour was this text, immediately, while the fetch was open.
    await expect(page.getByText(/loading activity/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('No recent activity')).toHaveCount(0);
  });

  test('the teacher picker does not claim there are no teachers while fetching', async ({ page }) => {
    // profiles is also what login reads, so the pattern is narrowed to the
    // teachers query specifically — AuthContext asks for select=* by id.
    await page.route('**/rest/v1/profiles?select=id%2Cname%2Cemail%2Cdepartment**', stall());
    await loginAsAdmin(page);
    // Same reason — click the tab without waiting for the network to settle.
    await page.locator('.sidebar-item', { hasText: 'Teaching Load' }).first().click({ force: true });

    await expect(page.getByText(/loading teachers/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/No teachers yet/i)).toHaveCount(0);
  });

  // UX-048: the hook set subjectsError and no component ever read it.
  test('a failed subjects read is reported, with a retry', async ({ page }) => {
    await page.route('**/rest/v1/subjects**', fail());
    await loginAsAdmin(page);
    await openAdminTab(page, 'Teaching Load');

    await expect(page.getByText(/could not load subjects/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^Retry$/ }).first()).toBeVisible();
  });

  // UX-050: one message covered two sources, and the only Retry re-ran the
  // request that had not failed.
  test('a sections failure names sections and retries sections', async ({ page }) => {
    await page.route('**/rest/v1/sections**', fail());
    await loginAsAdmin(page);
    await openAdminTab(page, 'Schedules');

    await expect(page.getByText(/could not load sections/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /retry sections/i })).toBeVisible();
    await expect(page.getByText('Could not load. Check your connection and try again.')).toHaveCount(0);
  });

  test('a schedules failure says the sections are fine', async ({ page }) => {
    await page.route('**/rest/v1/schedules**', fail());
    await loginAsAdmin(page);
    await openAdminTab(page, 'Schedules');

    await expect(page.getByText(/could not load schedules/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /retry schedules/i })).toBeVisible();
  });
});
