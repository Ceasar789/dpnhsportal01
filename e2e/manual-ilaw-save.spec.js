// P4b Manual ILAW save, browser flow. NOT run in P4b.
// Needs the dev server started with VITE_MANUAL_LESSON_PLAN_SAVE_ENABLED=1;
// skipped otherwise. Every request is local or intercepted: no real API or database.
import { expect, test } from '@playwright/test';
import { installProfileMocks, PROFILE_E2E_ORIGIN, syntheticProfile } from './profile-mock-fixture.js';

test.skip(process.env.VITE_MANUAL_LESSON_PLAN_SAVE_ENABLED !== '1', 'Start the dev server with VITE_MANUAL_LESSON_PLAN_SAVE_ENABLED=1');

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const PLAN = '99999999-9999-4999-8999-999999999999';
const YEAR = '2026-2027';

async function installManualSave(page, teacherId, { conflictOnce = false } = {}) {
  const state = { rows: [], calls: [], conflictOnce };
  await page.route(`${PROFILE_E2E_ORIGIN}/rest/v1/school_settings*`, route => route.fulfill({ json: { school_year: YEAR } }));
  await page.route(`${PROFILE_E2E_ORIGIN}/rest/v1/teacher_subjects*`, route => route.fulfill({
    json: [{ subject_id: SUBJECT, grade_level: 'Grade 7', subjects: { id: SUBJECT, name: 'Science' } }] }));
  await page.route(`${PROFILE_E2E_ORIGIN}/rest/v1/lesson_plans*`, route => (route.request().method() === 'GET'
    ? route.fulfill({ json: state.rows }) : route.abort()));
  await page.route('**/api/lesson-plans/manual/*', async route => {
    const operation = route.request().url().split('/').pop();
    const command = route.request().postDataJSON();
    state.calls.push({ operation, command });
    if (state.conflictOnce) {
      state.conflictOnce = false;
      return route.fulfill({ status: 409, json: { ok: false, code: 'revision_conflict', durable: false } });
    }
    const workflowState = ['CreateIncompleteDraft', 'UpdateIncompleteDraft'].includes(operation) ? 'draft' : 'saved';
    const revision = (command.expectedRevision ?? 0) + 1;
    const objectives = JSON.stringify({ kind: 'eduscribe.manual-ilaw', version: 2, teacherId, planId: PLAN,
      title: command.document.title, assignment: { ...command.document.assignment, subjectName: 'Science' }, workflowState,
      document: command.document.document, sourceDetails: command.document.sourceDetails });
    state.rows = [{ id: PLAN, teacher_id: teacherId, title: command.document.title, subject: 'Science', grade_level: 'Grade 7',
      academic_year: YEAR, ai_generated: false, status: 'draft', authoring_revision: revision, objectives,
      created_at: '2026-10-09T08:00:00.000Z' }];
    return route.fulfill({ json: { ok: true, durable: true, record: { id: PLAN, ownerId: teacherId, type: 'manual',
      revision, teacher_id: teacherId, objectives } } });
  });
  return state;
}

async function measure(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  if ((page.viewportSize()?.width ?? 0) >= 768) return; // 44px is the phone rule
  // P4b controls only: the save group, the load picker and discard.
  const small = await page.evaluate(() => [...document.querySelectorAll(
    '[aria-label="Manual ILAW save actions"] button, #manual-assignment, [data-manual-discard] button')]
    .filter(el => el.offsetParent !== null)
    .map(el => ({ text: el.textContent.trim() || el.getAttribute('aria-label'), h: el.getBoundingClientRect().height }))
    .filter(item => item.h < 44));
  expect(small).toEqual([]);
}

const fill = async (page, name, value) => page.getByRole('textbox', { name, exact: true }).fill(value);

for (const width of [390, 1280]) {
  for (const theme of ['light', 'dark']) {
    test(`P4b Draft -> Saved -> edit keeps Saved at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await installProfileMocks(page, { role: 'teacher', theme, teacherLessonPlanScenario: true });
      const state = await installManualSave(page, syntheticProfile('teacher').id);
      await page.goto('/teacher-dashboard/lesson-plans');
      await page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' }).click();
      await expect(page.getByText(/Local QA only/)).toHaveCount(0);
      const load = page.getByRole('combobox', { name: 'Subject and grade' });
      await expect(load).toBeEnabled();
      await load.selectOption(`${SUBJECT}|Grade 7`);
      await expect(page.getByRole('textbox', { name: 'Learning Area/s' })).toHaveValue('Science');
      await fill(page, 'Name of Lesson', 'Matter and its properties');
      await measure(page);
      await page.getByRole('button', { name: 'Save as draft' }).click();
      const item = page.locator('li').filter({ hasText: 'Matter and its properties' });
      await expect(item.getByText('Draft', { exact: true })).toBeVisible();

      await item.getByRole('button', { name: /View and edit/ }).click();
      await expect(page.getByText('Status: Draft')).toBeVisible();
      await fill(page, 'Teaching Date', 'Week 1');
      await fill(page, 'Learning Objectives, Monday', 'Describe matter');
      await fill(page, 'Flow, Monday', 'Group lab');
      await fill(page, 'Formative Assessment, Monday', 'Exit ticket');
      await page.getByRole('button', { name: 'Save lesson plan' }).click();
      await expect(item.getByText('Saved', { exact: true })).toBeVisible();
      await expect(item.getByText('Draft', { exact: true })).toHaveCount(0);

      await item.getByRole('button', { name: /View and edit/ }).click();
      await expect(page.getByText('Status: Saved')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save as draft' })).toHaveCount(0);
      await fill(page, 'Flow, Tuesday', 'Second activity');
      await page.getByRole('button', { name: 'Save lesson plan' }).click();
      await expect(item.getByText('Saved', { exact: true })).toBeVisible();
      await measure(page);
      expect(state.calls.map(call => call.operation)).toEqual(['CreateIncompleteDraft', 'SaveCompleteLessonPlan', 'UpdateSavedLessonPlan']);
    });
  }
}

test('P4b conflict message keeps the editor open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
  await installManualSave(page, syntheticProfile('teacher').id, { conflictOnce: true });
  await page.goto('/teacher-dashboard/lesson-plans');
  await page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' }).click();
  await page.getByRole('combobox', { name: 'Subject and grade' }).selectOption(`${SUBJECT}|Grade 7`);
  await fill(page, 'Name of Lesson', 'Matter');
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await expect(page.getByText('This plan was changed somewhere else. Reopen it before saving again.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name of Lesson', exact: true })).toHaveValue('Matter');
  await measure(page);
});
