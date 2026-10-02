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

  // Half of this test is the finding. The save bar works; the save does
  // not, and it never has — the live school_settings row has no
  // academic_year column, so the PATCH is rejected whole with PGRST204 and
  // nothing is written. saveSettings discards the returned error and says
  // "Settings saved!" regardless.
  //
  // So this asserts what the page DOES today, the way
  // e2e/network-failure.spec.js does for the teacher's swallowed read: the
  // bar appears on a change in a card far from the old button, Save sends
  // one PATCH, and that PATCH comes back 400. When the column question is
  // settled, the status assertion flips to 2xx and the persistence check
  // below it turns back on.
  test('a change in the Security card raises the bar, and Save is attempted', async ({ page }) => {
    const patches = [];
    await page.route('**/rest/v1/school_settings**', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const response = await route.fetch();
      patches.push({ status: response.status(), body: await response.text() });
      await route.fulfill({ response });
    });

    await loginAsAdmin(page);
    await openAdminTab(page, 'System Settings');

    // Nothing is claimed on a page nobody has touched.
    await expect(bar(page)).toHaveCount(0);

    const original = await timeout(page).inputValue();
    const next = TIMEOUTS.find((t) => t !== original);

    // Session Timeout lives in Security; the old Save button was in General.
    // That distance is what UX-028 was about.
    await timeout(page).selectOption(next);
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toContainText('1 unsaved change');

    await bar(page).getByRole('button', { name: /Save Changes/ }).click();
    await expect.poll(() => patches.length, { timeout: 15_000 }).toBe(1);

    expect(patches[0].status, 'if this is now 2xx, the column was added — invert this test').toBe(400);
    expect(patches[0].body).toContain('academic_year');

    // And because the write failed, the bar correctly stays up rather than
    // telling the admin their change was kept. That part is not a known
    // failure; it is the behaviour being asserted.
    await expect(bar(page)).toBeVisible();
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
      'Not configured. Failed sign-ins are not counted or limited.',
      'Backups run automatically every day at 12:30 AM (Manila time). The schedule is not configurable here.',
      'Activity logs are currently kept indefinitely. Automatic cleanup is not available yet.',
    ]) {
      await expect(page.getByText(said)).toBeVisible();
    }
  });
});
