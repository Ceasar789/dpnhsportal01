import { test, expect } from '@playwright/test';

const ORIGIN = 'http://127.0.0.1:4178';
const outbound = new WeakMap();

test.beforeEach(async ({ page }) => {
  outbound.set(page, []);
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === ORIGIN) return route.continue();
    outbound.get(page).push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Mock Draft and Save' }).click();
});
test.afterEach(async ({ page }) => expect(outbound.get(page)).toEqual([]));

test('mock Draft, refresh, reopen, and private Save retain one Manual ILAW row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.getByText(/real Teacher Dashboard Save remains blocked/)).toBeVisible();
  await expect(page.getByText('Unsaved changes in this temporary draft.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Draft', exact: true }).click();
  await expect(page.getByText(/Draft confirmed in this synthetic browser fixture only/)).toBeVisible();
  await expect(page.getByText(/Manual ILAW · Draft · synthetic-manual-1/)).toBeVisible();
  await page.screenshot({ path: 'test-results/mps1b/mock-draft-390.png', fullPage: true });

  await page.reload();
  await page.getByRole('button', { name: 'Mock Draft and Save' }).click();
  await page.getByRole('button', { name: /Reopen synthetic-manual-1/ }).click();
  await expect(page.getByText(/Draft reopened in the Full Manual ILAW editor/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Name of Lesson' }).fill('Synthetic Cell Lesson');
  await page.getByRole('textbox', { name: 'Teaching Date' }).fill('2026-10-16');
  await page.getByRole('textbox', { name: 'Learning Area/s' }).fill('Science');
  await page.getByRole('textbox', { name: 'Designed for which Grade Level and Section' }).fill('Grade 7, A');
  await page.getByRole('textbox', { name: 'Class Duration (minutes per session)' }).fill('45 minutes');
  await page.getByRole('textbox', { name: 'Teaching Strategy' }).fill('Inquiry');
  await page.getByRole('textbox', { name: 'Learning Objectives (lesson-wide)' }).fill('One\nTwo');
  await page.getByRole('textbox', { name: 'Learning Objectives, Friday' }).fill('Explain cell parts');
  await page.getByRole('textbox', { name: 'Flow, Tuesday' }).fill('Observe synthetic cell diagrams');
  await page.getByRole('textbox', { name: 'Formative Assessment, Friday' }).fill('Label a synthetic cell');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/Saved plan confirmed in this synthetic browser fixture only/)).toBeVisible();
  await expect(page.getByText('Unsaved changes in this temporary draft.')).toHaveCount(0);
  await expect(page.getByText(/Manual ILAW · Saved · synthetic-manual-1/)).toBeVisible();
  await expect(page.locator('.mps-mock-list li').filter({ hasText: 'Manual ILAW' })).toHaveCount(1);
  await page.screenshot({ path: 'test-results/mps1b/mock-saved-390.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Mock Draft and Save' }).click();
  await page.getByRole('button', { name: /Reopen Synthetic Cell Lesson/ }).click();
  await expect(page.getByRole('textbox', { name: 'Class Duration (minutes per session)' })).toHaveValue('45 minutes');
  await expect(page.getByRole('textbox', { name: 'Learning Objectives, Friday' })).toHaveValue('Explain cell parts');
  await expect(page.getByText('Synthetic AI lesson')).toBeVisible();
  await expect(page.getByText('Synthetic legacy lesson')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('mock failure does not report success or remove the editable document', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Name of Lesson' }).fill('Unsent synthetic lesson');
  await page.getByRole('button', { name: 'Reject next mock save' }).click();
  await page.getByRole('button', { name: 'Draft', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Mock writer rejected');
  await expect(page.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('Unsent synthetic lesson');
  await expect(page.getByText(/confirmed in this synthetic browser fixture only/)).toHaveCount(0);
  await page.screenshot({ path: 'test-results/mps1b/mock-rejection.png', fullPage: true });
});

test('canceling mock reopen preserves unsaved edits', async ({ page }) => {
  await page.getByRole('button', { name: 'Draft', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name of Lesson' }).fill('Unsaved changes');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: /Reopen synthetic-manual-1/ }).click();
  await expect(page.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('Unsaved changes');
});

for (const width of [360, 768, 1024, 1440]) {
  test(`mock Manual ILAW actions stay reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('button', { name: 'Draft', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Learning Objectives, Friday' })).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width === 1440) await page.screenshot({ path: 'test-results/mps1b/mock-editor-1440.png', fullPage: true });
  });
}
