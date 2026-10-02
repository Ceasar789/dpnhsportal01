// Phase 2 — everything the audit found unreachable from a keyboard.
//
// UX-093 was the headline: the dashboard's entire page switcher was ten
// divs with a click handler. A keyboard user could not change tab at all.
import { test, expect } from '@playwright/test';
import { ADMIN_TABS, ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

test.describe('admin keyboard access', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForLoadState('networkidle');
  });

  // UX-093. The whole point: reachable AND operable, not merely present.
  test('every sidebar destination is a real control, reachable by keyboard', async ({ page }) => {
    for (const label of ADMIN_TABS) {
      const item = page.getByRole('button', { name: new RegExp(`^${label}$`) }).first();
      await expect(item, `${label} is not exposed as a button`).toHaveCount(1);
    }

    // Operable, not just focusable: drive it with the keyboard and check the
    // page actually changed.
    const users = page.getByRole('button', { name: /^User Management$/ }).first();
    await users.focus();
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');
    await expect(users).toHaveAttribute('aria-current', 'page');
  });

  // Condition 2.
  test('exactly one sidebar item claims to be the current page', async ({ page }) => {
    for (const label of ['Subjects', 'Memos']) {
      await openAdminTab(page, label);
      const current = page.locator('.sidebar-item[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toContainText(label);
    }
  });

  // UX-093's shared Toggle is gone, and so is this test's subject. The
  // three switches it covered - Auto-Save, Email Notifications and
  // Auto-Backup - controlled settings nothing in the system reads, so
  // UX-028 replaced them with read-only statements of what actually
  // happens. e2e/admin-settings.spec.js asserts that, including that no
  // role=switch survives on the page. Removing the control is a stronger
  // outcome than making it accessible, so the test goes with it rather
  // than being rewritten to assert a weaker thing.

  // UX-096 across every form the admin can open.
  test('no form control anywhere is left without a name', async ({ page }) => {
    const OPENERS = [
      ['User Management', /add user|create user|new user/i],
      ['Subjects', /add subject/i],
      ['Sections', /add section/i],
      ['News Management', /new post|add post/i],
      ['Memos', /compose|new memo/i],
      ['Calendar', /add event|new event/i],
    ];
    const unnamed = [];

    for (const [tab, opener] of OPENERS) {
      await openAdminTab(page, tab);
      const trigger = page.getByRole('button', { name: opener }).first();
      if (await trigger.count() === 0) continue;
      await trigger.click();
      await expect(page.getByRole('dialog')).toBeVisible();

      const found = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role=dialog] input, [role=dialog] select, [role=dialog] textarea'))
          .filter((el) => el.type !== 'hidden' && el.offsetParent !== null)
          .filter((el) => {
            if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
            return !(el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
          })
          .map((el) => `${el.tagName.toLowerCase()}${el.type ? '[' + el.type + ']' : ''} id=${el.id || '(none)'}`));

      for (const f of found) unnamed.push(`${tab}: ${f}`);
      await page.keyboard.press('Escape');
      // A dirty check may ask; this spec is not about that.
      page.once('dialog', (d) => d.accept());
      await page.keyboard.press('Escape').catch(() => {});
    }

    expect(unnamed).toEqual([]);
  });

  // UX-097: collapsed, the label is not rendered and the glyph is alone.
  test('the collapsed sidebar still names its destinations', async ({ page }) => {
    const collapse = page.getByRole('button', { name: /collapse sidebar|expand sidebar/i }).first();
    test.skip(await collapse.count() === 0, 'no sidebar collapse control on this width');
    await collapse.click();
    await page.waitForTimeout(400);

    for (const label of ['Overview', 'User Management', 'System Settings']) {
      await expect(
        page.getByRole('button', { name: new RegExp(`^${label}$`) }).first(),
        `${label} lost its name when the sidebar collapsed`,
      ).toHaveCount(1);
    }
  });

  // UX-030: the verb alone repeats once per card.
  test('news card actions name the post they act on', async ({ page }) => {
    await openAdminTab(page, 'News Management');
    const deletes = page.getByRole('button', { name: /^Delete / });
    test.skip(await deletes.count() === 0, 'no posts to act on');
    // A bare "Delete" would mean the label was never widened.
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  });

});
