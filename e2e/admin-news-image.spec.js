// Phase 7C — the news form shows the image you just chose.
//
// It used to show the image already SAVED on the post. Pick a
// replacement and the preview kept showing the old one, so the form
// actively said the wrong thing; on a new post there was no preview at
// all, so nothing confirmed the file had been accepted. The chosen file
// was in state the whole time and never read.
//
// No database writes here: choosing a file stages it in the browser.
// Nothing is uploaded until the post is saved, and none of these saves.
import { test, expect } from '@playwright/test';
import { ADMIN_SKIP_REASON, hasAdminCredentials, loginAsAdmin, openAdminTab } from './helpers.js';

// A real PNG, so the browser decodes it and the preview has dimensions:
// 1x1, red.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const choose = (page, name = 'probe-image.png') =>
  page.locator('#news-attach-image').setInputFiles({ name, mimeType: 'image/png', buffer: PNG });

test.describe('the news image picker', () => {
  test.skip(!hasAdminCredentials, ADMIN_SKIP_REASON);

  test('a new post previews the file that was chosen', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'News Management');
    await page.getByRole('button', { name: /New Post/ }).click();
    await expect(page.locator('.ux-modal').first()).toBeVisible();

    // Nothing to show before a choice is made.
    await expect(page.locator('.news-image-preview')).toHaveCount(0);

    await choose(page);
    const preview = page.locator('.news-image-preview');
    await expect(preview).toBeVisible();

    // It is the staged file, not a saved URL: a blob the browser made.
    const src = await preview.locator('img').getAttribute('src');
    expect(src, `previewed ${src} instead of the chosen file`).toMatch(/^blob:/);

    // And it says it is not saved, with the file's name.
    await expect(preview.locator('.news-image-preview-label')).toContainText('probe-image.png');
    await expect(preview.locator('.news-image-preview-label')).toContainText('not saved yet');

    // The image actually decoded — a broken preview has no dimensions.
    const w = await preview.locator('img').evaluate((el) => el.naturalWidth);
    expect(w, 'the preview did not load').toBeGreaterThan(0);
  });

  test('the choice can be taken back without closing the form', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'News Management');
    await page.getByRole('button', { name: /New Post/ }).click();
    await expect(page.locator('.ux-modal').first()).toBeVisible();

    await choose(page);
    await expect(page.locator('.news-image-preview')).toBeVisible();

    await page.getByRole('button', { name: /^Remove$/ }).click();
    await expect(page.locator('.news-image-preview')).toHaveCount(0);

    // The input is uncontrolled, so clearing state alone would leave the
    // filename sitting next to the button as if a file were still chosen.
    const value = await page.locator('#news-attach-image').inputValue();
    expect(value, 'the file input still holds the cleared file').toBe('');

    // And it can be chosen again afterwards.
    await choose(page, 'second-choice.png');
    await expect(page.locator('.news-image-preview-label')).toContainText('second-choice.png');
  });

  test('editing a post shows the saved image until a new one is chosen', async ({ page }) => {
    // The saved image is injected into the READ rather than written to a
    // post. This is the case that was actually broken — the preview kept
    // showing the old image after a replacement was chosen — and it
    // should not go untested just because no post in the live data
    // happens to carry one. Nothing is written either way.
    await page.route('**/rest/v1/news**', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const res = await route.fetch();
      let rows;
      try { rows = await res.json(); } catch { return route.fulfill({ response: res }); }
      if (Array.isArray(rows)) {
        // A fixture, and labelled as one. Every live post is Published,
        // which offers View (read-only) rather than Edit, and none
        // carries an image — so the editable-with-an-image case cannot
        // be reached from the real data at all. The subject under test
        // is the modal's preview logic, not how the card got there.
        rows = rows.map((r) => ({
          ...r,
          status: 'Draft',
          featured_image_url: 'https://placehold.co/600x200/png',
        }));
      }
      return route.fulfill({
        status: res.status(),
        headers: { ...res.headers(), 'content-type': 'application/json' },
        body: JSON.stringify(rows),
      });
    });

    await loginAsAdmin(page);
    await openAdminTab(page, 'News Management');

    // The accessible name is the aria-label, "Edit <title>", not the
    // visible "Edit" — /^Edit$/ matches nothing.
    const edit = page.getByRole('button', { name: /^Edit / }).first();
    await expect(edit, 'no news post is editable').toBeVisible();
    await edit.click();
    await expect(page.locator('.ux-modal').first()).toBeVisible();

    const preview = page.locator('.news-image-preview');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.news-image-preview-label')).toHaveText('Current image');
    expect(await preview.locator('img').getAttribute('src')).not.toMatch(/^blob:/);

    // Choosing a replacement swaps the preview. Before 7C this still
    // showed the saved image, so the form said the wrong thing.
    await choose(page, 'replacement.png');
    await expect(preview.locator('img')).toHaveAttribute('src', /^blob:/);
    await expect(preview.locator('.news-image-preview-label')).toContainText('replacement.png');

    // Backing out restores the saved one rather than clearing it.
    await page.getByRole('button', { name: /^Keep current$/ }).click();
    await expect(preview.locator('.news-image-preview-label')).toHaveText('Current image');
    expect(await preview.locator('img').getAttribute('src')).not.toMatch(/^blob:/);
  });
});
