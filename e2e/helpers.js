// ============================================
// FILE: e2e/helpers.js
// Login, and the seeded accounts every spec shares.
//
// The credentials here are the throwaway test population from
// archives/phase4-03 and phase4-05 — example.com addresses that cannot
// receive mail, all sharing one password, all meant to be deleted after
// testing. Nothing real is committed here.
// ============================================

export const PASSWORD = '123456789';

export const STUDENT = { email: 'student01@example.com', password: PASSWORD };
export const STUDENT_B = { email: 'student41@example.com', password: PASSWORD };
export const TEACHER = { email: 'teacher.math7@example.com', password: PASSWORD };

// The two login screens are separate routes with separate forms: students go
// through /student-login, everybody else through /faculty-login.
export const STUDENT_LOGIN = '/student-login';
export const STAFF_LOGIN = '/faculty-login';

/**
 * Logs in and waits for the dashboard to actually be reached.
 *
 * Asserting on the URL rather than on a spinner disappearing: a login that
 * fails leaves you on the login page, and every later assertion would then
 * fail for reasons that have nothing to do with what the spec is testing.
 * Better to fail here, where the message says "login".
 */
export async function login(page, { email, password }, loginPath, dashboardPath) {
  await page.goto(loginPath);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in|log ?in/i }).click();
  await page.waitForURL(`**${dashboardPath}**`, { timeout: 30_000 });
}

export const loginAsStudent = (page, who = STUDENT) =>
  login(page, who, STUDENT_LOGIN, '/student-dashboard');

export const loginAsTeacher = (page, who = TEACHER) =>
  login(page, who, STAFF_LOGIN, '/teacher-dashboard');

export const loginAsAdmin = (page, who) =>
  login(page, who, STAFF_LOGIN, '/admin-dashboard');
