import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from './app.js';
import { createWeeklyDraftJobsRouter } from './routes/weeklyDraftJobs.js';
import { createWeeklyDraftWorkerRouter } from './routes/weeklyDraftWorker.js';

const teacherId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';
const teacherToken = 'synthetic-teacher-token';
const workerSecret = 'synthetic-worker-secret';

async function serve(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await callback((path, options) => fetch(`${base}${path}`, options));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('the absent or nonexact flag leaves both draft routes unavailable without loading them', async () => {
  for (const flag of [undefined, 'false', 'TRUE', '1']) {
    let loads = 0;
    const app = createApp({ env: { WEEKLY_DRAFT_GENERATION_ENABLED: flag },
      loadDraftRouters: () => { loads++; throw new Error('should not load'); } });
    await serve(app, async request => {
      const teacher = await request('/api/ai/weekly-draft-jobs', { method: 'POST' });
      const worker = await request('/api/internal/weekly-draft-worker');
      assert.equal(teacher.status, 404);
      assert.equal(worker.status, 404);
      assert.equal((await request('/api/health')).status, 200);
    });
    assert.equal(loads, 0);
  }
});

test('missing or invalid worker configuration fails closed for both endpoints, not the app', async () => {
  for (const env of [
    { WEEKLY_DRAFT_GENERATION_ENABLED: 'true' },
    { WEEKLY_DRAFT_GENERATION_ENABLED: 'true', SUPABASE_URL: 'https://synthetic.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key', WEEKLY_DRAFT_WORKER_SECRET: workerSecret,
      WEEKLY_DRAFT_PROVIDER: 'unsupported' },
  ]) {
    const app = createApp({ env });
    await serve(app, async request => {
      for (const [path, options] of [
        ['/api/ai/weekly-draft-jobs', { method: 'POST', headers: { authorization: `Bearer ${teacherToken}` } }],
        ['/api/internal/weekly-draft-worker', { headers: { authorization: `Bearer ${workerSecret}` } }],
      ]) {
        const response = await request(path, options);
        assert.equal(response.status, 503);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const text = await response.text();
        assert.deepEqual(JSON.parse(text), {
          code: 'weekly_draft_unavailable', error: 'Weekly generation is unavailable.',
        });
        assert.equal(text.includes(workerSecret), false);
        assert.equal(text.includes(teacherToken), false);
      }
      assert.equal((await request('/api/health')).status, 200);
      assert.equal((await request('/api/not-a-route')).status, 404);
    });
  }
});

test('enabled routes share one initialization and preserve teacher and worker authentication', async () => {
  let loads = 0;
  let statusCalls = 0;
  let workerCalls = 0;
  const env = { WEEKLY_DRAFT_GENERATION_ENABLED: 'true', SUPABASE_URL: 'https://synthetic.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key', WEEKLY_DRAFT_WORKER_SECRET: workerSecret,
    WEEKLY_DRAFT_PROVIDER: 'gemini', GEMINI_API_KEY: 'synthetic-gemini-key' };
  const app = createApp({ env,
    loadDraftRouters: async receivedEnv => {
      assert.equal(receivedEnv, env);
      loads++;
      const teacher = createWeeklyDraftJobsRouter({
        auth: (req, res, next) => {
          if (req.get('authorization') !== `Bearer ${teacherToken}`)
            return res.status(401).json({ code: 'not_authenticated' });
          req.user = { id: teacherId, role: 'teacher' };
          return next();
        },
        jobAdapter: { async status(credential, id) {
          statusCalls++;
          assert.equal(credential, teacherToken);
          assert.equal(id, jobId);
          return { id, status: 'QUEUED' };
        } },
      });
      const worker = createWeeklyDraftWorkerRouter({ workerSecret,
        coordinator: { async runOnce() { workerCalls++; return { status: 'idle' }; } } });
      return { teacher, worker };
    } });
  await serve(app, async request => {
    const statusPath = `/api/ai/weekly-draft-jobs/${jobId}`;
    assert.equal((await request(statusPath)).status, 401);
    const status = await request(statusPath, { headers: { authorization: `Bearer ${teacherToken}` } });
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { id: jobId, status: 'QUEUED' });
    assert.equal((await request('/api/internal/weekly-draft-worker')).status, 401);
    assert.equal((await request('/api/internal/weekly-draft-worker', {
      headers: { authorization: 'Bearer wrong' },
    })).status, 401);
    const tick = await request('/api/internal/weekly-draft-worker', {
      headers: { authorization: `Bearer ${workerSecret}` },
    });
    assert.equal(tick.status, 200);
    assert.deepEqual(await tick.json(), { status: 'idle' });
    assert.equal((await request('/api/health')).status, 200);
  });
  assert.equal(loads, 1);
  assert.equal(statusCalls, 1);
  assert.equal(workerCalls, 1);
});
