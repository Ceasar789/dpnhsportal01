// Not a test — the batch D camera. Deleted from the suite after the run.
//
// The process this follows exists because of a mistake: after fixing the
// calendar in batch C I re-shot only the agenda files, so the review was
// done against pre-fix images and raised two findings against code that
// was already correct. Every shot in the folder is now taken in one run,
// from one commit, and the commit is written into a manifest beside them.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { ADMIN_TABS, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

const DIR = process.env.SHOT_DIR || 'screenshots/phase6/batchD/after';
const WIDTHS = [
  { w: 360, h: 780 },
  { w: 768, h: 900 },
  { w: 1440, h: 900 },
];

const shots = [];

// fullPage is wrong for anything that floats. A sticky or fixed element is
// painted once, at the scroll position it had, so a full-page capture of
// the save bar puts it in the middle of a 2700px page — exactly the bug
// this batch fixed, photographed back into existence. Those shots are
// taken at viewport size, which is where the thing actually is.
async function shoot(page, name, { fullPage = true } = {}) {
  // The logo coin-flip never settles, so it is stopped rather than waited
  // out; otherwise every pair of shots differs on the logo alone.
  await page.addStyleTag({ content: '.eduscribe-flip-inner { animation: none !important; }' });
  // Park the pointer away from any row: a row left under the cursor after
  // a click paints its hover tint and reads as a rendering bug.
  await page.mouse.move(2, 2);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
  shots.push(`${name}.png`);
}

test('batch D shots', async ({ page }) => {
  test.skip(!hasAdminCredentials, 'no admin credentials');
  test.setTimeout(1_200_000);

  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsAdmin(page);

  for (const theme of ['dark', 'light']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAdminTab(page, 'System Settings');
    await page.getByLabel('Theme').selectOption(theme);

    for (const { w, h } of WIDTHS) {
      await page.setViewportSize({ width: w, height: h });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(w);

      // Every tab, every width, every theme.
      for (const tab of ADMIN_TABS) {
        await openAdminTab(page, tab);
        await shoot(page, `${theme}-${w}-${tab.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
      }

      // D1/D2 named the calendar at 768 and 1440 specifically, and the
      // agenda is a different view, not a narrower one.
      if (w === 360) {
        await openAdminTab(page, 'Calendar');
        await shoot(page, `${theme}-${w}-calendar-agenda`);
      }

      // D3: the section form sheet, shut and open, so the header behind
      // the scrim can be compared in one pair rather than across runs.
      if (w === 360) {
        await openAdminTab(page, 'Sections');
        await shoot(page, `${theme}-${w}-section-form-closed`);
        await page.getByRole('button', { name: /Add Section/ }).first().click();
        await expect(page.locator('.ux-modal').first()).toBeVisible();
        await shoot(page, `${theme}-${w}-section-form-open`, { fullPage: false });
        await page.keyboard.press('Escape');
        await expect(page.locator('.ux-modal')).toHaveCount(0);
      }

      // The save bar only exists when there is something to save.
      await openAdminTab(page, 'System Settings');
      const year = page.locator('#settings-academic-year');
      const original = await year.inputValue();
      await year.fill('2099-2100');
      await expect(page.locator('.settings-savebar')).toBeVisible();
      await shoot(page, `${theme}-${w}-settings-dirty`, { fullPage: false });
      await page.locator('.settings-savebar').getByRole('button', { name: 'Discard' }).click();
      await expect(page.locator('.settings-savebar')).toHaveCount(0);
      await expect(year).toHaveValue(original);

      // The drawer is the main thing that changes below 1024.
      if (w !== 1440) {
        await openAdminTab(page, 'Overview');
        await page.getByRole('button', { name: 'Open navigation' }).click();
        await expect(page.locator('.sidebar')).toBeVisible();
        await shoot(page, `${theme}-${w}-drawer-open`, { fullPage: false });
        await page.keyboard.press('Escape');
      }
    }
  }

  // The manifest is the part that makes a stale shot impossible to review
  // by accident.
  const head = execSync('git rev-parse HEAD').toString().trim();
  const when = new Date().toISOString();
  fs.writeFileSync(`${DIR}/manifest.txt`, [
    `Phase 6 batch D — after shots`,
    `commit: ${head}`,
    `taken:  ${when}`,
    `count:  ${shots.length}`,
    '',
    ...shots.sort().map((f) => `${head.slice(0, 7)}  ${f}`),
    '',
  ].join('\n'));
  console.log(`SHOTS -> ${DIR} (${shots.length} files at ${head.slice(0, 7)})`);
});
