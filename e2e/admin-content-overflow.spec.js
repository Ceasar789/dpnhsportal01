// Nothing inside the content area may be painted past its right edge.
//
// This exists because the suite already had a no-horizontal-scroll check
// and it passed on a calendar whose Friday and Saturday columns were
// invisible. document.documentElement.scrollWidth cannot see that: the
// clipped child sits inside a container with overflow hidden or auto, so
// the PAGE never grows and the page-level check stays green while two
// columns, the toolbar actions and the whole Upcoming rail are off screen.
//
// So this measures children against the box that is supposed to hold
// them, which is the only question that matters to someone looking at the
// screen.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

const WIDTHS = [360, 768, 1024, 1440];
const TABS = ['Overview', 'Calendar', 'News Management', 'System Settings'];

test.describe('nothing is painted outside the content area', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  for (const tab of TABS) {
    test(`${tab}: every visible element fits its container`, async ({ page }) => {
      test.setTimeout(120_000);
      await loginAsAdmin(page);

      const problems = [];
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(w);
        await openAdminTab(page, tab);
        await page.waitForTimeout(300);

        const found = await page.evaluate(() => {
          const main = document.querySelector('.main');
          if (!main) return ['no .main'];
          // The right edge of the area content is allowed to occupy,
          // inside the padding.
          const cs = getComputedStyle(main);
          const limit = main.getBoundingClientRect().right - parseFloat(cs.paddingRight);
          const out = [];

          for (const el of main.querySelectorAll('*')) {
            if (el.offsetParent === null) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;

            // A deliberately scrollable box is allowed to hold more than
            // it shows — that is what scrolling is for. What is NOT
            // allowed is the box itself sticking out, or a child sticking
            // out of a box that does not scroll.
            let scrollableAncestor = false;
            for (let p = el.parentElement; p && p !== main; p = p.parentElement) {
              const o = getComputedStyle(p).overflowX;
              if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth + 1) {
                scrollableAncestor = true; break;
              }
            }
            if (scrollableAncestor) continue;

            if (r.right > limit + 1) {
              const name = el.tagName.toLowerCase()
                + (el.className ? '.' + String(el.className).split(' ').slice(0, 2).join('.') : '');
              out.push(`${name} right=${Math.round(r.right)} limit=${Math.round(limit)} (+${Math.round(r.right - limit)}px) "${(el.textContent || '').trim().slice(0, 22)}"`);
            }
          }
          // Deduplicate: one overflowing parent reports every descendant.
          return [...new Set(out)].slice(0, 12);
        });

        for (const f of found) problems.push(`${w}px · ${f}`);
      }

      expect(problems, `${tab}: content painted outside the content area`).toEqual([]);
    });
  }
});
