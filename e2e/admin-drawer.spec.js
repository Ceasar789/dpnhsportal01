// The navigation drawer owes the same contract a dialog does.
//
// Below 1024px the sidebar is an overlay over the page. That makes it a
// dialog in everything but name: it must take focus, keep it, give it
// back, and stop the page behind it scrolling. Before Phase 6 it did none
// of those — Tab walked straight out of an open drawer and down a page the
// user could not see, Escape did nothing, and the page scrolled behind it.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

const PHONE = { width: 360, height: 780 };
const DESKTOP = { width: 1440, height: 900 };

const menuButton = (page) => page.getByRole('button', { name: 'Open navigation' });
const drawer = (page) => page.locator('#admin-sidebar');

async function openDrawer(page) {
  await expect(menuButton(page)).toBeVisible();
  await menuButton(page).click();
  await expect(drawer(page)).toHaveClass(/mobile-open/);
}

test.describe('the navigation drawer', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(PHONE);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(PHONE.width);
  });

  test('it is a drawer below 1024 and a sidebar above it', async ({ page }) => {
    // 1023 is inside the drawer range, 1024 is not. The rule the review
    // asked for is 1024, and the old one was 900 — so 1000px is the width
    // that tells the two apart.
    for (const [w, drawerExpected] of [[360, true], [768, true], [1000, true], [1024, false], [1440, false]]) {
      await page.setViewportSize({ width: w, height: 900 });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(w);
      await expect.poll(
        () => menuButton(page).isVisible(),
        { message: `menu button visibility at ${w}px` },
      ).toBe(drawerExpected);
    }
  });

  test('Escape closes it and hands focus back to the menu button', async ({ page }) => {
    await openDrawer(page);
    // Focus went INTO the drawer, not merely near it.
    expect(await page.evaluate(() => document.querySelector('#admin-sidebar').contains(document.activeElement))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(drawer(page)).not.toHaveClass(/mobile-open/);
    await expect(menuButton(page)).toBeFocused();
  });

  test('the backdrop closes it and hands focus back', async ({ page }) => {
    await openDrawer(page);
    await page.locator('.sidebar-mobile-overlay').click({ position: { x: 340, y: 400 } });
    await expect(drawer(page)).not.toHaveClass(/mobile-open/);
    await expect(menuButton(page)).toBeFocused();
  });

  test('picking a tab closes it and hands focus back', async ({ page }) => {
    await openDrawer(page);
    await page.locator('.sidebar-item', { hasText: 'Subjects' }).first().click();
    await expect(drawer(page)).not.toHaveClass(/mobile-open/);
    await expect(page.locator('.page-title')).toContainText('Subjects');
    await expect(menuButton(page)).toBeFocused();
  });

  test('Tab cycles inside the drawer instead of walking out', async ({ page }) => {
    await openDrawer(page);
    const inside = () => page.evaluate(() =>
      document.querySelector('#admin-sidebar').contains(document.activeElement));

    // Enough presses to pass the end of any sidebar and wrap.
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      expect(await inside(), `focus escaped the drawer after ${i + 1} tabs`).toBe(true);
    }
    // And backwards off the front.
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside(), 'focus escaped backwards').toBe(true);
    }
  });

  test('the page behind it does not scroll, and the position survives', async ({ page }) => {
    // Somewhere with enough content to scroll. Reached THROUGH the
    // drawer, because a forced click on an off-canvas entry navigated
    // nowhere and left the test on a short Overview with nothing to
    // scroll — which its own guard then caught.
    await openDrawer(page);
    await page.locator('.sidebar-item', { hasText: 'User Management' }).first().click();
    await expect(page.locator('.page-title')).toContainText('User Management');
    await expect(page.locator('.table-card tbody tr').first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 400));
    const before = await page.evaluate(() => window.scrollY);
    expect(before, 'the page did not scroll, so this proves nothing').toBeGreaterThan(0);

    await openDrawer(page);

    // While locked, window.scrollY is 0 BY DESIGN: the lock uses
    // position:fixed with a negative top, so the document is no longer
    // scrolled — the body is offset instead. Asserting scrollY === before
    // here measured the wrong thing and failed against a working lock.
    // What must hold is that the offset does not move.
    const offsetWhileOpen = await page.evaluate(() => document.body.style.top);
    expect(offsetWhileOpen, 'the page was not locked at all').toBe(`-${before}px`);

    // A real wheel gesture over the page, not a programmatic scroll.
    await page.mouse.move(180, 400);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => document.body.style.top),
      'the page moved behind the open drawer').toBe(offsetWhileOpen);

    await page.keyboard.press('Escape');
    await expect(drawer(page)).not.toHaveClass(/mobile-open/);
    await expect.poll(() => page.evaluate(() => window.scrollY),
      { message: 'the scroll position was not restored on close' }).toBe(before);
  });
});

test.describe('the desktop sidebar', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('collapsed/expanded persists across a reload, and only applies on desktop', async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(DESKTOP);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(DESKTOP.width);

    const sidebar = page.locator('#admin-sidebar');
    await expect(sidebar).not.toHaveClass(/collapsed/);
    await page.getByRole('button', { name: /Collapse sidebar/ }).click();
    await expect(sidebar).toHaveClass(/collapsed/);

    await expect.poll(() => page.evaluate(() => localStorage.getItem('smartedu-admin-sidebar')))
      .toBe('collapsed');

    await page.reload();
    await expect(page.locator('#admin-sidebar')).toHaveClass(/collapsed/);

    // On a phone the stored preference must not narrow the drawer: it
    // opens expanded, 256px, whatever desktop remembers.
    await page.setViewportSize(PHONE);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(PHONE.width);
    await menuButton(page).click();
    await expect(page.locator('#admin-sidebar')).toHaveClass(/mobile-open/);
    const width = await page.locator('#admin-sidebar').evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.round(width), 'the drawer opened at the collapsed width').toBe(256);

    // Put the preference back so the next spec starts clean.
    await page.evaluate(() => localStorage.setItem('smartedu-admin-sidebar', 'expanded'));
  });

  test('the collapse control is not offered when there is nothing to collapse', async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(PHONE);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(PHONE.width);
    await menuButton(page).click();
    // It used to sit half outside the left edge of every tab on mobile.
    await expect(page.locator('.sidebar-collapse')).toBeHidden();
  });
});

// Logout was styled for the navy header - near-white text on a near-white
// alpha border - and then reused in the sidebar. A modifier was added to
// theme it, but written ABOVE the base rule at equal specificity, so the
// base won and the header colours came back. Dark mode hid it: near-white
// on a dark rail looks correct. Light mode was white on near-white.
//
// A class name cannot catch that. Contrast can.
test.describe('Logout is readable in both themes', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  const luminance = ([r, g, b]) => {
    const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  for (const theme of ['dark', 'light']) {
    test(`${theme}: the Logout label clears 4.5:1 against the sidebar`, async ({ page }) => {
      await loginAsAdmin(page);
      await page.setViewportSize(DESKTOP);
      await openAdminTab(page, 'System Settings');
      await page.getByLabel('Theme').selectOption(theme);
      await page.waitForTimeout(300);

      const measured = await page.getByRole('button', { name: 'Logout' }).evaluate((el) => {
        const parse = (c) => c.match(/[0-9.]+/g).slice(0, 3).map(Number);
        const cs = getComputedStyle(el);
        // The button's own background if it has one, otherwise whatever it
        // is sitting on - an unpainted button shows the rail behind it.
        let bgEl = el;
        let bg = cs.backgroundColor;
        while (bg === 'rgba(0, 0, 0, 0)' && bgEl.parentElement) {
          bgEl = bgEl.parentElement;
          bg = getComputedStyle(bgEl).backgroundColor;
        }
        return { fg: parse(cs.color), bg: parse(bg), border: parse(cs.borderTopColor), raw: cs.color };
      });

      const text = ratio(measured.fg, measured.bg);
      const edge = ratio(measured.border, measured.bg);
      console.log(`  ${theme}: text ${text.toFixed(2)}:1  border ${edge.toFixed(2)}:1  (${measured.raw})`);

      expect(text, `Logout text on the ${theme} sidebar`).toBeGreaterThanOrEqual(4.5);

      // The border is measured and reported but NOT asserted at 3:1, and
      // that is deliberate rather than a concession. WCAG 1.4.11 asks 3:1
      // of non-text content that is needed TO IDENTIFY a control; this
      // button carries a visible label, so its outline is decoration. The
      // same --border hairline is used by every card and input in the
      // product, and holding this one button to 3:1 would either single it
      // out or force a redesign of every edge on the dashboard. What must
      // not regress is the LABEL, and that is what is asserted.
      expect(edge, 'the border vanished entirely').toBeGreaterThan(1);
    });
  }
});
