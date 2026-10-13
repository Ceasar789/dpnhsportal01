// The admin dashboard — the baseline this overhaul is measured against.
//
// Until now nothing here could be measured at all: e2e/helpers.js seeded a
// student and a teacher only, so every claim about the admin screens came
// from reading source. That is how four separate counts went wrong in one
// day. This spec exists so each phase of the overhaul has a real gate.
//
// It asserts what is TRUE TODAY, before any of the restyle. That is the
// point: it catches what the restyle breaks. The assertions for things the
// audit found broken — keyboard-reachable navigation, modal focus contracts,
// loading states — belong to the phase that fixes them, not here.
import { test, expect } from '@playwright/test';
import { ADMIN_TABS, ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab, appReady } from './helpers.js';

test.describe('admin dashboard', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await appReady(page);
  });

  test('the admin account reaches the admin dashboard', async ({ page }) => {
    await expect(page).toHaveURL(/\/admin-dashboard/);
    // A role that is not main_admin is bounced by the portal's own guard, so
    // landing here at all proves the .env account has the right role.
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  test('every tab renders something', async ({ page }) => {
    for (const label of ADMIN_TABS) {
      await openAdminTab(page, label);
      const main = page.locator('.main').first();
      const text = (await main.innerText().catch(() => '')).trim();
      expect(text.length, `${label} rendered a blank panel`).toBeGreaterThan(0);
    }
  });

  // X1 is a Phase 6 rule, but the baseline matters more than the rule: if a
  // width scrolls sideways today, Phase 6 has to fix it; if it does not,
  // Phase 6 must not introduce it. Either way this is the record.
  const WIDTHS = [360, 390, 768, 1024, 1440];

  for (const width of WIDTHS) {
    test(`${width}px: no sideways scroll on any tab`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const offenders = [];
      for (const label of ADMIN_TABS) {
        await openAdminTab(page, label);
        const over = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (over > 1) offenders.push(`${label} overflows by ${over}px`);
      }
      expect(offenders, `sideways scroll at ${width}px`).toEqual([]);
    });
  }

  test('no icon button on any tab is left unnamed', async ({ page }) => {
    const unnamed = [];
    for (const label of ADMIN_TABS) {
      await openAdminTab(page, label);
      const found = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .filter((b) => b.offsetParent !== null)
          .filter((b) => !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'))
          .filter((b) => !b.textContent.trim())
          .map((b) => (b.className || '(no class)').toString().slice(0, 60)));
      for (const f of found) unnamed.push(`${label}: ${f}`);
    }
    expect(unnamed).toEqual([]);
  });

  // 12 as of Phase 4c, which put every font size on the --font-size-*
  // scale and rounded the 19 call sites at 11px up to it.
  //
  // e2e/text-size.spec.js still says 11, and that is not an oversight: it
  // measures the public pages and the student and teacher dashboards,
  // which this overhaul has not reached. The two floors converge when
  // those are done.
  const FLOOR = 12;

  test(`no tab paints text below ${FLOOR}px`, async ({ page }) => {
    const small = [];
    for (const label of ADMIN_TABS) {
      await openAdminTab(page, label);
      const found = await page.evaluate((floor) => {
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          if (el.offsetParent === null) continue;
          const own = Array.from(el.childNodes)
            .filter((n) => n.nodeType === 3 && n.textContent.trim())
            .map((n) => n.textContent.trim()).join(' ');
          if (!own) continue;
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size < floor) out.push(`${size}px "${own.slice(0, 30)}"`);
        }
        return out;
      }, FLOOR);
      for (const f of found) small.push(`${label}: ${f}`);
    }
    expect(small).toEqual([]);
  });
});
