// S4: the teacher's file/link review end to end, in a real browser against
// isolated mocks (profile-mock-fixture + teacher-submissions-mock-fixture).
// Run with: npx playwright test --config playwright.teacher-submissions.config.js
import { test, expect } from '@playwright/test';
import { installProfileMocks } from './profile-mock-fixture.js';
import { installTeacherSubmissionMocks, STUDENT_LINK } from './teacher-submissions-mock-fixture.js';

const setup = async (page, options = {}) => {
  const harness = await installProfileMocks(page, { role: 'teacher', theme: 'light', worksheetScenario: true });
  const review = await installTeacherSubmissionMocks(page, options);
  await page.goto('/teacher-dashboard/worksheets');
  await expect(page.getByRole('heading', { name: 'Water cycle poster' })).toBeVisible();
  return { harness, review };
};
const openReview = async (page) => {
  const card = page.locator('.rounded-xl', { has: page.getByRole('heading', { name: 'Water cycle poster' }) });
  await card.getByRole('button', { name: 'More actions for Water cycle poster' }).click();
  await page.getByRole('menuitem', { name: /^Check submissions/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Submissions — Water cycle poster' });
  await expect(dialog.getByRole('list', { name: 'Students' })).toBeVisible();
  return dialog;
};
const student = (dialog, name) => dialog.getByRole('list', { name: 'Students' }).getByRole('button', { name: new RegExp(`^${name}`) });

test('the card says File or link with its points', async ({ page }) => {
  await setup(page);
  const card = page.locator('.rounded-xl', { has: page.getByRole('heading', { name: 'Water cycle poster' }) });
  await expect(card.getByText(/File or link · 10 pts/)).toBeVisible();
});

test('counts per filter, and a draft is never shown', async ({ page }) => {
  await setup(page);
  const dialog = await openReview(page);
  await expect(dialog.getByRole('button', { name: 'All (7)' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Submitted (3)' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Not submitted (2)' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Graded (2)' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Late (1)' })).toBeVisible();
  await student(dialog, 'Ben Cruz').click();
  await expect(dialog.getByText('Not turned in yet.')).toBeVisible();
  await expect(dialog.getByText('secret-draft.pdf')).toHaveCount(0);
});

test('score, Save, then Return: the RPC gets exactly the four arguments', async ({ page }) => {
  const { review } = await setup(page);
  const dialog = await openReview(page);
  await student(dialog, 'Cris Santos').click();
  await dialog.getByLabel('Score (out of 10)').fill('9');
  await dialog.getByLabel('Feedback (optional)').fill('Clear labels.');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Return to student' }).click();
  await expect(dialog.getByText('Returned to Cris Santos.')).toBeVisible();
  expect(review.state.rpcCalls).toEqual([
    { p_submission_id: review.state.submissions[1].id, p_score: 9, p_feedback: 'Clear labels.', p_release: false },
    { p_submission_id: review.state.submissions[1].id, p_score: 9, p_feedback: 'Clear labels.', p_release: true },
  ]);
});

test('an RPC error is a friendly message and changes nothing', async ({ page }) => {
  await setup(page, { rpc: 'invalid_state' });
  const dialog = await openReview(page);
  await student(dialog, 'Cris Santos').click();
  await dialog.getByLabel('Score (out of 10)').fill('9');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText("This student's work is not turned in (they may have unsubmitted it). Refresh to see the latest.");
  await expect(student(dialog, 'Cris Santos')).toContainText('Turned in');
});

test('unsaved changes are confirmed before switching student', async ({ page }) => {
  await setup(page);
  const dialog = await openReview(page);
  await student(dialog, 'Cris Santos').click();
  await dialog.getByLabel('Score (out of 10)').fill('7');
  await student(dialog, 'Dina Lopez').click();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();
});

test('opening work: a link and a file open in a new tab without window.opener', async ({ page }) => {
  await setup(page);
  const dialog = await openReview(page);
  await student(dialog, 'Dina Lopez').click();
  let popup = page.waitForEvent('popup');
  await dialog.getByRole('button', { name: 'Open link' }).click();
  let tab = await popup;
  expect(tab.url()).toBe(STUDENT_LINK);
  expect(await tab.evaluate(() => window.opener)).toBeNull();
  await student(dialog, 'Cris Santos').click();
  popup = page.waitForEvent('popup');
  await dialog.getByRole('button', { name: 'Open file' }).click();
  tab = await popup;
  expect(await tab.evaluate(() => window.opener)).toBeNull();
  await expect(dialog.getByRole('link', { name: 'Open file' })).toHaveAttribute('rel', 'noopener noreferrer');
});

test('an answers quiz still opens the original Check submissions dialog', async ({ page }) => {
  await setup(page);
  const card = page.locator('.rounded-xl', { has: page.getByRole('heading', { name: 'Fractions check' }) });
  await card.getByRole('button', { name: 'More actions for Fractions check' }).click();
  await page.getByRole('menuitem', { name: /^Check submissions/ }).click();
  await expect(page.getByRole('dialog', { name: 'Submissions — Fractions check' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Students' })).toHaveCount(0);
});
