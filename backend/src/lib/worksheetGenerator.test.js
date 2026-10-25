import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorksheetPrompt, generateWorksheetDraft, parseWorksheetResponse,
  requestWorksheetJsonFromGemini, validateWorksheetSource,
} from './worksheetGenerator.js';

const identity = { teacherId: 'synthetic-teacher', lessonPlanId: 'synthetic-plan' };
const context = (overrides = {}) => ({
  ...identity, activeTeacher: true, saved: true, assignmentVerified: true,
  schoolYear: '2026-2027', currentSchoolYear: '2026-2027',
  lessonTitle: 'Plant cells', subjectId: 'science-id', subjectName: 'Science', gradeLevel: 'Grade 7',
  source: { kind: 'ai-html-text', lessonText: 'Identify plant cell structures and explain their function.',
    assessment: { activities: ['Compare two cell diagrams.'],
      weekdayFormativeAssessments: { Wednesday: 'Label a plant cell diagram.', Monday: 'Identify three cell parts.' } } },
  ...overrides,
});
const choice = (overrides = {}) => ({
  question: 'Which cell structure controls activities?', item_type: 'multiple_choice',
  points: 2, options: ['Nucleus', 'Cell wall', 'Vacuole'], correct_answer: 'Nucleus', ...overrides,
});
const output = (questions = [choice()]) => JSON.stringify({ title: 'Plant cells worksheet', questions });
const run = (resolved = context(), response = output()) => generateWorksheetDraft(identity, {
  resolveAuthorizedContext: async () => resolved,
  generateText: async () => response,
});

test('valid AI plan returns a private in-memory draft and separate Teacher answer key', async () => {
  let prompt;
  const draft = await generateWorksheetDraft(identity, {
    resolveAuthorizedContext: async request => {
      assert.deepEqual(request, identity);
      return context({ privateProfile: 'Never send this to AI' });
    },
    generateText: async value => { prompt = value; return output(); },
  });
  assert.equal(draft.status, 'generated-draft');
  assert.equal(draft.saved, false);
  assert.deepEqual(draft.sourceLessonPlan, { id: identity.lessonPlanId, title: 'Plant cells' });
  assert.equal(draft.subjectId, 'science-id');
  assert.equal(draft.gradeLevel, 'Grade 7');
  assert.equal(draft.questions[0].question, choice().question);
  assert.equal(draft.questions[0].correct_answer, undefined);
  assert.deepEqual(draft.answerKey, [{ localId: 'draft-1', correct_answer: 'Nucleus' }]);
  assert.ok(prompt.includes('Identify plant cell structures'));
  assert.ok(prompt.includes('Compare two cell diagrams.'));
  assert.ok(prompt.indexOf('Identify three cell parts.') < prompt.indexOf('Label a plant cell diagram.'));
  assert.ok(!prompt.includes('Never send this to AI'));
  assert.ok(!('worksheetId' in draft));
});

test('valid synthetic Manual ILAW V2 context preserves objectives and activities in the prompt', async () => {
  const manual = context({ source: {
    kind: 'manual-ilaw-v2', learningObjectives: 'Identify cell parts.',
    weekdayObjectives: { Monday: 'Name cell structures.', Tuesday: '' },
    learningActivities: { Monday: 'Observe a cell model.', Tuesday: '' },
    formativeAssessments: { Monday: 'Label a cell diagram.', Tuesday: '' },
    teachingStrategy: 'Inquiry',
  } });
  const checked = validateWorksheetSource(manual, identity.teacherId, identity.lessonPlanId);
  const prompt = buildWorksheetPrompt(checked);
  assert.match(prompt, /Name cell structures/);
  assert.match(prompt, /Observe a cell model/);
  assert.match(prompt, /Label a cell diagram/);
  assert.match(prompt, /Inquiry/);
  assert.equal((await run(manual)).status, 'generated-draft');
});

test('missing topic, instructional text, objectives, and unsupported format fail closed', async () => {
  await assert.rejects(run(context({ lessonTitle: '' })), /saved, owned plan/);
  await assert.rejects(run(context({ source: { kind: 'ai-html-text', lessonText: '',
    assessment: { activities: ['Label a cell.'] } } })), /no usable instructional content/);
  await assert.rejects(run(context({ source: { kind: 'ai-html-text', lessonText: 'Identify cells.' } })), /no usable Assessment/);
  await assert.rejects(run(context({ source: { kind: 'manual-ilaw-v2', weekdayObjectives: {}, learningActivities: {} } })), /no learning objectives/);
  await assert.rejects(run(context({ source: { kind: 'unknown' } })), /not supported/);
});

test('identity, inactive Teacher, missing save, assignment, wrong grade or subject, and old year never call AI', async () => {
  const bad = [
    context({ teacherId: 'forged-teacher' }), context({ lessonPlanId: 'other-plan' }),
    context({ activeTeacher: false }), context({ saved: false }),
    context({ assignmentVerified: false }), context({ subjectId: '' }),
    context({ gradeLevel: '' }), context({ currentSchoolYear: '2027-2028' }),
  ];
  let calls = 0;
  for (const item of bad) {
    await assert.rejects(generateWorksheetDraft(identity, {
      resolveAuthorizedContext: async () => item,
      generateText: async () => { calls += 1; return output(); },
    }), /verified/);
  }
  assert.equal(calls, 0);
  await assert.rejects(generateWorksheetDraft(identity, { generateText: async () => output() }), /trusted plan resolver/);
});

test('malformed, empty, HTML, unsupported, and duplicate AI output is rejected', async () => {
  await assert.rejects(run(context(), '{bad json'), /invalid worksheet JSON/);
  await assert.rejects(run(context(), output([])), /incomplete worksheet/);
  await assert.rejects(run(context(), output([choice({ question: '<img src=x>' })])), /invalid question/);
  await assert.rejects(run(context(), output([choice({ item_type: 'matching' })])), /invalid question/);
  await assert.rejects(run(context(), output([choice(), choice({ question: ' WHICH cell structure controls activities? ' })])), /duplicate questions/);
});

test('multiple choice rejects missing or nonmatching keys and duplicate options', async () => {
  await assert.rejects(run(context(), output([choice({ correct_answer: '' })])), /invalid answer key/);
  await assert.rejects(run(context(), output([choice({ correct_answer: 'Chloroplast' })])), /invalid answer key/);
  await assert.rejects(run(context(), output([choice({ options: ['Nucleus', 'nucleus'] })])), /invalid answer key/);
  await assert.rejects(run(context(), output([choice({ options: ['Nucleus', ''] })])), /invalid options/);
});

test('true/false, identification, enumeration, and essay match the current editor schema', async () => {
  const questions = [
    { question: 'Plants have cells.', item_type: 'true_false', points: 1, options: [], correct_answer: 'True' },
    { question: 'Name a cell part.', item_type: 'identification', points: 1, options: [], correct_answer: 'Nucleus, Cell wall' },
    { question: 'Name two structures.', item_type: 'enumeration', points: 2, options: [], correct_answer: 'Nucleus, Vacuole' },
    { question: 'Explain your reasoning.', item_type: 'essay', points: 4, options: [], correct_answer: '' },
  ];
  const draft = await run(context(), output(questions));
  assert.deepEqual(draft.questions.map(item => item.item_type), questions.map(item => item.item_type));
  assert.equal(draft.answerKey.length, 3);
  assert.ok(draft.questions.every(item => !('correct_answer' in item)));
  await assert.rejects(run(context(), output([{ ...questions[1], correct_answer: ',' }])), /invalid answer key/);
  await assert.rejects(run(context(), output([{ ...questions[3], correct_answer: 'Guess' }])), /invalid answer key/);
});

test('blank enumeration answer with populated alternatives keeps rejection and identifies the missing key', () => {
  for (const correct_answer of ['', '  ']) {
    const questions = [choice(),
      { question: 'Plants have cells.', item_type: 'true_false', points: 1, options: [], correct_answer: 'True' },
      { question: 'Name two lessons.', item_type: 'enumeration', points: 2, options: [], correct_answer,
        enumeration: { alternatives: ['katapatan', 'pagtutulungan'], orderSensitive: false } }];
    assert.throws(() => parseWorksheetResponse(output(questions), context()), error =>
      error.validation?.category === 'invalid_answer_key'
      && error.validation.path === 'questions[2].correct_answer'
      && error.validation.subreason === 'enumeration_answer_missing');
  }
});

test('provider failure leaves no draft; explicit retry can succeed without a save', async () => {
  let attempts = 0;
  const generateText = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('Synthetic outage');
    return output();
  };
  const dependencies = { resolveAuthorizedContext: async () => context(), generateText };
  await assert.rejects(generateWorksheetDraft(identity, dependencies), /Synthetic outage/);
  const draft = await generateWorksheetDraft(identity, dependencies);
  assert.equal(attempts, 2);
  assert.equal(draft.saved, false);
});

test('Gemini adapter uses server key and JSON mode with mocked fetch only', async () => {
  let request;
  const text = await requestWorksheetJsonFromGemini('synthetic prompt', {
    apiKey: 'synthetic-test-key',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: output() }] } }] }) };
    },
  });
  assert.equal(text, output());
  assert.match(request.url, /gemini-2\.5-flash:generateContent/);
  assert.equal(request.options.headers['x-goog-api-key'], 'synthetic-test-key');
  assert.equal(JSON.parse(request.options.body).generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(JSON.parse(request.options.body).generationConfig.thinkingConfig, { thinkingBudget: 0 });
  await assert.rejects(requestWorksheetJsonFromGemini('prompt', { apiKey: '' }), /not configured/);
  await assert.rejects(requestWorksheetJsonFromGemini('prompt', {
    apiKey: 'synthetic-test-key', fetchImpl: async () => ({ ok: false }),
  }), /unavailable/);
  await assert.rejects(requestWorksheetJsonFromGemini('prompt', {
    apiKey: 'synthetic-test-key', fetchImpl: async () => ({ ok: false, status: 429 }),
  }), error => error.code === 'PROVIDER_RATE_LIMIT');
  await assert.rejects(requestWorksheetJsonFromGemini('prompt', {
    apiKey: 'synthetic-test-key', fetchImpl: async () => ({ ok: true, json: async () => ({
      candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"days":[' }] } }],
    }) }),
  }), error => error.code === 'PROVIDER_TRUNCATED');
});

test('weekly Gemini transport sends the response schema and propagates cancellation', async () => {
  const controller = new AbortController();
  const schema = { type: 'OBJECT', properties: { questions: { type: 'ARRAY' } } };
  await assert.rejects(requestWorksheetJsonFromGemini('synthetic prompt', {
    apiKey: 'synthetic-test-key', responseSchema: schema, signal: controller.signal,
    fetchImpl: async (_url, options) => {
      assert.deepEqual(JSON.parse(options.body).generationConfig.responseSchema, schema);
      assert.equal(options.signal.aborted, false);
      controller.abort();
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    },
  }), error => error.code === 'GENERATION_CANCELLED');
});

test('Gemini quota, overload and interrupted outcomes make one request without retry', async () => {
  for (const [status, details, expected] of [
    [429, [{ violations: [{ quotaId: 'GenerateRequestsPerDay-Project' }] }], 'PROVIDER_DAILY_QUOTA'],
    [429, [{ violations: [{ quotaId: 'GenerateRequestsPerMinute-Project' }] }], 'PROVIDER_RATE_LIMIT'],
    [503, [], 'PROVIDER_OVERLOADED'],
  ]) {
    let calls = 0;
    await assert.rejects(requestWorksheetJsonFromGemini('prompt', { apiKey: 'synthetic-test-key',
      fetchImpl: async () => {
        calls += 1;
        return { ok: false, status, headers: { get: () => '120' },
          json: async () => ({ error: { message: 'private provider detail', details } }) };
      },
    }), error => error.code === expected && error.retryAfterSeconds === 120
      && !error.message.includes('private provider detail'));
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(requestWorksheetJsonFromGemini('prompt', { apiKey: 'synthetic-test-key',
    fetchImpl: async () => { calls += 1; throw new TypeError('connection lost'); },
  }), error => error.code === 'PROVIDER_INTERRUPTED');
  assert.equal(calls, 1);
  await assert.rejects(requestWorksheetJsonFromGemini('prompt', { apiKey: 'synthetic-test-key',
    fetchImpl: async () => ({ ok: false, status: 429, headers: { get: () => null }, json: async () => ({
      error: { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '42s' }] },
    }) }),
  }), error => error.code === 'PROVIDER_RATE_LIMIT' && error.retryAfterSeconds === 42);
});

test('response parser creates no persistence or distribution fields', () => {
  const draft = parseWorksheetResponse(output(), validateWorksheetSource(context(), identity.teacherId, identity.lessonPlanId));
  for (const field of ['worksheetId', 'distribution', 'studentIds', 'posted', 'notifications']) {
    assert.equal(field in draft, false);
  }
});
