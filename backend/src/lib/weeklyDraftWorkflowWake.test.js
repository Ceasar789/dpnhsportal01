import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeeklyDraftWorkflowWake, weeklyDraftWorkflowWakeEnabled } from './weeklyDraftWorkflowWake.js';

const env = () => ({ NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production',
  WEEKLY_DRAFT_GENERATION_ENABLED: 'true', WEEKLY_DRAFT_WORKFLOW_DISPATCH_ENABLED: 'true',
  VERCEL_PROJECT_PRODUCTION_URL: 'eduscribe-dnhs-portal.vercel.app',
  VERCEL_PROJECT_ID: 'prj_SyntheticProject',
  WEEKLY_DRAFT_VERCEL_PROJECT_ID: 'prj_SyntheticProject',
  SUPABASE_URL: 'https://jllstakxiamxiycnwrbd.supabase.co',
  WEEKLY_DRAFT_GITHUB_TOKEN: 'synthetic-github-credential' });

test('only exact production configuration can send a wake-up', async () => {
  assert.equal(weeklyDraftWorkflowWakeEnabled(env()), true);
  for (const change of [
    { WEEKLY_DRAFT_WORKFLOW_DISPATCH_ENABLED: undefined },
    { WEEKLY_DRAFT_WORKFLOW_DISPATCH_ENABLED: '1' },
    { WEEKLY_DRAFT_GITHUB_TOKEN: undefined },
    { NODE_ENV: 'development' }, { VERCEL: undefined }, { VERCEL_ENV: 'preview' },
    { VERCEL_PROJECT_ID: 'prj_OtherProject' },
    { VERCEL_PROJECT_PRODUCTION_URL: 'preview.vercel.app' },
    { SUPABASE_URL: 'https://other.supabase.co' },
  ]) {
    let called = false;
    const wake = createWeeklyDraftWorkflowWake({ env: { ...env(), ...change },
      fetchImpl: () => { called = true; throw new Error('unexpected request'); } });
    assert.equal(await wake(), 'unavailable');
    assert.equal(called, false);
  }
});

test('one accepted dispatch pins GitHub URL, workflow, branch, method, and headers', async () => {
  const calls = [];
  const wake = createWeeklyDraftWorkflowWake({ env: env(), fetchImpl: async (...args) => {
    calls.push(args); return { status: 204, redirected: false };
  } });
  assert.equal(await wake(), 'accepted');
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(url, 'https://api.github.com/repos/Ceasar789/dpnhsportal01/actions/workflows/weekly-draft-worker.yml/dispatches');
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'manual');
  assert.equal(options.body, '{"ref":"master"}');
  assert.equal(options.headers.Authorization, 'Bearer synthetic-github-credential');
  assert.equal(options.headers.Accept, 'application/vnd.github+json');
  assert.equal(options.headers['X-GitHub-Api-Version'], '2026-03-10');
  assert.equal(options.signal instanceof AbortSignal, true);
});

test('HTTP rejection, redirect, timeout, and uncertain transport never retry or expose response data', async () => {
  const sentinel = 'synthetic-private-response-and-secret';
  for (const response of [
    () => ({ status: 401, redirected: false, body: { cancel: async () => {} },
      text: () => { throw new Error(sentinel); } }),
    () => ({ status: 302, redirected: true, body: { cancel: async () => {} } }),
    () => { throw new Error(sentinel); },
  ]) {
    let requests = 0;
    const wake = createWeeklyDraftWorkflowWake({ env: env(), fetchImpl: async () => {
      requests++; return response();
    } });
    const result = await wake();
    assert.equal(result, 'unconfirmed');
    assert.equal(requests, 1);
    assert.equal(JSON.stringify(result).includes(sentinel), false);
  }
  let requests = 0;
  let signal;
  const wake = createWeeklyDraftWorkflowWake({ env: env(),
    fetchImpl: (_url, options) => { requests++; signal = options.signal;
      return new Promise(() => {}); },
    clock: { setTimeout: callback => { queueMicrotask(callback); return 1; },
      clearTimeout: () => {} } });
  assert.equal(await wake(), 'unconfirmed');
  assert.equal(requests, 1);
  assert.equal(signal.aborted, true);
});
