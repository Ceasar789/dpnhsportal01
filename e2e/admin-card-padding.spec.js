// Content must not sit flush against the edge of the card holding it.
//
// This exists because of a specific, quiet failure. `.stat-card` set
// `padding: var(--space-16)`; `.clickable-stat` — a button reset on the
// same element — set `padding: 0`. Same specificity, later in the file, so
// the reset won and every stat card rendered its label, its number and its
// icon hard against the border. Nothing failed. The build was clean, the
// suite was green, and it was only visible to someone looking at a
// screenshot.
//
// A reset that removes what a <button> brings is right; one that removes
// what the component set is not, and the difference is invisible without a
// check like this. Phase 5 rebuilds cards across nine more tabs, so the
// check comes first.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, ADMIN_TABS, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

// Every surface that presents content as a card. If Phase 5 adds another,
// add it here — the point is that the list is explicit.
const CARDS = ['.stat-card', '.chart-card', '.card', '.table-card', '.settings-card'];

// .table-card is the exception and says so: a table draws its own cell
// padding, and padding on the card would sit outside the scroll container
// added for the mobile fix.
const SELF_PADDING = new Set(['.table-card']);

test.describe('cards have inner padding', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('no card on any tab renders its content against the border', async ({ page }) => {
    await loginAsAdmin(page);
    const flush = [];

    for (const tab of ADMIN_TABS) {
      await openAdminTab(page, tab);
      const found = await page.evaluate(({ selectors, exempt }) => {
        const out = [];
        for (const sel of selectors) {
          if (exempt.includes(sel)) continue;
          for (const el of document.querySelectorAll(sel)) {
            if (el.offsetParent === null) continue;
            const cs = getComputedStyle(el);
            const sides = {
              top: parseFloat(cs.paddingTop),
              right: parseFloat(cs.paddingRight),
              bottom: parseFloat(cs.paddingBottom),
              left: parseFloat(cs.paddingLeft),
            };
            // A card may legitimately pad with a child wrapper instead, so
            // a zero side only counts when the card has no padded child
            // doing the job for it.
            const padsItself = Object.values(sides).every((v) => v > 0);
            if (padsItself) continue;
            const child = el.firstElementChild;
            const childPads = child && Object.values({
              t: parseFloat(getComputedStyle(child).paddingTop),
              r: parseFloat(getComputedStyle(child).paddingRight),
              b: parseFloat(getComputedStyle(child).paddingBottom),
              l: parseFloat(getComputedStyle(child).paddingLeft),
            }).every((v) => v > 0);
            if (childPads) continue;
            out.push(`${sel} [${el.className}] padding ${sides.top}/${sides.right}/${sides.bottom}/${sides.left}`);
          }
        }
        return [...new Set(out)];
      }, { selectors: CARDS, exempt: [...SELF_PADDING] });

      for (const f of found) flush.push(`${tab}: ${f}`);
    }

    expect(flush, 'these cards put content against their own border').toEqual([]);
  });
});
