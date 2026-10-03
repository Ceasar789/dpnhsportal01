// UX-028 — the Settings page, after the audit.
//
// Two separate claims are tested here, and they are different kinds of
// claim. One is about the save model: three editable settings, one save bar
// for the page, Discard puts back what was loaded. The other is about
// honesty: the settings nothing reads are no longer controls, so the page
// cannot promise behaviour the system does not have.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

const TIMEOUTS = ['15 min', '30 min', '1 hour', '2 hours'];
const QUARTERS = ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'];
const bar = (page) => page.locator('.settings-savebar');

// The save bar compares the editable settings against the baseline that
// fetchSettings records, and nothing on screen says that read has landed —
// the fields show their defaults until it does. openAdminTab used to wait
// for networkidle, which waited for it by accident; now that it waits for
// the heading instead, these tests have to say what they are really
// waiting for. The response itself is that thing.
// The full-row read. AuthContext reads session_timeout on its own, so that
// one is filtered out.
const settingsRead = (page) => page.waitForResponse(
  (r) => r.url().includes('/rest/v1/school_settings')
    && r.request().method() === 'GET'
    && !r.url().includes('session_timeout'),
);

// The response ARRIVING is not the response being APPLIED. Waiting only for
// the response was not enough: a test edited a field, fetchSettings then
// overwrote it with the loaded value, and the save bar never appeared — or
// worse, appeared and then vanished under a click that was already in
// flight ("element was detached from the DOM"). Waiting until the DOM shows
// the row that came back is the only observable proof that setSettings and
// setSettingsBaseline have both run.
async function showsRow(page, row) {
  await expect(page.locator('#settings-academic-year')).toHaveValue(row.school_year);
  await expect(page.locator('#settings-quarter'))
    .toHaveValue(QUARTERS[(Number(row.current_semester) || 1) - 1]);
  await expect(timeout(page)).toHaveValue(row.session_timeout || '30 min');
}

// Same wait, after a reload rather than a login.
async function reopenSettings(page) {
  const read = settingsRead(page);
  await page.reload();
  const row = await (await read).json();
  await openAdminTab(page, 'System Settings');
  await showsRow(page, row);
  return row;
}

async function loginAndOpenSettings(page) {
  const read = settingsRead(page);
  await loginAsAdmin(page);
  const row = await (await read).json();
  await openAdminTab(page, 'System Settings');
  await showsRow(page, row);
  return row;
}
const timeout = (page) => page.getByLabel('Session Timeout');

test.describe('admin settings', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  // This used to assert a 400. The page wrote academic_year, semester,
  // portal_name, theme, language and auto_save — six keys that are not
  // columns on school_settings — so PostgREST rejected the whole PATCH and
  // nothing had ever saved, including session_timeout, the one setting the
  // app enforces. The payload now writes the columns that exist, so the
  // test asserts the thing it always wanted to: the value comes back after
  // a reload.
  test('a change in the Security card raises the bar, and Save persists it', async ({ page }) => {
    await loginAndOpenSettings(page);

    // Nothing is claimed on a page nobody has touched.
    await expect(bar(page)).toHaveCount(0);

    const original = await timeout(page).inputValue();
    const next = TIMEOUTS.find((t) => t !== original);

    // Session Timeout lives in Security; the old Save button was in
    // General, four cards away. That distance is what UX-028 was about.
    await timeout(page).selectOption(next);
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toContainText('1 unsaved change');

    await expect(bar(page)).toBeVisible();
    await bar(page).getByRole('button', { name: /Save Changes/ }).click();
    await expect(bar(page)).toHaveCount(0, { timeout: 15_000 });

    // Persisted means it survives a reload, not that a toast appeared.
    await reopenSettings(page);
    await expect(timeout(page)).toHaveValue(next);

    // Put the row back the way it was found — this one is enforced, and
    // leaving the suite's choice behind would change how the real portal
    // behaves.
    await timeout(page).selectOption(original);
    await expect(bar(page)).toBeVisible();
    await bar(page).getByRole('button', { name: /Save Changes/ }).click();
    await expect(bar(page)).toHaveCount(0, { timeout: 15_000 });
  });

  // Academic Year and Quarter read and write school_year and
  // current_semester, which are the columns that actually exist. Quarter
  // is the interesting one: the column is an INT and the UI offers four
  // quarters, so the round trip goes through a number and back.
  test('Academic Year and Quarter round-trip through the real columns', async ({ page }) => {
    const sent = [];
    await page.route('**/rest/v1/school_settings**', async (route) => {
      if (route.request().method() === 'PATCH') sent.push(route.request().postDataJSON());
      await route.continue();
    });

    await loginAndOpenSettings(page);

    const quarter = page.locator('#settings-quarter');
    const loaded = await quarter.inputValue();
    const next = ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'].find((q) => q !== loaded);

    await quarter.selectOption(next);
    await expect(bar(page)).toBeVisible();
    await bar(page).getByRole('button', { name: /Save Changes/ }).click();
    await expect(bar(page)).toHaveCount(0, { timeout: 15_000 });

    // The write names the real columns, and none of the six that are not.
    expect(Object.keys(sent[0]).sort()).toEqual([
      'activity_logs_retention', 'auto_backup', 'backup_frequency', 'backup_time',
      'current_semester', 'email_notifications', 'login_attempt_limit',
      'school_year', 'session_timeout', 'two_factor_auth', 'updated_at',
    ]);
    expect(sent[0].current_semester).toBe(['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'].indexOf(next) + 1);

    await reopenSettings(page);
    await expect(page.locator('#settings-quarter')).toHaveValue(next);

    await page.locator('#settings-quarter').selectOption(loaded);
    await expect(bar(page)).toBeVisible();
    await bar(page).getByRole('button', { name: /Save Changes/ }).click();
    await expect(bar(page)).toHaveCount(0, { timeout: 15_000 });
  });

  // The Overview banner reads settings.academic_year and settings.semester,
  // the same two fields the Settings page edits — so it has been showing
  // the hardcoded defaults too, not the row. Both now come from
  // school_year and current_semester, and this is what proves they agree.
  test('the Overview banner shows the same values the Settings page does', async ({ page }) => {
    await loginAndOpenSettings(page);
    const year = await page.locator('#settings-academic-year').inputValue();
    const quarter = await page.locator('#settings-quarter').inputValue();

    await openAdminTab(page, 'Overview');
    await expect(page.getByText(`${year} · ${quarter}`).first()).toBeVisible();
  });

  // The failure this page hid for its whole life: the returned error was
  // never destructured, so a rejected write still said "Settings saved!".
  test('a rejected write says so, keeps the bar up, and keeps the edits', async ({ page }) => {
    await page.route('**/rest/v1/school_settings**', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST204', message: 'intercepted by the e2e suite' }),
      });
    });

    await loginAndOpenSettings(page);

    const original = await timeout(page).inputValue();
    const next = TIMEOUTS.find((t) => t !== original);
    await timeout(page).selectOption(next);
    await expect(bar(page)).toBeVisible();

    await expect(bar(page)).toBeVisible();
    await bar(page).getByRole('button', { name: /Save Changes/ }).click();

    await expect(page.locator('.toast.error')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Could not save settings/i)).toBeVisible();
    await expect(page.getByText('Settings saved!')).toHaveCount(0);

    // The work is still there, and the bar still says so.
    await expect(bar(page)).toBeVisible();
    await expect(timeout(page)).toHaveValue(next);
  });

  test('the count counts, and Discard restores what was loaded', async ({ page }) => {
    await loginAndOpenSettings(page);

    const year = page.locator('#settings-academic-year');
    const quarter = page.locator('#settings-quarter');
    const loadedYear = await year.inputValue();
    const loadedQuarter = await quarter.inputValue();
    const loadedTimeout = await timeout(page).inputValue();

    await year.fill(`${loadedYear}-edited`);
    await expect(bar(page)).toContainText('1 unsaved change');

    const otherQuarter = ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter']
      .find((q) => q !== loadedQuarter);
    await quarter.selectOption(otherQuarter);
    await expect(bar(page)).toContainText('2 unsaved changes');

    await timeout(page).selectOption(TIMEOUTS.find((t) => t !== loadedTimeout));
    await expect(bar(page)).toContainText('3 unsaved changes');

    await bar(page).getByRole('button', { name: /Discard/ }).click();

    await expect(year).toHaveValue(loadedYear);
    await expect(quarter).toHaveValue(loadedQuarter);
    await expect(timeout(page)).toHaveValue(loadedTimeout);
    await expect(bar(page)).toHaveCount(0);
  });

  test('leaving the page with unsaved settings asks first', async ({ page }) => {
    await loginAndOpenSettings(page);

    const year = page.locator('#settings-academic-year');
    const loadedYear = await year.inputValue();
    await year.fill(`${loadedYear}-edited`);
    await expect(bar(page)).toBeVisible();

    // Dismissed: the admin stays where they are and keeps the edit.
    let asked = 0;
    page.on('dialog', async (d) => { asked += 1; await d.dismiss(); });
    await page.locator('.sidebar-item', { hasText: 'Overview' }).first().click({ force: true });
    await expect.poll(() => asked).toBe(1);
    await expect(year).toHaveValue(`${loadedYear}-edited`);

    // Accepted: the edit goes, and so does the admin.
    page.removeAllListeners('dialog');
    page.on('dialog', (d) => d.accept());
    await page.locator('.sidebar-item', { hasText: 'Overview' }).first().click({ force: true });
    await expect(page.locator('#settings-academic-year')).toHaveCount(0);
  });

  // The header button and the Settings dropdown are one state, so there is
  // nothing for them to disagree about. This is what that means on screen.
  test('the theme dropdown and the header button are the same control', async ({ page }) => {
    await loginAndOpenSettings(page);

    const dropdown = page.getByLabel('Theme');
    const headerButton = page.locator('.nav-toggle-btn');
    const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));

    // Dropdown drives the header.
    await dropdown.selectOption('light');
    expect(await isDark()).toBe(false);
    await expect(headerButton).toHaveAttribute('aria-label', /Switch to Dark Mode/i);

    // Header drives the dropdown.
    await headerButton.click();
    expect(await isDark()).toBe(true);
    await expect(dropdown).toHaveValue('dark');

    // It is a device preference, so it survives a reload with no save.
    await dropdown.selectOption('light');
    // Wait for the preference to actually reach localStorage before
    // reloading. The class is applied in a layout effect and the write
    // happens in a separate effect, so reloading immediately can race the
    // write and the page comes back on the old preference.
    await expect.poll(
      () => page.evaluate(() => localStorage.getItem('smartedu-theme')),
      { message: 'the theme preference never reached localStorage' },
    ).toBe('light');
    await reopenSettings(page);
    expect(await isDark()).toBe(false);
    await expect(page.getByLabel('Theme')).toHaveValue('light');

    // Auto follows the device rather than a stored appearance.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.getByLabel('Theme').selectOption('auto');
    expect(await isDark()).toBe(true);
    // And follows it live, without a reload.
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await isDark()).toBe(false);

    await page.emulateMedia({ colorScheme: null });
    await page.getByLabel('Theme').selectOption('dark');
  });

  // The settings nothing reads are statements, not switches. A DISABLED
  // control would still say "this is a setting you cannot reach"; the claim
  // being withdrawn is that it is a setting at all.
  test('the inert settings are text, not controls', async ({ page }) => {
    await loginAndOpenSettings(page);

    // Five controls left on the whole page, and these are they - one of
    // which (Portal Name) is disabled and explains itself.
    const controls = page.locator('.settings-section input, .settings-section select, .settings-section [role=switch]');
    await expect(controls).toHaveCount(5);
    await expect(page.locator('#settings-portal-name')).toBeDisabled();
    await expect(page.locator('#settings-academic-year')).toBeEnabled();
    await expect(page.locator('#settings-quarter')).toBeEnabled();
    await expect(timeout(page)).toBeEnabled();
    await expect(page.getByLabel('Theme')).toBeEnabled();

    // Nothing switches any more — the three toggles switched settings that
    // turned out to be inert.
    await expect(page.getByRole('switch')).toHaveCount(0);

    // And the claims that were false are gone.
    await expect(page.getByText('Locked On')).toHaveCount(0);
    await expect(page.getByText('5 Attempts')).toHaveCount(0);

    for (const said of [
      /Sign-in: email and password. Forgotten passwords are reset through a link sent to the user.s email./,
      'Failed sign-ins are not counted or limited.',
      'Backups run automatically every day at 12:30 AM (Manila time). The schedule is not configurable here.',
      'Activity logs are currently kept indefinitely. Automatic cleanup is not available yet.',
    ]) {
      await expect(page.getByText(said)).toBeVisible();
    }
  });
});

// The save bar on a phone.
//
// It was position: sticky inside .main, which had overflow-y: auto but no
// height to scroll within — so .main grew to fit its content, the WINDOW
// scrolled instead, and sticky had no scrollport to stick to. The bar sat
// at the end of a 2700px page where nobody editing a field at the top
// would ever see it. The fix was to stop .main pretending to scroll.
//
// This asserts the thing a person cares about: having changed something,
// can they see how to save it without going looking.
test.describe('the save bar is reachable', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  for (const width of [360, 768, 1440]) {
    test(`${width}: Save is on screen as soon as the form is dirty`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
      await loginAndOpenSettings(page);

      await page.locator('#settings-academic-year').fill('2099-2100');
      const save = bar(page).getByRole('button', { name: 'Save Changes' });
      await expect(save).toBeVisible();

      const box = await save.boundingBox();
      expect(box.y, 'Save is above the top of the screen').toBeGreaterThanOrEqual(0);
      expect(Math.round(box.y + box.height),
        'Save is below the fold — the bar is not sticking').toBeLessThanOrEqual(800);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(width);

      // And nothing is on top of it.
      const at = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return `${el?.tagName}.${String(el?.className || '').slice(0, 30)}`;
      }, [box.x + box.width / 2, box.y + box.height / 2]);
      expect(at, 'something is covering Save').toContain('BUTTON');
    });
  }

  test('360: the value survives a save and a reload', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(360);
    const row = await loginAndOpenSettings(page);
    const original = row.school_year;

    try {
      await page.locator('#settings-academic-year').fill('2099-2100');
      await bar(page).getByRole('button', { name: 'Save Changes' }).click();
      await expect(bar(page)).toHaveCount(0);

      const after = await reopenSettings(page);
      expect(after.school_year, 'the year did not persist').toBe('2099-2100');
      await expect(page.locator('#settings-academic-year')).toHaveValue('2099-2100');
    } finally {
      // Put the school's real year back whatever happened above.
      await page.locator('#settings-academic-year').fill(original);
      await bar(page).getByRole('button', { name: 'Save Changes' }).click();
      await expect(bar(page)).toHaveCount(0);
    }

    const restored = await reopenSettings(page);
    expect(restored.school_year, 'the original year was not restored').toBe(original);
  });

  // The bar floats over the page while scrolling, which is the point. What
  // it must never do is come to rest on top of the last card: it is in
  // normal flow, so its own height is already reserved at the end of the
  // page and no extra padding is needed to keep it clear.
  test('360: at the bottom of the page it clears the last card', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(360);
    const row = await loginAndOpenSettings(page);

    await page.locator('#settings-academic-year').fill('2099-2100');
    await expect(bar(page)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);

    const geom = await page.evaluate(() => {
      const b = document.querySelector('.settings-savebar').getBoundingClientRect();
      const last = [...document.querySelectorAll('.settings-section')].pop().getBoundingClientRect();
      return { barTop: b.top, lastBottom: last.bottom };
    });
    expect(geom.lastBottom, 'the bar is sitting on the last card')
      .toBeLessThanOrEqual(geom.barTop + 1);

    await page.locator('#settings-academic-year').fill(row.school_year);
  });
});
