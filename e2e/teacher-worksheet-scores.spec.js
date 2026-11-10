import { expect, test } from '@playwright/test';
import { installProfileMocks } from './profile-mock-fixture.js';

test('fictional Essay Review Lab requires Teacher approval and never releases a score', async ({ page }) => {
  const qa = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true, worksheetHasSubmission: true });
  await page.goto('/teacher-dashboard/essay-review-lab');
  await expect(page.getByRole('heading', { name: 'Essay Review Lab' })).toBeVisible();
  await expect(page.getByText('Simulated evaluation — not live AI. Local development only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve review locally' })).toBeDisabled();
  await page.getByRole('button', { name: 'Request simulated evaluation' }).click();
  await expect(page.getByText('Suggested total: 5 / 5')).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Scientific content score (max 3)' }).fill('2');
  await page.getByRole('textbox', { name: 'Teacher feedback' }).fill('Good explanation; add one specific example.');
  await expect(page.getByText('Teacher score: 4 / 5')).toBeVisible();
  await page.getByRole('checkbox', { name: /I reviewed this answer/ }).check();
  await page.getByRole('button', { name: 'Approve review locally' }).click();
  await expect(page.getByText('Review approved locally for testing. No student score was changed or released.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve review locally' })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Learner response' }).selectOption('student-b');
  await expect(page.getByText('The previous suggestion is stale.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve review locally' })).toBeDisabled();
  await page.getByRole('button', { name: 'Request simulated evaluation' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No local evaluation fixture matches' })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Scientific content score (max 3)' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Clear explanation score (max 2)' }).fill('1');
  await page.getByRole('textbox', { name: 'Teacher feedback' }).fill('Teacher-written feedback.');
  await page.getByRole('checkbox', { name: /I reviewed this answer/ }).check();
  await page.getByRole('button', { name: 'Approve review locally' }).click();
  await expect(page.getByText('Teacher score: 2 / 5')).toBeVisible();
  expect(qa.state.worksheetWrites).toEqual([]);
  expect(qa.state.teacherAiCalls).toBe(0);
  expect(qa.state.blockedRequests).toEqual([]);
  qa.assertHealthy();
});

test('rubric edits invalidate suggestions and mismatched totals block approval', async ({ page }) => {
  const qa = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true });
  await page.goto('/teacher-dashboard/essay-review-lab');
  await page.getByRole('button', { name: 'Request simulated evaluation' }).click();
  await expect(page.getByText('Suggested total: 5 / 5')).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Criterion 1 maximum points' }).fill('4');
  await expect(page.getByRole('alert').filter({ hasText: 'Rubric total must equal' })).toBeVisible();
  await expect(page.getByText('The previous suggestion is stale.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request simulated evaluation' })).toBeDisabled();
  await page.getByRole('spinbutton', { name: 'Criterion 2 maximum points' }).fill('1');
  await page.getByRole('button', { name: 'Request simulated evaluation' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No local evaluation fixture matches' })).toBeVisible();
  await page.getByRole('button', { name: 'Add criterion' }).click();
  await page.getByRole('textbox', { name: 'Criterion 3 title' }).fill('Evidence');
  await page.getByRole('spinbutton', { name: 'Criterion 3 maximum points' }).fill('0');
  await page.getByRole('button', { name: 'Move up criterion 3' }).click();
  await page.getByRole('button', { name: 'Remove criterion 2' }).click();
  await expect(page.getByRole('group', { name: 'Criterion 1' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Essay question' }).selectOption('cell-wall');
  await expect(page.getByRole('alert').filter({ hasText: 'another question' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve review locally' })).toBeDisabled();
  expect(qa.state.worksheetWrites).toEqual([]);
  expect(qa.state.teacherAiCalls).toBe(0);
  qa.assertHealthy();
});

test('rejected suggestion returns to manual review and unsaved navigation asks before leaving', async ({ page }) => {
  const qa = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true });
  await page.goto('/teacher-dashboard/essay-review-lab');
  await page.getByRole('button', { name: 'Request simulated evaluation' }).click();
  await expect(page.getByText('Suggested total: 5 / 5')).toBeVisible();
  await page.getByRole('button', { name: 'Reject suggestion' }).click();
  await expect(page.getByText('Suggestion rejected. Enter your own marks and feedback to continue.')).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Scientific content score (max 3)' })).toHaveValue('');
  await page.getByRole('button', { name: 'Back to Grading' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Unsaved changes' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/essay-review-lab$/);
  await page.getByRole('button', { name: 'Back to Grading' }).click();
  await confirmation.getByRole('button', { name: 'Leave page' }).click();
  await expect(page).toHaveURL(/\/teacher-dashboard\/grades$/);
  expect(qa.state.worksheetWrites).toEqual([]);
  qa.assertHealthy();
});

test('changing the selected Essay question prevents cross-question approval', async ({ page }) => {
  const qa = await installProfileMocks(page, { role: 'teacher' });
  await page.goto('/teacher-dashboard/essay-review-lab');
  await page.getByRole('button', { name: 'Request simulated evaluation' }).click();
  await expect(page.getByText('Suggested total: 5 / 5')).toBeVisible();
  await page.getByRole('combobox', { name: 'Essay question' }).selectOption('cell-wall');
  await expect(page.getByText('The previous suggestion is stale.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve review locally' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Request simulated evaluation' })).toBeDisabled();
  expect(qa.state.worksheetWrites).toEqual([]);
  qa.assertHealthy();
});

test('cancelled simulated evaluation cannot leave a late suggestion or approve a score', async ({ page }) => {
  const qa = await installProfileMocks(page, { role: 'teacher' });
  await page.goto('/teacher-dashboard/essay-review-lab');
  await page.getByRole('button', { name: 'Request simulated evaluation' }).click();
  await page.getByRole('button', { name: 'Cancel evaluation' }).click();
  await page.waitForTimeout(400);
  await expect(page.getByText('Suggested total: 5 / 5')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approve review locally' })).toBeDisabled();
  expect(qa.state.worksheetWrites).toEqual([]);
  expect(qa.state.teacherAiCalls).toBe(0);
  qa.assertHealthy();
});

test('development link opens the Lab and focuses its heading without score writes', async ({ page }) => {
  const qa = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true });
  await page.goto('/teacher-dashboard/grades');
  await page.getByRole('link', { name: 'Open fictional Essay Review Lab' }).click();
  await expect(page).toHaveURL(/essay-review-lab$/);
  await expect(page.getByRole('heading', { name: 'Essay Review Lab' })).toBeFocused();
  expect(qa.state.worksheetWrites).toEqual([]);
  qa.assertHealthy();
});

for (const width of [360, 390, 768, 1024, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`fictional Essay Review Lab remains usable at ${width}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const qa = await installProfileMocks(page, { role: 'teacher', theme });
      await page.goto('/teacher-dashboard/essay-review-lab');
      await expect(page.getByRole('heading', { name: 'Essay Review Lab' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Criterion 1 title' })).toBeVisible();
      await page.getByRole('button', { name: 'Request simulated evaluation' }).focus();
      await expect(page.getByRole('button', { name: 'Request simulated evaluation' })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(qa.state.worksheetWrites).toEqual([]);
      expect(qa.state.blockedRequests).toEqual([]);
      qa.assertHealthy();
      await page.screenshot({ path: testInfo.outputPath(`essay-review-${width}-${theme}.png`), fullPage: true });
    });
  }
}

test('TWF-02 review approval stays local and release writes are blocked', async ({ page }) => {
  const qa = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true, worksheetHasSubmission: true });
  await page.goto('/teacher-dashboard/grades');
  await page.getByRole('button', { name: 'Check submissions' }).click();
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.getByText('What is two plus two?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Release result' })).toBeDisabled();
  await page.getByRole('spinbutton', { name: 'Score for question 1' }).fill('0.5');
  await expect(page.getByText('Reviewed score: 0.5 / 1')).toBeVisible();
  await page.getByRole('textbox', { name: 'Feedback for question 1' }).fill('Good work.');
  await page.getByRole('button', { name: 'Approve review locally' }).click();
  await expect(page.getByRole('button', { name: 'Release result' })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Feedback for question 1' }).fill('Please show your work.');
  await expect(page.getByRole('button', { name: 'Release result' })).toBeDisabled();
  await page.getByRole('button', { name: 'Approve review locally' }).click();
  await page.getByRole('button', { name: 'Release result' }).click();
  await expect(page.getByText('Result release is unavailable. No score was saved or released.')).toBeVisible();
  expect(qa.state.worksheetWrites).toEqual([]);
  expect(qa.state.blockedRequests).toEqual([]);
  qa.assertHealthy();
});

test('TWF-02 attendance is historical read only', async ({ page }) => {
  const qa = await installProfileMocks(page, { role: 'teacher', teacherAttendanceScenario: true, attendanceExisting: true });
  await page.goto('/teacher-dashboard/attendance');
  await page.getByLabel('Date').fill(qa.state.attendanceRows[0].date);
  await expect(page.getByText('Saved: Present').first()).toBeVisible();
  await page.getByRole('button', { name: 'Mark Alexandria Verylongname-Santos Present' }).first().click();
  await expect(page.getByText(/Attendance saving is unavailable/)).toBeVisible();
  expect(qa.state.attendanceWrites).toEqual([]);
  expect(qa.state.blockedRequests).toEqual([]);
  qa.assertHealthy();
});

test('TWF-02 section navigation keeps historical attendance tied to its section', async ({ page }) => {
  const date = '2026-10-22';
  const qa = await installProfileMocks(page, { role: 'teacher', teacherAttendanceScenario: true,
    attendanceSections: [
      { id: 'section-old', name: 'Old Class', grade_level: 'Grade 7', school_year: '2025-2026' },
      { id: 'section-qa-1', name: 'Current Class', grade_level: 'Grade 8', school_year: '2026-2027' },
    ],
    attendanceLinks: [
      { student_id: 'student-qa-1', section_id: 'section-old' },
      { student_id: 'student-qa-1', section_id: 'section-qa-1' },
    ],
    attendanceRows: [
      { student_id: 'student-qa-1', section_id: 'section-old', date, status: 'Absent' },
      { student_id: 'student-qa-1', section_id: 'section-qa-1', date, status: 'Present' },
    ],
  });
  await page.goto('/teacher-dashboard/attendance');
  await page.getByLabel('Date').fill(date);
  await expect(page.getByLabel('Section')).toHaveValue('section-qa-1');
  await expect(page.getByRole('table').getByText('Saved: Present')).toBeVisible();
  await page.getByLabel('Section').selectOption('section-old');
  await expect(page.getByRole('table').getByText('Saved: Absent')).toBeVisible();
  await expect(page.getByRole('table').getByText('Saved: Present')).toHaveCount(0);
  expect(qa.state.attendanceWrites).toEqual([]);
  qa.assertHealthy();
});

for (const width of [360, 390, 768, 1024, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`Worksheet Scores stays readable at ${width}px in ${theme} mode`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const qa = await installProfileMocks(page, {
        role: 'teacher', theme, worksheetScenario: true, worksheetHasSubmission: true,
      });
      await page.goto('/teacher-dashboard/grades');
      await expect(page.getByRole('heading', { name: 'Grading' })).toBeVisible();
      await expect(page.getByText('Synthetic Student')).toBeVisible();
      await expect(page.getByText('Not scored')).toBeVisible();
      await expect(page.getByText('Needs checking').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Check submissions' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Encode paper scores' })).toHaveCount(0);
      if (width < 1024) {
        await page.getByRole('button', { name: 'Open navigation menu' }).click();
        await expect(page.getByRole('link', { name: 'Grading' })).toBeVisible();
        await page.keyboard.press('Escape');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(qa.state.worksheetWrites).toEqual([]);
      expect(qa.state.blockedRequests).toEqual([]);
      qa.assertHealthy();
      await page.screenshot({ path: testInfo.outputPath(`worksheet-scores-${width}-${theme}.png`), fullPage: true });
      if (width === 360 && theme === 'light') {
        await page.locator('main').evaluate(element => { element.scrollTop = element.scrollHeight; });
        await page.screenshot({ path: testInfo.outputPath('worksheet-scores-360-light-list.png') });
      }
    });
  }
}

test('legacy gradebook is absent and score controls reuse the existing dialog', async ({ page }) => {
  const qa = await installProfileMocks(page, {
    role: 'teacher', worksheetScenario: true, worksheetHasSubmission: true,
  });
  await page.goto('/teacher-dashboard/grades');
  await expect(page.getByRole('heading', { name: 'Grading' })).toBeVisible();
  await expect(page.getByText('Grades — Q3 Report')).toHaveCount(0);
  await expect(page.getByText('GWA', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Check submissions' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(qa.state.worksheetWrites).toEqual([]);
  expect(qa.state.blockedRequests).toEqual([]);
  qa.assertHealthy();
});

test('filters are reachable in keyboard order', async ({ page }) => {
  const qa = await installProfileMocks(page, {
    role: 'teacher', worksheetScenario: true, worksheetHasSubmission: true,
  });
  await page.goto('/teacher-dashboard/grades');
  await expect(page.getByText('Synthetic Student')).toBeVisible();
  await page.getByLabel('Subject').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Grade')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('combobox', { name: 'Worksheet', exact: true })).toBeFocused();
  expect(qa.state.worksheetWrites).toEqual([]);
  qa.assertHealthy();
});
