// Phase 5: teacher flows of this run in a real browser, production build, isolated mocks:
// 4c Worksheets status filter, 4h Type of assessment, 4i out-of-sync note, 4g Edit as manual, 4k Word downloads.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installProfileMocks, syntheticProfile } from './profile-mock-fixture.js';

const TEACHER = syntheticProfile('teacher').id;
const PLAN_ID = '0e2e0000-0000-4000-8000-0000000e0001';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const field = (section, label, values) => `<div class="${section}"><div class="ilaw-field"><span class="ilaw-label">${label}</span><table><tr>${DAYS.map(d => `<th>${d}</th>`).join('')}</tr><tr>${values.map(v => `<td>${v}</td>`).join('')}</tr></table></div></div>`;
const PLAN_HTML = field('ilaw-I', 'Learning Objectives', DAYS.map(d => `Describe states of matter on ${d}`))
  + field('ilaw-L', 'Flow', DAYS.map(d => `Group lab on ${d}`)) + field('ilaw-A', 'Formative Assessment', DAYS.map(d => `Exit ticket on ${d}`));
const PLAN = { id: PLAN_ID, teacher_id: TEACHER, title: 'States of Matter', subject: 'Science', grade_level: 'Grade 7', ai_generated: true,
  status: 'draft', objectives: PLAN_HTML, created_at: '2026-11-01T08:00:00', updated_at: '2026-11-20T08:00:00' };
const SHEETS = [
  { id: '0e2e0000-0000-4000-8000-0000000e0101', teacher_id: TEACHER, title: 'Matter quiz', subject: 'Science', origin: 'manual', task_type: 'quiz',
    items: 1, source_lesson_plan_id: PLAN_ID, collection_id: null, created_at: '2026-11-10T08:00:00' },
];
const ITEMS = [{ id: '0e2e0000-0000-4000-8000-0000000e0201', worksheet_id: SHEETS[0].id, position: 1, question: 'Ice is water in which state?',
  item_type: 'multiple_choice', options: ['Solid', 'Liquid', 'Gas', 'Plasma'], points: 1 }];

const install = async (page) => {
  const harness = await installProfileMocks(page, { role: 'teacher' });
  const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/rest/v1/lesson_plans*', route => (route.request().method() === 'GET' ? json(route, [PLAN]) : route.fallback()));
  await page.route('**/rest/v1/worksheets*', route => (route.request().method() === 'GET' ? json(route, SHEETS) : route.fallback()));
  await page.route('**/rest/v1/worksheet_items*', route => json(route, ITEMS));
  await page.route('**/rest/v1/worksheet_item_keys*', route => json(route, [{ item_id: ITEMS[0].id, correct_answer: 'Solid' }]));
  return harness;
};
const docxText = async (download) => readFileSync(await download.path()).toString('utf8');

test('Worksheets: status chips and the Word copies (Student copy / Key to correction)', async ({ page }) => {
  await install(page);
  await page.goto('/teacher-dashboard/worksheets');
  await expect(page.getByRole('heading', { name: 'Matter quiz' })).toBeVisible();
  const status = page.getByRole('group', { name: 'Filter worksheets by status' });
  await expect(status.getByRole('button')).toHaveText(['All', 'Drafts', 'Saved', 'Distributed']);
  const downloads = page.getByRole('group', { name: 'Download Matter quiz' });
  let wait = page.waitForEvent('download');
  await downloads.getByRole('button', { name: 'Student copy (.docx)' }).click();
  let file = await wait;
  expect(file.suggestedFilename()).toBe('Matter quiz - Student copy.docx');
  let text = await docxText(file);
  expect(text).toContain('Ice is water in which state?');
  expect(text).not.toContain('Answer: Solid');
  wait = page.waitForEvent('download');
  await downloads.getByRole('button', { name: 'Key to correction (.docx)' }).click();
  file = await wait;
  expect(await docxText(file)).toContain('Answer: Solid');
  await status.getByRole('button', { name: 'Drafts' }).click();
  await expect(page.getByRole('heading', { name: 'Matter quiz' })).toHaveCount(0);
});

test('Lesson Plans: out of sync note, Edit as manual copy, Download Word, Type of assessment', async ({ page }) => {
  await install(page);
  await page.goto('/teacher-dashboard/lesson-plans');
  const card = page.locator('li', { has: page.getByRole('heading', { name: 'States of Matter' }) });
  await expect(card.getByRole('note')).toContainText('This plan changed after a worksheet was made from it.');
  const wait = page.waitForEvent('download');
  await card.getByRole('button', { name: /^Download Word/ }).click();
  expect((await wait).suggestedFilename()).toBe('States of Matter.docx');
  await card.getByRole('button', { name: /^Sync worksheet/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^Tuesday/ }).click();
  await dialog.getByRole('button', { name: /^Quiz/ }).click();
  await expect(dialog.getByRole('group', { name: 'Type of assessment' })).toBeVisible();
  await dialog.getByRole('button', { name: /^Summative/ }).click();
  await expect(dialog.getByRole('button', { name: /^Summative/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
});

test('Edit as manual opens a filled Manual ILAW copy and writes nothing', async ({ page }) => {
  const writes = [];
  page.on('request', req => { if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method()) && req.url().includes('/rest/v1/')) writes.push(req.url()); });
  await install(page);
  await page.goto('/teacher-dashboard/lesson-plans');
  await page.locator('li', { has: page.getByRole('heading', { name: 'States of Matter' }) }).getByRole('button', { name: /^Edit as manual/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Manual ILAW Editor' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Name of Lesson' })).toHaveValue('States of Matter');
  await expect(page.getByRole('textbox', { name: 'Learning Objectives, Monday' })).toHaveValue('Describe states of matter on Monday');
  expect(writes).toEqual([]);
});
