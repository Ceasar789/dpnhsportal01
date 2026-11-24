// R39 (4h): the optional assessment purpose is validated and reaches the prompt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayTaskHandler } from './dayTasks.js';
import { buildDayTaskPrompt, PURPOSE_LINES } from '../lib/dayTaskPrompts.js';

const teacherId = '11111111-1111-4111-8111-111111111111';
const planId = 'aaaaaaaa-2222-4222-8222-222222222222';
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => ({ day, objective: `Describe ${day} cells`,
  activity: `Observe ${day} cells`, assessment: `Explain ${day} cells` }));
const plan = { id: planId, teacher_id: teacherId, status: 'draft', title: 'Cells', subject: 'Science',
  grade_level: 'Grade 7', objectives: '<p>saved</p>', ai_generated: true };
const activityJson = JSON.stringify({ language: 'en', title: 'Cell map', objective: 'Describe cells.', materials: [],
  procedure: ['Draw.', 'Label.', 'Share.'], grouping: 'Pairs', durationMinutes: 20,
  successCriteria: ['Correct labels.', 'Clear explanation.'] });
const fakeRes = () => {
  const res = { statusCode: 200, body: null, writableEnded: false,
    status(code) { res.statusCode = code; return res; },
    json(value) { res.body = value; res.writableEnded = true; return res; },
    on() { return res; } };
  return res;
};
const invoke = async (body) => {
  const provider = [];
  const res = fakeRes();
  await dayTaskHandler({ user: { id: teacherId }, body }, res, {
    loadPlan: async () => plan, resolveSource: () => days, log: { error() {} },
    requestJson: async (...args) => { provider.push(args); return activityJson; },
  });
  return { status: res.statusCode, body: res.body, provider };
};
const body = extra => ({ lessonPlanId: planId, day: 'Tuesday', taskType: 'activity', ...extra });

test('a purpose that does not fit the task type, or an unknown purpose, is a 400 with no AI call', async () => {
  for (const bad of [body({ purpose: 'summative' }), body({ purpose: 'essay' }), body({ purpose: 'quiz' }),
    body({ taskType: 'assignment', purpose: 'formative' }), body({ purpose: null }), body({ purpose: 'Formative' })]) {
    const result = await invoke(bad);
    assert.equal(result.status, 400, JSON.stringify(bad));
    assert.equal(result.body.code, 'INVALID_REQUEST');
    assert.equal(result.provider.length, 0);
  }
});

test('a fitting purpose is accepted and its line is in the prompt sent to the provider', async () => {
  const result = await invoke(body({ purpose: 'formative' }));
  assert.equal(result.status, 200);
  assert.equal(result.provider.length, 1);
  assert.ok(JSON.stringify(result.provider[0]).includes('Assessment purpose: formative.'));
});

test('no purpose: the prompt is exactly as before', () => {
  const source = days[1];
  const task = { taskType: 'activity', day: 'Tuesday' };
  const before = buildDayTaskPrompt(task, plan, source);
  assert.ok(!before.includes('Assessment purpose'));
  assert.equal(buildDayTaskPrompt({ ...task, purpose: 'formative' }, plan, source), `${before}\n${PURPOSE_LINES.formative}`);
  assert.deepEqual(Object.keys(PURPOSE_LINES), ['formative', 'summative', 'essay']);
});
