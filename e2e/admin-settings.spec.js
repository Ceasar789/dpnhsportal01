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
const bar = (page) => page.locator('.settings-savebar');
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
    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

    // Nothing is claimed on a page nobody has touched.
    await expect(bar(page)).toHaveCount(0);

    const original = await timeout(page).inputValue();
    const next = TIMEOUTS.find((t) => t !== original);

    // Session Timeout lives in Security; the old Save button was in
    // General, four cards away. That distance is what UX-028 was about.
    await timeout(page).selectOption(next);
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toContainText('1 unsaved change');

    await bar(page).getByRole('button', { name: /Save Changes/ }).click();
    await expect(bar(page)).toHaveCount(0, { timeout: 15_000 });

    // Persisted means it survives a reload, not that a toast appeared.
    await page.reload();
    await openAdminTab(page, 'System Settings');
    await expect(timeout(page)).toHaveValue(next);

    // Put the row back the way it was found — this one is enforced, and
    // leaving the suite's choice behind would change how the real portal
    // behaves.
    await timeout(page).selectOption(original);
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

    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

    const quarter = page.locator('#settings-quarter');
    const loaded = await quarter.inputValue();
    const next = ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'].find((q) => q !== loaded);

    await quarter.selectOption(next);
    await bar(page).getByRole('button', { name: /Save Changes/ }).click();
    await expect(bar(page)).toHaveCount(0, { timeout: 15_000 });

    // The write names the real columns, and none of the six that are not.
    expect(Object.keys(sent[0]).sort()).toEqual([
      'activity_logs_retention', 'auto_backup', 'backup_frequency', 'backup_time',
      'current_semester', 'email_notifications', 'login_attempt_limit',
      'school_year', 'session_timeout', 'two_factor_auth', 'updated_at',
    ]);
    expect(sent[0].current_semester).toBe(['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'].indexOf(next) + 1);

    await page.reload();
    await openAdminTab(page, 'System Settings');
    await expect(page.locator('#settings-quarter')).toHaveValue(next);

    await page.locator('#settings-quarter').selectOption(loaded);
    await bar(page).getByRole('button', { name: /Save Changes/ }).click();
    await expect(bar(page)).toHaveCount(0, { timeout: 15_000 });
  });

  // The Overview banner reads settings.academic_year and settings.semester,
  // the same two fields the Settings page edits — so it has been showing
  // the hardcoded defaults too, not the row. Both now come from
  // school_year and current_semester, and this is what proves they agree.
  test('the Overview banner shows the same values the Settings page does', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');
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

    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

    const original = await timeout(page).inputValue();
    const next = TIMEOUTS.find((t) => t !== original);
    await timeout(page).selectOption(next);
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
    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

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
    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

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
    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

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
    await page.reload();
    await openAdminTab(page, 'System Settings');
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
    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

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
