import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { inspectPdfmakePdf } from './pdfmake-text.js';
import { createBlankIlawDocument } from '../frontend/src/pages/dashboards/teacher/ilaw/ilawTemplateModel.js';
import { serializeManualIlawDraft } from '../frontend/src/pages/dashboards/teacher/ilaw/fullManualIlawModel.js';
import { currentSchoolYear } from '../frontend/src/lib/academicRules.js';

const weeklyQaDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const weeklyQaObjectives = [
  'Identify subjects in simple sentences.', 'Locate predicates in simple sentences.',
  'Distinguish compound subjects from single subjects.', 'Explain how subjects and predicates form a sentence.',
  'Revise unclear sentences using complete subjects and predicates.',
];
const weeklyQaActivities = [
  'Underline subjects in five sample sentences.', 'Circle predicates in a short paragraph.',
  'Sort examples by single and compound subjects.', 'Discuss why each sentence needs a subject and predicate.',
  'Edit a paragraph containing incomplete sentences.',
];
const weeklyQaAssessments = [
  'Identify the subject in each sample sentence.', 'Write the predicate for each marked subject.',
  'Classify single and compound subjects in the examples.', 'Explain how a subject and predicate complete a sentence.',
  'Revise three incomplete sentences and justify each correction.',
];
const weeklyQaField = (section, label, cells) => `<div class="${section}"><div class="ilaw-field"><span class="ilaw-label">${label}</span><table><tr>${weeklyQaDays.map(day => `<th>${day}</th>`).join('')}</tr><tr>${cells.map(value => `<td>${value}</td>`).join('')}</tr></table></div></div>`;
const weeklyQaHtml = (missingDay = '') => [
  weeklyQaField('ilaw-I', 'Learning Objectives', weeklyQaObjectives.map((value, index) => weeklyQaDays[index] === missingDay ? '[Objective]' : value)),
  weeklyQaField('ilaw-L', 'Flow', weeklyQaActivities),
  weeklyQaField('ilaw-A', 'Formative Assessment', weeklyQaAssessments),
].join('');

const filipinoQaObjectives = weeklyQaDays.map((day, index) => [
  'Natutukoy ang pandiwa sa pangungusap.', 'Naiuuri ang aspekto ng pandiwa.',
  'Nagagamit ang pandiwa sa sariling pangungusap.', 'Naipaliliwanag ang papel ng pandiwa sa salaysay.',
  'Nawawasto ang gamit ng pandiwa sa talata.',
][index] + ` Aralin sa ${day}.`);
const filipinoQaActivities = weeklyQaDays.map(day => `Suriin ang halimbawa at magsanay sa ${day}.`);
const filipinoQaAssessments = weeklyQaDays.map(day => `Sagutin ang gawain sa pandiwa para sa ${day}.`);
const filipinoQaHtml = () => [
  `<div class="ilaw-I"><div class="ilaw-field"><strong class="ilaw-label">Learning Objective:</strong>
    <table><thead><tr>${['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => `<th>${day}</th>`).join('')}</tr></thead>
    <tbody><tr>${filipinoQaObjectives.map(value => `<td><p>${value}</p></td>`).join('')}</tr></tbody></table></div></div>`,
  `<div class="ilaw-L"><div class="ilaw-field"><span class="ilaw-label">Teaching Activities</span>
    <table>${weeklyQaDays.map((day, index) => `<tr><th>${day}</th><td>${filipinoQaActivities[index]}</td></tr>`).join('')}</table></div></div>`,
  `<div class="ilaw-A"><div class="ilaw-field"><span class="ilaw-label">Assessment</span>
    <table>${weeklyQaDays.map((day, index) => `<tr><th>${day}</th><td>${filipinoQaAssessments[index]}</td></tr>`).join('')}</table></div></div>`,
].join('');

test('TD-VID-004A-F1 Filipino 7 historical plan creates five independent local worksheets', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true,
    worksheetScenario: true, teacherWeeklyScenario: true, teacherWeeklyFilipino: true });
  const plan = harness.state.lessonPlanRows[0];
  plan.title = 'Filipino 7 Lesson Plan'; plan.file_name = '[G7] Filipino.pdf';
  plan.subject = 'ILAW Lesson Plan'; plan.subject_id = null; plan.grade_level = null;
  plan.objectives = filipinoQaHtml();
  await page.goto('/teacher-dashboard/lesson-plans');
  await expect(page.getByRole('combobox', { name: 'Questions per day' })).toHaveValue('30');
  await page.getByRole('button', { name: `Generate Worksheet from ${plan.title}` }).click();
  await expect(page.getByRole('dialog', { name: 'Weekly worksheet generation' }))
    .toContainText('Five separate daily drafts are ready');
  expect(harness.state.teacherWeeklyPayloads[0].days.map(day => day.objective)).toEqual(filipinoQaObjectives);
  expect(harness.state.teacherWeeklyPayloads[0].questionCount).toBe(30);
  await page.getByRole('button', { name: 'View draft in Worksheets' }).click();
  const collection = page.getByRole('region', { name: 'Weekly Worksheet Collection' });
  await expect(collection).toContainText('Filipino 7 — Weekly Worksheets');
  await expect(collection).toContainText('Local draft · Not saved to EduScribe');
  await expect(collection).not.toContainText('Plan ID:');
  await expect(collection).not.toContainText('Subject: Unknown');
  await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'saved worksheets' })).toContainText('5 local drafts');
  await collection.getByRole('button', { name: 'Open weekly collection' }).click();
  for (const day of weeklyQaDays) await expect(collection.getByRole('region', { name: `${day} Worksheet` })).toBeVisible();
  for (const day of weeklyQaDays) await expect(collection.getByRole('region', { name: `${day} Worksheet` })).toContainText('30 questions');
  await expect(collection.getByRole('button', { name: /Distribute/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('td-vid-004a-f1-filipino-week.png'), fullPage: true });
  await collection.getByRole('button', { name: 'Edit/Preview Monday' }).click();
  const editor = page.getByRole('region', { name: 'Generated Worksheet editor' });
  await expect(editor.getByRole('textbox', { name: 'Question 1 text' })).toHaveValue(new RegExp(filipinoQaObjectives[0]));
  await editor.getByRole('textbox', { name: 'Question 1 text' }).fill('Binagong tanong para sa Lunes.');
  await editor.getByRole('button', { name: 'Save Local Draft' }).click();
  await expect(collection.getByRole('region', { name: 'Monday Worksheet' })).toContainText('Saved locally for testing');
  await expect(collection.getByRole('region', { name: 'Tuesday Worksheet' })).toContainText('Local draft');
  await collection.getByRole('button', { name: 'Edit/Preview Tuesday' }).click();
  await expect(page.getByRole('textbox', { name: 'Question 1 text' })).toHaveValue(new RegExp(filipinoQaObjectives[1]));
  await expect(page.getByRole('article', { name: 'Student-facing worksheet' })).toContainText(filipinoQaObjectives[1]);
  await expect(page.getByRole('article', { name: 'Student-facing worksheet' })).not.toContainText('Private Tuesday reference answer');
  await page.screenshot({ path: testInfo.outputPath('td-vid-004a-f1-tuesday-editor.png'), fullPage: true });
  expect(harness.state.teacherWeeklyCalls).toBe(1);
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  harness.assertHealthy();
});

for (const questionCount of [20, 40]) test(`TD-VID-004A-F3 ${questionCount} questions per daily worksheet`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: questionCount === 20 ? 390 : 1365, height: 900 });
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true,
    worksheetScenario: true, teacherWeeklyScenario: true, teacherWeeklyFilipino: true });
  const plan = harness.state.lessonPlanRows[0];
  plan.title = 'Filipino 7 Lesson Plan'; plan.subject = 'ILAW Lesson Plan';
  plan.objectives = filipinoQaHtml();
  await page.goto('/teacher-dashboard/lesson-plans');
  await page.getByRole('combobox', { name: 'Questions per day' }).selectOption(String(questionCount));
  await page.getByRole('button', { name: `Generate Worksheet from ${plan.title}` }).click();
  await expect(page.getByRole('dialog', { name: 'Weekly worksheet generation' })).toContainText('Five separate daily drafts are ready');
  expect(harness.state.teacherWeeklyPayloads[0].questionCount).toBe(questionCount);
  await page.getByRole('button', { name: 'View draft in Worksheets' }).click();
  const collection = page.getByRole('region', { name: 'Weekly Worksheet Collection' });
  await collection.getByRole('button', { name: 'Open weekly collection' }).click();
  for (const day of weeklyQaDays) await expect(collection.getByRole('region', { name: `${day} Worksheet` })).toContainText(`${questionCount} questions`);
  await expect(collection).not.toContainText('Plan ID:');
  await page.screenshot({ path: testInfo.outputPath(`td-vid-004a-f3-${questionCount}-collection.png`), fullPage: true });
  await collection.getByRole('button', { name: 'Edit/Preview Monday' }).click();
  const editor = page.getByRole('region', { name: 'Generated Worksheet editor' });
  await expect(editor.getByRole('textbox', { name: /Question \d+ text/ })).toHaveCount(questionCount);
  const types = await editor.locator('select[aria-label$="type"]').evaluateAll(selects => selects.map(select => select.value));
  expect(new Set(types)).toEqual(new Set(['multiple_choice', 'true_false', 'enumeration', 'essay']));
  await editor.getByRole('button', { name: 'Student preview' }).click();
  await expect(editor.getByRole('region', { name: 'Student-facing worksheet preview' })).not.toContainText('Private Monday reference answer');
  await page.screenshot({ path: testInfo.outputPath(`td-vid-004a-f3-${questionCount}-preview.png`), fullPage: true });
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  harness.assertHealthy();
});

test('TD-VID-004A-F1 shows provider failure category without offering unsafe Retry', async ({ page }, testInfo) => {
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true,
    teacherWeeklyScenario: true, teacherWeeklyFailure: { status: 502, body: {
      code: 'PROVIDER_TRUNCATED', retryable: false,
      error: 'The AI response ended before five worksheets were complete. Review the source plan and try again later.',
    } } });
  const plan = harness.state.lessonPlanRows[0];
  plan.objectives = weeklyQaHtml();
  await page.goto('/teacher-dashboard/lesson-plans');
  await page.getByRole('button', { name: `Generate Worksheet from ${plan.title}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Weekly worksheet generation' });
  await expect(dialog.getByRole('alert')).toContainText('AI response ended before five worksheets were complete');
  await expect(dialog.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('td-vid-004a-f1-failure-category.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(harness.state.teacherWeeklyCalls).toBe(1);
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  harness.assertHealthy();
});

test('TD-VID-004A-F4 Friday batch validation failure creates no collection or Retry', async ({ page }) => {
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true,
    teacherWeeklyScenario: true, teacherWeeklyFailure: { status: 502, body: {
      code: 'AI_RESPONSE_INVALID', retryable: false, questionCount: 30,
      error: 'Friday: Worksheet could not be completed because the generated questions failed validation in batch 3. Nothing was saved.',
    } } });
  const plan = harness.state.lessonPlanRows[0];
  plan.objectives = weeklyQaHtml();
  await page.goto('/teacher-dashboard/lesson-plans');
  await page.getByRole('button', { name: `Generate Worksheet from ${plan.title}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Weekly worksheet generation' });
  await expect(dialog.getByRole('alert')).toContainText('Friday: Worksheet could not be completed');
  await expect(dialog.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('link', { name: 'Worksheets', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Weekly Worksheet Collection' })).toHaveCount(0);
  expect(harness.state.teacherWeeklyCalls).toBe(1);
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  harness.assertHealthy();
});

test('TD-VID-004A-F1 canceled weekly request cannot create a late collection', async ({ page }) => {
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true,
    worksheetScenario: true, teacherWeeklyScenario: true, teacherWeeklyHold: true });
  const plan = harness.state.lessonPlanRows[0];
  plan.objectives = weeklyQaHtml();
  await page.goto('/teacher-dashboard/lesson-plans');
  await page.getByRole('button', { name: `Generate Worksheet from ${plan.title}` }).click();
  await expect.poll(() => Boolean(harness.state.releaseTeacherWeekly)).toBe(true);
  await page.getByRole('dialog', { name: 'Weekly worksheet generation' }).getByRole('button', { name: 'Cancel' }).click();
  harness.state.releaseTeacherWeekly();
  await expect(page.getByRole('dialog', { name: 'Weekly worksheet generation' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Worksheets', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Weekly Worksheet Collection' })).toHaveCount(0);
  expect(harness.state.teacherWeeklyCalls).toBe(1);
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  harness.assertHealthy();
});

test('TD-VID-004A creates five distinct daily worksheet cards from one saved AI ILAW', async ({ page }, testInfo) => {
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true,
    worksheetScenario: true, teacherWeeklyScenario: true });
  const plan = harness.state.lessonPlanRows[0];
  plan.title = 'Synthetic weekly English plan';
  plan.subject = 'English'; plan.subject_id = 'subject-qa-english'; plan.grade_level = 'Grade 7';
  plan.objectives = weeklyQaHtml();
  await page.goto('/teacher-dashboard/lesson-plans');
  await page.getByRole('button', { name: `Generate Worksheet from ${plan.title}` }).click();
  await expect(page.getByRole('dialog', { name: 'Weekly worksheet generation' }))
    .toContainText('Five separate daily drafts are ready');
  await page.getByRole('button', { name: 'View draft in Worksheets' }).click();
  const collection = page.getByRole('region', { name: 'Weekly Worksheet Collection' });
  await expect(collection).toContainText('English 7 — Weekly Worksheets');
  await collection.getByRole('button', { name: 'Open weekly collection' }).click();
  for (const day of weeklyQaDays) await expect(collection.getByRole('region', { name: `${day} Worksheet` })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('td-vid-004a-weekly-collection.png'), fullPage: true });
  await collection.getByRole('button', { name: 'Edit/Preview Monday' }).click();
  const editor = page.getByRole('region', { name: 'Generated Worksheet editor' });
  await expect(editor.getByRole('textbox', { name: 'Question 1 text' })).toHaveValue(new RegExp(weeklyQaObjectives[0]));
  await editor.getByRole('textbox', { name: 'Question 1 text' }).fill('Identify the subject in the edited sample sentence.');
  await editor.getByRole('button', { name: 'Save Local Draft' }).click();
  await expect(collection.getByRole('region', { name: 'Monday Worksheet' })).toContainText('Saved locally for testing');
  await expect(collection.getByRole('region', { name: 'Tuesday Worksheet' })).toContainText('Local draft');
  await collection.getByRole('button', { name: 'Edit/Preview Tuesday' }).click();
  await expect(page.getByRole('textbox', { name: 'Question 1 text' })).toHaveValue(new RegExp(weeklyQaObjectives[1]));
  await page.getByRole('button', { name: 'Back to Worksheets' }).first().click();
  await collection.getByRole('button', { name: 'Edit/Preview Thursday' }).click();
  await expect(page.getByRole('textbox', { name: /Question \d+ reference answer/ }).first()).toHaveValue('Private Thursday reference answer.');
  await expect(page.getByRole('article', { name: 'Student-facing worksheet' })).not.toContainText('Private Thursday reference answer.');
  await page.getByRole('button', { name: 'Teacher answer key' }).click();
  await expect(page.getByRole('article', { name: 'Teacher answer key' })).toContainText('Accurate explanation');
  await page.getByRole('textbox', { name: /Question \d+ reference answer/ }).first().fill('Edited private Thursday reference.');
  await page.getByRole('button', { name: 'Save Local Draft' }).click();
  await collection.getByRole('button', { name: 'Edit/Preview Thursday' }).click();
  await expect(page.getByRole('textbox', { name: /Question \d+ reference answer/ }).first()).toHaveValue('Edited private Thursday reference.');
  await page.screenshot({ path: testInfo.outputPath('td-vid-004a-daily-editor.png'), fullPage: true });
  expect(harness.state.teacherWeeklyCalls).toBe(1);
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  harness.assertHealthy();
});

test('TD-VID-004A keeps two English weekly collections separate by saved source plan', async ({ page }) => {
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true,
    worksheetScenario: true, teacherWeeklyScenario: true });
  const first = harness.state.lessonPlanRows[0];
  first.title = 'English week 3'; first.subject = 'English'; first.subject_id = 'subject-qa-english';
  first.grade_level = 'Grade 7'; first.objectives = weeklyQaHtml();
  harness.state.lessonPlanRows.push({ ...first, id: 'plan-week-4', title: 'English week 4' });
  await page.goto('/teacher-dashboard/lesson-plans');
  await page.getByRole('button', { name: 'Generate Worksheet from English week 3' }).click();
  await page.getByRole('button', { name: 'View draft in Worksheets' }).click();
  await page.getByRole('link', { name: 'Lesson Plans' }).click();
  await page.getByRole('button', { name: 'Generate Worksheet from English week 4' }).click();
  await page.getByRole('button', { name: 'View draft in Worksheets' }).click();
  const collections = page.getByRole('region', { name: 'Weekly Worksheet Collection' });
  await expect(collections).toHaveCount(2);
  await expect(collections.first()).toContainText('English 7 — Weekly Worksheets');
  await expect(collections.last()).toContainText('English 7 — Weekly Worksheets');
  expect(harness.state.teacherWeeklyCalls).toBe(2);
  expect(harness.state.worksheetWrites).toEqual([]);
  harness.assertHealthy();
});

test('TD-VID-004A reports a missing day without AI, save, or distribution', async ({ page }) => {
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true,
    teacherWeeklyScenario: true });
  const plan = harness.state.lessonPlanRows[0];
  plan.objectives = weeklyQaHtml('Tuesday');
  await page.goto('/teacher-dashboard/lesson-plans');
  await page.getByRole('button', { name: `Generate Worksheet from ${plan.title}` }).click();
  await expect(page.getByRole('dialog', { name: 'Weekly worksheet generation' })).toContainText('Tuesday learning objectives is missing.');
  expect(harness.state.teacherWeeklyCalls).toBe(0);
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  harness.assertHealthy();
});

test('TD-VID-003-F1 generates an unsaved AI plan without a teaching load', async ({ page }, testInfo) => {
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true,
    teacherAssignmentRows: [], officialSchoolYear: null, teacherUploadMode: 'success', teacherAiScenario: 'success' });
  await page.goto('/teacher-dashboard/lesson-plans');
  await expect(page.getByRole('combobox', { name: 'Official teaching assignment' })).toHaveCount(0);
  await expect(page.getByText('Choose subject and grade')).toHaveCount(0);
  await expect(page.getByText(/No official subject and grade teaching assignment/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('td-vid-003-f1-before.png'), fullPage: true });
  await page.locator('#lesson-pdf-upload').setInputFiles({ name: 'mathematics-8.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic') });
  await expect(page.getByRole('button', { name: 'Generate lesson plan' })).toBeEnabled();
  await page.getByRole('button', { name: 'Generate lesson plan' }).click();
  await expect(page.getByRole('textbox', { name: 'Lesson plan content' })).toContainText('Synthetic generated plan');
  await expect(page.getByRole('combobox', { name: 'Official teaching assignment' })).toHaveCount(0);
  await expect(page.getByText(/No official subject and grade teaching assignment/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save Plan' })).toBeDisabled();
  await expect(page.getByText(/Permanent AI Lesson Plan save is unavailable/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Distribute/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('td-vid-003-f1-after.png'), fullPage: true });
  await page.getByRole('button', { name: /Back/ }).click();
  await page.getByRole('dialog', { name: 'Confirm lesson plan action' }).getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.locator('#lesson-pdf-upload')).toBeVisible();
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  expect(harness.state.teacherStorageUploads).toBe(1);
  expect(harness.state.teacherAiCalls).toBe(1);
  expect(harness.state.teacherAssignmentReads).toEqual([]);
  harness.assertHealthy();
});

test('TD-VID-003 displays complete synthetic saved metadata and hands it to local Worksheet draft', async ({ page }, testInfo) => {
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true, worksheetScenario: true,
    teacherWeeklyScenario: true });
  const plan = harness.state.lessonPlanRows[0];
  plan.title = 'English 7';
  plan.objectives = weeklyQaHtml();
  await page.goto('/teacher-dashboard/lesson-plans');
  await expect(page.getByText('Subject: Unknown · Grade: Grade 7 · Academic Year: Unknown')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('td-vid-003-before.png'), fullPage: true });
  plan.subject_id = 'subject-qa-english';
  plan.subject = 'English';
  plan.grade_level = 'Grade 7';
  plan.academic_year = '2026-2027';
  await page.reload();
  await expect(page.getByText('Subject: English · Grade: Grade 7 · Academic Year: 2026-2027')).toBeVisible();
  await page.getByRole('button', { name: /View and edit.*English 7/ }).click();
  await expect(page.getByRole('textbox', { name: 'Lesson plan content' })).toContainText('Identify subjects in simple sentences.');
  await expect(page.getByText('Saved metadata — Subject: English · Grade: Grade 7 · Academic Year: 2026-2027')).toBeVisible();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  await page.getByRole('button', { name: /Back/ }).click();
  await page.reload();
  await expect(page.getByText('Subject: English · Grade: Grade 7 · Academic Year: 2026-2027')).toBeVisible();
  await page.getByRole('button', { name: 'Generate Worksheet from English 7' }).click();
  const progress = page.getByRole('dialog', { name: 'Weekly worksheet generation' });
  await expect(progress.getByRole('button', { name: 'View draft in Worksheets' })).toBeVisible();
  await progress.getByRole('button', { name: 'View draft in Worksheets' }).click();
  const entry = page.getByRole('region', { name: 'Weekly Worksheet Collection' });
  await expect(entry).toContainText('English 7 — Weekly Worksheets');
  await expect(entry).not.toContainText('Academic Year:');
  await page.screenshot({ path: testInfo.outputPath('td-vid-003-after.png'), fullPage: true });
  expect(harness.state.lessonPlanWrites).toEqual(['PATCH']);
  expect(harness.state.lessonPlanWriteRequests[0].payload).not.toHaveProperty('academic_year');
  expect(harness.state.worksheetWrites).toEqual([]);
  harness.assertHealthy();
});

test('TD-VID-003-F1 historical AI plans remain readable without a teaching load', async ({ page }) => {
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true, teacherAssignmentRows: [] });
  await page.goto('/teacher-dashboard/lesson-plans');
  await expect(page.getByRole('combobox', { name: 'Official teaching assignment' })).toHaveCount(0);
  await page.getByRole('button', { name: /View and edit.*Synthetic science lesson/ }).click();
  await expect(page.getByRole('textbox', { name: 'Lesson plan content' })).toContainText('Original science objectives');
  expect(harness.state.lessonPlanWrites).toEqual([]);
  harness.assertHealthy();
});

test('TD-VID-003 inactive Teacher receives no authoring assignment', async ({ page }) => {
  const harness = await installProfileMocks(page, { role: 'teacher', profile: { status: 'inactive' }, teacherLessonPlanScenario: true });
  await page.goto('/teacher-dashboard/lesson-plans');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('combobox', { name: 'Official teaching assignment' })).toHaveCount(0);
  expect(harness.state.teacherAssignmentReads).toEqual([]);
  expect(harness.state.lessonPlanWrites).toEqual([]);
  harness.assertHealthy();
});

test('TD-VID-002 renames the active AI document across editor, saved print, and real PDF', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
  const plan = harness.state.lessonPlanRows[0];
  plan.title = 'Original English plan';
  plan.objectives = '<div class="ilaw-lesson-plan"><h2 class="ilaw-title">ILAW LESSON PLAN IN ENGLISH 7</h2><h2>Objectives</h2><p>Identify &amp; compare</p><h3>Activities</h3><p>Read a story</p><h3>Assessment</h3><table><tr><th>Question</th><td>Explain the story</td></tr></table></div>';
  await page.goto('/teacher-dashboard/lesson-plans');
  await page.getByRole('button', { name: /View and edit.*Original English plan/ }).click();
  const editor = page.getByRole('textbox', { name: 'Lesson plan content' });
  await expect(editor.locator('h2.ilaw-title')).toHaveText('ILAW LESSON PLAN IN ENGLISH 7');
  await page.screenshot({ path: testInfo.outputPath('td-vid-002-before.png'), fullPage: true });
  await page.getByRole('textbox', { name: 'Lesson Plan Title' }).fill('7 English');
  await expect(editor.locator('h2.ilaw-title')).toHaveText('7 English');
  expect(await editor.locator('h2.ilaw-title').evaluate(node => getComputedStyle(node).textTransform)).toBe('none');
  await expect(editor.locator('h2')).toHaveCount(2);
  await expect(editor.locator('h2').last()).toHaveText('Objectives');
  await page.screenshot({ path: testInfo.outputPath('td-vid-002-draft.png'), fullPage: true });
  expect(harness.state.lessonPlanWrites).toEqual([]);
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Changes saved.')).toBeVisible();
  expect(harness.state.lessonPlanWrites).toEqual(['PATCH']);
  expect(harness.state.lessonPlanRows[0].title).toBe('7 English');
  expect(harness.state.lessonPlanRows[0].status).toBe('published');
  expect(harness.state.lessonPlanRows[1].title).toBe('Synthetic mathematics lesson');
  expect(harness.state.lessonPlanWriteRequests[0].payload).not.toHaveProperty('status');
  expect(harness.state.lessonPlanRows[0].objectives).toContain('>7 English</h2>');
  for (const phrase of ['Objectives', 'Identify &amp; compare', 'Activities', 'Read a story', 'Assessment', 'Explain the story']) {
    expect(harness.state.lessonPlanRows[0].objectives).toContain(phrase);
  }
  await page.getByRole('button', { name: /Back/ }).click();
  await expect(page.getByRole('heading', { name: '7 English', level: 3 })).toBeVisible();
  const printPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /Print saved version of 7 English/ }).click();
  const printPage = await printPromise;
  await expect(printPage.locator('h2.ilaw-title')).toHaveText('7 English');
  expect(await printPage.locator('h2.ilaw-title').evaluate(node => getComputedStyle(node).textTransform)).toBe('none');
  await expect(printPage.locator('h2').last()).toHaveText('Objectives');
  await printPage.close();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download PDF saved version of 7 English/ }).click();
  const download = await downloadPromise;
  const pdfText = inspectPdfmakePdf(readFileSync(await download.path())).pageTexts.join(' ').replace(/\s+/g, '');
  expect(pdfText).toContain('7English');
  expect(pdfText).toContain('Explainthe story'.replace(/\s+/g, ''));
  await page.getByRole('button', { name: /View and edit.*7 English/ }).click();
  await expect(page.getByRole('textbox', { name: 'Lesson plan content' }).locator('h2.ilaw-title')).toHaveText('7 English');
  await page.reload();
  await page.getByRole('button', { name: /View and edit.*7 English/ }).click();
  await expect(page.getByRole('textbox', { name: 'Lesson plan content' }).locator('h2.ilaw-title')).toHaveText('7 English');
  await page.screenshot({ path: testInfo.outputPath('td-vid-002-after.png'), fullPage: true });
  expect(harness.state.lessonPlanWrites).toEqual(['PATCH']);
  harness.assertHealthy();
});
import {
  installProfileMocks,
  openDashboardNavigation,
  openSyntheticProfile,
} from './profile-mock-fixture.js';

test('development Essay Review Lab keeps simulation local and requires Teacher approval', async ({ page }) => {
  const harness = await installProfileMocks(page, { role: 'teacher' });
  await page.goto('/teacher-dashboard/essay-review-lab');
  await expect(page.getByRole('heading', { name: 'Essay Review Lab' })).toBeVisible();
  await expect(page.getByText('Fictional submissions only. No score is saved or released.')).toBeVisible();
  await page.getByRole('button', { name: 'Request simulated evaluation' }).click();
  await expect(page.getByText('Suggested total: 5 / 5')).toBeVisible();

  await page.getByRole('textbox', { name: 'Criterion 1 title' }).fill('Scientific evidence');
  await expect(page.getByText(/previous suggestion is stale/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Criterion 1 title' }).fill('Scientific content');
  await page.getByRole('button', { name: 'Request simulated evaluation' }).click();
  await expect(page.getByText('Suggested total: 5 / 5')).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Scientific content score (max 3)' }).fill('2');
  await page.getByRole('textbox', { name: 'Teacher feedback' }).fill('Explain one more cell activity.');
  await page.getByRole('checkbox', { name: /I reviewed this answer/ }).check();
  await page.getByRole('button', { name: 'Approve review locally' }).click();
  await expect(page.getByText('Review approved locally for testing. No student score was changed or released.')).toBeVisible();
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  expect(harness.state.backendWrites).toBe(0);
  harness.assertHealthy();
});

test.describe('TDC4-C2 manual Worksheet authoring', () => {
  test('manual groups reorder and deleting the local card requires confirmation', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, worksheetScenario: true,
      teacherAssignmentRows: [{ subject_id: 'subject-qa-science', grade_level: 'Grade 7',
        subjects: { id: 'subject-qa-science', name: 'Science' } }],
    });
    await page.goto('/teacher-dashboard/worksheets');
    await page.getByRole('button', { name: 'Create Worksheet' }).click();
    const editor = page.getByRole('region', { name: 'Manual Worksheet editor' });
    await editor.getByLabel('Teaching-load subject').selectOption('subject-qa-science');
    await editor.getByLabel('Assigned grade level').selectOption('Grade 7');
    await editor.getByRole('textbox', { name: 'Worksheet title' }).fill('Two groups');
    await editor.getByLabel('Section 1 name').fill('First group');
    await editor.getByRole('button', { name: 'Add question to section' }).click();
    await editor.getByRole('textbox', { name: 'Question 1 text' }).fill('Explain the first group.');
    await editor.getByLabel('Question 1 type').selectOption('essay');
    await editor.getByRole('button', { name: 'Add question section' }).click();
    await editor.getByLabel('Section 2 name').fill('Second group');
    await editor.getByLabel('Directions for Second group').fill('Explain your answer.');
    await editor.getByRole('button', { name: 'Add question to section' }).last().click();
    await editor.getByRole('textbox', { name: 'Question 2 text' }).fill('Explain the second group.');
    await editor.getByLabel('Question 2 type').selectOption('essay');
    await editor.getByRole('button', { name: 'Move section 2 up' }).click();
    await editor.getByRole('button', { name: 'Student preview' }).click();
    const student = editor.getByRole('article', { name: 'Student-facing worksheet' });
    await expect(student).toContainText('Explain your answer.');
    expect(await student.locator('h4').allTextContents()).toEqual(['Second group', 'First group']);
    await editor.getByRole('button', { name: 'Save Worksheet' }).click();
    const card = page.getByRole('region', { name: 'Manual Worksheet draft entry' });
    await expect(card).toContainText('Saved locally for testing');
    await card.getByRole('button', { name: 'Delete Draft' }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete worksheet draft' });
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(card).toHaveCount(1);
    await card.getByRole('button', { name: 'Delete Draft' }).click();
    await confirm.getByRole('button', { name: 'Delete draft' }).click();
    await expect(card).toHaveCount(0);
    expect(harness.state.worksheetWrites).toEqual([]);
    expect(harness.state.teacherAiCalls).toBe(0);
    harness.assertHealthy();
  });

  test('manual and AI local drafts coexist without overwrite or mutation', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, worksheetScenario: true,
      teacherAssignmentRows: [{ subject_id: 'subject-qa-science', grade_level: 'Grade 7',
        subjects: { id: 'subject-qa-science', name: 'Science' } }],
    });
    Object.assign(harness.state.lessonPlanRows[0], {
      subject_id: 'subject-qa-science', grade_level: 'Grade 7',
      objectives: '<h2>Learning Objectives</h2><p>Identify plant cells.</p><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>',
    });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: 'Generate Worksheet from Synthetic science lesson' }).click();
    await openGeneratedWorksheetEntry(page);
    await page.getByRole('button', { name: 'Create Worksheet' }).click();
    const editor = page.getByRole('region', { name: 'Manual Worksheet editor' });
    await editor.getByLabel('Teaching-load subject').selectOption('subject-qa-science');
    await editor.getByLabel('Assigned grade level').selectOption('Grade 7');
    await editor.getByRole('textbox', { name: 'Worksheet title' }).fill('Teacher-authored');
    await editor.getByRole('button', { name: 'Add question to section' }).click();
    await editor.getByRole('textbox', { name: 'Question 1 text' }).fill('Explain a plant cell.');
    await editor.getByLabel('Question 1 type').selectOption('essay');
    await editor.getByRole('button', { name: 'Save Worksheet' }).click();
    await expect(page.getByRole('region', { name: 'Manual Worksheet draft entry' })).toContainText('Teacher-authored');
    await expect(page.getByRole('region', { name: 'Generated Worksheet draft entry' })).toBeVisible();
    await page.getByRole('button', { name: 'Create Worksheet' }).click();
    await expect(page.getByRole('region', { name: 'Manual Worksheet editor' })).toBeVisible();
    await editor.getByRole('button', { name: 'Back to Worksheets' }).first().click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByRole('region', { name: 'Manual Worksheet draft entry' })).toHaveCount(1);
    expect(harness.state.worksheetWrites).toEqual([]);
    expect(harness.state.teacherAiCalls).toBe(0);
    harness.assertHealthy();
  });

  test('no teaching load fails closed while saved records stay visible', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, worksheetScenario: true,
      teacherAssignmentRows: [],
    });
    await page.goto('/teacher-dashboard/worksheets');
    await expect(page.getByRole('heading', { name: 'Synthetic worksheet' })).toBeVisible();
    await page.getByRole('button', { name: 'Create Worksheet' }).click();
    const editor = page.getByRole('region', { name: 'Manual Worksheet editor' });
    await expect(editor.getByText('No assigned subject for this school year')).toBeVisible();
    await editor.getByRole('button', { name: 'Save Worksheet' }).click();
    await expect(editor.getByRole('alert').filter({ hasText: 'Choose an assigned subject' })).toBeVisible();
    expect(harness.state.worksheetWrites).toEqual([]);
    expect(harness.state.teacherAiCalls).toBe(0);
    harness.assertHealthy();
  });

  for (const width of [360, 390, 768, 1024, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`blank manual draft, local save and reopen at ${width}px in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, {
          role: 'teacher', theme, teacherLessonPlanScenario: true, worksheetScenario: true,
          teacherAssignmentRows: [{ subject_id: 'subject-qa-science', grade_level: 'Grade 7',
            subjects: { id: 'subject-qa-science', name: 'Science' } }],
        });
        await page.goto('/teacher-dashboard/worksheets');
        await page.getByRole('button', { name: 'Create Worksheet' }).click();
        const editor = page.getByRole('region', { name: 'Manual Worksheet editor' });
        await expect(editor).toBeVisible();
        await expect(editor.getByRole('textbox', { name: 'Worksheet title' })).toHaveValue('');
        await expect(editor.getByRole('textbox', { name: 'Question 1 text' })).toHaveCount(0);
        await expect(editor.getByLabel('Section 1 name')).toHaveValue('Questions');
        await expect(editor.getByText('Not saved to EduScribe')).toBeVisible();
        await editor.getByRole('button', { name: 'Save Worksheet' }).click();
        await expect(editor.getByRole('alert').filter({ hasText: 'Choose an assigned subject' })).toBeVisible();
        await editor.getByLabel('Teaching-load subject').selectOption('subject-qa-science');
        await editor.getByLabel('Assigned grade level').selectOption('Grade 7');
        await editor.getByRole('textbox', { name: 'Worksheet title' }).fill('Synthetic Science worksheet');
        await editor.getByLabel('Directions / Instructions').fill('Read every item.');
        await editor.getByLabel('Section 1 name').fill('Science practice');
        await editor.getByLabel('Directions for Science practice').fill('Choose the best answer.');
        await editor.getByRole('button', { name: 'Add question to section' }).click();
        await editor.getByRole('textbox', { name: 'Question 1 text' }).fill('Which part controls a cell?');
        await editor.getByRole('textbox', { name: 'Question 1 choice 1' }).fill('Nucleus');
        await editor.getByRole('textbox', { name: 'Question 1 choice 2' }).fill('Wall');
        await editor.getByLabel('Question 1 correct choice').selectOption('Nucleus');
        await editor.getByRole('button', { name: 'Student preview' }).click();
        const student = editor.getByRole('article', { name: 'Student-facing worksheet' });
        await expect(student).toContainText('Which part controls a cell?');
        await expect(student).not.toContainText('Answer: Nucleus');
        if (width === 360 || width === 1440) {
          mkdirSync('screenshots/teacher-tdc4c2', { recursive: true });
          await page.screenshot({ path: `screenshots/teacher-tdc4c2/${theme}-${width}-manual-editor.png`, fullPage: true });
        }
        await editor.getByRole('button', { name: 'Save Worksheet' }).click();
        const card = page.getByRole('region', { name: 'Manual Worksheet draft entry' });
        await expect(card).toHaveCount(1);
        await expect(card).toContainText('Saved locally for testing');
        if (width === 360 || width === 1440) {
          mkdirSync('screenshots/teacher-tdc4c2', { recursive: true });
          await page.screenshot({ path: `screenshots/teacher-tdc4c2/${theme}-${width}-manual-card.png`, fullPage: true });
        }
        await card.getByRole('button', { name: 'View/Edit worksheet' }).click();
        await expect(editor.getByRole('textbox', { name: 'Worksheet title' })).toHaveValue('Synthetic Science worksheet');
        await expect(editor.getByLabel('Directions for Science practice')).toHaveValue('Choose the best answer.');
        await editor.getByRole('button', { name: 'Edit questions and key' }).click();
        await editor.getByRole('textbox', { name: 'Question 1 text' }).fill('What controls a cell?');
        await editor.getByRole('button', { name: 'Save Worksheet' }).click();
        await expect(card).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
        expect(harness.state.worksheetWrites).toEqual([]);
        expect(harness.state.teacherAiCalls).toBe(0);
        harness.assertHealthy();
      });
    }
  }
});

test.describe('TDC4-B local Worksheet distribution simulation', () => {
  for (const width of [360, 390, 768, 1024, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`saved local worksheet review at ${width}px in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, {
          role: 'teacher', theme, teacherLessonPlanScenario: true, worksheetScenario: true,
          teacherAssignmentRows: [{ subject_id: 'subject-qa-science', grade_level: 'Grade 7',
            subjects: { id: 'subject-qa-science', name: 'Science' } }],
        });
        const teacherId = harness.state.profile.id;
        const year = currentSchoolYear();
        const synthetic = {
          synthetic: true, teacherId, schoolYear: year,
          teachingLoads: [{ id: 'load-science-7', teacher_id: teacherId, subject_id: 'subject-qa-science',
            grade_level: 'Grade 7', school_year: year, subjects: { name: 'Science' } }],
          schedules: [
            { id: 'schedule-1', teacher_id: teacherId, subject_id: 'subject-qa-science', section_id: 'section-a', school_year: year },
            { id: 'schedule-2', teacher_id: teacherId, subject_id: 'subject-qa-science', section_id: 'section-b', school_year: year },
          ],
          sections: [
            { id: 'section-a', name: 'Synthetic Orchid', grade_level: 'Grade 7', school_year: year },
            { id: 'section-b', name: 'Synthetic Jasmine', grade_level: 'Grade 7', school_year: year },
          ],
          enrollments: [
            { section_id: 'section-a', student_id: 'synthetic-student-a', status: 'active' },
            { section_id: 'section-a', student_id: 'synthetic-student-b', status: 'dropped' },
            { section_id: 'section-b', student_id: 'synthetic-student-c', status: 'active' },
          ],
        };
        await page.addInitScript(value => { window.__EDUSCRIBE_DISTRIBUTION_FIXTURE__ = value; }, synthetic);
        Object.assign(harness.state.lessonPlanRows[0], {
          subject_id: 'subject-qa-science', grade_level: 'Grade 7',
          objectives: '<h2>Learning Objectives</h2><p>Identify plant cells.</p><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>',
        });
        await page.goto('/teacher-dashboard/lesson-plans');
        await page.getByRole('button', { name: 'Generate Worksheet from Synthetic science lesson' }).click();
        const entry = await openGeneratedWorksheetEntry(page);
        await expect(entry.getByRole('button', { name: /Distribute Worksheet/ })).toHaveCount(0);
        await entry.getByRole('button', { name: 'View/Edit draft' }).click();
        await page.getByRole('region', { name: 'Generated Worksheet editor' })
          .getByRole('button', { name: 'Save Worksheet' }).click();
        const action = entry.getByRole('button', { name: /Distribute Worksheet/ });
        await expect(action).toBeVisible();
        await action.click();
        const dialog = page.getByRole('dialog', { name: 'Simulate Worksheet Distribution' });
        await expect(dialog).toContainText('No students will be notified');
        await expect(dialog.getByRole('button', { name: 'Review simulation' })).toBeDisabled();
        await dialog.getByLabel('Authorized synthetic class').selectOption('section-a');
        await expect(dialog).toContainText('Eligible synthetic recipients: 1');
        await expect(dialog).toContainText('Excluded or invalid records: 1');
        await dialog.getByRole('button', { name: 'Review simulation' }).click();
        await expect(dialog.getByLabel('Final distribution review')).toContainText('Synthetic Orchid · 1 eligible recipients');
        if (width === 360 || width === 1440) {
          mkdirSync('screenshots/teacher-tdc4b', { recursive: true });
          await page.screenshot({ path: `screenshots/teacher-tdc4b/${theme}-${width}-review.png`, fullPage: true });
        }
        await dialog.getByRole('button', { name: 'Back' }).click();
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(entry.getByText('Distribution Simulated Locally')).toHaveCount(0);
        await expect(action).toBeFocused();
        await action.click();
        await expect(dialog.getByLabel('Authorized synthetic class')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(action).toBeFocused();
        await action.click();
        await dialog.getByLabel('Authorized synthetic class').selectOption('section-a');
        await dialog.getByRole('button', { name: 'Review simulation' }).click();
        await dialog.getByRole('button', { name: 'Simulate Distribution' }).click();
        await expect(entry.getByText('Distribution Simulated Locally')).toBeVisible();
        await expect(entry).toContainText('No students were notified');
        await expect(entry).toHaveCount(1);
        await action.click();
        await dialog.getByLabel('Authorized synthetic class').selectOption('section-a');
        await expect(dialog.getByRole('button', { name: 'Review simulation' })).toBeDisabled();
        await dialog.getByLabel('Authorized synthetic class').selectOption('section-b');
        await dialog.getByRole('button', { name: 'Review simulation' }).click();
        await dialog.getByRole('button', { name: 'Simulate Distribution' }).click();
        await expect(entry).toContainText('Synthetic Orchid, Synthetic Jasmine');
        if (width === 360 || width === 1440) {
          mkdirSync('screenshots/teacher-tdc4b', { recursive: true });
          await page.screenshot({ path: `screenshots/teacher-tdc4b/${theme}-${width}.png`, fullPage: true });
        }
        if (width === 1440 && theme === 'light') {
          await page.getByRole('link', { name: 'Students', exact: true }).click();
          await page.getByRole('link', { name: 'Worksheets', exact: true }).click();
          await expect(entry).toContainText('Distribution Simulated Locally');
          await entry.getByRole('button', { name: 'View/Edit worksheet' }).click();
          const editor = page.getByRole('region', { name: 'Generated Worksheet editor' });
          await editor.getByRole('textbox', { name: 'Question 1 text' }).fill('Edited after simulation?');
          await editor.getByRole('button', { name: 'Save Worksheet' }).click();
          await expect(entry.getByText('Distribution Simulated Locally')).toHaveCount(0);
          await page.reload();
          await expect(page.getByRole('region', { name: 'Generated Worksheet draft entry' })).toHaveCount(0);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
        expect(harness.state.worksheetWrites).toEqual([]);
        expect(harness.state.lessonPlanWrites).toEqual([]);
        expect(harness.state.teacherAiCalls).toBe(0);
        expect(harness.state.backendWrites).toBe(0);
        harness.assertHealthy();
      });
    }
  }
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const profileAvatar = (page) => page
  .getByRole('button', { name: 'Change profile photo' })
  .locator('..')
  .locator('img');

const stagePhoto = async (page, name = 'synthetic-profile.png') => {
  await page.getByLabel('Choose profile photo').setInputFiles({ name, mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('You have unsaved Profile changes.')).toBeVisible();
  const preview = profileAvatar(page);
  await expect(preview).toHaveAttribute('src', /^blob:/);
  return preview.getAttribute('src');
};

const makeDirty = async (page, value = 'Synthetic Unsaved Name') => {
  await page.getByLabel('FULL NAME').fill(value);
  await expect(page.getByText('You have unsaved Profile changes.')).toBeVisible();
};

const beforeUnloadPrevented = (page) => page.evaluate(() => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
});

const openGeneratedWorksheetEntry = async (page) => {
  const progress = page.getByRole('dialog', { name: 'Sample worksheet generation' });
  await expect(progress.getByText(/Sample generated from a test Assessment fixture/)).toBeVisible();
  await progress.getByRole('button', { name: 'View draft in Worksheets' }).click();
  await expect(page).toHaveURL(/\/teacher-dashboard\/worksheets$/);
  const entry = page.getByRole('region', { name: 'Generated Worksheet draft entry' });
  await expect(entry).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Generated Worksheet draft' })).toHaveCount(0);
  await expect(entry.getByRole('article', { name: 'Student-facing worksheet' })).toHaveCount(0);
  return entry;
};

for (const { width, theme } of [{ width: 390, theme: 'light' }, { width: 1440, theme: 'dark' }]) {
test(`VQA1-F1 active Teacher route opens the local sample and updated question builder at ${width}px in ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const harness = await installProfileMocks(page, {
    role: 'teacher', theme, teacherLessonPlanScenario: true, worksheetScenario: true,
  });
  const plan = harness.state.lessonPlanRows[0];
  plan.objectives = '<h2>Learning Objectives</h2><p>Identify the parts of a plant cell.</p><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>';
  let releaseSampleModule;
  await page.route('**/developmentWorksheetDraft.js*', async route => {
    await new Promise(resolve => { releaseSampleModule = resolve; });
    await route.continue();
  });
  await page.goto('/teacher-dashboard/lesson-plans');
  await expect(page.getByRole('heading', { name: 'Saved Lesson Plans' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Generate Worksheet from Synthetic science lesson' }).click();
  const progress = page.getByRole('dialog', { name: 'Sample worksheet generation' });
  await expect(progress.getByText('Matching a local test Assessment fixture…')).toBeVisible();
  await expect.poll(() => Boolean(releaseSampleModule)).toBe(true);
  releaseSampleModule();
  await expect(progress.getByText('Sample generated from a test Assessment fixture — not live AI. View the unsaved draft on Worksheets, then choose View/Edit to open the editor.')).toBeVisible();
  mkdirSync('test-results/teacher-vqa1-f1', { recursive: true });
  await page.screenshot({ path: `test-results/teacher-vqa1-f1/${theme}-${width}-ready.png`, fullPage: true });
  await progress.getByRole('button', { name: 'View draft in Worksheets' }).click();
  await expect(page).toHaveURL(/\/teacher-dashboard\/worksheets$/);
  const entry = page.getByRole('region', { name: 'Generated Worksheet draft entry' });
  await expect(entry).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Generated Worksheet draft' })).toHaveCount(0);
  await entry.getByRole('button', { name: 'View/Edit draft' }).click();
  const draft = page.getByRole('region', { name: 'Generated Worksheet editor' });
  await expect(draft.getByText('Not saved to EduScribe')).toBeVisible();
  await draft.getByText('Lesson context').click();
  await expect(draft.locator('details').first().locator('p')).toContainText('Label the nucleus and cell wall');
  await draft.getByText('Source details').click();
  await expect(draft.getByText('Source ID: plan-qa-1')).toBeVisible();
  await expect(draft.getByRole('combobox', { name: 'Question 1 correct choice' })).toBeVisible();
  await draft.getByRole('textbox', { name: 'Question 1 text' }).fill('Which organelle stores DNA?');
  await page.screenshot({ path: `test-results/teacher-vqa1-f1/${theme}-${width}-editor.png`, fullPage: true });
  await draft.getByRole('button', { name: 'Student preview' }).click();
  await expect(draft.getByRole('region', { name: 'Student-facing worksheet preview' })
    .getByText(/Which organelle stores DNA/)).toBeVisible();
  await expect(draft.getByText('Correct answer')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  expect(harness.state.teacherAiCalls).toBe(0);
  harness.assertHealthy();
});
}

test('saved AI card keeps Print independent from direct PDF download', async ({ page }) => {
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
  harness.state.lessonPlanRows[0].objectives = '<h2>Learning Objectives</h2><p>Synthetic cell lesson.</p><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>';
  await page.goto('/teacher-dashboard/lesson-plans');
  const card = page.locator('section[aria-labelledby="saved-plans-heading"] li').first();
  await expect(card.getByRole('button', { name: 'Print saved version of Synthetic science lesson' })).toBeVisible();
  await expect(card.getByRole('button', { name: /Download PDF saved version/ })).toBeEnabled();
  const popupPromise = page.waitForEvent('popup');
  await card.getByRole('button', { name: 'Print saved version of Synthetic science lesson' }).click();
  const popup = await popupPromise;
  await expect(popup.locator('body')).toContainText('Synthetic cell lesson.');
  await expect(popup.getByAltText('Department of Education logo')).toBeVisible();
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  harness.assertHealthy();
});

test('unmatched saved Assessment reports fixture coverage without a worksheet draft or write', async ({ page }) => {
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true, worksheetScenario: true });
  harness.state.lessonPlanRows[0].objectives = '<h2>Learning Objectives</h2><p>Investigate rocks.</p><div class="ilaw-A"><p>Sort rocks by texture.</p></div>';
  await page.goto('/teacher-dashboard/lesson-plans');
  await page.getByRole('button', { name: 'Generate Worksheet from Synthetic science lesson' }).click();
  const progress = page.getByRole('dialog', { name: 'Sample worksheet generation' });
  await expect(progress.getByRole('alert')).toContainText('No local test fixture matches this Assessment');
  await expect(progress.getByRole('button', { name: 'View draft in Worksheets' })).toHaveCount(0);
  await progress.getByRole('button', { name: 'Retry' }).click();
  await expect(progress.getByRole('alert')).toContainText('No local test fixture matches this Assessment');
  await progress.getByRole('button', { name: 'Cancel' }).click();
  await expect(progress).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Saved Lesson Plans' })).toBeVisible();
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  expect(harness.state.teacherAiCalls).toBe(0);
  harness.assertHealthy();
});

test('cancel during local fixture loading leaves the saved plan and Worksheets untouched', async ({ page }) => {
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true, worksheetScenario: true });
  harness.state.lessonPlanRows[0].objectives = '<h2>Learning Objectives</h2><p>Identify cells.</p><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>';
  let releaseFixture;
  await page.route('**/developmentWorksheetDraft.js*', async route => {
    await new Promise(resolve => { releaseFixture = resolve; });
    await route.continue();
  });
  await page.goto('/teacher-dashboard/lesson-plans');
  await page.getByRole('button', { name: 'Generate Worksheet from Synthetic science lesson' }).click();
  const progress = page.getByRole('dialog', { name: 'Sample worksheet generation' });
  await expect(progress.getByText(/Matching a local test Assessment fixture/)).toBeVisible();
  await expect.poll(() => Boolean(releaseFixture)).toBe(true);
  await progress.getByRole('button', { name: 'Cancel' }).click();
  releaseFixture();
  await expect(progress).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Saved Lesson Plans' })).toBeVisible();
  await page.getByRole('link', { name: 'Worksheets', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Generated Worksheet draft entry' })).toHaveCount(0);
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  expect(harness.state.teacherAiCalls).toBe(0);
  harness.assertHealthy();
});

for (const width of [360, 390, 768, 1024, 1440]) {
for (const theme of ['light', 'dark']) {
test(`MUX2 active Teacher route keeps an incomplete mock Draft and converts it to Saved at ${width}px in ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const harness = await installProfileMocks(page, { role: 'teacher', theme, teacherLessonPlanScenario: true, worksheetScenario: true });
  await page.goto('/teacher-dashboard/lesson-plans');
  await page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' }).click();
  const editor = page.getByRole('region', { name: 'Full Manual ILAW editor' });
  await expect(editor.getByRole('button', { name: 'Check required fields' })).toHaveCount(0);
  await expect(editor.getByRole('button', { name: 'Preview document' })).toHaveCount(0);
  await editor.getByRole('textbox', { name: 'Learning Objectives, Monday' }).fill('Identify plant cells');
  await page.getByRole('button', { name: 'Save Incomplete Draft (local)' }).click();
  await expect(page.getByRole('heading', { name: 'Saved lesson plans' })).toBeVisible();
  const mockCard = page.locator('section[aria-labelledby="saved-plans-heading"] li').filter({ hasText: 'Local test only' });
  await expect(mockCard).toHaveCount(1);
  await expect(mockCard.getByText('Manual ILAW', { exact: true })).toBeVisible();
  await expect(mockCard.getByText('Draft', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View and edit lesson plan' }).click();
  await expect(page.getByRole('textbox', { name: 'Learning Objectives, Monday' })).toHaveValue('Identify plant cells');
  if (width === 390 && theme === 'light') {
    await page.getByRole('textbox', { name: 'Learning Objectives, Tuesday' }).fill('Compare cell types');
    await page.getByRole('button', { name: 'Save Incomplete Draft (local)' }).click();
    await expect(mockCard).toHaveCount(1);
    await page.getByRole('button', { name: 'View and edit lesson plan' }).click();
    await expect(page.getByRole('textbox', { name: 'Learning Objectives, Tuesday' })).toHaveValue('Compare cell types');
  }
  await page.getByRole('textbox', { name: 'Name of Lesson' }).fill('Synthetic cells');
  await page.getByRole('textbox', { name: 'Teaching Date' }).fill('2026-10-18');
  await page.getByRole('textbox', { name: 'Learning Area/s' }).fill('Science');
  await page.getByRole('textbox', { name: 'Designed for which Grade Level and Section' }).fill('Grade 7');
  await page.getByRole('textbox', { name: 'Flow, Tuesday' }).fill('Observe cell diagrams');
  await page.getByRole('textbox', { name: 'Formative Assessment, Friday' }).fill('Label a cell');
  await page.getByRole('button', { name: 'Save Lesson Plan' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic cells', level: 3 })).toBeVisible();
  await expect(mockCard.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PDF saved version of Synthetic cells' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Worksheet from Synthetic cells' })).toBeEnabled();
  if (width === 390 && theme === 'light') {
    const downloadPromise = page.waitForEvent('download');
    await mockCard.getByRole('button', { name: 'Download PDF saved version of Synthetic cells' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Synthetic cells.pdf');
    await page.evaluate(() => { window.__mux2PrintCalls = 0; window.print = () => { window.__mux2PrintCalls += 1; }; });
    await mockCard.getByRole('button', { name: 'Print saved version of Synthetic cells' }).click();
    await expect.poll(() => page.evaluate(() => window.__mux2PrintCalls)).toBe(1);
    await expect(page.locator('.teacher-manual-saved-print')).toContainText('Synthetic cells');
    await mockCard.getByRole('button', { name: 'Generate Worksheet from Synthetic cells' }).click();
    await expect(page.getByRole('dialog', { name: 'Sample worksheet generation' })
      .getByRole('alert')).toContainText('No local test fixture matches this Assessment');
    await expect(page.getByRole('region', { name: 'Generated Worksheet draft entry' })).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  if ([360, 1440].includes(width)) {
    mkdirSync('test-results/teacher-mux2', { recursive: true });
    await page.screenshot({ path: `test-results/teacher-mux2/${theme}-${width}-saved-list.png`, fullPage: true });
    if (theme === 'light') {
      const layout = await page.evaluate(() => {
        const main = document.querySelector('main');
        const section = document.querySelector('section[aria-labelledby="saved-plans-heading"]');
        const mainBox = main.getBoundingClientRect();
        const sectionBox = section.getBoundingClientRect();
        return { viewport: innerHeight, bodyHeight: document.body.scrollHeight,
          mainHeight: main.clientHeight, mainScrollHeight: main.scrollHeight, mainScrollTop: main.scrollTop,
          sectionBottomInContent: sectionBox.bottom - mainBox.top + main.scrollTop,
          trailingSpace: main.scrollHeight - (sectionBox.bottom - mainBox.top + main.scrollTop) };
      });
      expect(layout.bodyHeight).toBe(layout.viewport);
      expect(layout.trailingSpace).toBeLessThan(40);
      await page.screenshot({ path: `test-results/teacher-mux2/${theme}-${width}-saved-list-viewport.png` });
    }
  }
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  expect(harness.state.teacherAiCalls).toBe(0);
  expect(harness.state.teacherStorageUploads).toBe(0);
  expect(harness.state.backendWrites).toBe(0);
  harness.assertHealthy();
});
}
}

test('MUX2 Save Lesson Plan validates seven fields beside the editor without losing edits or creating a row', async ({ page }) => {
  const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
  await page.goto('/teacher-dashboard/lesson-plans');
  await page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' }).click();
  await page.getByRole('textbox', { name: 'Teaching Strategy' }).fill('Synthetic inquiry');
  await page.getByRole('button', { name: 'Save Lesson Plan' }).click();
  const summary = page.getByRole('region', { name: 'Full Manual ILAW editor' }).getByRole('alert');
  await expect(summary).toContainText('Name of Lesson is required');
  for (const text of ['Teaching Date', 'Learning Area/s', 'Grade/Section', 'learning objective', 'learning activity', 'assessment entry']) {
    await expect(summary).toContainText(text);
  }
  await expect(page.getByRole('textbox', { name: 'Name of Lesson' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Teaching Strategy' })).toHaveValue('Synthetic inquiry');
  await expect(page.getByText('Local test only')).toHaveCount(0);
  expect(harness.state.lessonPlanWrites).toEqual([]);
  expect(harness.state.worksheetWrites).toEqual([]);
  expect(harness.state.teacherStorageUploads).toBe(0);
  expect(harness.state.backendWrites).toBe(0);
  harness.assertHealthy();
});

test.describe('LPW2-B2 local Teacher Worksheet handoff', () => {
  test('editing only the PDF filename leaves the stored lesson-plan title and source PDF unchanged', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    const plan = harness.state.lessonPlanRows[0];
    plan.title = '[G7] English';
    plan.file_name = '[G7] English.pdf';
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: 'View and edit [G7] English' }).click();
    await page.getByRole('textbox', { name: 'Suggested PDF filename' }).fill('English 7');
    await expect(page.getByText('The suggested PDF filename is saved only on this device. It does not rename the Lesson Plan Title or the original uploaded PDF.')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Lesson Plan Title' })).toHaveValue('[G7] English');
    await page.getByRole('button', { name: /Back/ }).click();
    await expect(page.getByRole('heading', { name: '[G7] English', level: 3 })).toBeVisible();
    await expect(page.getByText('[G7] English.pdf')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: '[G7] English', level: 3 })).toBeVisible();
    await page.getByRole('button', { name: 'View and edit [G7] English' }).click();
    await expect(page.getByRole('textbox', { name: 'Suggested PDF filename' })).toHaveValue('English 7');
    expect(harness.state.lessonPlanWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('local sample preserves recorded metadata without treating a different assignment as verification', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, worksheetScenario: true,
      teacherAssignmentRows: [{ subject_id: 'subject-qa-english', grade_level: 'Grade 7',
        subjects: { id: 'subject-qa-english', name: 'English' } }],
    });
    harness.state.lessonPlanRows[0].subject_id = 'subject-qa-science';
    harness.state.lessonPlanRows[0].grade_level = null;
    harness.state.lessonPlanRows[0].objectives = '<h2>Learning Objectives</h2><p>Identify plant cells.</p><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>';
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: 'Generate Worksheet from Synthetic science lesson' }).click();
    const entry = await openGeneratedWorksheetEntry(page);
    await entry.getByRole('button', { name: 'View/Edit draft' }).click();
    await expect(page.getByRole('region', { name: 'Generated Worksheet editor' })
      .getByText('Subject and grade are not verified for this local sample. EduScribe Save and distribution are unavailable.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select assigned subject and grade' })).toHaveCount(0);
    expect(harness.state.lessonPlanWrites).toEqual([]);
    expect(harness.state.worksheetWrites).toEqual([]);
    harness.assertHealthy();
  });

  for (const width of [360, 390, 768, 1024, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`legacy AI plan opens one-click unsaved draft at ${width}px in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, {
          role: 'teacher', theme, teacherLessonPlanScenario: true, worksheetScenario: true,
          teacherAssignmentRows: [
            { subject_id: 'subject-qa-english', grade_level: 'Grade 7',
              subjects: { id: 'subject-qa-english', name: 'English' } },
            { subject_id: 'subject-qa-math', grade_level: 'Grade 8',
              subjects: { id: 'subject-qa-math', name: 'Mathematics' } },
          ],
        });
        const plan = harness.state.lessonPlanRows[0];
        plan.title = '[G7] English';
        plan.subject = 'ILAW Lesson Plan';
        plan.subject_id = null;
        plan.grade_level = null;
        plan.file_name = '[G7] English.pdf';
        plan.objectives = '<h2>Learning Objectives</h2><p>Explain English sentence structure.</p><div class="ilaw-A"><p>Identify the subject and predicate in each sentence.</p></div>';
        await page.goto('/teacher-dashboard/lesson-plans');
        await expect(page.getByRole('button', { name: 'Generate Worksheet from [G7] English' })).toBeEnabled();
        await expect(page.getByRole('dialog', { name: 'Select assigned subject and grade' })).toHaveCount(0);
        await page.getByRole('button', { name: 'Generate Worksheet from [G7] English' }).click();
        const entry = await openGeneratedWorksheetEntry(page);
        await expect(entry.getByText('Source Lesson Plan: [G7] English')).toBeVisible();
        await expect(entry.getByText('Subject: Unknown · Grade: Unknown')).toBeVisible();
        expect(harness.state.lessonPlanRows[0].subject_id).toBeNull();
        expect(harness.state.lessonPlanRows[0].grade_level).toBeNull();
        expect(harness.state.lessonPlanWrites).toEqual([]);
        expect(harness.state.worksheetWrites).toEqual([]);
        expect(harness.state.teacherAiCalls).toBe(0);
        expect(harness.state.teacherStorageUploads).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
        if (width === 360 || width === 1440) {
          mkdirSync('test-results/teacher-lpw2-b2-f2', { recursive: true });
          await page.screenshot({ path: `test-results/teacher-lpw2-b2-f2/${theme}-${width}-unsaved-draft.png`, fullPage: true });
        }
        harness.assertHealthy();
      });
    }
  }

  for (const width of [360, 390, 768, 1024, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`saved plan opens unsaved worksheet draft at ${width}px in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const runtimeErrors = [];
        page.on('pageerror', error => runtimeErrors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
        const harness = await installProfileMocks(page, {
          role: 'teacher', theme, teacherLessonPlanScenario: true, worksheetScenario: true,
          teacherAssignmentRows: [{ subject_id: 'subject-qa-science', grade_level: 'Grade 7',
            subjects: { id: 'subject-qa-science', name: 'Science' } }],
        });
        harness.state.lessonPlanRows[0].subject_id = 'subject-qa-science';
        harness.state.lessonPlanRows[0].objectives = '<h2>Learning Objectives</h2><p>Identify plant cells.</p><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>';
        await page.goto('/teacher-dashboard/lesson-plans');
        const generate = page.getByRole('button', { name: 'Generate Worksheet from Synthetic science lesson' });
        await expect(generate).toBeEnabled();
        if (width === 360 || width === 1440) {
          mkdirSync('test-results/teacher-lpw2-b2', { recursive: true });
          await page.screenshot({ path: `test-results/teacher-lpw2-b2/${theme}-${width}-lesson-plans.png`, fullPage: true });
        }
        await generate.click();
        const entry = await openGeneratedWorksheetEntry(page);
        await expect(entry.getByRole('button', { name: 'View/Edit draft' })).toBeVisible();
        await expect(entry.getByText('Not Saved', { exact: true })).toBeVisible();
        await expect(entry.getByText('Sample generated from a test Assessment fixture', { exact: false })).toBeVisible();
        await expect(entry.getByRole('article', { name: 'Student-facing worksheet' })).toHaveCount(0);
        await expect(page.getByText('Total Worksheets').locator('..').getByText('1', { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
        if (width === 360 || width === 1440) {
          mkdirSync('test-results/teacher-vqa2', { recursive: true });
          await page.screenshot({ path: `test-results/teacher-vqa2/${theme}-${width}-worksheet-entry.png`, fullPage: true });
        }
        await entry.getByRole('button', { name: 'View/Edit draft' }).click();
        const dialog = page.getByRole('region', { name: 'Generated Worksheet editor' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('heading', { name: 'Worksheet Editor' })).toBeFocused();
        await expect(page.getByRole('dialog', { name: 'Generated Worksheet draft' })).toHaveCount(0);
        const studentSheet = dialog.getByRole('article', { name: 'Student-facing worksheet' });
        await dialog.getByRole('textbox', { name: 'Directions / Instructions' }).fill('Read each item.\nWrite clearly.');
        await expect(studentSheet).toContainText('Read each item.');
        await expect(studentSheet).toContainText('Write clearly.');
        await expect(studentSheet.getByAltText('Department of Education logo')).toBeVisible();
        await expect(studentSheet.getByAltText('Dela Paz National High School seal')).toBeVisible();
        await expect(studentSheet.getByAltText('EduScribe logo')).toBeVisible();
        await expect(studentSheet.getByText('Answer:', { exact: false })).toHaveCount(0);
        await dialog.getByRole('button', { name: 'Teacher answer key' }).click();
        await expect(dialog.getByRole('article', { name: 'Teacher answer key' })).toBeVisible();
        await dialog.getByRole('button', { name: 'Hide teacher answer key' }).click();
        await expect(dialog.getByRole('article', { name: 'Teacher answer key' })).toHaveCount(0);
        await expect(dialog.getByText('Not saved to EduScribe')).toBeVisible();
        await expect(dialog.getByText('Source Lesson Plan: Synthetic science lesson')).toBeVisible();
        if (width === 360 || width === 1440) {
          mkdirSync('test-results/teacher-vqa3', { recursive: true });
          await page.screenshot({ path: `test-results/teacher-vqa3/${theme}-${width}-editor.png`, fullPage: true });
          mkdirSync('screenshots/teacher-tdc4a', { recursive: true });
          await page.screenshot({ path: `screenshots/teacher-tdc4a/${theme}-${width}-worksheet-editor.png`, fullPage: true });
        }
        await expect(dialog.getByRole('button', { name: 'Save questions' })).toHaveCount(0);
        await dialog.getByRole('textbox', { name: 'Worksheet title' }).fill('Edited synthetic worksheet');
        await dialog.getByRole('textbox', { name: 'Question 1 text' }).fill('Edited synthetic question?');
        await dialog.getByRole('textbox', { name: 'Question 1 choice 1' }).fill('New choice');
        await dialog.getByRole('spinbutton', { name: 'Question 1 points' }).fill('3');
        await dialog.getByRole('combobox', { name: 'Question 1 correct choice' }).selectOption('New choice');
        await dialog.getByRole('button', { name: 'Student preview' }).click();
        await expect(dialog.getByRole('region', { name: 'Student-facing worksheet preview' })
          .getByText('Edited synthetic question?')).toBeVisible();
        await expect(dialog.getByText('Correct answer')).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
        if (width === 360 || width === 1440) {
          await page.screenshot({ path: `test-results/teacher-lpw2-b2/${theme}-${width}-worksheet-draft.png`, fullPage: true });
        }
        expect(harness.state.lessonPlanWrites).toEqual([]);
        expect(harness.state.worksheetWrites).toEqual([]);
        expect(harness.state.teacherAiCalls).toBe(0);
        expect(harness.state.teacherStorageUploads).toBe(0);
        expect(runtimeErrors).toEqual([]);
        harness.assertHealthy();
      });
    }
  }

  for (const width of [360, 390, 768, 1024, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`VQA4 saves and reopens one local worksheet at ${width}px in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, { role: 'teacher', theme,
          teacherLessonPlanScenario: true, worksheetScenario: true });
        harness.state.lessonPlanRows[0].objectives = '<h2>Learning Objectives</h2><p>Identify plant cells.</p><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>';
        await page.goto('/teacher-dashboard/lesson-plans');
        await page.getByRole('button', { name: 'Generate Worksheet from Synthetic science lesson' }).click();
        const entry = await openGeneratedWorksheetEntry(page);
        await entry.getByRole('button', { name: 'View/Edit draft' }).click();
        const editor = page.getByRole('region', { name: 'Generated Worksheet editor' });
        await expect(editor.getByRole('button', { name: 'Save Worksheet' })).toBeVisible();
        await editor.getByRole('textbox', { name: 'Worksheet title' }).fill('Cells practice');
        await editor.getByRole('textbox', { name: 'Directions / Instructions' }).fill('Read each item.\nAnswer in complete sentences.');
        await editor.getByRole('textbox', { name: 'Question 1 text' }).fill('Where is DNA stored?');
        await editor.getByRole('button', { name: 'Save Worksheet' }).click();
        await expect(editor).toHaveCount(0);
        await expect(entry.getByText('Saved locally for testing')).toBeVisible();
        await expect(entry.getByText('Source Lesson Plan: Synthetic science lesson')).toBeVisible();
        await expect(entry.getByText('Lost on refresh')).toBeVisible();
        await expect(entry.getByRole('button', { name: 'View/Edit worksheet' })).toBeVisible();
        await expect(page.getByText('Total Worksheets').locator('..').getByText('1', { exact: true })).toBeVisible();
        if ((width === 390 && theme === 'light') || (width === 1440 && theme === 'dark')) {
          mkdirSync('test-results/teacher-vqa4', { recursive: true });
          await page.screenshot({ path: `test-results/teacher-vqa4/${theme}-${width}-saved-card.png`, fullPage: true });
          mkdirSync('screenshots/teacher-tdc4a', { recursive: true });
          await page.screenshot({ path: `screenshots/teacher-tdc4a/${theme}-${width}-saved-card.png`, fullPage: true });
        }
        await entry.getByRole('button', { name: 'View/Edit worksheet' }).click();
        await expect(editor.getByRole('textbox', { name: 'Worksheet title' })).toHaveValue('Cells practice');
        await expect(editor.getByRole('textbox', { name: 'Directions / Instructions' })).toHaveValue('Read each item.\nAnswer in complete sentences.');
        await expect(editor.getByRole('textbox', { name: 'Question 1 text' })).toHaveValue('Where is DNA stored?');
        await expect(editor.getByRole('combobox', { name: 'Question 1 correct choice' })).toHaveValue('Nucleus and cell wall');
        if ((width === 390 && theme === 'light') || (width === 1440 && theme === 'dark')) {
          await page.screenshot({ path: `test-results/teacher-vqa4/${theme}-${width}-reopened-editor.png`, fullPage: true });
        }
        await editor.getByRole('button', { name: 'Student preview' }).click();
        await expect(editor.getByRole('region', { name: 'Student-facing worksheet preview' }).getByText('Where is DNA stored?')).toBeVisible();
        await expect(editor.getByRole('region', { name: 'Student-facing worksheet preview' })).toContainText('Answer in complete sentences.');
        await expect(editor.getByText('Correct answer')).toHaveCount(0);
        await editor.getByRole('button', { name: 'Edit questions and key' }).click();
        await editor.getByRole('textbox', { name: 'Question 1 text' }).fill('Which organelle stores DNA?');
        await editor.getByRole('button', { name: 'Save Worksheet' }).click();
        await expect(editor).toHaveCount(0);
        await expect(entry).toHaveCount(1);
        await entry.getByRole('button', { name: 'View/Edit worksheet' }).click();
        await expect(editor.getByRole('textbox', { name: 'Question 1 text' })).toHaveValue('Which organelle stores DNA?');
        await expect(editor.getByRole('textbox', { name: 'Directions / Instructions' })).toHaveValue('Read each item.\nAnswer in complete sentences.');
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
        expect(harness.state.lessonPlanWrites).toEqual([]);
        expect(harness.state.worksheetWrites).toEqual([]);
        expect(harness.state.teacherAiCalls).toBe(0);
        expect(harness.state.teacherStorageUploads).toBe(0);
        harness.assertHealthy();
      });
    }
  }

  for (const [width, theme] of [360, 390, 768, 1024, 1440].flatMap(width =>
    ['light', 'dark'].map(theme => [width, theme]))) {
    test(`grouped worksheet directions and local reopen at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const harness = await installProfileMocks(page, {
        role: 'teacher', theme, teacherLessonPlanScenario: true, worksheetScenario: true,
      });
      harness.state.lessonPlanRows[0].objectives = '<h2>Learning Objectives</h2><p>Identify plant cells.</p><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>';
      await page.goto('/teacher-dashboard/lesson-plans');
      await page.getByRole('button', { name: 'Generate Worksheet from Synthetic science lesson' }).click();
      const entry = await openGeneratedWorksheetEntry(page);
      await entry.getByRole('button', { name: 'View/Edit draft' }).click();
      const editor = page.getByRole('region', { name: 'Generated Worksheet editor' });
      await editor.getByLabel('Directions for Questions').fill('Choose the best answer.\nRead carefully.');
      await editor.getByRole('button', { name: 'Add question section' }).click();
      await editor.getByLabel('Section 2 name').fill('Reflection');
      await editor.getByLabel('Directions for Reflection').fill('Explain your reasoning.');
      await editor.getByRole('button', { name: 'Add question to section' }).last().click();
      await editor.getByRole('combobox', { name: 'Question 3 type' }).selectOption('essay');
      await editor.getByRole('textbox', { name: 'Question 3 text' }).fill('How do cells function together?');
      await editor.getByRole('button', { name: 'Move section 2 up' }).click();
      await editor.getByRole('button', { name: 'Student preview' }).click();
      const preview = editor.getByRole('region', { name: 'Student-facing worksheet preview' });
      await expect(preview.getByRole('region', { name: 'Reflection' })).toContainText('Explain your reasoning.');
      await expect(preview.getByRole('region', { name: 'Reflection' }).locator('ol')).toHaveAttribute('start', '1');
      await expect(preview.getByRole('region', { name: 'Questions' })).toContainText('Choose the best answer.');
      await expect(preview.getByRole('region', { name: 'Questions' }).locator('ol')).toHaveAttribute('start', '2');
      await expect(preview).not.toContainText('Answer:');
      await editor.getByRole('button', { name: 'Edit questions and key' }).click();
      await editor.getByRole('button', { name: 'Save Worksheet' }).click();
      await expect(entry.getByText('Saved locally for testing')).toBeVisible();
      await entry.getByRole('button', { name: 'View/Edit worksheet' }).click();
      await expect(editor.getByLabel('Directions for Reflection')).toHaveValue('Explain your reasoning.');
      await expect(editor.getByRole('textbox', { name: 'Question 1 text' })).toHaveValue('How do cells function together?');
      await editor.getByRole('button', { name: 'Delete section 1 and move its questions to a neighboring section' }).click();
      await expect(editor.getByLabel('Section 2 name')).toHaveCount(0);
      await expect(editor.getByRole('textbox', { name: 'Question 1 text' })).toHaveValue('How do cells function together?');
      await editor.getByRole('button', { name: 'Save Worksheet' }).click();
      await entry.getByRole('button', { name: 'View/Edit worksheet' }).click();
      await expect(editor.getByLabel('Directions for Questions')).toHaveValue('Choose the best answer.\nRead carefully.');
      await expect(editor.getByRole('textbox', { name: 'Question 3 text' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
      expect(harness.state.worksheetWrites).toEqual([]);
      expect(harness.state.teacherAiCalls).toBe(0);
      harness.assertHealthy();
    });
  }

  test('VQA4 invalid local worksheet stays in the editor and focuses the first failing field', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true, worksheetScenario: true });
    harness.state.lessonPlanRows[0].objectives = '<h2>Learning Objectives</h2><p>Identify plant cells.</p><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>';
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: 'Generate Worksheet from Synthetic science lesson' }).click();
    const entry = await openGeneratedWorksheetEntry(page);
    await entry.getByRole('button', { name: 'View/Edit draft' }).click();
    const editor = page.getByRole('region', { name: 'Generated Worksheet editor' });
    await editor.getByRole('textbox', { name: 'Worksheet title' }).fill('');
    await editor.getByRole('button', { name: 'Save Worksheet' }).click();
    await expect(editor.getByText('Enter a worksheet title.')).toBeVisible();
    await expect(editor.getByRole('textbox', { name: 'Worksheet title' })).toBeFocused();
    await editor.getByRole('textbox', { name: 'Worksheet title' }).fill('Cells practice');
    await editor.getByRole('textbox', { name: 'Question 1 text' }).fill('');
    await editor.getByRole('button', { name: 'Save Worksheet' }).click();
    await expect(editor.getByText('Enter text for question 1.')).toBeVisible();
    await expect(editor.getByRole('textbox', { name: 'Question 1 text' })).toBeFocused();
    await expect(entry).toHaveCount(0);
    expect(harness.state.worksheetWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('VQA4 saved local worksheet survives route changes, guards new edits, and is lost on refresh', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true, worksheetScenario: true });
    harness.state.lessonPlanRows[0].objectives = '<h2>Learning Objectives</h2><p>Identify plant cells.</p><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>';
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: 'Generate Worksheet from Synthetic science lesson' }).click();
    const entry = await openGeneratedWorksheetEntry(page);
    await entry.getByRole('button', { name: 'View/Edit draft' }).click();
    const editor = page.getByRole('region', { name: 'Generated Worksheet editor' });
    await editor.getByRole('button', { name: 'Save Worksheet' }).click();
    await expect(entry.getByText('Saved locally for testing')).toBeVisible();
    await page.getByRole('link', { name: 'Students', exact: true }).click();
    await expect(page).toHaveURL(/\/teacher-dashboard\/students$/);
    await page.getByRole('link', { name: 'Worksheets', exact: true }).click();
    await expect(entry.getByText('Saved locally for testing')).toBeVisible();
    await entry.getByRole('button', { name: 'View/Edit worksheet' }).click();
    await editor.getByRole('textbox', { name: 'Worksheet title' }).fill('Unsaved edit');
    await page.getByRole('link', { name: 'Students', exact: true }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/teacher-dashboard\/worksheets$/);
    await expect(editor.getByRole('textbox', { name: 'Worksheet title' })).toHaveValue('Unsaved edit');
    await page.getByRole('link', { name: 'Students', exact: true }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Leave page' }).click();
    await expect(page).toHaveURL(/\/teacher-dashboard\/students$/);
    await page.getByRole('link', { name: 'Worksheets', exact: true }).click();
    await expect(entry.getByRole('heading', { name: /sample worksheet/ })).toBeVisible();
    await expect(entry.getByText('Saved locally for testing')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('region', { name: 'Generated Worksheet draft entry' })).toHaveCount(0);
    expect(harness.state.worksheetWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('no assignment rows do not become invented sample metadata or a write permission', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, worksheetScenario: true,
      teacherAssignmentRows: [],
    });
    harness.state.lessonPlanRows[0].subject_id = 'subject-qa-science';
    harness.state.lessonPlanRows[0].objectives = '<h2>Learning Objectives</h2><p>Identify plant cells.</p><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>';
    await page.goto('/teacher-dashboard/lesson-plans');
    harness.state.lessonPlanRows[0].subject_id = null;
    harness.state.lessonPlanRows[0].grade_level = null;
    await page.getByRole('button', { name: 'Generate Worksheet from Synthetic science lesson' }).click();
    const entry = await openGeneratedWorksheetEntry(page);
    await entry.getByRole('button', { name: 'View/Edit draft' }).click();
    await expect(page.getByRole('region', { name: 'Generated Worksheet editor' })
      .getByText('Subject: Unknown · Grade: Unknown')).toBeVisible();
    expect(harness.state.lessonPlanWrites).toEqual([]);
    expect(harness.state.worksheetWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('repeat activation opens one draft and discard requires confirmation', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, worksheetScenario: true,
      teacherAssignmentRows: [{ subject_id: 'subject-qa-science', grade_level: 'Grade 7',
        subjects: { id: 'subject-qa-science', name: 'Science' } }],
    });
    harness.state.lessonPlanRows[0].subject_id = 'subject-qa-science';
    harness.state.lessonPlanRows[0].objectives = '<h2>Learning Objectives</h2><p>Identify plant cells.</p><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>';
    await page.goto('/teacher-dashboard/lesson-plans');
    const generate = page.getByRole('button', { name: 'Generate Worksheet from Synthetic science lesson' });
    await expect(generate).toBeEnabled();
    await generate.dispatchEvent('click');
    if (await generate.count()) await generate.dispatchEvent('click');
    const entry = await openGeneratedWorksheetEntry(page);
    await entry.getByRole('button', { name: 'View/Edit draft' }).click();
    const dialog = page.getByRole('region', { name: 'Generated Worksheet editor' });
    await expect(dialog).toHaveCount(1);
    await dialog.getByRole('textbox', { name: 'Worksheet title' }).fill('Unsaved edit');
    await dialog.getByRole('textbox', { name: 'Directions / Instructions' }).fill('Read carefully.\nWrite clearly.');
    await expect(dialog.getByRole('article', { name: 'Student-facing worksheet' })).toContainText('Read carefully.');
    await page.getByRole('link', { name: 'Lesson Plans' }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete Draft' }).click();
    mkdirSync('screenshots/teacher-tdc4a', { recursive: true });
    await page.screenshot({ path: 'screenshots/teacher-tdc4a/delete-draft-confirmation.png' });
    await page.getByRole('dialog', { name: 'Delete worksheet draft' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Back to Worksheets' }).first().click();
    await expect(dialog).toHaveCount(0);
    await expect(entry.getByRole('heading', { name: 'Unsaved edit' })).toBeVisible();
    await expect(entry.getByRole('button', { name: 'View/Edit draft' })).toBeFocused();
    await page.getByRole('link', { name: 'Lesson Plans' }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(entry).toBeVisible();
    await entry.getByRole('button', { name: 'Delete Draft' }).click();
    await page.getByRole('dialog', { name: 'Delete worksheet draft' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(entry).toBeVisible();
    await entry.getByRole('button', { name: 'Delete Draft' }).click();
    await page.getByRole('dialog', { name: 'Delete worksheet draft' }).getByRole('button', { name: 'Delete draft', exact: true }).click();
    await expect(entry).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Synthetic worksheet' })).toBeVisible();
    expect(harness.state.lessonPlanWrites).toEqual([]);
    expect(harness.state.worksheetWrites).toEqual([]);
    expect(harness.state.teacherAiCalls).toBe(0);
    harness.assertHealthy();
  });
});

const worksheetAction = async (page, label) => {
  const trigger = page.getByRole('button', { name: 'More actions for Synthetic worksheet' });
  await trigger.click();
  await page.getByRole('menuitem', { name: `${label} for Synthetic worksheet` }).click();
  return trigger;
};

const PDF_FILE = { name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic') };

const openLeaveDialog = async (page, role = 'teacher') => {
  const destination = await openDashboardNavigation(page, role);
  await destination.click();
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
  return destination;
};

const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const luminance = (value) => {
  const channels = rgb(value).map((part) => {
    const n = part / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (left, right) => {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

test.describe('isolated Teacher A2 announcements and logout', () => {
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 768, 1024, 1440]) {
      test(`${theme} ${width}px keeps fetch failure and logout confirmation accessible`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, {
          role: 'teacher', theme, teacherAnnouncementsScenario: true, announcementReadMode: 'failure',
        });
        await page.goto('/teacher-dashboard/announcements');
        await expect(page.getByRole('alert').filter({ hasText: 'Announcements could not be loaded' })).toBeVisible();
        await expect(page.getByText('No announcements have been published yet.')).toHaveCount(0);
        const retry = page.getByRole('button', { name: 'Retry announcements' });
        expect((await retry.boundingBox()).height).toBeGreaterThanOrEqual(44);
        await page.screenshot({ path: testInfo.outputPath('announcements-error.png') });
        harness.state.announcementReadMode = 'success';
        await retry.click();
        await expect(page.getByRole('heading', { name: 'Synthetic school assembly' })).toBeVisible();
        const opener = page.getByRole('button', { name: 'Open navigation menu' });
        if (await opener.isVisible()) {
          await opener.click();
          await page.screenshot({ path: testInfo.outputPath('mobile-navigation.png') });
        }
        const logout = page.getByRole('button', { name: 'Logout' });
        expect((await logout.boundingBox()).height).toBeGreaterThanOrEqual(44);
        await logout.click();
        const dialog = page.getByRole('dialog', { name: 'Log out of EduScribe?' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('aria-describedby', /.+/);
        await expect(page.getByRole('button', { name: 'Close Log out of EduScribe?' })).toBeFocused();
        for (const name of ['Close Log out of EduScribe?', 'Cancel', 'Log out']) {
          expect((await dialog.getByRole('button', { name, exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(44);
        }
        expect(harness.state.authLogouts).toBe(0);
        await page.screenshot({ path: testInfo.outputPath('logout-confirmation.png') });
        await page.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toHaveCount(0);
        await expect(logout).toBeFocused();
        expect(harness.state.authLogouts).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        harness.assertHealthy();
      });
    }
  }

  test('saved edited AI ILAW downloads a real PDF without Print or database writes', async ({ page }) => {
    test.setTimeout(120_000);
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    harness.state.lessonPlanRows[0].file_url = 'https://profile-e2e.supabase.invalid/source/synthetic.pdf';
    harness.state.lessonPlanRows[0].file_name = 'synthetic-source.pdf';
    harness.state.lessonPlanRows[0].objectives = '<div class="ilaw-lesson-plan"><div class="ilaw-letterhead"><p>Republic of the Philippines</p><p class="ilaw-school-name">Dela Paz National High School</p></div><h2 class="ilaw-title">Synthetic ILAW Science</h2><table class="ilaw-info-table"><tr><th>Grade</th><td>Grade 7</td></tr></table><div class="ilaw-section ilaw-I"><h3>Intentions</h3><p>Original objective</p></div><div class="ilaw-section ilaw-L"><h3>Learning Experience</h3><p>Original activity</p></div><div class="ilaw-section ilaw-A"><h3>Assessment</h3><p>Original quiz</p></div><div class="ilaw-section ilaw-W"><h3>Ways Forward</h3><p>Original reflection</p></div><p>Prepared by: Synthetic Teacher</p></div>';
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: /View and edit.*Synthetic science lesson/ }).click();
    await page.getByRole('textbox', { name: 'Suggested PDF filename' }).fill('Edited_Science_Week1.pdf');
    const editor = page.getByRole('textbox', { name: 'Lesson plan content' });
    await editor.evaluate(element => {
      element.querySelector('.ilaw-I p').textContent = 'Teacher edited objective';
      element.querySelector('.ilaw-A p').textContent = 'Teacher edited quiz';
      element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Changes saved.')).toBeVisible();
    expect(harness.state.lessonPlanRows[0].objectives).toContain('Teacher edited objective');
    await page.getByRole('button', { name: /Back/ }).click();
    const button = page.getByRole('button', { name: /Download PDF saved version of Synthetic science lesson/ });
    await expect(button).toBeEnabled();
    const sourcePdf = page.getByRole('link', { name: /Open source PDF.*Synthetic science lesson/ });
    const sourceHref = await sourcePdf.getAttribute('href');
    const popupCount = page.context().pages().length;
    const downloadPromise = page.waitForEvent('download');
    await button.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Edited_Science_Week1.pdf');
    mkdirSync('test-results/teacher-ai-pdf', { recursive: true });
    await download.saveAs('test-results/teacher-ai-pdf/edited-science.pdf');
    const pdf = readFileSync(await download.path());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5_000);
    const inspected = inspectPdfmakePdf(pdf);
    expect(inspected.pageCount).toBeGreaterThanOrEqual(1);
    expect(inspected.imageCount).toBeGreaterThanOrEqual(3);
    const extracted = inspected.pageTexts.join(' ');
    for (const phrase of ['Dela Paz National High School', 'Synthetic ILAW Science', 'Teacher edited objective',
      'Teacher edited quiz', 'Original activity', 'Original reflection', 'Prepared by']) {
      // pdfmake emits some kerning runs separately; compare glyph order, not run boundaries.
      expect(extracted.replace(/\s+/g, '').toLowerCase()).toContain(phrase.replace(/\s+/g, '').toLowerCase());
    }
    const viewer = await page.context().newPage();
    await viewer.goto(pathToFileURL(await download.path()).href);
    await viewer.waitForTimeout(2500);
    await viewer.screenshot({ path: 'test-results/teacher-ai-pdf/edited-science-viewer.png' });
    await viewer.close();
    expect(page.context().pages()).toHaveLength(popupCount);
    expect(await sourcePdf.getAttribute('href')).toBe(sourceHref);
    expect(harness.state.lessonPlanWrites).toEqual(['PATCH']);
    expect(harness.state.blockedRequests).toEqual([]);
    harness.assertHealthy();
  });

  test('renamed AI plan uses the saved title for PDF without changing lesson HTML', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    const originalHtml = harness.state.lessonPlanRows[0].objectives;
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: /View and edit.*Synthetic science lesson/ }).click();
    await page.getByRole('textbox', { name: 'Lesson Plan Title' }).fill('English 7 Week One');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Changes saved.')).toBeVisible();
    await page.getByRole('button', { name: /Back/ }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download PDF saved version of English 7 Week One/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('English 7 Week One.pdf');
    expect(harness.state.lessonPlanRows[0].title).toBe('English 7 Week One');
    expect(harness.state.lessonPlanRows[0].objectives).toBe(originalHtml);
    expect(harness.state.lessonPlanWrites).toEqual(['PATCH']);
    harness.assertHealthy();
  });

  test('failed AI Save keeps unsaved content out of the saved-card PDF', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true,
      lessonPlanWriteMode: 'failure' });
    const originalHtml = harness.state.lessonPlanRows[0].objectives;
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: /View and edit.*Synthetic science lesson/ }).click();
    const editor = page.getByRole('textbox', { name: 'Lesson plan content' });
    await editor.evaluate(element => {
      element.insertAdjacentHTML('beforeend', '<p>Unsaved private addition</p>');
      element.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText(/Could not save the lesson plan/)).toBeVisible();
    expect(harness.state.lessonPlanRows[0].objectives).toBe(originalHtml);
    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByRole('dialog', { name: 'Confirm lesson plan action' })
      .getByRole('button', { name: 'Discard changes' }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download PDF saved version of Synthetic science lesson/ }).click();
    const inspected = inspectPdfmakePdf(readFileSync(await (await downloadPromise).path()));
    expect(inspected.pageTexts.join(' ')).not.toContain('Unsaved private addition');
    expect(harness.state.lessonPlanWrites).toEqual(['PATCH']);
    harness.assertHealthy();
  });

  test('unsupported saved AI HTML keeps Download PDF unavailable without a partial export', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    harness.state.lessonPlanRows[0].objectives = '<p>Valid paragraph</p><iframe src="https://example.org">Hidden source</iframe>';
    await page.goto('/teacher-dashboard/lesson-plans');
    await expect(page.getByRole('button', { name: /Download PDF saved version of Synthetic science lesson/ })).toBeDisabled();
    await expect(page.getByText(/iframe.*cannot be represented safely/)).toBeVisible();
    expect(harness.state.lessonPlanWrites).toEqual([]);
    expect(harness.state.blockedRequests).toEqual([]);
    harness.assertHealthy();
  });

  test('long saved AI weekday tables span pages without losing the final content', async ({ page }) => {
    test.setTimeout(120_000);
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const narrative = 'Synthetic weekday lesson detail for a classroom task. '.repeat(12);
    const week = `<table class="ilaw-week-table"><tr>${days.map(day => `<th>${day}</th>`).join('')}</tr><tr>${days.map(day => `<td>${day}: ${narrative}</td>`).join('')}</tr></table>`;
    const sections = [['I', 'INTENTIONS'], ['L', 'LEARNING EXPERIENCE'], ['A', 'ASSESSMENT'], ['W', 'WAYS FORWARD']]
      .map(([letter, title]) => `<div class="ilaw-section ilaw-${letter}"><h3>${letter} — ${title}</h3><p>${title} lesson note.</p>${week}${week}</div>`).join('');
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    harness.state.lessonPlanRows[0].objectives = `<div class="ilaw-lesson-plan"><div class="ilaw-letterhead"><p>Republic of the Philippines</p><p>Dela Paz National High School</p></div><h2>Synthetic long ILAW</h2>${sections}<p>Final signatory: Synthetic Teacher</p></div>`;
    await page.goto('/teacher-dashboard/lesson-plans');
    const button = page.getByRole('button', { name: /Download PDF saved version of Synthetic science lesson/ });
    await expect(button).toBeEnabled();
    const downloadPromise = page.waitForEvent('download');
    await button.click();
    const download = await downloadPromise;
    mkdirSync('test-results/teacher-ai-pdf', { recursive: true });
    await download.saveAs('test-results/teacher-ai-pdf/long-weekdays.pdf');
    const inspected = inspectPdfmakePdf(readFileSync(await download.path()));
    expect(inspected.pageCount).toBeGreaterThan(1);
    const extracted = inspected.pageTexts.join(' ').replace(/\s+/g, '').toLowerCase();
    for (const value of [...days, 'INTENTIONS', 'LEARNING EXPERIENCE', 'ASSESSMENT', 'WAYS FORWARD',
      'Final signatory: Synthetic Teacher']) {
      expect(extracted).toContain(value.replace(/\s+/g, '').toLowerCase());
    }
    const viewer = await page.context().newPage();
    await viewer.goto(pathToFileURL(await download.path()).href);
    await viewer.waitForTimeout(2500);
    await viewer.screenshot({ path: 'test-results/teacher-ai-pdf/long-weekdays-viewer.png' });
    await viewer.close();
    expect(harness.state.lessonPlanWrites).toEqual([]);
    expect(harness.state.blockedRequests).toEqual([]);
    harness.assertHealthy();
  });

  for (const theme of ['light', 'dark']) {
    test(`AI PDF card action remains reachable at all release widths in ${theme} mode`, async ({ page }) => {
      const harness = await installProfileMocks(page, { role: 'teacher', theme, teacherLessonPlanScenario: true });
      await page.goto('/teacher-dashboard/lesson-plans');
      for (const width of [360, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const button = page.getByRole('button', { name: /Download PDF saved version of Synthetic science lesson/ });
        await expect(button).toBeVisible();
        await expect(button).toBeEnabled();
        const bounds = await button.boundingBox();
        expect(bounds.height).toBeGreaterThanOrEqual(40);
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      }
      expect(harness.state.lessonPlanWrites).toEqual([]);
      expect(harness.state.blockedRequests).toEqual([]);
      harness.assertHealthy();
    });
  }

  test('successful empty announcements remain distinct from a failed read', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherAnnouncementsScenario: true, announcementRows: [],
    });
    await page.goto('/teacher-dashboard/announcements');
    await expect(page.getByText('No announcements have been published yet.')).toBeVisible();
    harness.assertHealthy();
  });

  test('search with no matches does not claim that no announcements were published', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherAnnouncementsScenario: true });
    await page.goto('/teacher-dashboard/announcements');
    await expect(page.getByRole('heading', { name: 'Synthetic school assembly' })).toBeVisible();
    await page.getByPlaceholder('Search announcements...').fill('unmatched');
    await expect(page.getByText('No announcements match your search or filter.')).toBeVisible();
    await expect(page.getByText('No announcements have been published yet.')).toHaveCount(0);
    harness.assertHealthy();
  });

  test('mobile dirty Profile uses its guard before the Teacher logout dialog', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    const harness = await installProfileMocks(page, { role: 'teacher' });
    await openSyntheticProfile(page, 'teacher');
    await makeDirty(page, 'Mobile unsaved name');
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Log out of EduScribe?' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Keep Editing' }).click();
    await expect(page.getByLabel('FULL NAME')).toHaveValue('Mobile unsaved name');
    expect(harness.state.authLogouts).toBe(0);
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.getByRole('button', { name: 'Discard and Leave' }).click();
    await expect(page.getByRole('dialog', { name: 'Log out of EduScribe?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeFocused();
    expect(harness.state.authLogouts).toBe(0);
    harness.assertHealthy();
  });
});

test.describe('isolated Teacher Students masterlist', () => {
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 768, 1024, 1440]) {
      test(`${theme} ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, { role: 'teacher', theme, teacherStudentsScenario: true });
        await page.goto('/teacher-dashboard/students');
        await expect(page.getByRole('heading', { name: 'Students', exact: true })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: '3 roster entries' })).toBeVisible();
        const roster = width < 768 ? page.getByRole('list', { name: 'Students in this section' }) : page.getByRole('table');
        await expect(roster.getByText('Alexandria Verylongname-Santos').first()).toBeVisible();
        await expect(roster.getByText('Active', { exact: true }).first()).toBeVisible();
        await expect(roster.getByText(/Suspended/).first()).toBeVisible();
        await expect(roster.getByText(/Status unavailable/).first()).toBeVisible();
        const badgeSurfaces = await Promise.all(['Active', 'Suspended', 'Status unavailable'].map(label =>
          roster.getByText(label, { exact: true }).first().evaluate(element => getComputedStyle(element).backgroundColor)));
        expect(new Set(badgeSurfaces).size).toBe(3);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        if (width < 768) {
          await expect(page.getByRole('list', { name: 'Students in this section' }).first()).toBeVisible();
        } else {
          await expect(page.getByRole('columnheader', { name: 'Account status' }).first()).toBeVisible();
        }
        await page.screenshot({ path: testInfo.outputPath(`students-${theme}-${width}.png`), fullPage: true });
        const search = page.getByRole('searchbox', { name: 'Search students by name or LRN' });
        await search.focus();
        await expect(search).toBeFocused();
        await search.fill('100000000002');
        await expect(page.getByRole('status').filter({ hasText: '1 matching roster entry' })).toBeVisible();
        await search.fill('does-not-exist');
        await expect(page.getByText('No students match your search.')).toBeVisible();
        harness.assertHealthy();
        expect(harness.state.studentRosterReads.some((read) => read.startsWith('sections ') && read.includes('adviser_id=eq.'))).toBe(true);
        expect(harness.state.studentRosterReads.some((read) => read.startsWith('schedules ') && read.includes('teacher_id=eq.'))).toBe(true);
      });
    }
  }

  test('distinguishes an empty roster from a failed read and retries', async ({ page }) => {
    const empty = await installProfileMocks(page, { role: 'teacher', teacherStudentsScenario: true, studentRosterEmpty: true });
    await page.goto('/teacher-dashboard/students');
    await expect(page.getByText('No students are enrolled in your advisory section yet.')).toBeVisible();
    empty.assertHealthy();
  });

  test('failed roster read has a durable Retry action', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherStudentsScenario: true, studentRosterReadMode: 'failure' });
    await page.goto('/teacher-dashboard/students');
    await expect(page.getByText('Could not load student rosters.', { exact: true })).toBeVisible();
    harness.state.studentRosterReadMode = 'success';
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('status').filter({ hasText: '3 roster entries' })).toBeVisible();
    harness.assertHealthy();
  });
});

test.describe('isolated Profile responsive and theme rendering', () => {
  const widths = [360, 390, 768, 1024, 1440];
  const themes = ['light', 'dark'];

  for (const theme of themes) {
    for (const width of widths) {
      test(`${theme} ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        const harness = await installProfileMocks(page, { role: 'teacher', theme });
        await openSyntheticProfile(page, 'teacher');

        expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);

        for (const label of ['FULL NAME', 'Teacher (account role)']) {
          const box = await (label === 'FULL NAME' ? page.getByLabel(label) : page.getByText(label)).boundingBox();
          expect(box, `${label} should render`).not.toBeNull();
          expect(box.x, `${label} begins outside the viewport`).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width, `${label} is clipped`).toBeLessThanOrEqual(width + 1);
        }
        await expect(page.getByLabel('PHONE NUMBER')).toHaveCount(0);

        await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Change profile photo' })).toBeVisible();
        const photoControl = await page.getByRole('button', { name: 'Change profile photo' }).boundingBox();
        const passwordControl = await page.getByRole('button', { name: 'Change Password' }).boundingBox();
        expect(photoControl.width).toBeGreaterThanOrEqual(44);
        expect(photoControl.height).toBeGreaterThanOrEqual(44);
        expect(passwordControl.height).toBeGreaterThanOrEqual(44);
        const passwordColors = await page.getByRole('button', { name: 'Change Password' }).evaluate((button) => ({
          text: getComputedStyle(button).color,
          background: getComputedStyle(button.parentElement).backgroundColor,
        }));
        expect(contrast(passwordColors.text, passwordColors.background)).toBeGreaterThanOrEqual(4.5);
        const avatarBox = await profileAvatar(page).boundingBox();
        expect(Math.round(avatarBox.width)).toBe(112);
        expect(Math.round(avatarBox.height)).toBe(112);

        const colors = await page.getByLabel('FULL NAME').evaluate((input) => {
          const inputStyle = getComputedStyle(input);
          const labelStyle = getComputedStyle(document.querySelector('label[for="profile-full-name"]'));
          const cardStyle = getComputedStyle(input.closest('div[style*="padding: 32px"]'));
          return {
            inputBackground: inputStyle.backgroundColor,
            inputText: inputStyle.color,
            labelText: labelStyle.color,
            cardBackground: cardStyle.backgroundColor,
          };
        });
        expect(contrast(colors.inputText, colors.inputBackground)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors.labelText, colors.cardBackground)).toBeGreaterThanOrEqual(4.5);

        await page.screenshot({ path: testInfo.outputPath(`profile-clean-${theme}-${width}.png`), fullPage: true });
        if (width === 360 || width === 1440) {
          mkdirSync('screenshots/teacher-tdc4a', { recursive: true });
          await page.screenshot({ path: `screenshots/teacher-tdc4a/${theme}-${width}-teacher-profile.png`, fullPage: true });
        }
        await makeDirty(page);
        await openLeaveDialog(page);
        const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
        const dialogBox = await dialog.boundingBox();
        expect(dialogBox.x).toBeGreaterThanOrEqual(0);
        expect(dialogBox.y).toBeGreaterThanOrEqual(0);
        expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(width + 1);
        expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
        await expect(page.getByRole('button', { name: 'Keep Editing' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Discard and Leave' })).toBeVisible();

        await page.screenshot({ path: testInfo.outputPath(`profile-${theme}-${width}.png`), fullPage: true });
        harness.assertHealthy();
      });
    }
  }
});

test('Teacher Profile keeps long account details inside the mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  const harness = await installProfileMocks(page, { role: 'teacher',
    profile: { name: 'Alexandria Verylongname-Santos and Several More Names',
      email: 'alexandria.verylongname-santos-teacher-account@example.test' } });
  await openSyntheticProfile(page, 'teacher');
  const email = page.getByText(harness.profile.email, { exact: true });
  const bounds = await email.boundingBox();
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(361);
  const emailFits = await email.evaluate(node => node.scrollWidth <= node.clientWidth);
  expect(emailFits).toBe(true);
  const photoButton = await page.getByRole('button', { name: 'Change profile photo' }).boundingBox();
  const passwordButton = await page.getByRole('button', { name: 'Change Password' }).boundingBox();
  expect(photoButton.width).toBeGreaterThanOrEqual(44);
  expect(photoButton.height).toBeGreaterThanOrEqual(44);
  expect(passwordButton.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
  harness.assertHealthy();
});

test.describe('isolated Teacher shell history scrolling', () => {
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 768, 1024, 1440]) {
      test(`${theme} ${width}px restores Back and Forward without changing new-route behavior`, async ({ page }) => {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        const harness = await installProfileMocks(page, { role: 'teacher', theme });
        await openSyntheticProfile(page, 'teacher');
        const main = page.locator('.teacher-dashboard-shell main');
        const profileScroll = await main.evaluate(async (element) => {
          element.scrollTop = Math.min(200, element.scrollHeight - element.clientHeight);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return element.scrollTop;
        });

        if (width < 1024) await page.getByRole('button', { name: 'Open navigation menu' }).click();
        await page.getByRole('link', { name: 'Students', exact: true }).click();
        const studentsHeading = page.getByRole('heading', { name: 'Students', exact: true });
        await expect(studentsHeading).toBeFocused();
        await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(0);
        const headingTop = await studentsHeading.evaluate((element) => element.getBoundingClientRect().top);
        const headerBottom = await page.locator('.teacher-header').evaluate((element) => element.getBoundingClientRect().bottom);
        expect(headingTop).toBeGreaterThanOrEqual(headerBottom);

        const studentsScroll = await main.evaluate(async (element) => {
          element.scrollTop = Math.min(100, element.scrollHeight - element.clientHeight);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return element.scrollTop;
        });
        await page.goBack();
        await expect(page.getByLabel('FULL NAME')).toBeVisible();
        await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(profileScroll);
        await page.goForward();
        await expect(studentsHeading).toBeVisible();
        await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(studentsScroll);
        expect(harness.state.profileWrites).toBe(0);
        expect(harness.state.storageUploads).toBe(0);
        expect(harness.state.backendWrites).toBe(0);
        harness.assertHealthy();
      });
    }
  }

  for (const theme of ['light', 'dark']) {
    test(`${theme} 360px restores a nonzero Profile position on Forward`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 844 });
      const harness = await installProfileMocks(page, { role: 'teacher', theme });
      await page.goto('/teacher-dashboard/students');
      const studentsHeading = page.getByRole('heading', { name: 'Students', exact: true });
      await expect(studentsHeading).toBeVisible();
      await page.getByRole('button', { name: 'Open navigation menu' }).click();
      await page.getByRole('button', { name: 'Toggle profile menu' }).click();
      await page.getByRole('button', { name: 'Profile Settings' }).click();
      await expect(page.getByLabel('FULL NAME')).toBeVisible();
      const main = page.locator('.teacher-dashboard-shell main');
      const profileScroll = await main.evaluate(async (element) => {
        element.scrollTop = 200;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return element.scrollTop;
      });
      expect(profileScroll).toBeGreaterThan(0);
      await page.goBack();
      await expect(studentsHeading).toBeVisible();
      await page.goForward();
      await expect(page.getByLabel('FULL NAME')).toBeVisible();
      await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(profileScroll);
      expect(harness.state.profileWrites).toBe(0);
      harness.assertHealthy();
    });
  }
});

test.describe('isolated Worksheet creation and Lesson Plan file selection', () => {
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 768, 1024, 1440]) {
      test(`${theme} ${width}px offers manual Worksheet creation without upload`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, { role: 'teacher', theme, worksheetScenario: true });
        await page.goto('/teacher-dashboard/worksheets');
        await expect(page.getByRole('button', { name: 'Create Worksheet', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Upload worksheet' })).toHaveCount(0);
        await expect(page.locator('#worksheet-upload')).toHaveCount(0);
        await expect(page.getByTestId('worksheet-upload-dropzone')).toHaveCount(0);
        await page.getByRole('button', { name: 'Create Worksheet', exact: true }).click();
        const editor = page.getByRole('region', { name: 'Manual Worksheet editor' });
        await expect(editor).toBeVisible();
        await expect(editor.getByRole('heading', { name: 'Worksheet Editor' })).toBeFocused();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        await editor.getByRole('button', { name: 'Back to Worksheets' }).first().click();
        await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Discard changes' }).click();
        await page.screenshot({ path: `test-results/lpw2d-worksheets-${theme}-${width}.png`, fullPage: true });
        await page.goto('/teacher-dashboard/lesson-plans');
        await page.locator('#lesson-pdf-upload').setInputFiles(PDF_FILE);
        await expect(page.getByText('synthetic.pdf')).toBeVisible();
        expect(harness.state.teacherStorageUploads).toBe(0);
        expect(harness.state.worksheetWrites).toEqual([]);
        harness.assertHealthy();
      });
    }
  }

  test('AI upload shows indeterminate progress and opens the editable result', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherUploadMode: 'slow', teacherAiScenario: 'success' });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.locator('#lesson-pdf-upload').setInputFiles(PDF_FILE);
    await page.getByRole('button', { name: 'Generate lesson plan' }).click();
    await expect.poll(() => Boolean(harness.state.releaseTeacherUpload)).toBe(true);
    await expect(page.getByRole('status').filter({ hasText: 'Uploading to storage' })).toBeVisible();
    await page.getByRole('link', { name: 'Students', exact: true }).click();
    await expect(page).toHaveURL(/\/teacher-dashboard\/lesson-plans$/);
    expect(harness.state.teacherStorageUploads).toBe(1);
    harness.releaseTeacherUpload();
    await expect(page.getByRole('textbox', { name: 'Lesson plan content' })).toContainText('Synthetic generated plan');
    expect(harness.state.teacherAiCalls).toBe(1);
    harness.assertHealthy();
  });

  test('failed AI generation keeps its selected PDF and durable error', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherUploadMode: 'success', teacherAiScenario: 'failure' });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.locator('#lesson-pdf-upload').setInputFiles(PDF_FILE);
    await page.getByRole('button', { name: 'Generate lesson plan' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not generate the lesson plan' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Retry with this selected file to reuse it' })).toBeVisible();
    await expect(page.getByText('synthetic.pdf')).toBeVisible();
    expect(harness.state.teacherStorageUploads).toBe(1);
    expect(harness.state.teacherAiCalls).toBe(1);
    harness.assertHealthy();
  });

  test('a rejected AI request needs an explicit retry and reuses the uploaded PDF', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherUploadMode: 'success', teacherAiScenario: 'success' });
    let requests = 0;
    await page.route('**/api/ai/lesson-plan', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      requests += 1;
      if (requests === 1) return route.abort('failed');
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ html: '<p>Synthetic retry result</p>', truncated: false }) });
    });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.locator('#lesson-pdf-upload').setInputFiles(PDF_FILE);
    const generate = page.getByRole('button', { name: 'Generate lesson plan' });
    await generate.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not receive a response' })).toBeVisible();
    await expect(generate).toBeEnabled();
    expect(requests).toBe(1);
    expect(harness.state.teacherStorageUploads).toBe(1);
    expect(harness.state.lessonPlanWrites).toEqual([]);
    await generate.click();
    await expect(page.getByRole('textbox', { name: 'Lesson plan content' })).toContainText('Synthetic retry result');
    expect(requests).toBe(2);
    expect(harness.state.teacherStorageUploads).toBe(1);
    expect(harness.state.lessonPlanWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('Storage failure retains the selected PDF and never calls AI', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherUploadMode: 'failure', teacherAiScenario: 'success' });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.locator('#lesson-pdf-upload').setInputFiles(PDF_FILE);
    await page.getByRole('button', { name: 'Generate lesson plan' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not generate the lesson plan' })).toBeVisible();
    await expect(page.getByText('synthetic.pdf')).toBeVisible();
    expect(harness.state.teacherStorageUploads).toBe(1);
    expect(harness.state.teacherAiCalls).toBe(0);
    harness.assertHealthy();
  });
});

test.describe('isolated Teacher worksheet dialog accessibility', () => {
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 768, 1024, 1440]) {
      test(`${theme} ${width}px keeps an unsaved worksheet dialog accessible`, async ({ page }) => {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        const harness = await installProfileMocks(page, { role: 'teacher', theme });
        await page.goto('/teacher-dashboard/worksheets');
        const create = page.getByRole('button', { name: 'Create Worksheet', exact: true }).first();
        await create.click();
        const editor = page.getByRole('region', { name: 'Manual Worksheet editor' });
        await expect(editor).toBeVisible();
        await expect(editor.getByRole('heading', { name: 'Worksheet Editor' })).toBeFocused();
        await expect(editor.getByRole('textbox', { name: 'Worksheet title' })).toBeVisible();
        await expect(editor.getByLabel('Section 1 name')).toBeVisible();
        const box = await editor.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        await editor.getByRole('textbox', { name: 'Worksheet title' }).fill('Unsaved worksheet');
        await editor.getByRole('button', { name: 'Back to Worksheets' }).first().click();
        const confirmation = page.getByRole('dialog', { name: 'Unsaved changes' });
        await expect(confirmation).toBeVisible();
        await confirmation.getByRole('button', { name: 'Cancel' }).click();
        await expect(editor.getByRole('textbox', { name: 'Worksheet title' })).toHaveValue('Unsaved worksheet');
        await editor.getByRole('button', { name: 'Back to Worksheets' }).first().click();
        await confirmation.getByRole('button', { name: 'Discard changes' }).click();
        await expect(editor).toHaveCount(0);
        expect(harness.state.profileWrites).toBe(0);
        expect(harness.state.backendWrites).toBe(0);
        harness.assertHealthy();
      });
    }
  }
});

test.describe('isolated Teacher worksheet list and actions', () => {
  for (const [theme, width] of [['light', 360], ['dark', 360], ['light', 390], ['dark', 390], ['light', 768], ['dark', 768], ['light', 1024], ['dark', 1024], ['light', 1440], ['dark', 1440]]) {
    test(`${theme} ${width}px shows searchable worksheets and keyboard actions`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const harness = await installProfileMocks(page, { role: 'teacher', theme, worksheetScenario: true });
      await page.goto('/teacher-dashboard/worksheets');
      await expect(page.getByRole('heading', { name: 'Synthetic worksheet' })).toBeVisible();
      const search = page.getByRole('textbox', { name: 'Search worksheets' });
      await search.fill('missing');
      await expect(page.getByText('No worksheets match your search or subject filter.')).toBeVisible();
      await search.fill('synthetic');
      const trigger = page.getByRole('button', { name: 'More actions for Synthetic worksheet' });
      await trigger.focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menuitem', { name: 'Distribute for Synthetic worksheet' })).toBeFocused();
      await page.keyboard.press('End');
      await expect(page.getByRole('menuitem', { name: 'Delete for Synthetic worksheet' })).toBeFocused();
      const menuBox = await page.getByRole('menu', { name: 'Actions for Synthetic worksheet' }).boundingBox();
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width + 1);
      expect(menuBox.y).toBeGreaterThanOrEqual(0);
      expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(901);
      if (width === 360) await page.screenshot({ path: `test-results/phase3b-actions-${theme}-${width}.png`, fullPage: true });
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await page.screenshot({ path: `test-results/phase3b-worksheets-${theme}-${width}.png`, fullPage: true });
      expect(harness.state.worksheetWrites).toEqual([]);
      harness.assertHealthy();
    });
  }

  test('read failure has durable retry rather than an empty-list claim', async ({ page }) => {
    test.setTimeout(45000);
    const harness = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true, worksheetReadMode: 'error' });
    await page.goto('/teacher-dashboard/worksheets');
    await expect(page.getByRole('alert').filter({ hasText: 'Worksheets could not be loaded' })).toBeVisible({ timeout: 35000 });
    await expect(page.getByRole('button', { name: 'Retry worksheets' })).toBeVisible();
    await expect(page.getByText('No worksheets yet.')).toHaveCount(0);
    harness.assertHealthy();
  });

  test('an empty worksheet list offers only manual creation', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true, worksheetReadMode: 'empty' });
    await page.goto('/teacher-dashboard/worksheets');
    await expect(page.getByText('No worksheets yet. Create one to get started.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Worksheet' })).toBeVisible();
    await expect(page.locator('#worksheet-upload')).toHaveCount(0);
    harness.assertHealthy();
  });

  test('a failed delete keeps the worksheet and reports the mutation error', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', worksheetScenario: true,
      worksheetWriteMode: 'error', worksheetErrorTable: 'worksheets',
    });
    await page.goto('/teacher-dashboard/worksheets');
    await worksheetAction(page, 'Delete');
    await page.getByRole('dialog', { name: 'Delete worksheet' }).getByRole('button', { name: 'Delete worksheet', exact: true }).click();
    await expect(page.getByText('Error: Synthetic worksheet write failure')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Synthetic worksheet' })).toBeVisible();
    expect(harness.state.worksheetWrites).toContain('DELETE worksheets');
    harness.assertHealthy();
  });

  test('a file worksheet keeps Open file accessible inside the mobile menu', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    const harness = await installProfileMocks(page, {
      role: 'teacher', worksheetScenario: true, worksheetHasFile: true,
    });
    await page.goto('/teacher-dashboard/worksheets');
    await expect(page.getByRole('button', { name: 'View', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'View', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Preview: Synthetic worksheet' });
    await expect(preview.getByText('synthetic.pdf')).toBeVisible();
    await preview.getByRole('button', { name: 'Close', exact: true }).click();
    const trigger = page.getByRole('button', { name: 'More actions for Synthetic worksheet' });
    await trigger.click();
    await expect(page.getByRole('menuitem', { name: 'Open file for Synthetic worksheet' })).toBeVisible();
    const box = await page.getByRole('menu').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(901);
    await page.evaluate(() => {
      window.__worksheetOpenCount = 0;
      window.open = () => {
        window.__worksheetOpenCount += 1;
        return { opener: window, location: { replace: url => { window.__worksheetOpenedUrl = url; } } };
      };
    });
    await page.getByRole('menuitem', { name: 'Open file for Synthetic worksheet' }).click();
    expect(await page.evaluate(() => window.__worksheetOpenedUrl)).toContain('/worksheets/synthetic.pdf');
    expect(await page.evaluate(() => window.__worksheetOpenCount)).toBe(1);
    await expect(page.getByText('File tab opened. Check the tab to confirm the file is accessible.')).toBeVisible();
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Open file for Synthetic worksheet' }).click();
    expect(await page.evaluate(() => window.__worksheetOpenedUrl)).toContain('/worksheets/synthetic.pdf');
    expect(harness.state.worksheetWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('blocked file tab reports failure without claiming a download', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true, worksheetHasFile: true });
    await page.goto('/teacher-dashboard/worksheets');
    await page.evaluate(() => { window.open = () => null; });
    await page.getByRole('button', { name: 'More actions for Synthetic worksheet' }).click();
    await page.getByRole('menuitem', { name: 'Open file for Synthetic worksheet' }).click();
    await expect(page.getByText('Your browser blocked the file tab. Allow pop-ups for EduScribe and try again.')).toBeVisible();
    await expect(page.getByText(/Downloaded:/)).toHaveCount(0);
    expect(harness.state.worksheetWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('invalid file URL cannot open a tab or report success', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', worksheetScenario: true, worksheetHasFile: true,
      worksheetFileUrl: 'javascript:alert(1)',
    });
    await page.goto('/teacher-dashboard/worksheets');
    await page.evaluate(() => { window.open = () => { throw new Error('Invalid URL reached window.open'); }; });
    await page.getByRole('button', { name: 'More actions for Synthetic worksheet' }).click();
    await page.getByRole('menuitem', { name: 'Open file for Synthetic worksheet' }).click();
    await expect(page.getByText('No valid file link is available. Ask your administrator to check this worksheet.')).toBeVisible();
    expect(harness.state.worksheetWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('worksheet without a file offers no file-opening action', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true });
    await page.goto('/teacher-dashboard/worksheets');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Preview: Synthetic worksheet' });
    await expect(preview.getByText('No file attached')).toBeVisible();
    await expect(preview.getByRole('button', { name: 'Open File' })).toHaveCount(0);
    await preview.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'More actions for Synthetic worksheet' }).click();
    await expect(page.getByRole('menuitem', { name: 'Open file for Synthetic worksheet' })).toHaveCount(0);
    expect(harness.state.worksheetWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('an inaccessible file tab is not reported as a completed download', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true, worksheetHasFile: true });
    await page.context().route('https://profile-e2e.supabase.invalid/**', route =>
      route.fulfill({ status: 403, contentType: 'text/plain', body: 'Synthetic expired file link' }));
    await page.goto('/teacher-dashboard/worksheets');
    await page.getByRole('button', { name: 'More actions for Synthetic worksheet' }).click();
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('menuitem', { name: 'Open file for Synthetic worksheet' }).click();
    const popup = await popupPromise;
    await expect(popup.getByText('Synthetic expired file link')).toBeVisible();
    await expect(page.getByText(/Downloaded:/)).toHaveCount(0);
    await expect(page.getByText('File tab opened. Check the tab to confirm the file is accessible.')).toBeVisible();
    expect(harness.state.worksheetWrites).toEqual([]);
    harness.assertHealthy();
    await popup.close();
  });
});

test.describe('isolated Teacher submissions and scoring', () => {
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 768, 1024, 1440]) {
      test(`${theme} ${width}px keeps checking and encoding readable`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, {
          role: 'teacher', theme, worksheetScenario: true, worksheetHasSubmission: true,
          worksheetExtraStudent: true,
        });
        await page.goto('/teacher-dashboard/worksheets');
        await worksheetAction(page, 'Check submissions');
        const checking = page.getByRole('dialog', { name: 'Submissions — Synthetic worksheet' });
        await expect(checking.getByRole('list', { name: 'Worksheet submissions' })).toBeVisible();
        await checking.getByRole('button', { name: 'Check', exact: true }).click();
        await expect(checking.getByRole('spinbutton', { name: 'Score for question 1' })).toBeVisible();
        await expect(checking.getByText('Reviewed score:')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`checking-${theme}-${width}.png`) });
        expect(await checking.locator('.overflow-y-auto').first().evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
        await checking.getByRole('button', { name: 'Close Submissions — Synthetic worksheet' }).click();
        await worksheetAction(page, 'Encode scores');
        const encoding = page.getByRole('dialog', { name: 'Encode scores — Synthetic worksheet' });
        await expect(encoding.getByRole('list', { name: 'Students to score' })).toBeVisible();
        await expect(encoding.getByRole('textbox', { name: 'Score for Synthetic Student' })).toBeVisible();
        await expect(encoding.getByText('Bianca Verylongname-Santos')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`encoding-${theme}-${width}.png`) });
        expect(await encoding.locator('.overflow-y-auto').first().evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        harness.assertHealthy();
        expect(harness.state.worksheetWrites).toEqual([]);
      });
    }
  }

  test('manual encoding reports unavailable without a score write', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true });
    await page.goto('/teacher-dashboard/worksheets');
    await worksheetAction(page, 'Encode scores');
    const dialog = page.getByRole('dialog', { name: 'Encode scores — Synthetic worksheet' });
    await expect(dialog.getByRole('textbox', { name: 'Score for Synthetic Student' })).toBeVisible();
    await dialog.getByRole('spinbutton', { name: 'Total points' }).fill('1');
    await dialog.getByRole('textbox', { name: 'Score for Synthetic Student' }).fill('1');
    await dialog.getByRole('button', { name: 'Save scores' }).click();
    await expect(dialog.getByText('Paper score saving and release are unavailable. Nothing was saved or released.')).toBeVisible();
    expect(harness.state.worksheetWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('failed answer read blocks release until Retry loads real answers', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', worksheetScenario: true, worksheetHasSubmission: true,
      worksheetAnswerReadMode: 'error',
    });
    await page.goto('/teacher-dashboard/worksheets');
    await worksheetAction(page, 'Check submissions');
    const dialog = page.getByRole('dialog', { name: 'Submissions — Synthetic worksheet' });
    await dialog.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText("Could not load this student's answers");
    await expect(dialog.getByRole('button', { name: 'Save & Release' })).toHaveCount(0);
    expect(harness.state.worksheetWrites).toEqual([]);
    harness.state.worksheetAnswerReadMode = 'success';
    await dialog.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog.getByRole('spinbutton', { name: 'Score for question 1' })).toBeVisible();
    harness.assertHealthy();
  });

  test('checking distinguishes an empty submission list from a failed read', async ({ page }) => {
    const empty = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true });
    await page.goto('/teacher-dashboard/worksheets');
    await worksheetAction(page, 'Check submissions');
    await expect(page.getByRole('dialog', { name: 'Submissions — Synthetic worksheet' })
      .getByText('No one has answered this worksheet in the app yet.')).toBeVisible();
    empty.assertHealthy();
  });

  test('failed submissions read has Retry and never looks empty', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', worksheetScenario: true, worksheetHasSubmission: true,
      worksheetSubmissionReadMode: 'error',
    });
    await page.goto('/teacher-dashboard/worksheets');
    await worksheetAction(page, 'Check submissions');
    const dialog = page.getByRole('dialog', { name: 'Submissions — Synthetic worksheet' });
    await expect(dialog.getByRole('alert')).toContainText('Could not load the submissions');
    await expect(dialog.getByText('No one has answered this worksheet in the app yet.')).toHaveCount(0);
    harness.state.worksheetSubmissionReadMode = 'success';
    await dialog.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog.getByRole('list', { name: 'Worksheet submissions' })).toBeVisible();
    harness.assertHealthy();
  });

  test('failed class-list read blocks encoding until Retry succeeds', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', worksheetScenario: true, worksheetClassReadMode: 'error',
    });
    await page.goto('/teacher-dashboard/worksheets');
    await worksheetAction(page, 'Encode scores');
    const dialog = page.getByRole('dialog', { name: 'Encode scores — Synthetic worksheet' });
    await expect(dialog.getByRole('alert')).toContainText('Could not load this section');
    await expect(dialog.getByRole('button', { name: 'Save scores' })).toBeDisabled();
    harness.state.worksheetClassReadMode = 'success';
    await dialog.getByRole('button', { name: 'Retry' }).click();
    await expect(dialog.getByRole('list', { name: 'Students to score' })).toBeVisible();
    harness.assertHealthy();
  });

  test.skip('partial manual score writes identify the failed row without claiming rollback', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', worksheetScenario: true, worksheetExtraStudent: true,
      worksheetPartialStudentId: 'student-qa-2',
    });
    await page.goto('/teacher-dashboard/worksheets');
    await worksheetAction(page, 'Encode scores');
    const dialog = page.getByRole('dialog', { name: 'Encode scores — Synthetic worksheet' });
    await dialog.getByRole('spinbutton', { name: 'Total points' }).fill('1');
    await dialog.getByRole('textbox', { name: 'Score for Synthetic Student' }).fill('1');
    await dialog.getByRole('textbox', { name: 'Score for Bianca Verylongname-Santos' }).fill('0.5');
    await dialog.getByRole('button', { name: 'Save scores' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Saved 1 of 2');
    await expect(dialog.getByRole('alert')).toContainText('nothing was undone');
    await expect(dialog.getByRole('listitem').filter({ hasText: 'Bianca Verylongname-Santos' })).toContainText('Synthetic row write failure');
    await expect(dialog.getByRole('listitem').filter({ hasText: 'Synthetic Student' })).toContainText('Saved and released.');
    expect(harness.state.worksheetWrites.filter(write => write === 'POST worksheet_submissions')).toHaveLength(2);
    harness.assertHealthy();
  });

  test.skip('online work requires explicit per-student overwrite before paper scoring', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true, worksheetHasSubmission: true });
    await page.goto('/teacher-dashboard/worksheets');
    await worksheetAction(page, 'Encode scores');
    const dialog = page.getByRole('dialog', { name: 'Encode scores — Synthetic worksheet' });
    await dialog.getByRole('spinbutton', { name: 'Total points' }).fill('1');
    await dialog.getByRole('textbox', { name: 'Score for Synthetic Student' }).fill('1');
    await dialog.getByRole('button', { name: 'Save scores' }).click();
    await expect(dialog.getByRole('alert')).toContainText('already answered this worksheet in the app');
    expect(harness.state.worksheetWrites.filter(write => write.includes('worksheet_submissions'))).toHaveLength(0);
    await dialog.getByRole('checkbox', { name: /Replace Synthetic Student/ }).check();
    await dialog.getByRole('button', { name: 'Save scores' }).click();
    await expect(dialog).toHaveCount(0);
    expect(harness.state.worksheetWrites).toContain('PATCH worksheet_submissions');
    harness.assertHealthy();
  });
});

test.describe('isolated Teacher worksheet safety dialogs', () => {
  const cases = [
    { opener: 'Distribute', title: 'Distribute "Synthetic worksheet"', edit: async (page) => {
      await page.getByLabel('Due date').fill('2026-10-20');
    }, exit: 'Cancel' },
    { opener: 'Questions', title: 'Questions — Synthetic worksheet', edit: async (page) => {
      await page.getByRole('textbox', { name: 'Question 1 text' }).fill('Edited question');
    }, exit: 'Cancel' },
    { opener: 'Check', title: 'Submissions — Synthetic worksheet', submission: true,
      edit: async (page) => {
        await page.getByRole('dialog').getByRole('button', { name: 'Check', exact: true }).click();
        await page.getByRole('spinbutton', { name: 'Score for question 1' }).fill('0.5');
      }, exit: 'Back' },
    { opener: 'Encode scores', title: 'Encode scores — Synthetic worksheet', edit: async (page) => {
      await page.getByRole('textbox', { name: 'Score for Synthetic Student' }).fill('0.5');
    }, exit: 'Close' },
  ];

  for (const [theme, width] of [['light', 360], ['dark', 390], ['light', 768], ['dark', 1024], ['dark', 1440]]) {
    for (const scenario of cases) {
      test(`${theme} ${width}px ${scenario.opener} guards changed work`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, {
          role: 'teacher', theme, worksheetScenario: true,
          worksheetHasSubmission: Boolean(scenario.submission),
        });
        await page.goto('/teacher-dashboard/worksheets');
        const opener = await worksheetAction(page, scenario.opener === 'Check' ? 'Check submissions' : scenario.opener);
        const dialog = page.getByRole('dialog', { name: scenario.title });
        await expect(dialog).toBeVisible();
        await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
        const box = await dialog.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        expect(await dialog.locator('.overflow-y-auto').first().evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
        await page.keyboard.press('Shift+Tab');
        expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeVisible();
        await dialog.locator('..').dispatchEvent('mousedown');
        await dialog.locator('..').dispatchEvent('click');
        await expect(dialog).toBeVisible();
        await scenario.edit(page);
        await dialog.getByRole('button', { name: scenario.exit, exact: true }).click();
        await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: scenario.exit, exact: true }).click();
        await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Discard changes' }).click();
        if (scenario.exit === 'Back') {
          await expect(dialog).toBeVisible();
          await dialog.getByRole('button', { name: `Close ${scenario.title}` }).click();
        }
        await expect(dialog).toHaveCount(0);
        await expect(opener).toBeFocused();
        expect(harness.state.worksheetWrites).toEqual([]);
        harness.assertHealthy();
      });
    }
  }

  for (const scenario of [
    ...cases,
  ]) {
    test(`${scenario.opener} guards dirty browser Back navigation`, async ({ page }) => {
      const harness = await installProfileMocks(page, {
        role: 'teacher', worksheetScenario: true,
        worksheetHasSubmission: Boolean(scenario.submission),
      });
      await page.goto('/teacher-dashboard/students');
      await page.getByRole('link', { name: 'Worksheets', exact: true }).click();
      await worksheetAction(page, scenario.opener === 'Check' ? 'Check submissions' : scenario.opener);
      const dialog = page.getByRole('dialog', { name: scenario.title });
      await scenario.edit(page);
      await page.evaluate(() => window.history.back());
      await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Cancel' }).click();
      await expect(page).toHaveURL(/\/teacher-dashboard\/worksheets$/);
      await expect(dialog).toBeVisible();
      await page.evaluate(() => window.history.back());
      await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Leave page' }).click();
      await expect(page).toHaveURL(/\/teacher-dashboard\/students$/);
      expect(harness.state.worksheetWrites).toEqual([]);
      harness.assertHealthy();
    });
  }

  test('manual draft blocks dirty browser Back navigation', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true });
    await page.goto('/teacher-dashboard/students');
    await page.getByRole('link', { name: 'Worksheets', exact: true }).click();
    await page.getByRole('button', { name: 'Create Worksheet', exact: true }).click();
    const editor = page.getByRole('region', { name: 'Manual Worksheet editor' });
    await editor.getByRole('textbox', { name: 'Worksheet title' }).fill('Retained draft');
    await page.evaluate(() => window.history.back());
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/teacher-dashboard\/worksheets$/);
    await expect(editor.getByRole('textbox', { name: 'Worksheet title' })).toHaveValue('Retained draft');
    await page.evaluate(() => window.history.back());
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Leave page' }).click();
    await expect(page).toHaveURL(/\/teacher-dashboard\/students$/);
    expect(harness.state.worksheetWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('Distribution reports a saved posting even when no new students are assigned', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', worksheetScenario: true });
    await page.goto('/teacher-dashboard/worksheets');
    await worksheetAction(page, 'Distribute');
    const dialog = page.getByRole('dialog', { name: 'Distribute "Synthetic worksheet"' });
    await page.getByLabel('Due date').fill('2026-10-20');
    await expect(dialog.getByRole('button', { name: 'Distribute', exact: true })).toBeEnabled();
    await page.route('**/rest/v1/task_assignees*', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ student_id: 'student-qa-1', task_id: 'worksheet-qa-1' }]),
    }));
    await dialog.getByRole('button', { name: 'Distribute', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Everyone ticked already has this task');
    page.once('dialog', confirmation => {
      expect(confirmation.message()).toContain('section posting was saved');
      return confirmation.dismiss();
    });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeVisible();
    expect(harness.state.worksheetWrites).toContain('POST worksheet_sections');
    harness.assertHealthy();
  });

  test('Question Builder keeps partial completion visible when checking mode fails', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', worksheetScenario: true,
      worksheetWriteMode: 'error', worksheetErrorTable: 'worksheets',
    });
    await page.goto('/teacher-dashboard/worksheets');
    await worksheetAction(page, 'Questions');
    const dialog = page.getByRole('dialog', { name: 'Questions — Synthetic worksheet' });
    await dialog.getByRole('checkbox', { name: /Auto-check this worksheet/ }).check();
    await dialog.getByRole('button', { name: 'Save questions' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Questions were saved, but the checking mode was not changed');
    await expect(dialog).toBeVisible();
    expect(harness.state.worksheetWrites).toContain('PATCH worksheets');
    const itemWritesBeforeRetry = harness.state.worksheetWrites.filter(write => write.endsWith('worksheet_items')).length;
    await dialog.getByRole('button', { name: 'Save questions' }).click();
    await expect(dialog.getByRole('alert')).toContainText('checking mode was not changed');
    expect(harness.state.worksheetWrites.filter(write => write.endsWith('worksheet_items'))).toHaveLength(itemWritesBeforeRetry);
    harness.assertHealthy();
  });

  for (const scenario of [
    { opener: 'Distribute', title: 'Distribute "Synthetic worksheet"', errorTable: 'task_assignees',
      prepare: async page => page.getByLabel('Due date').fill('2026-10-20'),
      save: 'Distribute', message: 'section posting was saved', inDialog: true },
    { opener: 'Questions', title: 'Questions — Synthetic worksheet', errorTable: 'worksheet_items',
      prepare: async page => page.getByRole('textbox', { name: 'Question 1 text' }).fill('Failing question'),
      save: 'Save questions', message: 'Could not save questions' },
    { opener: 'Check', title: 'Submissions — Synthetic worksheet', errorTable: 'worksheet_answers', submission: true,
      prepare: async page => {
        await page.getByRole('dialog').getByRole('button', { name: 'Check', exact: true }).click();
        await page.getByRole('spinbutton', { name: 'Score for question 1' }).fill('1');
      }, save: 'Save & Release', message: 'Could not save item marks' },
    { opener: 'Encode scores', title: 'Encode scores — Synthetic worksheet', errorTable: 'worksheet_submissions',
      prepare: async page => {
        await page.getByRole('spinbutton', { name: 'Total points' }).fill('1');
        await page.getByRole('textbox', { name: 'Score for Synthetic Student' }).fill('1');
      }, save: 'Save scores', message: 'could not be saved', inDialog: true },
  ]) {
    test(`${scenario.opener} announces a synthetic write failure without closing`, async ({ page }) => {
      test.skip(scenario.opener === 'Check' || scenario.opener === 'Encode scores', 'Trusted score writes are disabled; covered by TWF-02/TWF-03A no-write checks.');
      const harness = await installProfileMocks(page, {
        role: 'teacher', worksheetScenario: true,
        worksheetHasSubmission: Boolean(scenario.submission),
        worksheetWriteMode: 'error', worksheetErrorTable: scenario.errorTable,
      });
      await page.goto('/teacher-dashboard/worksheets');
      await worksheetAction(page, scenario.opener === 'Check' ? 'Check submissions' : scenario.opener);
      const dialog = page.getByRole('dialog', { name: scenario.title });
      await scenario.prepare(page);
      await dialog.getByRole('button', { name: scenario.save, exact: true }).click();
      await expect((scenario.inDialog ? dialog.getByRole('alert') : page.getByRole('alert'))
        .filter({ hasText: scenario.message })).toContainText(scenario.message);
      if (scenario.opener === 'Check') {
        await expect(dialog.getByRole('alert').filter({ hasText: 'Score was not released.' })).toBeVisible();
      }
      await expect(dialog).toBeVisible();
      harness.assertHealthy();
    });
  }

  const pendingCases = [
    { opener: 'Distribute', title: 'Distribute "Synthetic worksheet"', slowTable: 'worksheet_sections',
      prepare: async page => page.getByLabel('Due date').fill('2026-10-20'), save: 'Distribute' },
    { opener: 'Questions', title: 'Questions — Synthetic worksheet', slowTable: 'worksheet_items',
      prepare: async page => page.getByRole('textbox', { name: 'Question 1 text' }).fill('Pending question'),
      save: 'Save questions' },
    { opener: 'Check', title: 'Submissions — Synthetic worksheet', slowTable: 'worksheet_answers', submission: true,
      prepare: async page => {
        await page.getByRole('dialog').getByRole('button', { name: 'Check', exact: true }).click();
        await page.getByRole('spinbutton', { name: 'Score for question 1' }).fill('1');
      }, save: 'Save & Release' },
    { opener: 'Encode scores', title: 'Encode scores — Synthetic worksheet', slowTable: 'worksheet_submissions',
      prepare: async page => {
        await page.getByRole('spinbutton', { name: 'Total points' }).fill('1');
        await page.getByRole('textbox', { name: 'Score for Synthetic Student' }).fill('1');
      }, save: 'Save scores' },
  ];

  for (const scenario of pendingCases) {
    test(`${scenario.opener} blocks dismissal and history navigation during a pending write`, async ({ page }) => {
      test.skip(scenario.opener === 'Check' || scenario.opener === 'Encode scores', 'Trusted score writes are disabled; pending-write behavior awaits the trusted writer.');
      const harness = await installProfileMocks(page, {
        role: 'teacher', worksheetScenario: true,
        worksheetHasSubmission: Boolean(scenario.submission),
        worksheetWriteMode: 'slow', worksheetSlowTable: scenario.slowTable,
      });
      await page.goto('/teacher-dashboard/students');
      await page.getByRole('link', { name: 'Worksheets', exact: true }).click();
      await worksheetAction(page, scenario.opener === 'Check' ? 'Check submissions' : scenario.opener);
      const dialog = page.getByRole('dialog', { name: scenario.title });
      await scenario.prepare(page);
      await dialog.getByRole('button', { name: scenario.save, exact: true }).click();
      await expect.poll(() => Boolean(harness.state.releaseWorksheetWrite)).toBe(true);
      await expect(dialog.getByRole('button', { name: /^(Distributing|Saving|Releasing)/ })).toBeDisabled();
      expect(harness.state.worksheetWrites.filter(write => write.endsWith(scenario.slowTable))).toHaveLength(1);
      await dialog.getByRole('button', { name: `Close ${scenario.title}` }).click();
      await expect(dialog.getByRole('status').filter({ hasText: 'wait for the current save' })).toBeVisible();
      await page.evaluate(() => window.history.back());
      await expect(page).toHaveURL(/\/teacher-dashboard\/worksheets$/);
      await expect(dialog).toBeVisible();
      harness.releaseWorksheetWrite();
      if (scenario.opener === 'Check') {
        await expect(dialog.getByRole('button', { name: 'Review again' })).toBeVisible();
      } else {
        await expect(dialog).toHaveCount(0);
      }
      harness.assertHealthy();
    });
  }

  for (const [theme, width] of [['light', 360], ['dark', 1440]]) {
    test(`${theme} ${width}px Preview stays dismissible`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const harness = await installProfileMocks(page, { role: 'teacher', theme, worksheetScenario: true });
      await page.goto('/teacher-dashboard/worksheets');
      const opener = page.getByRole('button', { name: 'Preview', exact: true });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Preview: Synthetic worksheet' });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      expect(harness.state.worksheetWrites).toEqual([]);
      harness.assertHealthy();
    });
  }
});

test.describe('isolated Teacher Overview', () => {
  test('classifies a paged legacy-only saved list separately from AI plans', async ({ page }) => {
    const rows = Array.from({ length: 105 }, (_, index) => ({
      id: `legacy-${String(index).padStart(3, '0')}`,
      teacher_id: 'teacher-qa', title: `Legacy plan ${index}`,
      ai_generated: false, objectives: '<p>Legacy content</p>',
      created_at: '2026-10-12T00:00:00.000Z', status: 'draft',
    }));
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherOverviewScenario: true, overviewPlanRows: rows,
    });
    await page.goto('/teacher-dashboard');
    await expect(page.getByRole('button', { name: /Total Lesson Plans/ })).toContainText('105');
    await expect(page.getByText('0 AI · 0 Manual ILAW · 105 other')).toBeVisible();
    expect(harness.state.backendWrites).toBe(0);
    harness.assertHealthy();
  });

  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 768, 1024, 1440]) {
      test(`${theme} ${width}px shows real Overview data without overflow`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+08:00'));
        const harness = await installProfileMocks(page, { role: 'teacher', theme, teacherOverviewScenario: true });
        await page.goto('/teacher-dashboard');
        await expect(page.getByRole('heading', { name: 'Dashboard Overview' })).toBeVisible();
        await expect(page.getByText('Academic Year 2026-2027')).toBeVisible();
        const lessonMetric = page.getByRole('button', { name: /Total Lesson Plans/ });
        const worksheetMetric = page.getByRole('button', { name: /Total Worksheets/ });
        await expect(lessonMetric).toContainText('2');
        await expect(worksheetMetric).toContainText('1');
        expect(await lessonMetric.evaluate(element => getComputedStyle(element).borderColor))
          .toBe(await worksheetMetric.evaluate(element => getComputedStyle(element).borderColor));
        await lessonMetric.focus();
        await expect(lessonMetric).toBeFocused();
        const plan = page.getByRole('listitem').filter({ hasText: 'Synthetic science lesson' });
        await expect(plan).toBeVisible();
        await expect(plan).toContainText('Science · Grade 7');
        await expect(plan).toContainText('Created');
        await expect(plan).toContainText('Published');
        await expect(page.getByText('Synthetic mathematics lesson')).toBeVisible();
        await expect(page.getByRole('listitem').filter({ hasText: 'Synthetic mathematics lesson' }).getByText('Draft', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Lesson Planning Activity' })).toBeVisible();
        await expect(page.getByText('1 AI · 0 Manual ILAW · 1 other')).toBeVisible();
        await expect(page.getByRole('heading', { name: /Today's Classes/ })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /Classes Remaining Today/ })).toContainText('1');
        await expect(page.getByRole('button', { name: 'Upload Resource' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        const cardBackgrounds = await Promise.all([lessonMetric, worksheetMetric].map(locator =>
          locator.evaluate(element => getComputedStyle(element).backgroundColor)));
        expect(cardBackgrounds[0]).toBe(cardBackgrounds[1]);
        const primaryLabelContrast = await lessonMetric.evaluate(element => {
          const luminance = color => {
            const values = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(channel => {
              const value = channel / 255;
              return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            });
            return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
          };
          const foreground = luminance(getComputedStyle(element.querySelector('span')).color);
          const background = luminance(getComputedStyle(element).backgroundColor);
          return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        });
        expect(primaryLabelContrast).toBeGreaterThanOrEqual(4.5);
        await lessonMetric.evaluate(element => element.blur());
        if ((theme === 'light' && width === 360) || (theme === 'dark' && width === 1440)) {
          await page.screenshot({ path: `test-results/teacher-overview-${theme}-${width}.png`, fullPage: true });
          mkdirSync('screenshots/teacher-tdc4a', { recursive: true });
          await page.screenshot({ path: `screenshots/teacher-tdc4a/${theme}-${width}-overview.png`, fullPage: true });
        }
        if (theme === 'light' && width === 360) {
          await page.locator('main').evaluate(element => { element.scrollTop = element.scrollHeight; });
          await page.screenshot({ path: 'test-results/teacher-overview-light-360-lower.png' });
        }
        expect(harness.state.backendWrites).toBe(0);
        harness.assertHealthy();
      });
    }
  }

  test('Overview distinguishes an empty result from a failed read and retries the failure', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherOverviewScenario: true, overviewReadMode: 'failure',
    });
    await page.goto('/teacher-dashboard');
    await expect(page.getByRole('alert')).toContainText('Dashboard data could not be loaded');
    await expect(page.getByText('No lesson plans yet.')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Quick Actions' })).toBeVisible();
    harness.state.overviewReadMode = 'success';
    await page.getByRole('button', { name: 'Retry dashboard' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Synthetic science lesson' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    harness.assertHealthy();
  });

  test('Overview has a distinct loading state and truthful empty states', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherOverviewScenario: true, overviewReadMode: 'slow', overviewEmpty: true,
    });
    await page.goto('/teacher-dashboard');
    await expect(page.getByRole('status')).toContainText('Loading dashboard data');
    await expect(page.getByText('No lesson plans yet.')).toHaveCount(0);
    await expect.poll(() => Boolean(harness.state.releaseOverviewRead)).toBe(true);
    harness.state.overviewReadMode = 'success';
    harness.releaseOverviewRead();
    await expect(page.getByText('No lesson plans yet.')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Today's Classes/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Total Lesson Plans/ })).toContainText('0');
    harness.assertHealthy();
  });

  test('Overview never substitutes a clock year when the official year cannot load', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherOverviewScenario: true, overviewYearFailure: true,
    });
    await page.goto('/teacher-dashboard');
    await expect(page.getByRole('alert')).toContainText('Dashboard data could not be loaded');
    await expect(page.getByText('Academic Year Unavailable')).toBeVisible();
    await expect(page.getByText('2026-2027')).toHaveCount(0);
    harness.assertHealthy();
  });

  test('Overview wraps a long lesson title at 360px without clipping it', async ({ page }) => {
    const title = 'A very long interdisciplinary science and mathematics lesson plan title for the entire Grade 7 class';
    await page.setViewportSize({ width: 360, height: 900 });
    await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+08:00'));
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherOverviewScenario: true, overviewLongTitle: title,
    });
    await page.goto('/teacher-dashboard');
    const planTitle = page.getByRole('listitem').getByText(title, { exact: true });
    await expect(planTitle).toBeVisible();
    expect(await planTitle.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
    harness.assertHealthy();
  });

  test('Overview lesson-plan action retains keyboard access and its existing destination', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-12T10:00:00+08:00'));
    const harness = await installProfileMocks(page, { role: 'teacher', teacherOverviewScenario: true });
    await page.goto('/teacher-dashboard');
    const metric = page.getByRole('button', { name: /Total Lesson Plans/ });
    await metric.focus();
    await expect(metric).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/teacher-dashboard\/lesson-plans$/);
    await page.goBack();
    const action = page.getByRole('button', { name: 'View all lesson plans' });
    await action.focus();
    await expect(action).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/teacher-dashboard\/lesson-plans$/);
    await expect(page.getByRole('heading', { name: 'Lesson Plans', exact: true })).toBeVisible();
    harness.assertHealthy();
  });
});

test.describe('isolated Teacher Lesson Plans', () => {
  for (const width of [360, 390, 768, 1024, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`F3 saved plan types and filters at ${width}px in ${theme} mode`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, { role: 'teacher', theme, teacherLessonPlanScenario: true });
        const teacherId = harness.state.lessonPlanRows[0].teacher_id;
        harness.state.lessonPlanRows.push({
          id: 'manual-qa-1', teacher_id: teacherId, title: 'Structured ILAW example',
          subject: 'Mathematics', status: 'draft', ai_generated: false,
          created_at: '2026-10-12T00:00:00Z', updated_at: '2026-10-12T00:00:00Z',
          objectives: serializeManualIlawDraft({
            teacherId, planId: 'manual-qa-1',
            assignment: { subjectId: 'subject-qa-math', subjectName: 'Mathematics', gradeLevel: 'Grade 8' },
            document: createBlankIlawDocument(),
          }),
        });
        await page.goto('/teacher-dashboard/lesson-plans');
        await expect(page.getByRole('heading', { name: 'Structured ILAW example' })).toBeVisible();
        await expect(page.getByText('3 of 3 plans')).toBeVisible();
        const savedRows = page.locator('section[aria-labelledby="saved-plans-heading"] ul');
        await expect(savedRows.getByText('AI-Generated', { exact: true })).toBeVisible();
        await expect(savedRows.getByText('Manual ILAW', { exact: true })).toBeVisible();
        await expect(savedRows.getByText('Other saved plan', { exact: true })).toBeVisible();
        const type = page.getByRole('combobox', { name: 'Filter by plan type' });
        await type.selectOption('manual');
        await expect(page.getByText('1 of 3 plans')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Structured ILAW example' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Synthetic mathematics lesson' })).toHaveCount(0);
        await type.selectOption('ai');
        await expect(page.getByRole('heading', { name: 'Synthetic science lesson' })).toBeVisible();
        await type.selectOption('all');
        await page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' }).click();
        const editor = page.getByRole('region', { name: 'Full Manual ILAW editor' });
        await expect(editor.getByRole('button', { name: 'Open Draft', exact: true })).toHaveCount(0);
        await expect(page.getByRole('group', { name: 'Local Manual ILAW save actions' }).getByRole('button', { name: 'Save Incomplete Draft (local)' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Save Lesson Plan' })).toBeVisible();
        if (width === 360 || width === 1440) {
          mkdirSync('test-results/teacher-mux1-f3', { recursive: true });
          await page.getByRole('heading', { name: 'Manual ILAW Editor' }).scrollIntoViewIfNeeded();
          await page.screenshot({ path: `test-results/teacher-mux1-f3/${theme}-${width}-draft-controls.png` });
        }
        await page.getByRole('button', { name: /Back to Lesson Plans/ }).click();
        await expect(page.getByText('3 of 3 plans')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
        if (width === 360 || width === 1440) {
          mkdirSync('test-results/teacher-mux1-f3', { recursive: true });
          await page.getByRole('heading', { name: 'Saved lesson plans' }).scrollIntoViewIfNeeded();
          await page.screenshot({ path: `test-results/teacher-mux1-f3/${theme}-${width}-saved-plan-types.png` });
        }
        expect(harness.state.lessonPlanWrites).toEqual([]);
        harness.assertHealthy();
      });
    }
  }

  for (const width of [360, 390, 768, 1024, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`MUX1 one-click blank Manual ILAW at ${width}px in ${theme} mode`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, { role: 'teacher', theme, teacherLessonPlanScenario: true });
        await page.goto('/teacher-dashboard/lesson-plans');
        await expect(page.getByRole('heading', { name: 'Saved lesson plans' })).toBeVisible();
        const headings = await page.locator('main h2').allTextContents();
        expect(headings.indexOf('AI-Generated ILAW Lesson Plan')).toBeLessThan(headings.indexOf('Manual ILAW Lesson Plan'));
        expect(headings.indexOf('Manual ILAW Lesson Plan')).toBeLessThan(headings.indexOf('Saved lesson plans'));
        const action = page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' });
        await expect(action).toBeEnabled();
        await expect(page.getByRole('region', { name: 'Quick Create lesson plan' })).toHaveCount(0);
        if (width === 360 || width === 1440) {
          mkdirSync('test-results/teacher-mux1', { recursive: true });
          await page.screenshot({ path: `test-results/teacher-mux1/${theme}-${width}-entry.png`, fullPage: true });
        }
        const readsBeforeCreate = harness.state.teacherAssignmentReads.length;
        await action.click();
        const draft = page.getByRole('region', { name: 'Full Manual ILAW editor' });
        await expect(page.locator('main h1')).toHaveCount(1);
        await expect(draft.getByRole('group', { name: 'Document mode' })).toHaveCount(0);
        await expect(draft.getByRole('group', { name: 'Document validation' })).toHaveCount(0);
        await expect(page.getByRole('group', { name: 'Local Manual ILAW save actions' })).toBeVisible();
        if (width === 360 || width === 1440) {
          mkdirSync('test-results/teacher-mux1-f2', { recursive: true });
          await page.getByRole('heading', { name: 'Manual ILAW Editor', level: 1 }).scrollIntoViewIfNeeded();
          await page.screenshot({ path: `test-results/teacher-mux1-f2/${theme}-${width}-editor-controls.png` });
        }
        await expect(page.getByRole('status').filter({ hasText: 'Local QA only · Not saved to EduScribe' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Manual ILAW Editor', level: 1 })).toBeFocused();
        await expect(draft.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('');
        await expect(draft.getByRole('textbox', { name: 'Learning Area/s' })).toHaveValue('');
        await expect(draft.getByRole('textbox', { name: 'Designed for which Grade Level and Section' })).toHaveValue('');
        await expect(draft.getByRole('textbox', { name: 'Class Duration (minutes per session)' })).toHaveValue('');
        await expect(draft.getByRole('textbox', { name: 'Learning Objectives, Monday' })).toHaveValue('');
        await expect(draft.getByRole('textbox', { name: 'Learning Objectives, Tuesday' })).toHaveValue('');
        await expect(draft.getByRole('textbox', { name: 'Prepared by name' })).toHaveValue('Synthetic Teacher');
        await expect(draft.getByRole('textbox', { name: 'Checked by name' })).toHaveValue('REXES MARLON A. TEODORO');
        await expect(draft.getByRole('textbox', { name: 'Checked by designation' })).toHaveValue('TLE Coordinator');
        await expect(draft.getByRole('textbox', { name: 'Noted by name' })).toHaveValue('MARIA BEATRIZ T. MANAIG');
        await expect(draft.getByRole('textbox', { name: 'Noted by designation' })).toHaveValue('School Principal II');
        await draft.getByRole('textbox', { name: 'Name of Lesson' }).fill('Synthetic cells plan');
        await draft.getByRole('textbox', { name: 'Teaching Date' }).fill('2026-10-16');
        await draft.getByRole('textbox', { name: 'Learning Area/s' }).fill('Mathematics');
        await draft.getByRole('textbox', { name: 'Designed for which Grade Level and Section' }).fill('Grade 8');
        await draft.getByRole('textbox', { name: 'Class Duration (minutes per session)' }).fill('45 minutes');
        await draft.getByRole('textbox', { name: 'Teaching Strategy' }).fill('Peer instruction');
        await draft.getByRole('textbox', { name: 'Learning Objectives (lesson-wide)' }).fill('Describe cells\nCompare tissues');
        if (width === 360 || width === 1440) {
          await page.screenshot({ path: `test-results/teacher-mux1/${theme}-${width}-editor.png`, fullPage: true });
        }
        await draft.getByRole('textbox', { name: 'Teaching Strategy' }).fill('Discussion');
        await draft.getByRole('textbox', { name: 'Learning Objectives (lesson-wide)' }).fill('First objective\nSecond objective');
        await draft.getByRole('textbox', { name: 'Learning Objectives, Monday' }).fill('Monday objective');
        await draft.getByRole('textbox', { name: 'Learning Objectives, Tuesday' }).fill('Tuesday objective');
        await expect(draft.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('Synthetic cells plan');
        await expect(draft.getByRole('textbox', { name: 'Learning Area/s' })).toHaveValue('Mathematics');
        await expect(draft.getByRole('textbox', { name: 'Designed for which Grade Level and Section' })).toHaveValue('Grade 8');
        await expect(draft.getByRole('textbox', { name: 'Teaching Strategy' })).toHaveValue('Discussion');
        await expect(draft.getByRole('textbox', { name: 'Learning Objectives, Tuesday' })).toHaveValue('Tuesday objective');
        await expect(draft.locator('table')).toHaveCount(5);
        await expect(draft.getByRole('button', { name: 'Print' })).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
        if (width === 360 || width === 1440) {
          await page.screenshot({ path: `test-results/teacher-mux1/${theme}-${width}-preview.png`, fullPage: true });
        }
        if (width === 1440 && theme === 'light') {
          await page.emulateMedia({ media: 'print' });
          await expect(draft.getByRole('article', { name: 'ILAW lesson plan document' })).toBeVisible();
          await expect(page.locator('.teacher-header')).toBeHidden();
          await expect(page.getByRole('button', { name: 'Discard temporary draft', includeHidden: true })).toBeHidden();
          await page.screenshot({ path: 'test-results/teacher-mux1/print-view.png', fullPage: true });
          await page.pdf({ path: 'test-results/teacher-mux1/print.pdf', format: 'A4', printBackground: true });
        }
        expect(harness.state.teacherAssignmentReads).toHaveLength(readsBeforeCreate);
        expect(harness.state.lessonPlanWrites).toEqual([]);
        harness.assertHealthy();
      });
    }
  }

  test('MUX1-F2 section links keep the local draft accessible after toolbar removal', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' }).click();
    const editor = page.getByRole('region', { name: 'Full Manual ILAW editor' });
    await editor.getByRole('textbox', { name: 'Name of Lesson' }).fill('Local sample');
    await editor.getByRole('link', { name: 'Assessment' }).click();
    await expect(editor.locator('#ilaw-assessment')).toBeFocused();
    await expect(editor.getByRole('button', { name: 'Preview document' })).toHaveCount(0);
    await expect(editor.getByRole('button', { name: 'Edit document' })).toHaveCount(0);
    await expect(editor.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('Local sample');
    await expect(editor.getByRole('button', { name: 'Print' })).toHaveCount(0);
    await page.getByRole('button', { name: /Back to Lesson Plans/ }).click();
    await page.getByRole('dialog', { name: 'Confirm lesson plan action' })
      .getByRole('button', { name: 'Leave document' }).click();
    await expect(page.getByRole('button', { name: 'Resume temporary draft' })).toBeFocused();
    await expect(page.getByRole('button', { name: 'Create new Manual ILAW Lesson Plan' })).toBeVisible();
    expect(harness.state.lessonPlanWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('MUX1-F1 signatory edits survive local Draft Save, reopen and PDF download', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' }).click();
    const draft = page.getByRole('region', { name: 'Full Manual ILAW editor' });
    await draft.getByRole('textbox', { name: 'Prepared by name' }).fill('Edited Teacher Name');
    await draft.getByRole('textbox', { name: 'Prepared by designation' }).fill('Teacher III');
    await draft.getByRole('textbox', { name: 'Checked by name' }).fill('Edited Checker');
    await draft.getByRole('textbox', { name: 'Checked by designation' }).fill('Edited Coordinator');
    await draft.getByRole('textbox', { name: 'Noted by name' }).fill('Edited Principal');
    await draft.getByRole('textbox', { name: 'Noted by designation' }).fill('Edited Principal Role');
    await page.getByRole('button', { name: 'Save Incomplete Draft (local)' }).click();
    const mockCard = page.locator('section[aria-labelledby="saved-plans-heading"] li').filter({ hasText: 'Local test only' });
    await expect(mockCard).toHaveCount(1);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      mockCard.getByRole('button', { name: /Download PDF saved version/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    await mockCard.getByRole('button', { name: /View and edit/ }).click();
    for (const [label, value] of [
      ['Prepared by name', 'Edited Teacher Name'], ['Prepared by designation', 'Teacher III'],
      ['Checked by name', 'Edited Checker'], ['Checked by designation', 'Edited Coordinator'],
      ['Noted by name', 'Edited Principal'], ['Noted by designation', 'Edited Principal Role'],
    ]) await expect(draft.getByRole('textbox', { name: label })).toHaveValue(value);
    expect(harness.state.lessonPlanWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('MUX1-F1 inline validation and safe local Draft reopen', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' }).click();
    const editor = page.getByRole('region', { name: 'Full Manual ILAW editor' });
    await expect(editor.getByRole('button', { name: 'Edit document' })).toHaveCount(0);
    await expect(editor.getByRole('button', { name: 'Preview document' })).toHaveCount(0);
    await expect(editor.getByRole('button', { name: 'Check required fields' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Save Lesson Plan' }).click();
    const title = editor.getByRole('textbox', { name: 'Name of Lesson' });
    await expect(title).toBeFocused();
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await expect(title).toHaveAttribute('aria-describedby', 'ilaw-error-nameOfLesson');
    await expect(editor.locator('#ilaw-error-nameOfLesson')).toHaveText('Name of Lesson is required.');
    await expect(editor.locator('#ilaw-error-learningArea')).toHaveText('Learning Area/s is required.');
    await page.emulateMedia({ media: 'print' });
    await expect(editor.locator('#ilaw-error-nameOfLesson')).toBeHidden();
    await expect(page.getByRole('group', { name: 'Local Manual ILAW save actions', includeHidden: true })).toBeHidden();
    await page.emulateMedia({ media: 'screen' });

    await title.fill('Local Draft');
    await editor.getByRole('textbox', { name: 'Learning Area/s' }).fill('Science');
    await editor.getByRole('textbox', { name: 'Designed for which Grade Level and Section' }).fill('Grade 7');
    await editor.getByRole('textbox', { name: 'Learning Objectives, Monday' }).fill('Explain cells');
    await editor.getByRole('textbox', { name: 'Class Duration (minutes per session)' }).fill('45 minutes');
    await editor.getByRole('textbox', { name: 'Checked by name' }).fill('Edited Checker');
    await page.getByRole('button', { name: 'Save Incomplete Draft (local)' }).click();
    const mockCard = page.locator('section[aria-labelledby="saved-plans-heading"] li').filter({ hasText: 'Local test only' });
    await expect(mockCard).toHaveCount(1);
    await mockCard.getByRole('button', { name: /View and edit/ }).click();
    await expect(title).toHaveValue('Local Draft');
    await expect(editor.getByRole('textbox', { name: 'Learning Objectives, Monday' })).toHaveValue('Explain cells');
    await expect(editor.getByRole('textbox', { name: 'Checked by name' })).toHaveValue('Edited Checker');
    await expect(editor.getByRole('textbox', { name: 'Class Duration (minutes per session)' })).toHaveValue('45 minutes');
    expect(harness.state.lessonPlanWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('MUX1 manual draft resumes, confirms replacement and discard, and blocks route loss', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' }).click();
    await page.getByRole('textbox', { name: 'Name of Lesson' }).fill('Unsaved cells');
    await page.getByRole('textbox', { name: 'Learning Objectives, Monday' }).fill('Keep Monday work');
    await page.getByRole('textbox', { name: 'Teaching Strategy' }).fill('Keep custom strategy');
    await page.getByRole('link', { name: 'Students', exact: true }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/teacher-dashboard\/lesson-plans$/);
    await page.getByRole('button', { name: '← Back to Lesson Plans' }).click();
    await page.getByRole('dialog', { name: 'Confirm lesson plan action' }).getByRole('button', { name: 'Leave document' }).click();
    await expect(page.getByRole('button', { name: 'Resume temporary draft' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Saved lesson plans' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Unsaved cells' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Create new Manual ILAW Lesson Plan' }).click();
    await page.getByRole('dialog', { name: 'Confirm lesson plan action' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: 'Resume temporary draft' })).toBeVisible();
    await page.getByRole('button', { name: 'Resume temporary draft' }).click();
    await expect(page.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('Unsaved cells');
    await expect(page.getByRole('textbox', { name: 'Learning Objectives, Monday' })).toHaveValue('Keep Monday work');
    await expect(page.getByRole('textbox', { name: 'Teaching Strategy' })).toHaveValue('Keep custom strategy');
    await page.getByRole('button', { name: 'Discard temporary draft' }).click();
    await page.getByRole('dialog', { name: 'Confirm lesson plan action' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('Unsaved cells');
    await page.getByRole('button', { name: 'Discard temporary draft' }).click();
    await page.getByRole('dialog', { name: 'Confirm lesson plan action' }).getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByRole('button', { name: 'Resume temporary draft' })).toHaveCount(0);
    expect(harness.state.lessonPlanWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('MUX1 manual draft is clearly transient across a full reload', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' }).click();
    await page.getByRole('textbox', { name: 'Name of Lesson' }).fill('Transient plan');
    await expect(page.getByRole('status').filter({ hasText: 'Local QA only · Not saved to EduScribe' })).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Saved lesson plans' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume temporary draft' })).toHaveCount(0);
    await expect(page.getByText('Transient plan')).toHaveCount(0);
    expect(harness.state.lessonPlanWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('saved-plan rename confirms one owned row and synchronizes the list and PDF suggestion', async ({ page }, testInfo) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    const plan = harness.state.lessonPlanRows[0];
    plan.title = '[G7] Filipino';
    plan.file_name = '[G7] Filipino.pdf';
    plan.file_path = 'synthetic-teacher/original.pdf';
    plan.file_url = 'https://profile-e2e.supabase.invalid/storage/v1/object/public/lesson-pdfs/original.pdf';
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: /View and edit.*\[G7\] Filipino/ }).click();
    const title = page.getByRole('textbox', { name: 'Lesson Plan Title' });
    await expect(title).toHaveValue('[G7] Filipino');
    await page.screenshot({ path: testInfo.outputPath('r2-before-editor.png'), fullPage: true });
    await page.getByRole('textbox', { name: 'Suggested PDF filename' }).fill('Old Custom Name');
    await title.fill('  Filipino 7 Lesson Plan  ');
    expect(harness.state.lessonPlanWrites).toEqual([]);
    const readsBefore = harness.state.lessonPlanReads;
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('heading', { name: 'Filipino 7 Lesson Plan', level: 1 })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Suggested PDF filename' })).toHaveValue('Filipino 7 Lesson Plan');
    await expect(page.getByText('Changes saved.')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('r2-after-save-editor.png'), fullPage: true });
    expect(harness.state.lessonPlanWrites).toEqual(['PATCH']);
    const request = harness.state.lessonPlanWriteRequests[0];
    const filters = new URL(request.url).searchParams;
    expect(filters.get('id')).toBe(`eq.${plan.id}`);
    expect(filters.get('teacher_id')).toBe(`eq.${harness.profile.id}`);
    expect(filters.get('updated_at')).toBe(`eq.${plan.updated_at}`);
    expect(request.payload.title).toBe('Filipino 7 Lesson Plan');
    expect(request.payload.objectives).toBe('<p>Original science objectives</p>');
    expect(request.payload).not.toHaveProperty('file_name');
    expect(request.payload).not.toHaveProperty('file_path');
    expect(harness.state.lessonPlanReads).toBe(readsBefore);
    expect(harness.state.lessonPlanRows[0].file_path).toBe('synthetic-teacher/original.pdf');
    expect(harness.state.lessonPlanRows[0].objectives).toBe('<p>Original science objectives</p>');
    expect(harness.state.lessonPlanRows[1].title).toBe('Synthetic mathematics lesson');
    const printPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Print' }).click();
    const printPage = await printPromise;
    await expect.poll(() => printPage.title()).toBe('Filipino 7 Lesson Plan.pdf');
    await printPage.close();
    await page.getByRole('button', { name: /Back/ }).click();
    await expect(page.getByRole('heading', { name: 'Filipino 7 Lesson Plan', level: 3 })).toBeVisible();
    await expect(page.getByText('[G7] Filipino.pdf')).toBeVisible();
    await page.getByRole('heading', { name: 'Filipino 7 Lesson Plan', level: 3 }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('r2-after-save-list.png'), fullPage: true });
    await page.getByRole('button', { name: /View and edit.*Filipino 7 Lesson Plan/ }).click();
    await expect(page.getByRole('textbox', { name: 'Lesson Plan Title' })).toHaveValue('Filipino 7 Lesson Plan');
    await expect(page.getByRole('textbox', { name: 'Suggested PDF filename' })).toHaveValue('Filipino 7 Lesson Plan');
    await page.screenshot({ path: testInfo.outputPath('r2-after-reopen-editor.png'), fullPage: true });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Filipino 7 Lesson Plan', level: 3 })).toBeVisible();
    await page.getByRole('button', { name: /View and edit.*Filipino 7 Lesson Plan/ }).click();
    await expect(page.getByRole('textbox', { name: 'Lesson Plan Title' })).toHaveValue('Filipino 7 Lesson Plan');
    expect(harness.state.blockedRequests).toEqual([]);
    harness.assertHealthy();
  });

  for (const mode of ['failure', 'zero', 'mismatch', 'multiple', 'stale']) {
    test(`${mode} update keeps title and content drafts without claiming success`, async ({ page }, testInfo) => {
      const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true,
        lessonPlanWriteMode: mode === 'stale' ? 'success' : mode });
      await page.goto('/teacher-dashboard/lesson-plans');
      await page.getByRole('button', { name: /View and edit.*Synthetic science lesson/ }).click();
      await page.getByRole('textbox', { name: 'Suggested PDF filename' }).fill('Old preferred name');
      await page.getByRole('textbox', { name: 'Lesson Plan Title' }).fill('Renamed science');
      const editor = page.getByRole('textbox', { name: 'Lesson plan content' });
      await editor.fill('Unsaved synthetic content');
      if (mode === 'stale') harness.state.lessonPlanRows[0].updated_at = '2026-10-10T08:00:00.000Z';
      await page.getByRole('button', { name: 'Save Changes' }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Could not save the lesson plan' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Lesson Plan Title' })).toHaveValue('Renamed science');
      await expect(editor).toContainText('Unsaved synthetic content');
      await expect(page.getByRole('heading', { name: 'Synthetic science lesson', level: 1 })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Suggested PDF filename' })).toHaveValue('Old preferred name');
      await expect(page.getByText('Changes saved.')).toHaveCount(0);
      expect(harness.state.lessonPlanRows[0].title).toBe('Synthetic science lesson');
      expect(harness.state.lessonPlanWrites).toEqual(['PATCH']);
      if (mode === 'failure') {
        await page.screenshot({ path: testInfo.outputPath('r2-failed-save.png'), fullPage: true });
        await page.locator('main').evaluate(element => { element.scrollTop = 0; });
        await page.screenshot({ path: testInfo.outputPath('r2-failed-save-title.png'), fullPage: true });
      }
      expect(harness.state.blockedRequests).toEqual([]);
      harness.assertHealthy();
    });
  }

  test('another Teacher’s saved plan is not listed or editable', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    harness.state.lessonPlanRows[0].teacher_id = 'another-teacher';
    await page.goto('/teacher-dashboard/lesson-plans');
    await expect(page.getByRole('button', { name: /View and edit.*Synthetic mathematics lesson/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /View and edit.*Synthetic science lesson/ })).toHaveCount(0);
    expect(harness.state.lessonPlanWrites).toEqual([]);
    expect(harness.state.blockedRequests).toEqual([]);
    harness.assertHealthy();
  });

  test('unsaved title blocks Back and route navigation until the Teacher discards it', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: /View and edit.*Synthetic science lesson/ }).click();
    const title = page.getByRole('textbox', { name: 'Lesson Plan Title' });
    await title.fill('Unsaved science title');
    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByRole('dialog', { name: 'Confirm lesson plan action' })
      .getByRole('button', { name: 'Cancel' }).click();
    await expect(title).toHaveValue('Unsaved science title');
    await page.getByRole('link', { name: 'Students', exact: true }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' })
      .getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/teacher-dashboard\/lesson-plans$/);
    await expect(title).toHaveValue('Unsaved science title');
    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByRole('dialog', { name: 'Confirm lesson plan action' })
      .getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByRole('heading', { name: 'Saved lesson plans' })).toBeVisible();
    expect(harness.state.lessonPlanWrites).toEqual([]);
    expect(harness.state.blockedRequests).toEqual([]);
    harness.assertHealthy();
  });

  test('pending title save disables a second save and navigation', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, lessonPlanWriteMode: 'slow',
    });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: /View and edit.*Synthetic science lesson/ }).click();
    await page.getByRole('textbox', { name: 'Lesson Plan Title' }).fill('Pending renamed plan');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    await expect(page.getByRole('textbox', { name: 'Lesson Plan Title' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Back/ })).toBeDisabled();
    expect(harness.state.lessonPlanWrites).toEqual(['PATCH']);
    harness.releaseLessonPlanWrite();
    await expect(page.getByRole('heading', { name: 'Pending renamed plan', level: 1 })).toBeVisible();
    expect(harness.state.lessonPlanWrites).toEqual(['PATCH']);
    expect(harness.state.blockedRequests).toEqual([]);
    harness.assertHealthy();
  });

  test('unchanged title keeps its custom PDF preference and invalid title never sends a write', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: /View and edit.*Synthetic science lesson/ }).click();
    const title = page.getByRole('textbox', { name: 'Lesson Plan Title' });
    await page.getByRole('textbox', { name: 'Suggested PDF filename' }).fill('My private filename');
    await title.fill('  ');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Enter a lesson plan title.')).toBeVisible();
    expect(harness.state.lessonPlanWrites).toEqual([]);
    await title.fill('Synthetic science lesson');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('textbox', { name: 'Suggested PDF filename' })).toHaveValue('My private filename');
    expect(harness.state.lessonPlanWrites).toEqual(['PATCH']);
    expect(harness.state.blockedRequests).toEqual([]);
    harness.assertHealthy();
  });

  for (const { theme, width } of [{ theme: 'light', width: 360 }, { theme: 'dark', width: 1440 }]) {
    test(`active hybrid AI letterhead is presentation-only at ${theme} ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const harness = await installProfileMocks(page, { role: 'teacher', theme, teacherLessonPlanScenario: true });
      harness.state.lessonPlanRows[0].objectives = '<div class="ilaw-lesson-plan"><div class="ilaw-letterhead"><p>Republic of the Philippines</p><p class="ilaw-school-name">Dela Paz National High School</p></div><h2 class="ilaw-title">Synthetic Science</h2><p>Monday objective remains editable.</p></div>';
      const original = harness.state.lessonPlanRows[0].objectives;
      await page.goto('/teacher-dashboard/lesson-plans');
      await expect(page.getByRole('heading', { name: 'Lesson Plans', exact: true })).toBeVisible();
      await page.getByRole('button', { name: /View and edit.*Synthetic science lesson/i }).click();
      const editor = page.getByRole('textbox', { name: 'Lesson plan content' });
      await expect(editor.locator('.ilaw-letterhead')).toHaveCount(1);
      await expect(editor).toContainText('Monday objective remains editable.');
      const background = await editor.locator('.ilaw-letterhead').evaluate(element => getComputedStyle(element).backgroundImage);
      expect(background).toContain('deped-logo');
      expect(background).toContain('school-seal');
      expect(background).toContain('eduscribe-logo');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      expect(harness.state.lessonPlanRows[0].objectives).toBe(original);
      expect(harness.state.lessonPlanWrites).toEqual([]);
      await page.screenshot({ path: `test-results/teacher-hybrid-${theme}-${width}.png` });
      harness.assertHealthy();
    });
  }

  for (const theme of ['light', 'dark']) {
    test(`long synthetic ILAW plan prints to A4 PDF in ${theme} mode`, async ({ page }) => {
      await page.context().addInitScript(() => { window.print = () => {}; });
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      const narrative = 'Synthetic classroom activity with readable details and no real student information. '.repeat(9);
      const week = `<table class="ilaw-week-table"><tr>${days.map(day => `<th>${day}</th>`).join('')}</tr><tr>${days.map(day => `<td>${day}: ${narrative}</td>`).join('')}</tr></table>`;
      const sections = [
        ['I', 'INTENTIONS'], ['L', 'LEARNING EXPERIENCE'],
        ['A', 'ASSESSMENT'], ['W', 'WAYS FORWARD'],
      ].map(([letter, heading]) => `<div class="ilaw-section ilaw-${letter}"><div class="ilaw-section-header">${letter} — ${heading}</div><div class="ilaw-field"><span class="ilaw-label">Synthetic ${heading}</span>${week}${week}</div></div>`).join('');
      await page.setViewportSize({ width: theme === 'light' ? 360 : 1440, height: 900 });
      const harness = await installProfileMocks(page, { role: 'teacher', theme, teacherLessonPlanScenario: true });
      harness.state.lessonPlanRows[0].objectives = `<div class="ilaw-lesson-plan"><div class="ilaw-letterhead"><p>Republic of the Philippines</p><p class="ilaw-school-name">Dela Paz National High School</p></div><h2 class="ilaw-title">Synthetic ILAW Science</h2><table class="ilaw-info-table"><tr><th>Lesson</th><td>Synthetic science</td></tr></table>${sections}<div class="ilaw-signatures"><p>Prepared by: ____________________</p></div></div>`;
      await page.goto('/teacher-dashboard/lesson-plans');
      await page.getByRole('button', { name: /View and edit.*Synthetic science lesson/ }).click();
      const editor = page.getByRole('textbox', { name: 'Lesson plan content' });
      await expect(editor.locator('.ilaw-section-header')).toHaveCount(4);
      expect(await editor.locator('.ilaw-section-header').allTextContents()).toEqual([
        'I — INTENTIONS', 'L — LEARNING EXPERIENCE', 'A — ASSESSMENT', 'W — WAYS FORWARD',
      ]);
      expect(await editor.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
      expect(await editor.locator('.ilaw-section-header').first().evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(200, 225, 244)');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((theme === 'light' ? 360 : 1440) + 1);
      await editor.evaluate(element => {
        element.insertAdjacentHTML('beforeend', '<p>Teacher edited ending remains in the PDF.</p>');
        element.dispatchEvent(new InputEvent('input', { bubbles: true }));
      });
      const writesBefore = harness.state.backendWrites;
      const popupPromise = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'Print' }).click();
      const popup = await popupPromise;
      await expect(popup.locator('.ilaw-print-brand img')).toHaveCount(3);
      await expect(popup.locator('.ilaw-week-table')).toHaveCount(8);
      expect(await popup.locator('.ilaw-week-table').first().locator('th').allTextContents()).toEqual(days);
      await expect(popup.getByText('Teacher edited ending remains in the PDF.')).toBeVisible();
      const imageState = await popup.locator('.ilaw-print-brand img').evaluateAll(images => images.map(image => ({ src: image.src, width: image.naturalWidth })));
      expect(imageState.every(image => image.width > 0), JSON.stringify(imageState)).toBe(true);
      mkdirSync('test-results', { recursive: true });
      const pdf = await popup.pdf({ path: `test-results/teacher-ilaw-${theme}.pdf`, printBackground: true, preferCSSPageSize: true });
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      const count = Number(pdf.toString('latin1').match(/\/Type\s*\/Pages\b[^]*?\/Count\s+(\d+)/)?.[1]);
      expect(count).toBeGreaterThan(1);
      await popup.close();
      expect(harness.state.backendWrites).toBe(writesBefore);
      expect(harness.state.blockedRequests).toEqual([]);
      harness.assertHealthy();
    });
  }

  test('custom PDF name survives editor focus changes and reaches the print document', async ({ page }) => {
    await page.context().addInitScript(() => {
      window.print = () => {
        window.__titlesAtPrint = { popup: document.title, app: window.opener?.document.title };
      };
    });
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    harness.state.lessonPlanRows[1].objectives = '<p>Synthetic mathematics content</p>';
    await page.goto('/teacher-dashboard/lesson-plans');
    const originalTitle = await page.title();
    await page.getByRole('button', { name: /View and edit.*Synthetic science lesson/ }).click();
    const filename = page.getByRole('textbox', { name: 'Suggested PDF filename' });
    await filename.fill('ILAW_English_Grade7_Week1');
    await page.getByRole('textbox', { name: 'Lesson plan content' }).focus();
    await expect(filename).toHaveValue('ILAW_English_Grade7_Week1');
    const writesBefore = harness.state.backendWrites;
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Print' }).click();
    const popup = await popupPromise;
    await expect.poll(() => popup.title()).toBe('ILAW_English_Grade7_Week1.pdf');
    await expect.poll(() => popup.evaluate(() => window.__titlesAtPrint)).toEqual({
      popup: 'ILAW_English_Grade7_Week1.pdf', app: 'ILAW_English_Grade7_Week1.pdf',
    });
    const pdf = await popup.pdf({ printBackground: true, preferCSSPageSize: true });
    expect(pdf.toString('latin1')).toContain('/Title (ILAW_English_Grade7_Week1.pdf)');
    expect(await page.title()).toBe(originalTitle);
    expect(await filename.inputValue()).toBe('ILAW_English_Grade7_Week1');
    expect(harness.state.backendWrites).toBe(writesBefore);
    await popup.close();
    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByRole('button', { name: /View and edit.*Synthetic science lesson/ }).click();
    await expect(page.getByRole('textbox', { name: 'Suggested PDF filename' })).toHaveValue('ILAW_English_Grade7_Week1');
    await page.reload();
    await page.getByRole('button', { name: /View and edit.*Synthetic science lesson/ }).click();
    await expect(page.getByRole('textbox', { name: 'Suggested PDF filename' })).toHaveValue('ILAW_English_Grade7_Week1');
    const reopenedContext = await page.context().browser().newContext({
      storageState: await page.context().storageState(), serviceWorkers: 'block',
    });
    try {
      const reopenedPage = await reopenedContext.newPage();
      const reopenedHarness = await installProfileMocks(reopenedPage, { role: 'teacher', teacherLessonPlanScenario: true });
      await reopenedPage.goto(page.url());
      await reopenedPage.getByRole('button', { name: /View and edit.*Synthetic science lesson/ }).click();
      await expect(reopenedPage.getByRole('textbox', { name: 'Suggested PDF filename' })).toHaveValue('ILAW_English_Grade7_Week1');
      reopenedHarness.assertHealthy();
    } finally {
      await reopenedContext.close();
    }
    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByRole('button', { name: /View and edit.*Synthetic mathematics lesson/ }).click();
    await expect(page.getByRole('textbox', { name: 'Suggested PDF filename' })).toHaveValue('Synthetic mathematics lesson');
    expect(harness.state.backendWrites).toBe(writesBefore);
    harness.assertHealthy();
  });

  test('hostile stored HTML stays inert through edit, paste, drop, save, reopen, and PDF print', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    harness.state.lessonPlanRows[0].title = '</title><script>titleAttack()</script> Class';
    harness.state.lessonPlanRows[0].objectives = '<div class="ilaw-lesson-plan fixed inset-0"><h2 class="ilaw-title">Science</h2><table class="ilaw-week-table"><tr><td colspan="3">Day one</td></tr></table><p onclick="storedAttack()">Stored</p><script>storedAttack()</script><a href="javascript:storedAttack()">Bad URL</a><p style="color:red">Styled</p></div>';
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: /View and edit.*Class/ }).click();
    const editor = page.getByRole('textbox', { name: 'Lesson plan content' });
    await expect(editor.locator('.ilaw-week-table td[colspan="3"]')).toContainText('Day one');
    await expect(editor.locator('.ilaw-lesson-plan')).toHaveClass('ilaw-lesson-plan');
    await expect(editor.locator('script, [onclick], [style], a[href^="javascript:"]')).toHaveCount(0);

    await editor.evaluate(element => {
      element.focus();
      const paste = new DataTransfer();
      paste.setData('text/html', '<p onmouseover="pasteAttack()"><strong>Pasted</strong><iframe src="https://example.edu"></iframe></p>');
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: paste }));
      const drop = new DataTransfer();
      drop.setData('text/html', '<p style="color:red">Dropped<svg onload="dropAttack()"></svg></p>');
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: drop }));
      const plain = new DataTransfer();
      plain.setData('text/plain', '<b>Plain text</b>\nSecond line');
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: plain }));
    });
    await expect(editor).toContainText('Pasted');
    await expect(editor).toContainText('Dropped');
    await expect(editor).toContainText('<b>Plain text</b>');
    await expect(editor.locator('b')).toHaveCount(0);
    await expect(editor.locator('script, iframe, svg, [onmouseover], [style]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Changes saved.')).toBeVisible();
    const saved = harness.state.lessonPlanRows[0].objectives;
    expect(saved).toContain('Pasted');
    expect(saved).toContain('Dropped');
    expect(saved).not.toMatch(/<script|<iframe|<svg|onmouseover|onclick|style=|javascript:/i);

    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByRole('button', { name: /View and edit.*Class/ }).click();
    await expect(page.getByRole('textbox', { name: 'Lesson plan content' })).toContainText('Pasted');
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Print' }).click();
    const popup = await popupPromise;
    await expect(popup.locator('.ilaw-week-table td[colspan="3"]')).toContainText('Day one');
    const printed = await popup.content();
    expect(printed).toContain('ilaw-week-table');
    expect(printed).toContain('<title>title_script_titleAttack()_script_ Class.pdf</title>');
    expect(printed).not.toMatch(/<script|<iframe|<svg|onmouseover|onclick|style="color:red"|javascript:/i);
    await popup.close();
    expect(harness.state.blockedRequests).toEqual([]);
    harness.assertHealthy();
  });

  test('hostile generated HTML is sanitized before the editor mounts', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherUploadMode: 'success', teacherAiScenario: 'success',
      teacherAiHtml: '<div class="ilaw-lesson-plan"><h2 class="ilaw-title">Generated</h2><p onload="attack()">Safe text</p><script>attack()</script></div>',
    });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.locator('#lesson-pdf-upload').setInputFiles(PDF_FILE);
    await page.getByRole('button', { name: 'Generate lesson plan' }).click();
    const editor = page.getByRole('textbox', { name: 'Lesson plan content' });
    await expect(editor.locator('h2.ilaw-title')).toContainText('Generated');
    await expect(editor.locator('script, [onload]')).toHaveCount(0);
    expect(harness.state.teacherAiCalls).toBe(1);
    expect(harness.state.blockedRequests).toEqual([]);
    harness.assertHealthy();
  });

  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 768, 1024, 1440]) {
      test(`${theme} ${width}px keeps plans and one-click Manual ILAW entry usable`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, {
          role: 'teacher', theme, teacherLessonPlanScenario: true,
        });
        await page.goto('/teacher-dashboard/lesson-plans');
        await expect(page.getByRole('heading', { name: 'Lesson Plans', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Saved lesson plans' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Synthetic science lesson' })).toBeVisible();
        await expect(page.getByRole('listitem').filter({ hasText: 'Synthetic science lesson' }).getByText('published', { exact: true })).toBeVisible();
        await expect(page.getByRole('listitem').filter({ hasText: 'Synthetic mathematics lesson' }).getByText('draft', { exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' })).toBeEnabled();
        await expect(page.getByRole('region', { name: 'Quick Create lesson plan' })).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        mkdirSync('test-results/teacher-qc6', { recursive: true });
        await page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' }).screenshot({ path: `test-results/teacher-qc6/form-${theme}-${width}.png` });
        await page.screenshot({ path: `test-results/teacher-qc3/dashboard-${theme}-${width}.png`, fullPage: true });
        await page.locator('main').evaluate(element => { element.scrollTop = element.scrollHeight; });
        await page.screenshot({ path: `test-results/teacher-qc3/form-${theme}-${width}.png` });
        if (theme === 'light' && width === 360) {
          await page.screenshot({ path: 'test-results/teacher-plans-light-360.png', fullPage: true });
          await page.locator('main').evaluate(element => { element.scrollTop = element.scrollHeight; });
          await page.screenshot({ path: 'test-results/teacher-plans-light-360-lower.png' });
        }
        if (theme === 'dark' && width === 1440) {
          await page.screenshot({ path: 'test-results/teacher-plans-dark-1440.png', fullPage: true });
        }
        await page.getByRole('button', { name: 'View and edit Synthetic science lesson' }).click();
        await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();
        for (const name of ['Print', 'Save Changes']) {
          const action = page.getByRole('button', { name });
          expect((await action.boundingBox()).height).toBeGreaterThanOrEqual(44);
        }
        const editor = page.getByRole('textbox', { name: 'Lesson plan content' });
        await expect(editor).toBeVisible();
        await editor.focus();
        await expect(editor).toBeFocused();
        const editorColors = await editor.evaluate(element => ({
          text: getComputedStyle(element).color,
          background: getComputedStyle(element).backgroundColor,
        }));
        expect(contrast(editorColors.text, editorColors.background)).toBeGreaterThanOrEqual(4.5);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        if ((theme === 'light' && width === 360) || (theme === 'dark' && width === 1440)) {
          await page.locator('main').evaluate(element => { element.scrollTop = 0; });
          await page.screenshot({ path: `test-results/teacher-plans-editor-${theme}-${width}.png` });
        }
        harness.assertHealthy();
      });
    }
  }

  test('search and status filter retain truthful counts and keyboard actions', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    await page.goto('/teacher-dashboard/lesson-plans');
    await expect(page.getByText('2 of 2 plans')).toBeVisible();
    await page.getByLabel('Search lesson plans').fill('science');
    await expect(page.getByText('1 of 2 plans')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Synthetic mathematics lesson' })).toHaveCount(0);
    await page.getByLabel('Filter by status').selectOption('draft');
    await expect(page.getByText('No plans match your search or filters.')).toBeVisible();
    await page.getByLabel('Search lesson plans').fill('');
    await expect(page.getByRole('heading', { name: 'Synthetic mathematics lesson' })).toBeVisible();
    harness.assertHealthy();
  });

  test('long plan titles wrap at 360px without clipping actions', async ({ page }) => {
    const title = 'A very long interdisciplinary science and mathematics lesson plan for several Grade 7 sections';
    const fileName = 'a-very-long-source-curriculum-filename-without-spaces-for-grade-seven-science.pdf';
    await page.setViewportSize({ width: 360, height: 900 });
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, lessonPlanLongTitle: title,
    });
    harness.state.lessonPlanRows[0].file_name = fileName;
    await page.goto('/teacher-dashboard/lesson-plans');
    const heading = page.getByRole('heading', { name: title });
    await expect(heading).toBeVisible();
    expect(await heading.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expect(page.getByRole('button', { name: `View and edit ${title}` })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
    await page.locator('main').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.getByRole('button', { name: `View and edit ${title}` }).click();
    await expect.poll(() => page.locator('main').evaluate(element => element.scrollTop)).toBe(0);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText(fileName)).toBeVisible();
    for (const name of ['Print', 'Save Changes']) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }
    await page.getByRole('button', { name: /Back/ }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Lesson Plan Title' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Print' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Suggested PDF filename' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(361);
    await page.screenshot({ path: 'test-results/teacher-plans-editor-long-title-light-360.png' });
    harness.assertHealthy();
  });

  test('a failed list read stays distinct from empty and supports Retry', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, lessonPlanReadMode: 'failure',
    });
    await page.goto('/teacher-dashboard/lesson-plans');
    await expect(page.getByRole('alert').filter({ hasText: 'Lesson plans could not be loaded' })).toBeVisible();
    await expect(page.getByText('No lesson plans yet.')).toHaveCount(0);
    harness.state.lessonPlanReadMode = 'success';
    await page.getByRole('button', { name: 'Retry lesson plans' }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic science lesson' })).toBeVisible();
    harness.assertHealthy();
  });

  test('loading and a successful empty list have distinct messages', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, lessonPlanReadMode: 'slow', lessonPlanEmpty: true,
    });
    await page.goto('/teacher-dashboard/lesson-plans');
    await expect(page.getByRole('status').filter({ hasText: 'Loading lesson plans' })).toBeVisible();
    await expect(page.getByText('No lesson plans yet.')).toHaveCount(0);
    await expect.poll(() => Boolean(harness.state.releaseLessonPlanRead)).toBe(true);
    harness.state.lessonPlanReadMode = 'success';
    harness.releaseLessonPlanRead();
    await expect(page.getByText('No lesson plans yet. Create one manually or upload a PDF.')).toBeVisible();
    harness.assertHealthy();
  });

  test.skip('retired QC5 active Quick Create assignment selector (isolated component coverage retained)', async ({ page }) => {
    mkdirSync('test-results/teacher-qc6', { recursive: true });
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, lessonPlanWriteMode: 'failure',
    });
    await page.goto('/teacher-dashboard/lesson-plans');
    await expect(page.getByRole('region', { name: 'Quick Create lesson plan' })).toBeVisible();
    const subject = page.getByRole('combobox', { name: 'Assigned Subject *' });
    const grade = page.getByRole('combobox', { name: 'Assigned Grade Level *' });
    await expect(subject).toBeEnabled();
    await expect(subject.locator('option')).toHaveCount(3);
    await subject.selectOption('subject-qa-math');
    await expect(grade.locator('option')).toHaveCount(3);
    await grade.selectOption('Grade 8');
    await subject.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/teacher-qc5/subject-grade-options.png' });
    await page.getByRole('region', { name: 'Quick Create lesson plan' }).screenshot({ path: 'test-results/teacher-qc6/multiple-subject-grade.png' });
    await subject.selectOption('subject-qa-english');
    await expect(grade).toHaveValue('Grade 7');
    await subject.selectOption('subject-qa-math');
    await expect(grade).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Create Temporary Draft' })).toBeDisabled();
    await page.getByRole('textbox', { name: 'Lesson Plan Title *' }).fill('Draft title');
    await page.getByRole('textbox', { name: 'Learning Objectives' }).fill('Describe cells\nCompare cells');
    await expect(page.getByRole('textbox', { name: 'Lesson Plan Title *' })).toHaveValue('Draft title');
    await expect(page.getByRole('textbox', { name: 'Learning Objectives' })).toHaveValue('Describe cells\nCompare cells');
    await page.locator('form[aria-label="Quick Create form"]').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await expect(page.getByRole('status').filter({ hasText: 'Not saved to EduScribe' }).last()).toBeVisible();
    await page.locator('main').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.screenshot({ path: 'test-results/teacher-qc5/assigned-but-guarded.png' });
    expect(harness.state.teacherAssignmentReads).toHaveLength(1);
    expect(harness.state.lessonPlanWrites).toEqual([]);
    harness.assertHealthy();
  });

  test.skip('retired QC6 active Quick Create form (isolated component coverage retained)', async ({ page }) => {
    mkdirSync('test-results/teacher-qc6', { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    await page.goto('/teacher-dashboard/lesson-plans');
    const form = page.getByRole('region', { name: 'Quick Create lesson plan' });
    await expect(form.getByText('Learning Objectives', { exact: true })).toHaveCount(1);
    await expect(form.getByRole('textbox', { name: 'Learning Objectives' })).toBeVisible();
    await expect(form.getByText('Lesson Information')).toBeVisible();
    await expect(form.getByText('Teaching Approach')).toBeVisible();
    await expect(form.getByText('Learning Objectives', { exact: true }).first()).toBeVisible();
    const strategy = form.getByRole('combobox', { name: 'Teaching Strategy' });
    await expect(strategy.locator('option')).toHaveCount(11);
    await strategy.focus();
    await expect(strategy).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(form.getByRole('textbox', { name: 'Learning Objectives' })).toBeFocused();
    await strategy.selectOption('custom');
    await strategy.focus();
    await page.keyboard.press('Tab');
    await expect(form.getByRole('textbox', { name: 'Custom Teaching Strategy' })).toBeFocused();
    await form.getByRole('textbox', { name: 'Custom Teaching Strategy' }).fill('Peer instruction');
    await form.screenshot({ path: 'test-results/teacher-qc6/desktop-custom.png' });
    await strategy.selectOption('Collaborative Learning');
    await expect(form.getByRole('textbox', { name: 'Custom Teaching Strategy' })).toHaveCount(0);
    await strategy.selectOption('custom');
    await expect(form.getByRole('textbox', { name: 'Custom Teaching Strategy' })).toHaveValue('Peer instruction');
    await expect(form.getByRole('button', { name: 'Create Temporary Draft' })).toBeDisabled();
    await page.locator('form[aria-label="Quick Create form"]').evaluate(element => element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await expect(form.getByRole('status')).toContainText('Not saved to EduScribe');
    expect(harness.state.lessonPlanWrites).toEqual([]);
    harness.assertHealthy();
  });

  test.skip('retired active Quick Create assignment error UI (isolated hook coverage retained)', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, teacherAssignmentReadMode: 'failure',
    });
    await page.goto('/teacher-dashboard/lesson-plans');
    await expect(page.getByRole('alert').filter({ hasText: 'Could not load teaching assignments' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Temporary Draft' })).toBeDisabled();
    mkdirSync('test-results/teacher-qc6', { recursive: true });
    await page.getByRole('region', { name: 'Quick Create lesson plan' }).screenshot({ path: 'test-results/teacher-qc6/assignment-error.png' });
    harness.state.teacherAssignmentReadMode = 'success';
    harness.state.teacherAssignmentRows = [];
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText(/No assigned subject for this school year/)).toBeVisible();
    await page.getByRole('region', { name: 'Quick Create lesson plan' }).screenshot({ path: 'test-results/teacher-qc6/no-assignment.png' });
    await expect(page.getByRole('button', { name: 'Create Temporary Draft' })).toBeDisabled();
    await page.locator('main').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.screenshot({ path: 'test-results/teacher-qc5/no-assignment.png' });
    expect(harness.state.teacherAssignmentReads.length).toBeGreaterThanOrEqual(3);
    expect(harness.state.lessonPlanWrites).toEqual([]);
    harness.assertHealthy();
  });

  test.skip('retired active Quick Create loading UI (isolated hook coverage retained)', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, teacherAssignmentReadMode: 'slow',
    });
    await page.goto('/teacher-dashboard/lesson-plans');
    await expect(page.getByRole('status').filter({ hasText: 'Loading assigned subjects' })).toBeVisible();
    mkdirSync('test-results/teacher-qc6', { recursive: true });
    await page.getByRole('region', { name: 'Quick Create lesson plan' }).screenshot({ path: 'test-results/teacher-qc6/assignment-loading.png' });
    await expect(page.getByRole('combobox', { name: 'Assigned Subject *' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Create Temporary Draft' })).toBeDisabled();
    await expect.poll(() => Boolean(harness.state.releaseTeacherAssignmentRead)).toBe(true);
    harness.state.teacherAssignmentReadMode = 'success';
    harness.state.releaseTeacherAssignmentRead();
    await expect(page.getByRole('combobox', { name: 'Assigned Subject *' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Create Temporary Draft' })).toBeDisabled();
    expect(harness.state.lessonPlanWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('editor keeps failed-save edits and confirms before discarding', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, lessonPlanWriteMode: 'failure',
    });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: 'View and edit Synthetic science lesson' }).click();
    const editor = page.getByRole('textbox', { name: 'Lesson plan content' });
    await expect(editor).toBeVisible();
    await editor.fill('Revised objectives');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Your edits are still here' })).toBeVisible();
    await expect(editor).toContainText('Revised objectives');
    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByRole('dialog', { name: 'Confirm lesson plan action' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(editor).toBeVisible();
    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByRole('dialog', { name: 'Confirm lesson plan action' }).getByRole('button', { name: 'Discard changes' }).click();
    await expect(page.getByRole('heading', { name: 'Saved lesson plans' })).toBeVisible();
    expect(harness.state.lessonPlanWrites).toEqual(['PATCH']);
    harness.assertHealthy();
  });

  test.skip('retired Quick Create manual draft guard (active Full Manual ILAW navigation is covered above)', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('textbox', { name: 'Lesson Plan Title *' }).fill('Unsent lesson');
    await page.getByRole('link', { name: 'Students', exact: true }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/teacher-dashboard\/lesson-plans$/);
    await expect(page.getByRole('textbox', { name: 'Lesson Plan Title *' })).toHaveValue('Unsent lesson');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('textbox', { name: 'Lesson Plan Title *' })).toHaveValue('Unsent lesson');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('textbox', { name: 'Lesson Plan Title *' })).toHaveValue('');
    expect(harness.state.lessonPlanWrites).toEqual([]);
    harness.assertHealthy();
  });

  for (const width of [360, 390, 768, 1024, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`active Full Manual ILAW editor at ${width}px in ${theme} mode`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, { role: 'teacher', theme, teacherLessonPlanScenario: true });
        await page.goto('/teacher-dashboard/lesson-plans');
        await expect(page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Quick Create lesson plan' })).toHaveCount(0);
        if (width === 360 || width === 1440) {
          mkdirSync('test-results/teacher-manual-ilaw', { recursive: true });
          await page.screenshot({ path: `test-results/teacher-manual-ilaw/${theme}-${width}-entry.png`, fullPage: true });
        }
        const readsBeforeOpen = harness.state.teacherAssignmentReads.length;
        await page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' }).click();
        await expect(page.getByRole('heading', { name: 'Manual ILAW Editor', level: 1 })).toBeFocused();
        await expect(page.getByRole('region', { name: 'Full Manual ILAW editor' })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: 'Local QA only · Not saved to EduScribe' })).toBeVisible();
        await expect(page.getByText('About this local draft')).toBeVisible();
        await expect(page.getByRole('button', { name: /Create mock snapshot|Post|Distribute/i })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Save Lesson Plan' })).toBeVisible();
        await page.getByRole('textbox', { name: 'Learning Objectives, Monday' }).fill('Synthetic Monday objective');
        await page.getByRole('textbox', { name: 'Learning Objectives, Tuesday' }).fill('Synthetic Tuesday objective');
        await expect(page.getByRole('textbox', { name: 'Learning Objectives, Tuesday' })).toHaveValue('Synthetic Tuesday objective');
        if (width === 360 || width === 1440) {
          await page.screenshot({ path: `test-results/teacher-manual-ilaw/${theme}-${width}-editor.png`, fullPage: true });
        }
        await expect(page.getByRole('button', { name: 'Preview document' })).toHaveCount(0);
        await expect(page.getByRole('textbox', { name: 'Learning Objectives, Monday' })).toHaveValue('Synthetic Monday objective');
        await expect(page.getByRole('textbox', { name: 'Learning Objectives, Tuesday' })).toHaveValue('Synthetic Tuesday objective');
        await expect(page.locator('.full-manual-ilaw .ilaw-template table:visible')).toHaveCount(5);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        expect(overflow).toBe(false);
        if (width === 360 || width === 1440) {
          await page.screenshot({ path: `test-results/teacher-manual-ilaw/${theme}-${width}-editor-fields.png`, fullPage: true });
        }
        if (width === 1440 && theme === 'light') {
          await page.emulateMedia({ media: 'print' });
          await expect(page.locator('.full-manual-ilaw .ilaw-template table:visible')).toHaveCount(5);
          await page.screenshot({ path: 'test-results/teacher-manual-ilaw/print-view.png', fullPage: true });
          await page.pdf({ path: 'test-results/teacher-manual-ilaw/print.pdf', format: 'A4', printBackground: true });
        }
        expect(harness.state.teacherAssignmentReads).toHaveLength(readsBeforeOpen);
        expect(harness.state.lessonPlanWrites).toEqual([]);
        harness.assertHealthy();
      });
    }
  }

  test('active Full Manual ILAW preserves a temporary draft and warns before leaving', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: 'Create Manual ILAW Lesson Plan' }).click();
    await page.getByRole('textbox', { name: 'Name of Lesson' }).fill('Synthetic unsaved plan');
    await page.getByRole('button', { name: '← Back to Lesson Plans' }).click();
    const leaveDialog = page.getByRole('dialog', { name: 'Confirm lesson plan action' });
    await expect(leaveDialog).toContainText('Leave this Manual ILAW document with unsaved changes?');
    await leaveDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('Synthetic unsaved plan');
    await page.getByRole('button', { name: '← Back to Lesson Plans' }).click();
    await page.getByRole('dialog', { name: 'Confirm lesson plan action' }).getByRole('button', { name: 'Leave document' }).click();
    await expect(page.getByRole('button', { name: 'Resume temporary draft' })).toBeFocused();
    await page.getByRole('button', { name: 'Resume temporary draft' }).click();
    await expect(page.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('Synthetic unsaved plan');
    await page.getByRole('link', { name: 'Students', exact: true }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/teacher-dashboard\/lesson-plans$/);
    expect(harness.state.lessonPlanWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('a successful editor save clears the dirty warning', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: 'View and edit Synthetic science lesson' }).click();
    const editor = page.getByRole('textbox', { name: 'Lesson plan content' });
    await editor.fill('Verified revision');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('Changes saved.')).toBeVisible();
    let dialogs = 0;
    page.on('dialog', dialog => { dialogs += 1; dialog.dismiss(); });
    await page.getByRole('button', { name: /Back/ }).click();
    await expect(page.getByRole('heading', { name: 'Saved lesson plans' })).toBeVisible();
    expect(dialogs).toBe(0);
    expect(harness.state.lessonPlanWrites).toEqual(['PATCH']);
    harness.assertHealthy();
  });

  test.skip('retired active Quick Create guarded submit (isolated component coverage retained)', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', teacherLessonPlanScenario: true, lessonPlanWriteMode: 'slow',
    });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('textbox', { name: 'Lesson Plan Title *' }).fill('Unsubmitted manual lesson');
    await expect(page.getByRole('button', { name: 'Create Temporary Draft' })).toBeDisabled();
    await page.locator('form[aria-label="Quick Create form"]').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await expect(page.getByRole('textbox', { name: 'Lesson Plan Title *' })).toHaveValue('Unsubmitted manual lesson');
    expect(harness.state.lessonPlanWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('the existing delete confirmation still removes only the selected plan', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherLessonPlanScenario: true });
    await page.goto('/teacher-dashboard/lesson-plans');
    await page.getByRole('button', { name: 'Delete Synthetic mathematics lesson' }).click();
    await page.getByRole('dialog', { name: 'Confirm lesson plan action' })
      .getByRole('button', { name: 'Delete lesson plan' }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic mathematics lesson' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Synthetic science lesson' })).toBeVisible();
    expect(harness.state.lessonPlanWrites).toEqual(['DELETE']);
    harness.assertHealthy();
  });
});

test.describe('isolated Profile navigation and lifecycle', () => {
  test('text edits cancel and discard without a Profile write', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher' });
    await openSyntheticProfile(page, 'teacher');
    await makeDirty(page);

    const opener = await openLeaveDialog(page);
    await expect(page.getByRole('button', { name: 'Keep Editing' })).toBeFocused();
    await page.getByRole('button', { name: 'Keep Editing' }).click();
    await expect(page.getByLabel('FULL NAME')).toHaveValue('Synthetic Unsaved Name');
    await expect(opener).toBeFocused();

    await opener.click();
    await page.getByRole('button', { name: 'Discard and Leave' }).click();
    await expect(page).toHaveURL(/\/teacher-dashboard\/?$/);
    expect(harness.state.profileWrites).toBe(0);

    await page.getByRole('button', { name: 'Toggle profile menu' }).click();
    await page.getByRole('button', { name: 'Profile Settings' }).click();
    await expect(page.getByLabel('FULL NAME')).toHaveValue(harness.profile.name);
    harness.assertHealthy();
  });

  test('a staged photo survives cancel, is released on discard, and never calls Storage delete', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher' });
    await openSyntheticProfile(page, 'teacher');
    const blobUrl = await stagePhoto(page);

    const opener = await openLeaveDialog(page);
    await page.getByRole('button', { name: 'Keep Editing' }).click();
    await expect(profileAvatar(page)).toHaveAttribute('src', blobUrl);

    await opener.click();
    await page.getByRole('button', { name: 'Discard and Leave' }).click();
    await expect(page).toHaveURL(/\/teacher-dashboard\/?$/);
    expect(harness.state.storageUploads).toBe(0);
    expect(harness.state.storageDeletes).toBe(0);
    const blobStillReadable = await page.evaluate(async (url) => {
      try { await fetch(url); return true; } catch { return false; }
    }, blobUrl);
    expect(blobStillReadable).toBe(false);
    harness.assertHealthy();
  });

  test('clean, Back, Forward, Change Password, and dirty logout navigation remain coherent', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher' });
    await page.goto('/teacher-dashboard');
    await page.getByRole('button', { name: 'Toggle profile menu' }).click();
    await page.getByRole('button', { name: 'Profile Settings' }).click();
    await expect(page.getByLabel('FULL NAME')).toBeVisible();

    await makeDirty(page, 'History Draft');
    const firstBack = page.goBack().catch(() => null);
    await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep Editing' }).click();
    await firstBack;
    await expect(page.getByLabel('FULL NAME')).toHaveValue('History Draft');

    const confirmedBack = page.goBack().catch(() => null);
    await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Discard and Leave' }).click();
    await confirmedBack;
    await expect(page).toHaveURL(/\/teacher-dashboard\/?$/);

    await page.goForward();
    await expect(page).toHaveURL(/\/teacher-dashboard\/profile/);
    await makeDirty(page, 'Password Navigation Draft');
    await page.getByRole('button', { name: 'Change Password' }).click();
    await page.getByRole('button', { name: 'Discard and Leave' }).click();
    await expect(page).toHaveURL(/\/change-password/);

    await page.goBack();
    await expect(page.getByLabel('FULL NAME')).toBeVisible();
    await makeDirty(page, 'Logout Draft');
    const logout = page.getByRole('button', { name: 'Logout' });
    await logout.click();
    await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
    await page.getByRole('button', { name: 'Discard and Leave' }).click();
    await expect(page.getByRole('dialog', { name: 'Log out of EduScribe?' })).toBeVisible();
    expect(harness.state.authLogouts).toBe(0);
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(harness.state.authLogouts).toBe(1);
    harness.assertHealthy();
  });

  test('Main Admin local page changes use the same Profile guard', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'main_admin' });
    await openSyntheticProfile(page, 'main_admin');
    await makeDirty(page, 'Admin Draft');
    await openLeaveDialog(page, 'main_admin');
    await page.getByRole('button', { name: 'Keep Editing' }).click();
    await expect(page.getByLabel('FULL NAME')).toHaveValue('Admin Draft');
    const overview = await openDashboardNavigation(page, 'main_admin');
    await overview.click();
    await page.getByRole('button', { name: 'Discard and Leave' }).click();
    await expect(page.locator('.page-title').first()).toHaveText('Dashboard Overview');
    expect(harness.state.profileWrites).toBe(0);
    harness.assertHealthy();
  });
});

test.describe('isolated Profile saves and failures', () => {
  test('text and photo saves update through mocks and clear dirty state', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher' });
    await openSyntheticProfile(page, 'teacher');

    await page.getByLabel('FULL NAME').fill('Saved Synthetic Name');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('status')).toContainText('Profile updated successfully');
    await expect(page.getByText('You have unsaved Profile changes.')).toHaveCount(0);
    expect(harness.state.profileWrites).toBe(1);

    await stagePhoto(page, 'replacement.png');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('status')).toContainText('Profile updated successfully');
    expect(harness.state.storageUploads).toBe(1);
    expect(harness.state.profileWrites).toBe(2);
    expect(harness.state.storageDeletes).toBe(1);
    harness.assertHealthy();
  });

  for (const scenario of [
    ['Profile update failure', { profileWriteMode: 'failure' }, 'Your profile could not be updated'],
    ['photo-limit rejection', { profileWriteMode: 'photo-limit' }, 'Photo change limit reached'],
    ['expired session', { profileWriteMode: 'expired' }, 'Your session expired'],
  ]) {
    test(scenario[0], async ({ page }) => {
      const harness = await installProfileMocks(page, { role: 'teacher', ...scenario[1] });
      await openSyntheticProfile(page, 'teacher');
      await stagePhoto(page);
      await page.getByRole('button', { name: 'Save Changes' }).click();
      await expect(page.getByRole('alert')).toContainText(scenario[2]);
      await expect(page.getByText('You have unsaved Profile changes.')).toBeVisible();
      await expect(page.locator('form[aria-busy="true"]')).toHaveCount(0);
      expect(await beforeUnloadPrevented(page)).toBe(true);
      await expect(page.getByText(/Profile updated successfully/)).toHaveCount(0);
      expect(harness.state.storageUploads).toBe(1);
      expect(harness.state.storageDeletes).toBe(1);
      harness.assertHealthy();
    });
  }

  test('upload failure never reports success or attempts cleanup', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', uploadMode: 'failure' });
    await openSyntheticProfile(page, 'teacher');
    await stagePhoto(page);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('alert')).toContainText('could not be uploaded');
    expect(harness.state.profileWrites).toBe(0);
    expect(harness.state.storageDeletes).toBe(0);
    harness.assertHealthy();
  });

  test('rollback cleanup failure is reported without hiding the Profile failure', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'teacher', profileWriteMode: 'failure', deleteMode: 'failure',
    });
    await openSyntheticProfile(page, 'teacher');
    await stagePhoto(page);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('alert')).toContainText('could not be removed automatically');
    expect(harness.state.storageDeletes).toBe(1);
    harness.assertHealthy();
  });

  test('old-photo cleanup failure preserves the successful replacement', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', deleteMode: 'failure' });
    await openSyntheticProfile(page, 'teacher');
    await stagePhoto(page, 'replacement-with-cleanup-warning.png');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByRole('status')).toContainText('Profile updated successfully');
    await expect(page.getByRole('status')).toContainText('previous photo could not be removed automatically');
    await expect(page.getByText('You have unsaved Profile changes.')).toHaveCount(0);
    await expect(page.locator('form[aria-busy="true"]')).toHaveCount(0);
    expect(harness.state.storageUploads).toBe(1);
    expect(harness.state.profileWrites).toBe(1);
    expect(harness.state.storageDeletes).toBe(1);
    harness.assertHealthy();
  });

  test('slow save prevents duplicate writes and unsafe navigation', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', profileWriteMode: 'slow' });
    await openSyntheticProfile(page, 'teacher');
    await makeDirty(page, 'Slow Save');
    const save = page.getByRole('button', { name: 'Save Changes' });
    await save.click();
    await page.locator('form[aria-busy="true"]').waitFor();
    await page.locator('form').evaluate((form) => form.requestSubmit());
    await expect.poll(() => harness.state.profileWrites).toBe(1);

    const destination = await openDashboardNavigation(page);
    await destination.click();
    await expect(page.getByRole('dialog', { name: 'Profile save in progress' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Discard and Leave' })).toHaveCount(0);
    harness.releaseSlowWrite();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/teacher-dashboard\/profile/);
    harness.assertHealthy();
  });

  test('Teacher logout remains blocked while a Profile save is pending', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', profileWriteMode: 'slow' });
    await openSyntheticProfile(page, 'teacher');
    await makeDirty(page, 'Pending logout draft');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.locator('form[aria-busy="true"]').waitFor();
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByRole('dialog', { name: 'Profile save in progress' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Log out of EduScribe?' })).toHaveCount(0);
    expect(harness.state.authLogouts).toBe(0);
    harness.releaseSlowWrite();
    await expect(page.getByRole('dialog', { name: 'Profile save in progress' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/teacher-dashboard\/profile/);
    expect(harness.state.authLogouts).toBe(0);
    harness.assertHealthy();
  });
});

test.describe('isolated Profile accessibility and unload behavior', () => {
  test('keyboard focus, trapping, Escape, restoration, and visible focus work in Chrome', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher' });
    await openSyntheticProfile(page, 'teacher');

    const photoButton = page.getByRole('button', { name: 'Change profile photo' });
    await photoButton.focus();
    const fileChooser = page.waitForEvent('filechooser');
    await page.keyboard.press('Enter');
    await (await fileChooser).setFiles({ name: 'keyboard-photo.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('You have unsaved Profile changes.')).toBeVisible();

    const opener = await openDashboardNavigation(page);
    await opener.click();
    await expect(page.getByRole('button', { name: 'Keep Editing' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Discard and Leave' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Keep Editing' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
    const outline = await opener.evaluate((node) => getComputedStyle(node).outlineWidth);
    expect(parseFloat(outline)).toBeGreaterThanOrEqual(2);
    harness.assertHealthy();
  });

  test('beforeunload eligibility follows clean, dirty, restored, and saving state', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', profileWriteMode: 'slow' });
    await openSyntheticProfile(page, 'teacher');
    expect(await beforeUnloadPrevented(page)).toBe(false);
    await makeDirty(page, 'Unload Draft');
    expect(await beforeUnloadPrevented(page)).toBe(true);
    await page.getByLabel('FULL NAME').fill(harness.profile.name);
    await expect(page.getByText('You have unsaved Profile changes.')).toHaveCount(0);
    expect(await beforeUnloadPrevented(page)).toBe(false);

    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.locator('form[aria-busy="true"]').waitFor();
    expect(await beforeUnloadPrevented(page)).toBe(true);
    harness.releaseSlowWrite();
    await expect(page.locator('form[aria-busy="true"]')).toHaveCount(0);
    expect(await beforeUnloadPrevented(page)).toBe(false);
    harness.assertHealthy();
  });
});

test.describe('isolated Teacher Attendance', () => {
  test('a delayed older date cannot replace the selected date attendance', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherAttendanceScenario: true });
    let releaseOlderRead;
    let olderReadStarted;
    const olderStarted = new Promise(resolve => { olderReadStarted = resolve; });
    const olderRead = new Promise(resolve => { releaseOlderRead = resolve; });
    await page.route('**/rest/v1/attendance?**', async route => {
      const date = new URL(route.request().url()).searchParams.get('date');
      if (date === 'eq.2026-10-01') {
        olderReadStarted();
        await olderRead;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
          { student_id: 'student-qa-1', section_id: 'section-qa-1', status: 'Present' },
        ]) });
      } else if (date === 'eq.2026-10-02') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
          { student_id: 'student-qa-1', section_id: 'section-qa-1', status: 'Absent' },
        ]) });
      } else await route.fallback();
    });
    await page.goto('/teacher-dashboard/attendance');
    const date = page.getByLabel('Date', { exact: true });
    await expect(date).toBeEnabled();
    await date.fill('2026-10-01');
    await olderStarted;
    // Bypass the deliberate loading lock only to simulate two requests racing.
    await date.evaluate(element => { element.disabled = false; });
    await date.fill('2026-10-02');
    await expect(page.getByRole('table').getByText('Saved: Absent')).toBeVisible();
    const olderResponse = page.waitForResponse(response => response.url().includes('attendance?')
      && response.url().includes('2026-10-01'));
    releaseOlderRead();
    await olderResponse;
    await page.waitForTimeout(100);
    await expect(page.getByRole('table').getByText('Saved: Absent')).toBeVisible();
    await expect(date).toHaveValue('2026-10-02');
    expect(harness.state.attendanceWrites).toEqual([]);
    harness.assertHealthy();
  });

  test('defaults to the Manila school date and preserves a selected date', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherAttendanceScenario: true });
    await page.clock.setFixedTime(new Date('2026-10-16T16:00:00.000Z'));
    await page.goto('/teacher-dashboard/attendance');
    const date = page.getByLabel('Date', { exact: true });
    await expect(date).toHaveValue('2026-10-17');
    await date.fill('2026-12-30');
    await expect(date).toHaveValue('2026-12-30');
    await expect(page.getByRole('heading', { name: 'Attendance', exact: true })).toBeVisible();
    expect(harness.state.attendanceWrites).toEqual([]);
    harness.assertHealthy();
  });

  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 768, 1024, 1440]) {
      test(`${theme} ${width}px roster and controls`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, { role: 'teacher', theme, teacherAttendanceScenario: true });
        await page.goto('/teacher-dashboard/attendance');
        await expect(page.getByRole('heading', { name: 'Attendance', exact: true })).toBeVisible();
        await expect(page.getByLabel('Date', { exact: true })).toBeVisible();
        const roster = width < 768 ? page.getByRole('list', { name: 'Attendance roster' }) : page.getByRole('table');
        await expect(roster.getByText('Alexandria Verylongname-Santos')).toBeVisible();
        await expect(page.getByText('No attendance marked for this date yet')).toBeVisible();
        await expect(page.getByText('Export is unavailable.')).toBeVisible();
        await expect(page.getByRole('button', { name: /Export/ })).toHaveCount(0);
        if (width < 768) {
          await expect(page.getByRole('list', { name: 'Attendance roster' })).toBeVisible();
        } else {
          await expect(page.getByRole('columnheader', { name: 'Saved status' })).toBeVisible();
        }
        const mark = page.getByRole('button', { name: 'Mark Alexandria Verylongname-Santos Present' });
        await expect(mark).toHaveAttribute('aria-pressed', 'false');
        expect((await mark.boundingBox()).height).toBeGreaterThanOrEqual(44);
        await mark.focus();
        await expect(mark).toBeFocused();
        expect(parseFloat(await mark.evaluate(node => getComputedStyle(node).outlineWidth))).toBeGreaterThanOrEqual(2);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        await page.screenshot({ path: testInfo.outputPath(`attendance-${theme}-${width}.png`), fullPage: true });
        harness.assertHealthy();
      });
    }
  }

  for (const theme of ['light', 'dark']) {
    for (const width of [360, 1024]) {
      test(`${theme} ${width}px shows confirmed status with a selected tint, border, and label`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        const harness = await installProfileMocks(page, { role: 'teacher', theme, teacherAttendanceScenario: true, attendanceExisting: true });
        await page.goto('/teacher-dashboard/attendance');
        const roster = width < 768 ? page.getByRole('list', { name: 'Attendance roster' }) : page.getByRole('table');
        const selected = page.getByRole('button', { name: 'Mark Alexandria Verylongname-Santos Present' });
        const unselected = page.getByRole('button', { name: 'Mark Alexandria Verylongname-Santos Absent' });
        await expect(selected).toHaveAttribute('aria-pressed', 'true');
        await expect(unselected).toHaveAttribute('aria-pressed', 'false');
        await expect(roster.getByText('Saved: Present')).toBeVisible();
        const selectedStyle = await selected.evaluate(element => ({
          background: getComputedStyle(element).backgroundColor,
          borderWidth: getComputedStyle(element).borderWidth,
        }));
        expect(selectedStyle.background).not.toBe(await unselected.evaluate(element => getComputedStyle(element).backgroundColor));
        expect(selectedStyle.borderWidth).toBe('2px');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
        await page.screenshot({ path: testInfo.outputPath(`attendance-selected-${theme}-${width}.png`), fullPage: true });
        harness.assertHealthy();
      });
    }
  }

  for (const status of ['Present', 'Absent', 'Late', 'Excused']) {
    test(`${status} is blocked without trusted attendance persistence`, async ({ page }) => {
      const harness = await installProfileMocks(page, { role: 'teacher', teacherAttendanceScenario: true });
      await page.goto('/teacher-dashboard/attendance');
      const mark = page.getByRole('button', { name: `Mark Alexandria Verylongname-Santos ${status}` });
      await mark.click();
      await expect(mark).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByText(/Attendance saving is unavailable/)).toBeVisible();
      expect(harness.state.attendanceWrites).toHaveLength(0);
      harness.assertHealthy();
    });
  }

  test.skip('an unverified save keeps durable refresh guidance without claiming success', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherAttendanceScenario: true, attendanceWriteMode: 'slow' });
    await page.goto('/teacher-dashboard/attendance');
    const mark = page.getByRole('button', { name: 'Mark Alexandria Verylongname-Santos Present' });
    await mark.click();
    await expect(mark).toBeDisabled();
    harness.state.attendanceReadMode = 'records-failure';
    harness.releaseAttendanceWrite();
    await expect(page.getByRole('alert').filter({ hasText: 'The save may have completed' })).toBeVisible();
    await expect(page.getByText('Present saved for Alexandria Verylongname-Santos.')).toHaveCount(0);
    harness.state.attendanceReadMode = 'success';
    await page.getByRole('button', { name: 'Refresh date' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'The save may have completed' })).toHaveCount(0);
    await expect(page.getByRole('table').getByText('Saved: Present')).toBeVisible();
    harness.assertHealthy();
  });

  test.skip('save serializes rows, prevents duplicate submission, and updates only after success', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherAttendanceScenario: true, attendanceWriteMode: 'slow' });
    await page.goto('/teacher-dashboard/attendance');
    const mark = page.getByRole('button', { name: 'Mark Alexandria Verylongname-Santos Present' });
    await mark.click();
    await expect(page.getByRole('table').getByText('Saving Alexandria Verylongname-Santos…')).toBeVisible();
    await expect(mark).toBeDisabled();
    await expect(mark).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('table').getByText('Not marked').first()).toBeVisible();
    await expect(page.getByLabel('Date', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Mark Bianca Cruz Absent' })).toBeDisabled();
    expect(harness.state.attendanceWrites).toHaveLength(1);
    expect(harness.state.attendanceWrites[0].payload[0].status).toBe('Present');
    expect(harness.state.attendanceWrites[0].payload[0].section_id).toBe('section-qa-1');
    harness.releaseAttendanceWrite();
    await expect(mark).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('table').getByText('Saved: Present')).toBeVisible();
    await expect(page.getByRole('table').getByText('Saving Alexandria Verylongname-Santos…')).toHaveCount(0);
    expect(harness.state.attendanceWrites).toHaveLength(1);
    harness.assertHealthy();
  });

  test.skip('failed save keeps previous status and offers a row retry', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherAttendanceScenario: true, attendanceExisting: true, attendanceWriteMode: 'failure' });
    await page.goto('/teacher-dashboard/attendance');
    await page.getByRole('button', { name: 'Mark Alexandria Verylongname-Santos Late' }).click();
    await expect(page.getByRole('button', { name: 'Retry for Alexandria Verylongname-Santos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark Alexandria Verylongname-Santos Present' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('table').getByText('Saved: Present')).toBeVisible();
    expect(harness.state.attendanceWrites[0].method).toBe('PATCH');
    harness.state.attendanceWriteMode = 'success';
    await page.getByRole('button', { name: 'Retry for Alexandria Verylongname-Santos' }).click();
    await expect(page.getByRole('button', { name: 'Mark Alexandria Verylongname-Santos Late' })).toHaveAttribute('aria-pressed', 'true');
    expect(harness.state.attendanceWrites).toHaveLength(2);
    harness.assertHealthy();
  });

  test.skip('a successful HTTP response without a matching update never claims saved', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherAttendanceScenario: true,
      attendanceExisting: true, attendanceWriteMode: 'no-match' });
    await page.goto('/teacher-dashboard/attendance');
    await page.getByRole('button', { name: 'Mark Alexandria Verylongname-Santos Late' }).click();
    await expect(page.getByRole('button', { name: 'Retry for Alexandria Verylongname-Santos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark Alexandria Verylongname-Santos Present' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('table').getByText('Saved: Present')).toBeVisible();
    await expect(page.getByText('Late saved for Alexandria Verylongname-Santos.')).toHaveCount(0);
    harness.assertHealthy();
  });

  test.skip('keyboard marking and changing dates load the matching saved records', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherAttendanceScenario: true, attendanceExisting: true });
    await page.goto('/teacher-dashboard/attendance');
    const mark = page.getByRole('button', { name: 'Mark Alexandria Verylongname-Santos Absent' });
    await mark.focus();
    await page.keyboard.press('Enter');
    await expect(mark).toHaveAttribute('aria-pressed', 'true');
    expect(harness.state.attendanceWrites).toHaveLength(1);
    expect(harness.state.attendanceWrites[0].method).toBe('PATCH');
    await page.getByLabel('Date', { exact: true }).fill('2020-01-01');
    await expect(page.getByRole('table').getByText('Not marked').first()).toBeVisible();
    await expect(page.getByText('No attendance marked for this date yet')).toBeVisible();
    harness.assertHealthy();
  });

  test('attendance-record failure never appears as an empty or unmarked class', async ({ page }) => {
    const harness = await installProfileMocks(page, { role: 'teacher', teacherAttendanceScenario: true, attendanceReadMode: 'records-failure' });
    await page.goto('/teacher-dashboard/attendance');
    await expect(page.getByText('Could not load attendance for this date.')).toBeVisible();
    await expect(page.getByText('No attendance marked for this date yet')).toHaveCount(0);
    harness.state.attendanceReadMode = 'success';
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('table').getByText('Alexandria Verylongname-Santos')).toBeVisible();
    harness.assertHealthy();
  });

  test('empty sections, empty roster, and failed read remain distinct', async ({ page }) => {
    const noSection = await installProfileMocks(page, { role: 'teacher', teacherAttendanceScenario: true, attendanceNoSection: true });
    await page.goto('/teacher-dashboard/attendance');
    await expect(page.getByText('You have no advisory section assigned yet.')).toBeVisible();
    noSection.assertHealthy();

    const emptyPage = await page.context().newPage();
    const empty = await installProfileMocks(emptyPage, { role: 'teacher', teacherAttendanceScenario: true, attendanceEmpty: true });
    await emptyPage.goto('/teacher-dashboard/attendance');
    await expect(emptyPage.getByText('No students are enrolled in this advisory section.')).toBeVisible();
    empty.assertHealthy();

    const failedPage = await page.context().newPage();
    const failed = await installProfileMocks(failedPage, { role: 'teacher', teacherAttendanceScenario: true, attendanceReadMode: 'failure' });
    await failedPage.goto('/teacher-dashboard/attendance');
    await expect(failedPage.getByText('Could not load attendance for this date.')).toBeVisible();
    failed.state.attendanceReadMode = 'success';
    await failedPage.getByRole('button', { name: 'Retry' }).click();
    await expect(failedPage.getByRole('table').getByText('Alexandria Verylongname-Santos')).toBeVisible();
    failed.assertHealthy();
  });
});

test.describe('isolated Profile fixture states and cross-role integration', () => {
  test('loading and Profile read failure states fail closed', async ({ page }) => {
    const slowHarness = await installProfileMocks(page, { role: 'teacher', profileReadMode: 'slow' });
    await page.goto('/teacher-dashboard/profile');
    await expect(page.locator('.animate-spin')).toBeVisible();
    await expect.poll(() => typeof slowHarness.state.releaseProfileRead).toBe('function');
    slowHarness.state.releaseProfileRead();
    await expect(page.getByRole('heading', { name: 'Profile Settings', exact: true })).toBeVisible();
    slowHarness.assertHealthy();

    const failedPage = await page.context().newPage();
    const failedHarness = await installProfileMocks(failedPage, { role: 'teacher', profileReadMode: 'failure' });
    await failedPage.goto('/teacher-dashboard/profile');
    await expect(failedPage).toHaveURL(/\/login$/);
    await expect(failedPage.getByText('Profile Settings', { exact: true })).toHaveCount(0);
    failedHarness.assertHealthy();
  });

  test('partial, no-photo, and photo-limit states are truthful', async ({ page }) => {
    const harness = await installProfileMocks(page, {
      role: 'student',
      profile: {
        phone: null, date_of_birth: null, address: null, bio: null, photo_url: '',
        photo_change_count: 3, photo_change_window_start: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    await openSyntheticProfile(page, 'student');
    await expect(page.getByLabel('PHONE NUMBER')).toHaveValue('');
    await expect(page.getByLabel('DATE OF BIRTH')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Change profile photo' })).toBeDisabled();
    await expect(page.getByText(/Photo change limit reached/)).toBeVisible();
    expect(harness.state.storageSigns).toBe(0);
    harness.assertHealthy();
  });

  for (const role of ['main_admin', 'teacher', 'student', 'registrar', 'faculty']) {
    test(`${role} renders the shared Profile and logs out through its existing shell`, async ({ page }) => {
      const harness = await installProfileMocks(page, { role, profile: { photo_url: '' } });
      await openSyntheticProfile(page, role);
      await expect(page.getByText(harness.profile.email)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();

      const logout = page.getByRole('button', { name: 'Logout' });
      if (!(await logout.isVisible())) {
        const opener = page.getByRole('button', { name: /Open navigation/ });
        if (await opener.isVisible()) await opener.click();
      }
      await page.getByRole('button', { name: 'Logout' }).click();
      if (role === 'main_admin') {
        await page.getByRole('button', { name: 'Sign Out' }).click();
      } else if (role === 'teacher') {
        await page.getByRole('dialog', { name: 'Log out of EduScribe?' })
          .getByRole('button', { name: 'Log out', exact: true }).click();
      }
      await expect(page).toHaveURL(/\/login/);
      expect(harness.state.authLogouts).toBe(1);
      harness.assertHealthy();
    });
  }
});
