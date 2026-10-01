// Every icon-only button must announce what it does.
//
// The audit first put this at 9, then 15, then 28, then 68 — each number from
// a regex that `=>` inside an onClick had quietly truncated. Counting in the
// browser instead of in the source settles it: the accessible name is what
// the accessibility tree says it is, which is the thing that actually matters.
import { test, expect } from '@playwright/test';
import { login, STUDENT, TEACHER, STUDENT_LOGIN, STAFF_LOGIN } from './helpers.js';

// A visible button with no text node and no aria-label announces as just
// "button". Passed as a real function — page.evaluate given a STRING
// evaluates it as an expression and hands back the function, not its result,
// which is how the first version of this spec read `undefined` everywhere.
const named = (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('button'))
    .filter((b) => b.offsetParent !== null)
    .filter((b) => !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'))
    .filter((b) => !b.textContent.trim())
    .map((b) => (b.className || '(no class)').toString().slice(0, 70)));

// This one passed before the repair too — the public pages were already
// clean. It is a guard against the next unnamed button, not evidence that
// anything here was fixed. The two dashboard checks below are the ones that
// went from red to green.
test('no public page leaves an icon button unnamed', async ({ page }) => {
  for (const path of ['/', '/news', '/calendar', '/login', '/student-login', '/faculty-login']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await named(page), `${path} has unnamed icon buttons`).toEqual([]);
  }
});

test('the student dashboard names every icon button, collapsed and expanded', async ({ page }) => {
  await login(page, STUDENT, STUDENT_LOGIN, '/student-dashboard');
  await page.waitForLoadState('networkidle');
  expect(await named(page), 'student shell').toEqual([]);

  // Collapsed is the state that strips the visible "Logout" text, leaving the
  // icon alone — that is where a label stops being optional.
  const collapse = page.getByRole('button', { name: 'Collapse sidebar' });
  if (await collapse.count()) {
    await collapse.first().click();
    await page.waitForTimeout(300);
    expect(await named(page), 'student shell with the sidebar collapsed').toEqual([]);
  }
});

test('the teacher dashboard names every icon button on every tab', async ({ page }) => {
  await login(page, TEACHER, STAFF_LOGIN, '/teacher-dashboard', 'Teacher');

  // The tabs are routes, not buttons — clicking through them was flaky and
  // the flakiness was mine, not the app’s.
  for (const path of ['', 'worksheets', 'lesson-plans', 'students', 'attendance', 'announcements']) {
    await page.goto(`/teacher-dashboard/${path}`);
    await page.waitForLoadState('networkidle');
    expect(await named(page), `teacher /${path} has unnamed icon buttons`).toEqual([]);
  }
});
