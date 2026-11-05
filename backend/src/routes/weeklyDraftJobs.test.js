import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlankIlawDocument } from '../../../frontend/src/pages/dashboards/teacher/ilaw/ilawTemplateModel.js';
import { serializeManualIlawV2 } from '../../../frontend/src/pages/dashboards/teacher/ilaw/manualIlawV2.js';
import { createWeeklyDraftJobsRouter } from './weeklyDraftJobs.js';

const teacherId = '11111111-1111-4111-8111-111111111111';
const planId = '22222222-2222-4222-8222-222222222222';
const subjectId = '33333333-3333-4333-8333-333333333333';
const jobId = '44444444-4444-4444-8444-444444444444';
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const token = 'synthetic-teacher-token';
const basePlan = { id: planId, teacher_id: teacherId, status: 'draft',
  title: 'Synthetic ILAW', subject: 'Science', grade_level: 'Grade 7',
  subject_id: subjectId, academic_year: '2026-2027', ai_generated: true };
const table = (section, label, values) => `<div class="ilaw-section ${section}"><div class="ilaw-field">
  <span class="ilaw-label">${label}</span><table class="ilaw-week-table"><tr>
  ${days.map(day => `<th>${day}</th>`).join('')}</tr><tr>
  ${values.map(value => `<td><p>${value}</p></td>`).join('')}</tr></table></div></div>`;
const aiPlan = () => ({ ...basePlan, objectives: `<div class="ilaw-lesson-plan">
  <div class="ilaw-section ilaw-I"><div class="ilaw-field"><span class="ilaw-label">Learning Competency</span>
  <p>Describe the weekly topic.</p></div><div class="ilaw-field"><span class="ilaw-label">Learning Objectives</span>
  <table class="ilaw-week-table"><tr>${days.map(day => `<th>${day}</th>`).join('')}</tr><tr>
  ${days.map(day => `<td><p>Objective for ${day}.</p></td>`).join('')}</tr></table></div></div>
  ${table('ilaw-L', 'Flow', days.map(day => `Activity for ${day}.`))}
  ${table('ilaw-A', 'Formative Assessment', days.map(day => `Assessment for ${day}.`))}</div>` });

function manualPlan() {
  const document = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7' });
  document.info.nameOfLesson = basePlan.title;
  document.info.teachingDate = '2026-11-03';
  document.learningCompetency = 'Describe the weekly topic.';
  for (const day of days) {
    document.weekly.learningObjectives[day] = `Objective for ${day}.`;
    document.weekly.flow[day] = `Activity for ${day}.`;
    document.weekly.formativeAssessment[day] = `Assessment for ${day}.`;
  }
  return { ...basePlan, ai_generated: false,
    objectives: serializeManualIlawV2({ kind: 'eduscribe.manual-ilaw', version: 2,
      teacherId, planId, title: basePlan.title, workflowState: 'saved',
      assignment: { subjectId, subjectName: 'Science', gradeLevel: 'Grade 7',
        schoolYear: '2026-2027' }, document,
      sourceDetails: { classDuration: '45 minutes', teachingStrategy: 'Inquiry',
        learningObjectives: 'Describe the weekly topic.' } }) };
}

const auth = (req, res, next) => {
  if (req.get('authorization') !== `Bearer ${token}`)
    return res.status(401).json({ code: 'not_authenticated' });
  req.user = { id: teacherId, role: 'teacher' };
  return next();
};
const response = () => ({ statusCode: 200, headers: {},
  set(name, value) { this.headers[name] = value; return this; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return body; } });
const request = (body, path = '/') => ({ body, params: path === '/' ? {} : { jobId },
  get: name => name === 'authorization' ? `Bearer ${token}` : '' });
async function dispatch(router, method, path, req) {
  const res = response();
  for (const layer of router.stack.filter(item => !item.route)) {
    let next = false;
    await layer.handle(req, res, () => { next = true; });
    if (!next) return res;
  }
  const route = router.stack.find(layer => layer.route?.path === path
    && layer.route.methods[method.toLowerCase()])?.route;
  assert.ok(route, `missing ${method} ${path}`);
  await route.stack[0].handle(req, res);
  return res;
}
const body = () => ({ lessonPlanId: planId, questionCount: 20, requestId: 'synthetic-request' });
const adapter = overrides => ({ submit: async () => ({ id: jobId, status: 'QUEUED' }),
  status: async () => ({ id: jobId, status: 'QUEUED' }),
  cancel: async () => ({ id: jobId, status: 'CANCELED' }),
  result: async () => ({ kind: 'weekly-worksheet-collection', status: 'local-draft',
    saved: false, worksheets: [] }), ...overrides });

test('owned saved AI and Manual ILAW plans submit only verified row content and identity', async () => {
  for (const plan of [aiPlan(), manualPlan()]) {
    const calls = [];
    const router = createWeeklyDraftJobsRouter({ auth, loadPlan: async (...args) => {
      calls.push(['read', ...args]); return plan;
    }, jobAdapter: adapter({ submit: async args => {
      calls.push(['submit', args]); return { id: jobId, status: 'QUEUED' };
    } }) });
    const res = await dispatch(router, 'POST', '/', request(body()));
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.body, { id: jobId, status: 'QUEUED' });
    assert.equal(res.headers['X-Weekly-Workflow-Wake'], 'unavailable');
    assert.deepEqual(calls[0], ['read', planId, teacherId]);
    const submitted = calls[1][1];
    assert.equal(submitted.teacherId, teacherId);
    assert.equal(submitted.sourceLessonPlanId, planId);
    assert.equal(submitted.questionCount, 20);
    assert.equal(submitted.requestId, 'synthetic-request');
    assert.deepEqual(submitted.sourceDays.map(day => day.day), days);
    assert.deepEqual(submitted.expectedSource, Object.fromEntries([
      'title', 'objectives', 'subject', 'grade_level', 'subject_id',
      'academic_year', 'ai_generated'].map(key => [key, plan[key]])));
    assert.equal(JSON.stringify(res.body).includes(plan.objectives), false);
  }
});

test('QUEUED new and replayed submissions each send at most one wake-up for the same job', async () => {
  let submits = 0;
  let wakes = 0;
  const router = createWeeklyDraftJobsRouter({ auth, loadPlan: async () => aiPlan(),
    jobAdapter: adapter({ submit: async () => { submits++;
      return { id: jobId, status: 'QUEUED' }; } }),
    wake: async () => { wakes++; return 'accepted'; } });
  for (let index = 0; index < 2; index++) {
    const res = await dispatch(router, 'POST', '/', request(body()));
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.body, { id: jobId, status: 'QUEUED' });
    assert.equal(res.headers['X-Weekly-Workflow-Wake'], 'accepted');
    assert.equal(res.headers['Access-Control-Expose-Headers'], 'X-Weekly-Workflow-Wake');
  }
  assert.equal(submits, 2);
  assert.equal(wakes, 2);
});

test('terminal and running submit receipts never wake a worker', async () => {
  for (const status of ['RUNNING', 'COMPLETED', 'FAILED', 'CANCELED',
    'INTERRUPTED_UNKNOWN_OUTCOME']) {
    let wakes = 0;
    const router = createWeeklyDraftJobsRouter({ auth, loadPlan: async () => aiPlan(),
      jobAdapter: adapter({ submit: async () => ({ id: jobId, status }) }),
      wake: async () => { wakes++; return 'accepted'; } });
    const res = await dispatch(router, 'POST', '/', request(body()));
    assert.equal(res.statusCode, 202);
    assert.deepEqual(res.body, { id: jobId, status });
    assert.equal(res.headers['X-Weekly-Workflow-Wake'], 'not_needed');
    assert.equal(wakes, 0);
  }
});

test('an unconfirmed wake keeps the same durable job and never retries within the request', async () => {
  let wakes = 0;
  const router = createWeeklyDraftJobsRouter({ auth, loadPlan: async () => aiPlan(),
    jobAdapter: adapter(), wake: async () => { wakes++; throw new Error('synthetic secret'); } });
  const res = await dispatch(router, 'POST', '/', request(body()));
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { id: jobId, status: 'QUEUED' });
  assert.equal(res.headers['X-Weekly-Workflow-Wake'], 'unconfirmed');
  assert.equal(wakes, 1);
  assert.equal(JSON.stringify(res.body).includes('synthetic secret'), false);
});

test('invalid, unauthenticated, and failed submissions never wake a worker', async () => {
  let wakes = 0;
  const router = createWeeklyDraftJobsRouter({ auth, loadPlan: async () => aiPlan(),
    jobAdapter: adapter({ submit: async () => {
      throw Object.assign(new Error('private details'), { code: 'source_changed' });
    } }), wake: async () => { wakes++; return 'accepted'; } });
  const unauthenticated = request(body());
  unauthenticated.get = () => '';
  assert.equal((await dispatch(router, 'POST', '/', unauthenticated)).statusCode, 401);
  assert.equal((await dispatch(router, 'POST', '/', request({ ...body(), questionCount: 25 }))).statusCode, 400);
  assert.equal((await dispatch(router, 'POST', '/', request(body()))).statusCode, 409);
  assert.equal(wakes, 0);
});

test('foreign, missing, or ineligible saved plans do not submit', async () => {
  for (const plan of [null, { ...aiPlan(), teacher_id: subjectId },
    { ...aiPlan(), status: 'archived' }]) {
    let submits = 0;
    const router = createWeeklyDraftJobsRouter({ auth, loadPlan: async () => plan,
      jobAdapter: adapter({ submit: async () => { submits++; } }) });
    const res = await dispatch(router, 'POST', '/', request(body()));
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.code, 'source_denied');
    assert.equal(submits, 0);
  }
});

test('invalid and injected submit fields are rejected before the plan read', async () => {
  for (const bad of [
    { ...body(), teacherId }, { ...body(), sourceDays: [] },
    { ...body(), expectedSource: {} }, { ...body(), html: '<p>x</p>' },
    { ...body(), provider: 'other' }, { ...body(), questionCount: 25 },
    { ...body(), lessonPlanId: 'bad-id' }, { ...body(), requestId: 'x'.repeat(129) },
  ]) {
    let reads = 0;
    const router = createWeeklyDraftJobsRouter({ auth, loadPlan: async () => { reads++; },
      jobAdapter: adapter() });
    const res = await dispatch(router, 'POST', '/', request(bad));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'invalid_request');
    assert.equal(reads, 0);
  }
});

test('incomplete saved source and source_changed race are safe failures', async () => {
  let submits = 0;
  const malformed = createWeeklyDraftJobsRouter({ auth,
    loadPlan: async () => ({ ...aiPlan(), objectives: '<p>incomplete</p>' }),
    jobAdapter: adapter({ submit: async () => { submits++; } }) });
  const invalid = await dispatch(malformed, 'POST', '/', request(body()));
  assert.equal(invalid.statusCode, 422);
  assert.equal(invalid.body.code, 'invalid_weekly_source');
  assert.equal(submits, 0);

  const changed = createWeeklyDraftJobsRouter({ auth, loadPlan: async () => aiPlan(),
    jobAdapter: adapter({ submit: async () => {
      throw Object.assign(new Error('private source text'), { code: 'source_changed' });
    } }) });
  const conflict = await dispatch(changed, 'POST', '/', request(body()));
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.body.code, 'source_changed');
  assert.equal(JSON.stringify(conflict.body).includes('private'), false);
});

test('status, Cancel and result pass only the authenticated bearer to owner-scoped adapter methods', async () => {
  const calls = [];
  const router = createWeeklyDraftJobsRouter({ auth, loadPlan: async () => {
    throw new Error('unexpected plan read');
  }, jobAdapter: adapter({
    status: async (...args) => { calls.push(['status', ...args]);
      return { id: jobId, status: 'RUNNING', completedBatches: 1 }; },
    cancel: async (...args) => { calls.push(['cancel', ...args]);
      return { id: jobId, status: 'CANCELED' }; },
    result: async (...args) => { calls.push(['result', ...args]);
      return { kind: 'weekly-worksheet-collection', status: 'local-draft', saved: false,
        worksheets: [] }; },
  }) });
  const status = await dispatch(router, 'GET', '/:jobId', request(undefined, '/:jobId'));
  const cancel = await dispatch(router, 'POST', '/:jobId/cancel', request(undefined, '/:jobId/cancel'));
  const result = await dispatch(router, 'GET', '/:jobId/result', request(undefined, '/:jobId/result'));
  assert.equal(status.statusCode, 200);
  assert.equal(cancel.body.status, 'CANCELED');
  assert.equal(result.body.kind, 'weekly-worksheet-collection');
  assert.deepEqual(calls, [['status', token, jobId], ['cancel', token, jobId], ['result', token, jobId]]);
  assert.equal(JSON.stringify([status.body, cancel.body]).includes('checkpoint'), false);
});

test('missing authentication, invalid job IDs and read failures never access another resource', async () => {
  let reads = 0;
  let calls = 0;
  const router = createWeeklyDraftJobsRouter({ auth, loadPlan: async () => {
    reads++; throw new Error('database details');
  }, jobAdapter: adapter({ status: async () => { calls++; } }) });
  const unauthenticated = request(body());
  unauthenticated.get = () => '';
  assert.equal((await dispatch(router, 'POST', '/', unauthenticated)).statusCode, 401);
  const invalid = request(undefined, '/:jobId');
  invalid.params.jobId = 'bad-id';
  assert.equal((await dispatch(router, 'GET', '/:jobId', invalid)).statusCode, 400);
  const unavailable = await dispatch(router, 'POST', '/', request(body()));
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.body.code, 'job_unavailable');
  assert.equal(JSON.stringify(unavailable.body).includes('database details'), false);
  assert.equal(reads, 1);
  assert.equal(calls, 0);
});

test('role guard and unexpected error codes fail closed without leaking data', async () => {
  let reads = 0;
  const student = createWeeklyDraftJobsRouter({ auth: (req, _res, next) => {
    req.user = { id: teacherId, role: 'student' }; next();
  }, loadPlan: async () => { reads++; }, jobAdapter: adapter() });
  const forbidden = await dispatch(student, 'POST', '/', request(body()));
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.body.code, 'inactive_teacher');
  assert.equal(reads, 0);

  const broken = createWeeklyDraftJobsRouter({ auth, loadPlan: async () => {
    throw Object.assign(new Error('private details'), { code: 'constructor' });
  }, jobAdapter: adapter() });
  const failure = await dispatch(broken, 'POST', '/', request(body()));
  assert.equal(failure.statusCode, 503);
  assert.equal(failure.body.code, 'job_unavailable');
  assert.equal(JSON.stringify(failure.body).includes('private'), false);
});
