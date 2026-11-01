import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createWeeklyJobRouter } from './weeklyJobs.js';

const serve = async (router, callback) => {
  const app = express();
  app.use(express.json());
  app.use('/jobs', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/jobs`;
    await callback((path, init) => fetch(`${base}${path}`, init));
  } finally { await new Promise(resolve => server.close(resolve)); }
};

test('production job API gate rejects requests without starting a service', async () => {
  await serve(createWeeklyJobRouter(), async request => {
    const response = await request('/', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceLessonPlanId: 'plan-1' }) });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'GENERATION_WORKER_DISABLED');
  });
});

test('enabled job API uses verified actor, hides private status, and protects daily reads', async () => {
  const calls = [];
  const service = {
    submit: async (actor, body) => { calls.push({ actor, body }); return { id: 'job-1', status: 'QUEUED' }; },
    status: async actor => { calls.push({ actor }); return { id: 'job-1', status: 'RUNNING',
      completedValidatedBatches: 1 }; },
    listCollections: async () => [{ id: 'collection-1', days: [{ day: 'Monday' }] }],
    openCollection: async actor => { calls.push({ actor }); return { id: 'collection-1',
      worksheets: [{ id: 'monday-1', answerKey: [{ correct_answer: 'private' }] }] }; },
    deleteEligibleDraft: async (actor, id, revision) => {
      calls.push({ actor, id, revision }); return { deleted: true, durable: true };
    },
  };
  const authenticate = (req, res, next) => {
    if (req.get('authorization') !== 'Bearer synthetic-teacher') return res.status(401).json({ code: 'not_authenticated' });
    req.user = { id: 'teacher-1' }; next();
  };
  await serve(createWeeklyJobRouter({ enabled: true, service, authenticate }), async request => {
    assert.equal((await request('/job-1')).status, 401);
    const headers = { authorization: 'Bearer synthetic-teacher', 'content-type': 'application/json' };
    const created = await request('/', { method: 'POST', headers,
      body: JSON.stringify({ sourceLessonPlanId: 'plan-1', teacherId: 'forged' }) });
    assert.equal(created.status, 200);
    assert.equal(calls[0].actor.id, 'teacher-1');
    assert.equal(calls[0].actor.verified, true);
    assert.equal(calls[0].body.teacherId, undefined);
    const status = await (await request('/job-1', { headers })).json();
    assert.equal(JSON.stringify(status).includes('private'), false);
    assert.equal((await request('/collections/missing/days/unknown', { headers })).status, 404);
    const day = await (await request('/collections/collection-1/days/monday-1', { headers })).json();
    assert.equal(day.answerKey[0].correct_answer, 'private');
    const deleted = await request('/collections/collection-1', { method: 'DELETE', headers,
      body: JSON.stringify({ expectedRevision: 3, teacherId: 'forged' }) });
    assert.equal(deleted.status, 200);
    assert.deepEqual(calls.at(-1), { actor: { id: 'teacher-1', role: 'teacher', status: 'active', verified: true },
      id: 'collection-1', revision: 3 });
  });
});
