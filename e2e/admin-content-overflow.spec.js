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

          // The right edge of the area content may occupy, inside the padding.
          const inner = (el) => {
            const cs = getComputedStyle(el);
            return el.getBoundingClientRect().right
              - parseFloat(cs.paddingRight || 0)
              - parseFloat(cs.borderRightWidth || 0);
          };
          const mainLimit = inner(main);

          // How far right this element is allowed to reach.
          //
          // Not the page edge — the edge of whatever actually clips it.
          // Measuring against the page is the second half of the D1/D2
          // miss: at 1440 the calendar's Saturday column ended at 1398
          // with the content area's limit at 1408, so it passed, while
          // the grid clipped it at 1192 and nobody could see it. An
          // element hidden by its own container is just as gone as one
          // hidden by the window.
          //
          // null means exempt: an ancestor opted in to scrolling
          // sideways with --scroll-x: 1, declared in the same CSS rule
          // as its overflow-x so the two cannot drift apart. A wide
          // table is the case where scrolling IS the answer; a month
          // grid has nowhere to scroll to and never gets one.
          const limitFor = (el) => {
            let limit = mainLimit;
            for (let p = el.parentElement; p && p !== main; p = p.parentElement) {
              const cs = getComputedStyle(p);
              if (cs.overflowX === 'visible') continue;
              if (cs.getPropertyValue('--scroll-x').trim() === '1'
                && p.scrollWidth > p.clientWidth + 1) return null;
              limit = Math.min(limit, inner(p));
            }
            return limit;
          };

          const out = [];
          for (const el of main.querySelectorAll('*')) {
            if (el.offsetParent === null) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;

            const limit = limitFor(el);
            if (limit === null) continue;

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
