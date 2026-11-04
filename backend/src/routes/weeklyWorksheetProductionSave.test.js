import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createWeeklyWorksheetProductionSaveRouter, weeklyProductionSaveEnabled } from './weeklyWorksheetProductionSave.js';

const id = '12345678-1234-4234-8234-123456789abc';
const jobId = '22345678-1234-4234-8234-123456789abc';
const requestId = '32345678-1234-4234-8234-123456789abc';
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const env = { NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production',
  WEEKLY_WORKSHEET_PRODUCTION_SAVE_ENABLED: 'true',
  WEEKLY_WORKSHEET_PRODUCTION_SAVE_PROJECT_REF: 'jllstakxiamxiycnwrbd',
  SUPABASE_URL: 'https://jllstakxiamxiycnwrbd.supabase.co', SUPABASE_ANON_KEY: 'synthetic' };
const command = () => ({ jobId, requestId, collection: {
  collectionId: jobId, teacherId: id, title: 'Synthetic weekly collection',
  sourceLessonPlan: { id }, worksheets: days.map((day, index) => ({
    day, title: `${day} synthetic worksheet`, instructions: 'Answer carefully.',
    checkingMode: 'manual', sections: [{ id: 'one', title: 'Section', directions: 'Choose.' }],
    questions: [{ localId: `q-${index}`, sectionId: 'one', question: 'Synthetic prompt',
      item_type: 'true_false', options: null, points: 1 }],
    answerKey: [{ localId: `q-${index}`, correct_answer: 'True' }],
  })) } });
const receipt = { ok: true, durable: true, collectionId: id,
  worksheets: days.map((_, index) => ({ day: index + 1, id: `42345678-1234-4234-8234-123456789ab${index}`,
    items: 1 })) };

async function post({ enabled = env, auth = (req, _res, next) => { req.user = { id, role: 'teacher' }; next(); },
  invokeRpc = async () => ({ data: receipt, error: null }), body = command() } = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/weekly-worksheets/production-save',
    createWeeklyWorksheetProductionSaveRouter({ env: enabled, auth, invokeRpc }));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      if (server.listening) resolve();
      else { server.once('listening', resolve); server.once('error', reject); }
    });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/weekly-worksheets/production-save`, {
      method: 'POST', headers: { Authorization: 'Bearer synthetic-teacher-token',
        'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('production gate defaults off and requires exact target and flag', async () => {
  assert.equal(weeklyProductionSaveEnabled({}), false);
  assert.equal(weeklyProductionSaveEnabled({ ...env, WEEKLY_WORKSHEET_PRODUCTION_SAVE_ENABLED: '1' }), false);
  assert.equal(weeklyProductionSaveEnabled({ ...env, WEEKLY_WORKSHEET_PRODUCTION_SAVE_PROJECT_REF: 'other' }), false);
  let called = false;
  const response = await post({ enabled: {}, invokeRpc: async () => { called = true; } });
  assert.equal(response.status, 503);
  assert.equal(called, false);
});

test('authenticated teacher sends one reviewed five-day payload to the user-scoped RPC', async () => {
  const calls = [];
  const response = await post({ invokeRpc: async (...args) => {
    calls.push(args); return { data: receipt, error: null };
  } });
  assert.equal(response.status, 200);
  assert.equal(response.body.durable, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'eduscribe_weekly_job_save_v1');
  assert.equal(calls[0][1].p_job_id, jobId);
  assert.equal(calls[0][1].p_request_id, requestId);
  assert.deepEqual(calls[0][1].p_payload.worksheets.map(day => day.day), [1, 2, 3, 4, 5]);
  assert.equal(calls[0][1].p_payload.worksheets[0].questions[0].correct_answer, 'True');
  assert.equal(calls[0][2], 'synthetic-teacher-token');
  assert.equal(JSON.stringify(response.body).includes('Synthetic prompt'), false);
});

test('auth, owner, and complete-payload failures make no RPC call', async () => {
  let calls = 0;
  const invokeRpc = async () => { calls++; return { data: receipt, error: null }; };
  assert.equal((await post({ auth: (_req, res) => res.status(401).json({ code: 'not_authenticated' }), invokeRpc })).status, 401);
  const wrongOwner = command(); wrongOwner.collection.teacherId = 'foreign';
  assert.equal((await post({ body: wrongOwner, invokeRpc })).status, 422);
  const missingDay = command(); missingDay.collection.worksheets.pop();
  assert.equal((await post({ body: missingDay, invokeRpc })).status, 422);
  assert.equal(calls, 0);
});

test('database rejection is definite; uncertain transport and receipt are not declared saved', async () => {
  const noTransport = await post({ enabled: { ...env, SUPABASE_ANON_KEY: '' }, invokeRpc: null });
  assert.deepEqual(noTransport.body, { ok: false, code: 'integration_blocked', durable: false });
  const denied = await post({ invokeRpc: async () => ({ data: null,
    error: { message: 'assignment_denied' } }) });
  assert.deepEqual(denied.body, { ok: false, code: 'assignment_denied', durable: false });
  const uncertain = await post({ invokeRpc: async () => { throw new Error('private worksheet content'); } });
  assert.equal(uncertain.status, 503);
  assert.equal(uncertain.body.code, 'save_unconfirmed');
  assert.equal(JSON.stringify(uncertain.body).includes('private worksheet content'), false);
  const malformed = await post({ invokeRpc: async () => ({ data: { ok: true }, error: null }) });
  assert.equal(malformed.body.code, 'save_unconfirmed');
});
