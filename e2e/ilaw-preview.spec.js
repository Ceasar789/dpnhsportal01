import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const LOCAL_ORIGIN = 'http://127.0.0.1:4178';
const WIDTHS = [360, 390, 768, 1024, 1440];

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== LOCAL_ORIGIN) return route.abort('blockedbyclient');
    return route.continue();
  });
});

test('MI-13 and MI-14 protect dirty fixture switching without mixing Teacher drafts', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Full Manual ILAW' }).click();
  await page.getByRole('textbox', { name: 'Name of Lesson' }).fill('Unsaved mathematics');
  const selector = page.getByRole('combobox', { name: 'Preview Teacher and plan' });
  await selector.selectOption('1');
  const dialog = page.getByRole('dialog', { name: 'Switch ILAW example' });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mi13-switch-dialog.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(selector).toHaveValue('0');
  await expect(page.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('Unsaved mathematics');
  await selector.selectOption('1');
  await page.getByRole('dialog', { name: 'Switch ILAW example' }).getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByRole('textbox', { name: 'Learning Area/s' })).toHaveValue('Science');
  await expect(page.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('');
  await selector.selectOption('0');
  await expect(page.getByRole('textbox', { name: 'Learning Area/s' })).toHaveValue('Mathematics');
  await expect(page.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('');
});

test('F4 downloads the edited structured Manual ILAW as a real PDF with a safe filename', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Full Manual ILAW' }).click();
  await page.getByRole('textbox', { name: 'Name of Lesson' }).fill('Synthetic English Lesson');
  await page.getByRole('textbox', { name: 'Learning Objectives, Monday' }).fill('Edited Monday objective');
  await page.getByRole('textbox', { name: 'Suggested PDF filename' }).fill('ILAW: English/Grade 7.pdf');
  await page.evaluate(() => { window.__f4PrintCalls = 0; window.print = () => { window.__f4PrintCalls += 1; }; });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('ILAW_ English_Grade 7.pdf');
  await download.saveAs('screenshots/pdf-f4-evaluation/browser-edited.pdf');
  const bytes = fs.readFileSync(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(1000);
  expect(await page.evaluate(() => window.__f4PrintCalls)).toBe(0);
  await expect(page.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('Synthetic English Lesson');
  await expect(page.getByRole('textbox', { name: 'Learning Objectives, Monday' })).toHaveValue('Edited Monday objective');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('F4 keeps Manual Print and Download reachable in a narrow editor', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Full Manual ILAW' }).click();
  await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  await page.screenshot({ path: 'screenshots/pdf-f4-evaluation/manual-download-toolbar-360.png', fullPage: true });
});

test('F4 reports a failed logo conversion and does not start an invalid download', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Full Manual ILAW' }).click();
  await page.evaluate(() => {
    HTMLImageElement.prototype.decode = () => Promise.reject(new Error('Synthetic image failure'));
  });
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await page.getByRole('button', { name: 'Download PDF' }).click();
  await expect(page.getByRole('alert')).toContainText('A school logo could not be loaded for the PDF.');
  expect(downloads).toBe(0);
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeEnabled();
});

for (const width of WIDTHS) {
  test(`isolated ILAW editor and preview at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'ILAW Template — Local QA Preview' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('');
    await expect(page.getByRole('img', { name: 'Dela Paz National High School seal' })).toHaveJSProperty('naturalWidth', 534);
    await expect(page.getByRole('img', { name: 'Department of Education logo' })).toHaveJSProperty('naturalWidth', 800);
    await expect(page.getByRole('img', { name: 'EduScribe logo' })).toHaveJSProperty('naturalWidth', 512);
    const hybrid = await page.locator('.ilaw-template-hybrid-mark:visible').evaluate(element => {
      const images = [...element.querySelectorAll('img')];
      return { widths: images.map(image => image.getBoundingClientRect().width), natural: images.map(image => [image.naturalWidth, image.naturalHeight]), fits: images.map(image => getComputedStyle(image).objectFit) };
    });
    expect(hybrid.widths[0]).toBe(hybrid.widths[1]);
    expect(hybrid.fits).toEqual(['contain', 'contain']);
    expect(hybrid.natural[0][0]).toBeGreaterThan(0);
    expect(hybrid.natural[1][0]).toBeGreaterThan(0);
    await expect(page.locator('.ilaw-template table:visible')).toHaveCount(5);
    await expect(page.getByRole('textbox', { name: 'Declaration of AI Use' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Name of Lesson' }).fill('Synthetic visual QA edit');
    await page.getByRole('button', { name: 'Read-only preview' }).click();
    await expect(page.getByText('Synthetic visual QA edit')).toBeVisible();
    await expect(page.locator('.ilaw-template input:visible, .ilaw-template textarea:visible')).toHaveCount(0);
    await page.getByRole('button', { name: 'Populated example' }).click();
    await expect(page.getByRole('textbox', { name: 'Learning Area/s' })).toHaveValue('Mathematics');
    await expect(page.getByRole('textbox', { name: 'Designed for which Grade Level and Section' })).toHaveValue('Grade 8, Section Sample');
    await expect(page.getByRole('textbox', { name: 'Checked by name' })).toHaveValue('');
    const pageWidth = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client);
    const tableWidth = await page.getByRole('region', { name: 'Intentions table' }).evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    if (width <= 390) expect(tableWidth.scroll).toBeGreaterThan(tableWidth.client);
    const monday = page.getByRole('textbox', { name: 'Learning Objectives, Monday' });
    await monday.focus();
    await expect(monday).toBeFocused();
    expect(await monday.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
    if (width === 360 || width === 1440) {
      await page.screenshot({ path: `test-results/ilaw-preview/editor-${width}.png`, fullPage: true });
    }
  });
}

test('print media keeps the read-only document and hides the local QA toolbar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Populated example' }).click();
  await page.getByRole('button', { name: 'Read-only preview' }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: 'ILAW Template — Local QA Preview' })).toBeHidden();
  await expect(page.getByText('Equivalent Fractions', { exact: true })).toBeVisible();
  await expect(page.locator('.ilaw-template table:visible')).toHaveCount(5);
  await page.screenshot({ path: 'test-results/ilaw-preview/print-media.png', fullPage: true });
  await page.pdf({ path: 'test-results/ilaw-preview/print.pdf', format: 'A4', printBackground: true });
});

test('isolated Full Manual ILAW edits, validates, previews, and prints without external requests', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Full Manual ILAW' }).click();
  await expect(page.getByRole('heading', { name: 'Full Manual ILAW' })).toBeVisible();
  await page.getByRole('button', { name: 'Create mock snapshot' }).click();
  await expect(page.getByRole('alert')).toContainText('Name of Lesson is required');
  await page.screenshot({ path: 'test-results/ilaw-preview/manual-validation.png', fullPage: true });
  await page.getByRole('textbox', { name: 'Name of Lesson' }).fill('Synthetic Mathematics Plan');
  await page.getByRole('textbox', { name: 'Teaching Date' }).fill('2026-10-15');
  await page.getByRole('textbox', { name: 'Learning Objectives, Monday' }).fill('Compare fractions');
  await page.getByRole('textbox', { name: 'Declaration of AI Use' }).fill('No AI was used in this synthetic fixture.');
  await page.screenshot({ path: 'test-results/ilaw-preview/manual-editor.png', fullPage: true });
  await page.getByRole('button', { name: 'Create mock snapshot' }).click();
  await expect(page.getByText(/Mock snapshot created in this browser tab only/)).toBeVisible();
  await page.getByRole('button', { name: 'Preview document' }).click();
  await expect(page.getByText('Synthetic Mathematics Plan', { exact: true })).toBeVisible();
  await expect(page.getByText('Compare fractions', { exact: true })).toBeVisible();
  await expect(page.locator('.ilaw-template table:visible')).toHaveCount(5);
  for (const title of ['I — INTENTIONS', 'L — LEARNING EXPERIENCE', 'A — ASSESSMENT', 'W — WAYS FORWARD']) {
    await expect(page.getByRole('rowheader', { name: title })).toBeVisible();
  }
  for (const label of ['Prepared by', 'Checked by', 'Noted by']) {
    await expect(page.getByRole('heading', { name: label })).toBeVisible();
  }
  await expect(page.getByRole('img', { name: 'EduScribe logo' })).toBeVisible();
  await expect(page.locator('.ilaw-template input:visible, .ilaw-template textarea:visible')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/ilaw-preview/manual-preview.png', fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: 'Full Manual ILAW' })).toBeHidden();
  await expect(page.getByText('Synthetic Mathematics Plan', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/ilaw-preview/manual-print-media.png', fullPage: true });
  await page.pdf({ path: 'test-results/ilaw-preview/manual-print.pdf', format: 'A4', printBackground: true });
});

for (const width of WIDTHS) {
  test(`isolated Full Manual ILAW responsive at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Full Manual ILAW' }).click();
    await expect(page.getByRole('textbox', { name: 'Learning Objectives, Friday' })).toBeAttached();
    await expect(page.getByRole('link', { name: 'Ways Forward' })).toBeVisible();
    const pageWidth = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client);
    const monday = page.getByRole('textbox', { name: 'Learning Objectives, Monday' });
    await monday.focus();
    await expect(monday).toBeFocused();
    expect(await monday.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
  });
}
