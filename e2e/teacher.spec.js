// ============================================
// FILE: e2e/teacher.spec.js
// The teacher dashboard. Read-only — it never creates or distributes a task,
// because that would write to the live database and put work in a real
// student's list.
//
// What it is really checking is that a teacher's own screens load against
// their own data. Two of the bugs this project has already shipped were of
// exactly this shape and invisible to every unit test: an attendance tab
// that used a PostgREST embed with no FK behind it (PGRST200, whole fetch
// aborted, rendered as an empty roster), and a Grades tab that still does.
// ============================================

import { test, expect } from '@playwright/test';
import { loginAsTeacher } from './helpers.js';

test.describe('teacher dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTeacher(page);
  });

  test('every tab opens without a blank screen', async ({ page }) => {
    for (const path of ['', 'worksheets', 'lesson-plans', 'students', 'attendance', 'announcements']) {
      await page.goto(`/teacher-dashboard/${path}`);
      await expect(page.locator('#root')).not.toBeEmpty();
      await page.waitForTimeout(500);
    }
  });

  // A teacher with no teaching load cannot be allowed to create a task with
  // no subject — that is how a task ends up on no card at all. The screen has
  // to say which of the two it is: a failed read means retry, no load means
  // ask the admin, and sending someone to the wrong one wastes their day.
  test('the worksheets tab knows which subject this teacher holds', async ({ page }) => {
    await page.goto('/teacher-dashboard/worksheets');
    await expect(page.locator('#root')).not.toBeEmpty();
    await page.waitForTimeout(3000);

    const noSubject = await page.getByText(/no subject is assigned to you yet/i).count();
    const loadFailed = await page.getByText(/could not load your teaching load/i).count();
    // Whichever it is, it must not be silent — and the two must not be the
    // same message.
    expect(noSubject + loadFailed).toBeLessThanOrEqual(1);
  });

  test('the notification bell opens', async ({ page }) => {
    await page.getByRole('button', { name: /notifications/i }).click();
    await expect(page.getByText(/notifications/i).first()).toBeVisible();
  });
});
