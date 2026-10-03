// ============================================
// FILE: e2e/helpers.js
// Login, and the seeded accounts every spec shares.
//
// The credentials here are the throwaway test population from
// backend/database/seeds — example.com addresses that cannot
// receive mail, all sharing one password, all meant to be deleted after
// testing. Nothing real is committed here.
// ============================================

import { expect } from '@playwright/test';

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
// What waitForLoadState('networkidle') was being used for, done in a way
// that works here.
//
// networkidle means "no network request for 500ms". This app holds Supabase
// realtime websockets open, so that is a condition its pages do not
// reliably reach — and a second Playwright process on the same machine is
// enough extra load to tip it over. It timed out intermittently on
// polish.spec, admin-a11y.spec and tokens.spec during Phase 4, every time
// on a spec unrelated to the change being made. A flaky wait is worse than
// no wait: it fails tests that are passing.
//
// What every caller actually meant is "React has painted something".
// That is #root having content, which is a fact about the page rather than
// a guess about the network. Everything after it is covered by Playwright's
// own auto-waiting on locators and assertions.
export async function appReady(page) {
  // React has mounted something.
  await expect(page.locator('#root')).not.toBeEmpty();

  // And its first fetch has finished. #root alone was not enough: the
  // public News and Calendar pages render a spinner while loading, and a
  // test that measured `article` elements the moment the shell appeared
  // found none — evaluateAll, count() and innerText do not auto-wait, so
  // they read an empty page and either failed or skipped themselves.
  //
  // Both pages drop the spinner when the data lands, which is the same
  // moment networkidle used to catch and is a fact about the page rather
  // than about the network.
  await expect(page.locator('.animate-spin, .loading-row .spin')).toHaveCount(0);
}

// spec cannot reach one by URL — it clicks the sidebar entry, exactly as a
// person does. These are the labels that entry renders.
export const ADMIN_TABS = [
  'Overview', 'User Management', 'Subjects', 'Teaching Load', 'Sections',
  'Schedules', 'News Management', 'Calendar', 'Memos', 'System Settings',
];

export async function openAdminTab(page, label) {
  const item = page.locator('.sidebar-item', { hasText: label }).first();
  const drawerButton = page.getByRole('button', { name: 'Open navigation' });

  // Two separate things have to settle before the entry can be clicked,
  // and both of them bit this helper in turn.
  //
  // 1. setViewportSize() is awaited, but the page's layout lands after it.
  //    Sampling position inside that window reads the OLD layout. The
  //    drawer button is not a usable signal — it is in the DOM at every
  //    width and only hidden by CSS — so the signal is window.innerWidth
  //    agreeing with the viewport Playwright asked for.
  await expect.poll(
    () => page.evaluate(() => window.innerWidth),
    { message: 'the viewport resize never reached the page' },
  ).toBe(page.viewportSize().width);

  // 2. The sidebar ANIMATES between the two layouts
  //    (`transition: width .3s ease, transform .3s ease`). Immediately
  //    after a resize to 360 the entry is still at x=12, on its way to
  //    x=-244 — on screen, stable enough for one sample, and gone by the
  //    time a click lands. Asking "is it on screen?" before it has stopped
  //    moving gets a true answer to the wrong question.
  const stopped = async () => {
    const a = await item.boundingBox();
    await page.waitForTimeout(80);
    const b = await item.boundingBox();
    return Boolean(a && b) && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
  };
  await expect.poll(stopped, { message: 'the sidebar never stopped moving' }).toBe(true);

  // Below 900px the sidebar is off-canvas (AdminDashboard.jsx:531) and the
  // entry cannot be clicked until the drawer is open. 900, not the 1024 the
  // design rules ask for — that gap is a Phase 6 finding, not something to
  // paper over here.
  const onScreen = async () => {
    const box = await item.boundingBox();
    return Boolean(box) && box.x >= 0 && box.x < page.viewportSize().width;
  };
  if (!(await onScreen())) {
    await drawerButton.click();
    await expect.poll(onScreen, { message: 'the drawer never slid in' }).toBe(true);
    await expect.poll(stopped, { message: 'the drawer never stopped moving' }).toBe(true);
  }

  // No `force`. It used to be here because .sidebar-item carried
  // `transition: all .3s ease` and the active entry animates its own
  // padding and left border, so Playwright's stability check waited out
  // its own timeout on an element that was only changing appearance.
  // Phase 4f halved that to 150ms — measured, not assumed: getComputedStyle
  // reports 0.15s — and the click lands on its own.
  await item.click();
  // The tab has arrived when its own heading is on screen — a fact about
  // this navigation, not about the network going quiet.
  await expect(page.locator('.page-title').first()).toBeVisible();
}

