import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDayTask, renderActivityInstructions } from './dayTaskGenerator.js';
import { DAY_TASK_SCHEMAS } from './dayTaskPrompts.js';

const plan = { id: 'plan-1', title: 'Cells', subject: 'Science', grade_level: 'Grade 7' };
const source = { day: 'Monday', objective: 'Describe cells', activity: 'Observe cells', assessment: 'Explain cells' };
const activity = { language: 'en', title: 'Cell map', objective: 'Describe cells.', materials: ['Paper', 'Pens'],
  procedure: ['1. Draw a cell.', '2) Label it.', 'Share it.'], grouping: 'Pairs', durationMinutes: 20,
  successCriteria: ['Labels are correct.', 'Parts are explained.'] };
const quiz = { title: 'Quiz', directions: 'Answer.', questions: [
  { question: 'Cells are alive.', item_type: 'true_false', options: [], correct_answer: 'True' },
] };

test('activity instructions are rendered in code and numbered once', () => {
  assert.equal(renderActivityInstructions(activity), [
    'Objective: Describe cells.', 'Grouping: Pairs', 'Duration: 20 minutes',
    'Materials:', '- Paper', '- Pens',
    'Procedure:', '1. Draw a cell.', '2. Label it.', '3. Share it.',
    'Success criteria:', '- Labels are correct.', '- Parts are explained.',
  ].join('\n'));
  assert.doesNotMatch(renderActivityInstructions({ ...activity, materials: [] }), /Materials:/);
});

test('language fil renders Filipino labels and en keeps English ones', () => {
  const filipino = renderActivityInstructions({ ...activity, language: 'fil' });
  assert.equal(filipino, [
    'Layunin: Describe cells.', 'Pagpapangkat: Pairs', 'Tagal: 20 minuto',
    'Mga Kagamitan:', '- Paper', '- Pens',
    'Pamamaraan:', '1. Draw a cell.', '2. Label it.', '3. Share it.',
    'Pamantayan sa Tagumpay:', '- Labels are correct.', '- Parts are explained.',
  ].join('\n'));
  assert.doesNotMatch(filipino, /Objective|Grouping|Duration|minutes|Materials|Procedure|Success criteria/);
  assert.doesNotMatch(renderActivityInstructions(activity), /Layunin|Pagpapangkat|Tagal|minuto|Kagamitan|Pamamaraan|Pamantayan/);
});

test('the validated language is returned and drives the instructions', async () => {
  const result = await generateDayTask({ plan, source, task: { taskType: 'activity', day: 'Monday' },
    requestJson: async () => JSON.stringify({ ...activity, language: 'fil' }) });
  assert.equal(result.activity.language, 'fil');
  assert.match(result.instructions, /^Layunin: /);
});

test('activity result has no questions and carries instructions built from the activity', async () => {
  const result = await generateDayTask({ plan, source, task: { taskType: 'activity', day: 'Monday' },
    requestJson: async () => JSON.stringify({ ...activity, instructions: 'AI-WRITTEN' }) });
  assert.equal(result.title, 'Cell map');
  assert.deepEqual(result.questions, []);
  assert.deepEqual(result.answerKey, []);
  assert.equal(result.instructions, renderActivityInstructions(result.activity));
  assert.doesNotMatch(JSON.stringify(result), /AI-WRITTEN/);
});

test('one provider call with the task schema, token limit, and signal', async () => {
  const signal = new AbortController().signal;
  const calls = [];
  const task = { taskType: 'quiz', day: 'Monday', itemCount: 1, typeCounts: { true_false: 1 } };
  const result = await generateDayTask({ plan, source, task, signal,
    requestJson: async (prompt, options) => { calls.push({ prompt, options }); return JSON.stringify(quiz); } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.maxOutputTokens, 16384);
  assert.equal(calls[0].options.responseSchema, DAY_TASK_SCHEMAS.quiz);
  assert.equal(calls[0].options.signal, signal);
  assert.equal(result.instructions, 'Answer.');
  assert.equal(result.activity, null);
  assert.equal(result.providerCalls, 1);
  assert.equal(result.saved, false);
});

test('activity and assignment use the smaller token limit', async () => {
  let tokens;
  await generateDayTask({ plan, source, task: { taskType: 'activity', day: 'Monday' },
    requestJson: async (_prompt, options) => { tokens = options.maxOutputTokens; return JSON.stringify(activity); } });
  assert.equal(tokens, 8192);
  tokens = undefined;
  await assert.rejects(generateDayTask({ plan, source, task: { taskType: 'assignment', day: 'Monday', itemCount: 1, typeCounts: { essay: 1 } },
    requestJson: async (_prompt, options) => { tokens = options.maxOutputTokens; return '{}'; } }));
  assert.equal(tokens, 8192);
});

test('an invalid response is not retried', async () => {
  let calls = 0;
  await assert.rejects(generateDayTask({ plan, source, task: { taskType: 'activity', day: 'Monday' },
    requestJson: async () => { calls += 1; return 'not json'; } }), { code: 'AI_RESPONSE_INVALID' });
  assert.equal(calls, 1);
});

test('a provider failure is not retried', async () => {
  let calls = 0;
  await assert.rejects(generateDayTask({ plan, source, task: { taskType: 'activity', day: 'Monday' },
    requestJson: async () => { calls += 1; throw Object.assign(new Error('x'), { code: 'PROVIDER_OVERLOADED' }); } }),
  { code: 'PROVIDER_OVERLOADED' });
  assert.equal(calls, 1);
});
