// ============================================
// FILE: e2e/helpers.js
// Login, and the seeded accounts every spec shares.
//
// The credentials here are the throwaway test population from
// backend/database/seeds — example.com addresses that cannot
// receive mail, all sharing one password, all meant to be deleted after
// testing. Nothing real is committed here.
// ============================================

export const PASSWORD = '123456789';

export const STUDENT = { email: 'student01@example.com', password: PASSWORD };
export const STUDENT_B = { email: 'student41@example.com', password: PASSWORD };
export const TEACHER = { email: 'teacher.math7@example.com', password: PASSWORD };

/**
 * The admin account is deliberately NOT in this file.
 *
 * Every other account here is a throwaway from backend/database/seeds, all
 * sharing one password, none of them able to do real damage. An admin can
 * edit every user in the school, so its credentials come from the
 * environment — E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD — read out of .env by
 * playwright.config.js, or exported into the shell before the run. .env is
 * gitignored; these values must never be committed.
 *
 * When they are absent, `hasAdminCredentials` is false and the admin specs
 * skip with that reason rather than failing — and a skip is not a pass. If
 * the whole admin suite reports SKIP, nothing about the admin dashboard has
 * been tested.
 */
export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || '',
  password: process.env.E2E_ADMIN_PASSWORD || '',
};

export const hasAdminCredentials = Boolean(ADMIN.email && ADMIN.password);

export const ADMIN_SKIP_REASON =
  'set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in .env — the admin dashboard is untested without them';

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
 *
 * `role` is required on the staff portal and must be omitted on the student
 * one — the two login screens are genuinely different forms. The staff form
 * opens with a custom dropdown, not a <select>, and refuses to submit
 * without a choice: "Please select your role". The first version of this
 * helper filled only email and password, so every staff login timed out
 * waiting for a navigation the form was never going to make.
 */
export async function login(page, { email, password }, loginPath, dashboardPath, role) {
  await page.goto(loginPath);

  if (role) {
    await page.getByRole('button', { name: /select your role/i }).click();
    // The choices are options in a listbox, labelled exactly as ROLE_OPTIONS
    // in FacultyLogin.jsx spells them. `exact` matters: Teacher and Registrar
    // are short enough that a loose match is asking for trouble the day a
    // fifth role is added.
    await page.getByRole('option', { name: role, exact: true }).click();
  }

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`**${dashboardPath}**`, { timeout: 30_000 });
}

export const loginAsStudent = (page, who = STUDENT) =>
  login(page, who, STUDENT_LOGIN, '/student-dashboard');

export const loginAsTeacher = (page, who = TEACHER) =>
  login(page, who, STAFF_LOGIN, '/teacher-dashboard', 'Teacher');

export const loginAsAdmin = (page, who = ADMIN) =>
  login(page, who, STAFF_LOGIN, '/admin-dashboard', 'Admin');

// The admin's tabs are `page` state inside AdminDashboard, not routes, so a
// spec cannot reach one by URL — it clicks the sidebar entry, exactly as a
// person does. These are the labels that entry renders.
export const ADMIN_TABS = [
  'Overview', 'User Management', 'Subjects', 'Teaching Load', 'Sections',
  'Schedules', 'News Management', 'Calendar', 'Memos', 'System Settings',
];

export async function openAdminTab(page, label) {
  await page.locator('.sidebar-item', { hasText: label }).first().click();
  await page.waitForLoadState('networkidle');
}
