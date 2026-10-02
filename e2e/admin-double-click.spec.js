// Rule B2 — a busy save button is NOT disabled.
//
// Taking `disabled` off is what makes the button keep focus and stay
// reachable while the request is in flight. It also means the second half of
// a double click now reaches the handler, so every one of these buttons got
// a ref guard in the same commit. These tests are what prove the guard is
// actually there: remove it and each one sees two inserts.
//
// Two things learned the hard way, both of which this file depends on:
//
//   * `button.click()` twice is NOT a double click. The first click flips the
//     button to its busy label, the locator stops matching, and Playwright
//     waits out the second. Both clicks are dispatched in ONE `evaluate` so
//     they land in the same tick, as a real double click does.
//   * An empty form never reaches the guard — validation returns above it.
//     Every test fills valid data first; a test that double-clicks an invalid
//     form passes whether the guard exists or not.
//
// The insert is intercepted and answered with a 201, so the suite proves the
// guard without writing rows into the database it runs against.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

// Counts POSTs to one table and holds each one open long enough that a
// second click would have to land while the first is still in flight.
function countInserts(page, table, { emptyReads = false } = {}) {
  const seen = { posts: 0 };
  page.route(`**/rest/v1/${table}**`, async (route) => {
    if (route.request().method() !== 'POST') {
      // emptyReads answers the GET with nothing, which is how a form whose
      // every option is already taken in this database is made fillable.
      return emptyReads
        ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        : route.continue();
    }
    seen.posts += 1;
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });
  return seen;
}

// One click in each half of a double click, dispatched together so the
// second cannot be swallowed by the re-render the first causes.
async function doubleClick(locator) {
  await locator.evaluate((el) => { el.click(); el.click(); });
}

async function expectExactlyOneInsert(seen) {
  await expect.poll(() => seen.posts, { message: 'no insert was attempted at all' })
    .toBeGreaterThan(0);
  // Long enough for a second insert to have been issued if the guard let it.
  await new Promise((r) => setTimeout(r, 2500));
  expect(seen.posts, 'the second click of a double click reached the handler').toBe(1);
}

test.describe('a double click saves once', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('Subjects · Create', async ({ page }) => {
    await loginAsAdmin(page);
    const seen = countInserts(page, 'subjects');
    await openAdminTab(page, 'Subjects');
    await page.getByRole('button', { name: /Add Subject/ }).click();
    await page.locator('#subjects-subject-name').fill('Double Click Probe');
    await page.locator('#subjects-code').fill('DBLCLK');
    await doubleClick(page.getByRole('button', { name: /^Create$/ }));
    await expectExactlyOneInsert(seen);
  });

  test('Sections · Create', async ({ page }) => {
    await loginAsAdmin(page);
    const seen = countInserts(page, 'sections');
    await openAdminTab(page, 'Sections');
    await page.getByRole('button', { name: /Add Section/ }).click();
    await page.locator('#sections-section-name').fill('Double Click Probe');
    await page.locator('#sections-grade-level').selectOption({ index: 1 });
    await doubleClick(page.getByRole('button', { name: /^Create$/ }));
    await expectExactlyOneInsert(seen);
  });

  test('Calendar · Add Event', async ({ page }) => {
    await loginAsAdmin(page);
    const seen = countInserts(page, 'calendar_events');
    await openAdminTab(page, 'Calendar');
    await page.getByRole('button', { name: /Add Event/ }).click();
    await page.locator('#calendar-title').fill('Double Click Probe');
    await page.locator('#calendar-start-date').fill('2026-12-01');
    await doubleClick(page.getByRole('button', { name: /^Add Event$/ }).last());
    await expectExactlyOneInsert(seen);
  });

  test('Memos · Send', async ({ page }) => {
    await loginAsAdmin(page);
    const seen = countInserts(page, 'memos');
    await openAdminTab(page, 'Memos');
    await page.getByRole('button', { name: /Compose/ }).click();
    await page.locator('#memos-subject').fill('Double Click Probe');
    await page.locator('#memos-body').fill('Body.');
    await doubleClick(page.getByRole('button', { name: /^Send$/ }));
    await expectExactlyOneInsert(seen);
  });

  test('News · Publish', async ({ page }) => {
    await loginAsAdmin(page);
    const seen = countInserts(page, 'news');
    await openAdminTab(page, 'News Management');
    await page.getByRole('button', { name: /New Post/ }).click();
    await page.locator('#news-title').fill('Double Click Probe');
    await page.locator('#news-content').fill('Body.');
    await doubleClick(page.getByRole('button', { name: /^Publish$/ }));
    await expectExactlyOneInsert(seen);
  });
  // Reaching Assign means staging an entry first: a teacher who does not
  // already hold this grade, and a subject nobody holds for it. If the test
  // database has neither free, the staging step cannot happen — the test
  // fails with that reason rather than passing on an empty list.
  test('Teaching Load · Assign', async ({ page }) => {
    await loginAsAdmin(page);
    // The seeded database already holds every subject at every grade, so
    // both pickers come up fully disabled and nothing can be staged. The
    // existing-load READ is answered with an empty list to free them. That
    // is the form's input, not the behaviour under test.
    const seen = countInserts(page, 'teacher_subjects', { emptyReads: true });
    await openAdminTab(page, 'Teaching Load');

    const teacher = page.locator('.picker-row:not(.disabled) input[type=radio]').first();
    await expect(teacher, 'no teacher is free even with the load read emptied')
      .toBeVisible({ timeout: 10_000 });
    await teacher.check();

    const subject = page.locator('.bulk-grid select').first();
    const free = await subject.evaluate((el) => {
      const o = [...el.options].find((x) => x.value && !x.disabled);
      return o ? o.value : null;
    });
    expect(free, 'no subject is free even with the load read emptied').toBeTruthy();
    await subject.selectOption(free);

    await page.getByRole('button', { name: /Add to list/ }).click();
    await doubleClick(page.getByRole('button', { name: 'Assign 1 entry' }));
    await expectExactlyOneInsert(seen);
  });
  // The schedule form is the one with a real precondition: the chosen
  // teacher must already hold the subject at that grade, or canTeachSection
  // rejects the save before it reaches the guard. The teacher select only
  // offers teachers who qualify, so the first one is taken — and if it is
  // empty the test says the grade has no eligible teacher rather than
  // passing on a form that never submitted.
  test('Schedules · Create', async ({ page }) => {
    await loginAsAdmin(page);
    const seen = countInserts(page, 'schedules');
    await openAdminTab(page, 'Schedules');

    await page.locator('.section-chip').first().click();
    await page.getByRole('button', { name: /^Add$/ }).first().click();

    const teacher = page.locator('#schedules-teacher');
    await expect(teacher).toBeVisible();
    const eligible = await teacher.evaluate((el) => {
      const o = [...el.options].find((x) => x.value && !x.disabled);
      return o ? o.value : null;
    });
    expect(eligible, 'no teacher holds this subject at this grade').toBeTruthy();
    await teacher.selectOption(eligible);
    await page.locator('#schedules-start').fill('07:00');
    await page.locator('#schedules-end').fill('08:00');

    await doubleClick(page.getByRole('button', { name: /^Create$/ }));
    await expectExactlyOneInsert(seen);
  });
});
