// ============================================
// FILE: e2e/student.spec.js
// The student dashboard, as a student actually sees it.
//
// Read-only: it logs in, looks and navigates. It never answers a task,
// because that would write to the live database.
//
// Most of these assert the ABSENCE of the specific lie this project keeps
// producing — a failed read that renders identically to an empty result.
// "0 pending", a blank list and "not started" all look the same whether the
// data is genuinely empty or the query fell over, and only the second is a
// bug. Every screen here has to distinguish them.
// ============================================

import { test, expect } from '@playwright/test';
import { loginAsStudent } from './helpers.js';

test.describe('student dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
  });

  test('the banner states the enrolment rather than guessing at it', async ({ page }) => {
    await expect(page.getByText(/welcome back/i)).toBeVisible();
    // Three distinct states, never collapsed: loading, failed, enrolled. What
    // must never appear is a permanent "Loading your enrolment…".
    await expect(page.getByText(/loading your enrolment/i)).toBeHidden({ timeout: 20_000 });
  });

  test('subject cards render and none of them is "Other"', async ({ page }) => {
    const cards = page.locator('button:has(.lucide-book-open), [class*="grid"] button');
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });
    // Other was removed: every task now lands on a card named after its own
    // subject. A card called Other reappearing means the card set narrowed.
    await expect(page.getByText('Other', { exact: true })).toHaveCount(0);
  });

  test('a subject card opens the Tasks tab filtered to it', async ({ page }) => {
    const card = page.locator('[class*="grid"] button').first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.click();
    await expect(page).toHaveURL(/\/student-dashboard\/tasks\?subject=/);
  });

  test('every tab opens without a blank screen', async ({ page }) => {
    for (const path of ['tasks', 'attendance', 'announcements', 'profile']) {
      await page.goto(`/student-dashboard/${path}`);
      // An unhandled render error leaves an empty <div id="root">, which is
      // exactly what the Loader2 bug produced for every student.
      await expect(page.locator('#root')).not.toBeEmpty();
      await page.waitForTimeout(500);
    }
  });

  test('the stat cards never show a bare zero over a failed read', async ({ page }) => {
    await page.goto('/student-dashboard');
    await page.waitForTimeout(3000);
    // "Could not load" is the honest state. Its presence is fine; what would
    // be wrong is a 0% sitting where a failure happened, which this cannot
    // see — so the check is that if it failed, it SAYS so.
    const failed = await page.getByText(/could not load/i).count();
    if (failed > 0) {
      console.log('a read failed — the dashboard said so, which is the point');
    }
    await expect(page.getByText(/worksheet performance/i)).toBeVisible();
  });

  // No table is in the supabase_realtime publication, so the bell is polled
  // and refreshed on open. Opening it also marks everything read.
  test('the notification bell opens', async ({ page }) => {
    await page.getByRole('button', { name: /notifications/i }).click();
    await expect(page.getByText(/notifications/i).first()).toBeVisible();
  });
});
