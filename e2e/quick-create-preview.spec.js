import { test, expect } from '@playwright/test';

const LOCAL_ORIGIN = 'http://127.0.0.1:4179';
const WIDTHS = [360, 390, 768, 1024, 1440];

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== LOCAL_ORIGIN || /\/(?:rest\/v1|auth\/v1|storage\/v1|api)\b/.test(url.pathname)) {
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
});

test('synthetic multi-subject selection produces a proposed payload only', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Quick Create — isolated local QA' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview mock create' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Lesson Plan Title *' }).fill('Synthetic Fractions');
  await page.getByRole('combobox', { name: 'Assigned Subject *' }).selectOption('synthetic-math');
  await page.getByRole('combobox', { name: 'Assigned Grade Level *' }).selectOption('Grade 8');
  await page.getByRole('spinbutton', { name: 'Class Duration (minutes per session)' }).fill('60');
  await page.getByRole('textbox', { name: 'Learning Objectives' }).fill('Compare halves\nExplain quarters');
  await page.getByRole('button', { name: 'Preview mock create' }).click();
  await expect(page.getByText(/Mock create completed. No lesson plan was saved/)).toBeVisible();
  const payload = JSON.parse(await page.getByRole('region', { name: 'Proposed mock payload' }).locator('pre').textContent());
  expect(payload).toMatchObject({ title: 'Synthetic Fractions', subject_id: 'synthetic-math', subject: 'Mathematics', grade_level: 'Grade 8', duration: '60 minutes', objectives: 'Compare halves\nExplain quarters' });
  expect(payload).not.toHaveProperty('section_id');
  await page.screenshot({ path: 'test-results/quick-create-preview/multi-success.png', fullPage: true });
});

test('mock failure retains the form; empty adviser load and fetch error cannot create', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Fixture scenario').selectOption('single');
  await expect(page.getByRole('combobox', { name: 'Assigned Subject *' })).toHaveValue('synthetic-science');
  await expect(page.getByRole('combobox', { name: 'Assigned Grade Level *' })).toHaveValue('Grade 9');
  await page.getByRole('textbox', { name: 'Lesson Plan Title *' }).fill('Synthetic cells');
  await page.getByLabel('Simulate mock-create failure').check();
  await page.getByRole('button', { name: 'Preview mock create' }).click();
  await expect(page.getByText(/Mock create failed. Your entries are still here/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Lesson Plan Title *' })).toHaveValue('Synthetic cells');
  await page.screenshot({ path: 'test-results/quick-create-preview/mock-failure.png', fullPage: true });
  await page.getByLabel('Fixture scenario').selectOption('adviser');
  await expect(page.getByText(/No assigned subject for this school year/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview mock create' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/quick-create-preview/no-assignment.png', fullPage: true });
  await page.getByRole('button', { name: 'Simulate fetch error' }).click();
  await expect(page.getByRole('button', { name: 'Preview mock create' })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText(/No assigned subject for this school year/)).toBeVisible();
});

for (const width of WIDTHS) {
  test(`responsive isolated Quick Create at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const pageWidth = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client);
    const title = page.getByRole('textbox', { name: 'Lesson Plan Title *' });
    await title.focus();
    await expect(title).toBeFocused();
    expect(await title.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
    await expect(page.getByRole('combobox', { name: 'Assigned Subject *' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Assigned Grade Level *' })).toBeVisible();
    if (width === 360 || width === 1440) {
      await page.screenshot({ path: `test-results/quick-create-preview/responsive-${width}.png`, fullPage: true });
    }
  });
}
