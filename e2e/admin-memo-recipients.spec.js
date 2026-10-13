// Phase 7D — a memo can only be addressed to somewhere real.
//
// The compose form and the filter each carried their own hardcoded copy
// of the same six options. Two of those six were departments —
// "Science Dept" and "Math Dept" — and neither exists: the real values
// in profiles.department are "Science" and "Mathematics". A memo
// addressed through that form went to a department with no members, and
// nothing said so.
//
// Read-only: these open the form and read the options, and never save.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;

// The staff list, read directly — the User Management table paginates,
// so "is this department on screen" answers a question about page one
// rather than about the data.
async function staffDepartments(request) {
  const auth = await request.post(`${URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    data: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD },
  });
  const token = (await auth.json()).access_token;
  const res = await request.get(
    `${URL}/rest/v1/profiles?select=role,department&department=not.is.null`,
    { headers: { apikey: ANON, Authorization: `Bearer ${token}` } },
  );
  const staff = new Set(['teacher', 'faculty', 'registrar', 'admin', 'main_admin']);
  return new Set((await res.json())
    .filter((p) => staff.has((p.role || '').toLowerCase()))
    .map((p) => (p.department || '').trim())
    .filter(Boolean));
}

const options = (locator) => locator.evaluate((el) =>
  [...el.options].map((o) => o.textContent.trim()));

test.describe('memo recipients', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('compose offers the departments that exist, and no invented ones', async ({ page, request }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'Memos');
    await page.getByRole('button', { name: /Compose/ }).click();
    await expect(page.locator('.ux-modal').first()).toBeVisible();

    // The departments come from the profiles list, which the dashboard
    // fetches on mount — so right after Compose opens the select may
    // still hold only the four fixed groups.
    const select = page.locator('#memos-recipient');
    await expect.poll(async () => (await options(select)).length, {
      message: 'the recipient list never grew past the fixed groups',
      timeout: 20_000,
    }).toBeGreaterThan(4);

    const got = await options(select);

    // The invented ones are gone.
    expect(got, 'a department that does not exist is still offered').not.toContain('Science Dept');
    expect(got, 'a department that does not exist is still offered').not.toContain('Math Dept');

    // The role groups stay — they are the app's own vocabulary, not data.
    for (const fixed of ['All', 'All Faculty', 'All Students', 'Registrar Office']) {
      expect(got, `${fixed} should still be offered`).toContain(fixed);
    }

    // And the real departments are there, read from profiles.
    const departments = got.filter((o) =>
      !['All', 'All Faculty', 'All Students', 'Registrar Office'].includes(o));
    expect(departments.length, 'no departments came from the data').toBeGreaterThan(0);

    // Every one belongs to real staff, checked against the profiles
    // table rather than against a second constant in the test.
    const real = await staffDepartments(request);
    for (const dept of departments) {
      expect([...real], `"${dept}" is offered but belongs to no staff member`).toContain(dept);
    }
  });

  test('the filter offers only recipients some memo actually has', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'Memos');

    // The options are derived from the memos, so they are empty until
    // the memos arrive. Wait for the list, not for the select.
    await expect(page.locator('.memo-list-item').first()).toBeVisible();

    const filter = page.getByLabel('Filter by recipient');
    const got = (await options(filter)).filter((o) => o !== 'All Recipients');
    expect(got.length, 'the filter offers nothing at all').toBeGreaterThan(0);

    // What the list itself shows, as the source of truth.
    const rows = await page.locator('.memo-list-item').count();
    expect(rows, 'no memos to compare against').toBeGreaterThan(0);

    // Every option finds at least one memo. The old filter offered six
    // fixed values whatever the data held, so most of them matched
    // nothing and read as "there are no memos".
    for (const value of got) {
      await filter.selectOption(value);
      await page.waitForTimeout(250);
      const shown = await page.locator('.memo-list-item').count();
      expect(shown, `filtering by "${value}" shows nothing`).toBeGreaterThan(0);
    }
  });

  test('the two lists come from one source', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'Memos');

    await expect(page.locator('.memo-list-item').first()).toBeVisible();
    const filterValues = (await options(page.getByLabel('Filter by recipient')))
      .filter((o) => o !== 'All Recipients');

    await page.getByRole('button', { name: /Compose/ }).click();
    await expect(page.locator('.ux-modal').first()).toBeVisible();
    const composeValues = await options(page.locator('#memos-recipient'));

    // A filter value is either something the app offers when composing,
    // or something older than the current options — never a third list.
    // What must never happen again is a value in BOTH lists that exists
    // in neither the data nor the app's vocabulary.
    for (const v of filterValues) {
      expect(composeValues, `"${v}" appears in the filter but cannot be composed`).toContain(v);
    }
  });
});
