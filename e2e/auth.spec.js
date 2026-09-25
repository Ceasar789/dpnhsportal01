// ============================================
// FILE: e2e/auth.spec.js
// Can each role log in, and does it land where it should?
//
// The dullest spec in the suite and the one most worth having: every other
// test depends on this working, and a broken login is the failure that takes
// the whole system down for everyone at once. It is also the only thing here
// that exercises the real auth path — the deadlock that cost 8.8 seconds on
// every login for every user was invisible in the code and in every unit
// test, and showed up only in a browser.
// ============================================

import { test, expect } from '@playwright/test';
import {
  STUDENT, TEACHER, PASSWORD, STUDENT_LOGIN, STAFF_LOGIN,
  loginAsStudent, loginAsTeacher,
} from './helpers.js';

test.describe('authentication', () => {
  test('a student reaches the student dashboard', async ({ page }) => {
    await loginAsStudent(page);
    await expect(page).toHaveURL(/\/student-dashboard/);
    await expect(page.getByText(/welcome back/i)).toBeVisible();
  });

  test('a teacher reaches the teacher dashboard', async ({ page }) => {
    await loginAsTeacher(page);
    await expect(page).toHaveURL(/\/teacher-dashboard/);
  });

  test('a wrong password is refused and stays put', async ({ page }) => {
    await page.goto(STUDENT_LOGIN);
    await page.locator('input[type="email"]').fill(STUDENT.email);
    await page.locator('input[type="password"]').fill('definitely-not-the-password');
    await page.getByRole('button', { name: /sign in|log ?in/i }).click();

    // Still on the login page after a moment, rather than halfway in.
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/student-login/);
  });

  // The roles are not interchangeable: profiles.role drives every route
  // guard and every RLS policy, so a student who lands on a staff dashboard
  // is a privilege bug, not a routing quirk.
  test('a student cannot get in through the staff login', async ({ page }) => {
    await page.goto(STAFF_LOGIN);
    await page.locator('input[type="email"]').fill(STUDENT.email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /sign in|log ?in/i }).click();

    await page.waitForTimeout(4000);
    await expect(page).not.toHaveURL(/\/(teacher|admin|registrar|faculty)-dashboard/);
  });

  // Typing a dashboard URL is the cheapest possible attack, so it is worth
  // one test. Nothing sensitive should render before the redirect.
  test('a signed-out visitor cannot open a dashboard by URL', async ({ page }) => {
    await page.goto('/student-dashboard');
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/student-dashboard/);
  });

  // Not an assertion about a number — a threshold this loose only fires when
  // something is structurally wrong, like the onAuthStateChange deadlock that
  // timed out at exactly 4 seconds, twice, on every single login.
  test('logging in does not take absurdly long', async ({ page }) => {
    const started = Date.now();
    await loginAsTeacher(page);
    const seconds = (Date.now() - started) / 1000;
    console.log(`login took ${seconds.toFixed(1)}s`);
    expect(seconds).toBeLessThan(20);
  });
});
