import { expect, test } from '@playwright/test';

const blockExternal = async page => {
  const external = [];
  const previewPort = process.env.WORKSHEET_VQA_PORT || '4182';
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' || url.port !== previewPort) {
      external.push(url.origin);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  return external;
};

test('generation announces completion before the Teacher opens Worksheets', async ({ page }, testInfo) => {
  const external = await blockExternal(page);
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Worksheet from Plant cells' }).first().click();
  const progress = page.getByRole('dialog', { name: 'Sample worksheet generation' });
  await expect(progress).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saved Lesson Plans' })).toBeVisible();
  await expect(progress.getByText('Sample worksheet ready', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('generation-ready-390.png') });
  await progress.getByRole('button', { name: 'Open worksheet draft' }).click();
  await expect(page.getByRole('heading', { name: 'Worksheets' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Generated Worksheet editor' })).toBeVisible();
  expect(external).toEqual([]);
});

test('Escape cancels the sample dialog and restores focus without opening Worksheets', async ({ page }) => {
  const external = await blockExternal(page);
  await page.goto('/');
  const generate = page.getByRole('button', { name: 'Generate Worksheet from Plant cells' }).first();
  await generate.click();
  const progress = page.getByRole('dialog', { name: 'Sample worksheet generation' });
  await expect(progress).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(progress).toHaveCount(0);
  await expect(generate).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Saved Lesson Plans' })).toBeVisible();
  expect(external).toEqual([]);
});

test('synthetic AI plan generates an editable unsaved draft with a separate student preview', async ({ page }) => {
  const external = await blockExternal(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Worksheet from Plant cells' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Sample worksheet generation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saved Lesson Plans' })).toBeVisible();
  await page.getByRole('button', { name: 'Open worksheet draft' }).click();
  const dialog = page.getByRole('region', { name: 'Generated Worksheet editor' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Worksheets' })).toBeVisible();
  await expect(dialog.getByText('Not saved to EduScribe')).toBeVisible();
  await expect(dialog.getByText('Source Lesson Plan: Plant cells')).toBeVisible();
  await dialog.getByText('Source details').click();
  await expect(dialog.getByText('Source ID: synthetic-ai-plan')).toBeVisible();
  await dialog.getByText('Lesson context').click();
  await expect(dialog.getByText('Identify plant cell structures', { exact: false })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Worksheet title' }).fill('Edited worksheet');
  await dialog.getByRole('textbox', { name: 'Question 1 text' }).fill('Edited cell question?');
  await dialog.getByRole('textbox', { name: 'Question 1 choice 1' }).fill('Chloroplast');
  await dialog.getByRole('combobox', { name: 'Question 1 correct choice' }).selectOption('Chloroplast');
  await dialog.getByRole('button', { name: 'Add question section' }).click();
  await dialog.getByLabel('Section 2 name').fill('Reflection');
  await dialog.getByLabel('Directions for Reflection').fill('Explain your reasoning.');
  await dialog.getByRole('combobox', { name: 'Question 2 section' }).selectOption({ label: 'Reflection' });
  await dialog.getByRole('button', { name: 'Student preview' }).click();
  const preview = dialog.getByRole('region', { name: 'Student-facing worksheet preview' });
  await expect(preview.getByText('Edited cell question?', { exact: false })).toBeVisible();
  await expect(preview.getByText('Chloroplast')).toBeVisible();
  await expect(preview.getByText('Explain your reasoning.')).toBeVisible();
  await expect(preview.getByText('Nucleus')).toHaveCount(0);
  await expect(preview.getByText('Teacher answer key')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Edit questions and key' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Question 1 correct choice' })).toHaveValue('Chloroplast');
  await dialog.getByRole('button', { name: 'Delete Draft' }).click();
  await page.getByRole('dialog', { name: 'Delete worksheet draft' }).getByRole('button', { name: 'Delete draft' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Saved Lesson Plans' })).toBeVisible();
  expect(external).toEqual([]);
});

test('synthetic Manual ILAW V2 reaches the same draft editor without writes', async ({ page }) => {
  const external = await blockExternal(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Worksheet from Plant cells' }).nth(1).click();
  await page.getByRole('button', { name: 'Open worksheet draft' }).click();
  const dialog = page.getByRole('region', { name: 'Generated Worksheet editor' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Subject: Science · Grade: Grade 7')).toBeVisible();
  await expect(dialog.getByText('Source Lesson Plan: Plant cells')).toBeVisible();
  await expect(dialog.getByText('Manual ILAW V2', { exact: false })).toBeVisible();
  expect(external).toEqual([]);
});

test('repeated Generate activation opens one unsaved draft and no write path', async ({ page }) => {
  const external = await blockExternal(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Worksheet from Plant cells' }).first().dblclick();
  await expect(page.getByRole('dialog', { name: 'Sample worksheet generation' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Open worksheet draft' }).click();
  await expect(page.getByRole('region', { name: 'Generated Worksheet editor' })).toHaveCount(1);
  await expect(page.getByText('Generated draft in memory. No Worksheet record exists.')).toBeVisible();
  expect(external).toEqual([]);
});

test('synthetic generator failure has Retry and incomplete legacy context fails closed', async ({ page }) => {
  const external = await blockExternal(page);
  await page.goto('/');
  await page.getByRole('checkbox', { name: 'Fail next generation' }).check();
  await page.getByRole('button', { name: 'Generate Worksheet from Plant cells' }).first().click();
  await expect(page.getByRole('alert')).toContainText('Synthetic AI generation failed');
  await expect(page.getByRole('heading', { name: 'Saved Lesson Plans' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.getByRole('button', { name: 'Open worksheet draft' }).click();
  await expect(page.getByRole('region', { name: 'Generated Worksheet editor' })).toBeVisible();
  expect(external).toEqual([]);
});

test('identity switch and legacy missing assignment do not produce a draft', async ({ page }) => {
  const external = await blockExternal(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Worksheet from Legacy plan without assignment metadata' }).click();
  await expect(page.getByRole('alert')).toContainText('Confirm a current assigned subject and grade');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: /Teacher: synthetic-teacher-1/ }).click();
  await page.getByRole('button', { name: 'Generate Worksheet from Plant cells' }).first().click();
  await expect(page.getByRole('alert')).toContainText('not available for the signed-in Teacher');
  await expect(page.getByRole('region', { name: 'Generated Worksheet editor' })).toHaveCount(0);
  expect(external).toEqual([]);
});

test('malformed generation shows an error, then an explicit Retry opens a draft', async ({ page }) => {
  const external = await blockExternal(page);
  await page.goto('/');
  await page.getByRole('checkbox', { name: 'Return malformed generation' }).check();
  await page.getByRole('button', { name: 'Generate Worksheet from Plant cells' }).first().click();
  await expect(page.getByRole('alert')).toContainText('invalid worksheet JSON');
  await expect(page.getByRole('region', { name: 'Generated Worksheet editor' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.getByRole('button', { name: 'Open worksheet draft' }).click();
  await expect(page.getByRole('region', { name: 'Generated Worksheet editor' })).toBeVisible();
  expect(external).toEqual([]);
});

test('delete confirmation preserves edited draft when declined and refresh clears it', async ({ page }) => {
  const external = await blockExternal(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Worksheet from Plant cells' }).first().click();
  await page.getByRole('button', { name: 'Open worksheet draft' }).click();
  const dialog = page.getByRole('region', { name: 'Generated Worksheet editor' });
  await dialog.getByRole('textbox', { name: 'Question 1 text' }).fill('Unsaved edited question?');
  await dialog.getByRole('button', { name: 'Delete Draft' }).click();
  await page.getByRole('dialog', { name: 'Delete worksheet draft' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Question 1 text' })).toHaveValue('Unsaved edited question?');
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  page.once('dialog', confirmation => confirmation.accept());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Saved Lesson Plans' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Generated Worksheet editor' })).toHaveCount(0);
  expect(external).toEqual([]);
});

test('synthetic Teacher identity change clears an open private draft', async ({ page }) => {
  const external = await blockExternal(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Generate Worksheet from Plant cells' }).first().click();
  await page.getByRole('button', { name: 'Open worksheet draft' }).click();
  await expect(page.getByRole('region', { name: 'Generated Worksheet editor' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('lpw2b:switch-teacher')));
  await expect(page.getByRole('region', { name: 'Generated Worksheet editor' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Teacher: synthetic-teacher-2' })).toBeVisible();
  expect(external).toEqual([]);
});

for (const theme of ['Light', 'Dark']) {
  for (const width of [360, 390, 768, 1024, 1440]) {
    test(`${theme} ${width}px draft layout and keyboard controls`, async ({ page }, testInfo) => {
      const external = await blockExternal(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      if (theme === 'Dark') await page.getByRole('button', { name: 'Theme: Light' }).click();
      await page.getByRole('button', { name: 'Generate Worksheet from Plant cells' }).first().click();
      await page.getByRole('button', { name: 'Open worksheet draft' }).click();
      const dialog = page.getByRole('region', { name: 'Generated Worksheet editor' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Source Lesson Plan: Plant cells')).toBeVisible();
      await dialog.getByRole('button', { name: 'Add question', exact: true }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole('button', { name: 'Back to Worksheets' }).first()).toBeVisible();
      await dialog.getByRole('textbox', { name: 'Worksheet title' }).focus();
      await expect(dialog.getByRole('textbox', { name: 'Worksheet title' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('textbox', { name: 'Directions / Instructions' })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await page.screenshot({ path: testInfo.outputPath(`${theme.toLowerCase()}-${width}.png`) });
      expect(external).toEqual([]);
    });
  }
}
