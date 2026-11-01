import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductionPersistence } from './productionBoundary.js';
import { createPostgresPersistence } from './postgresAdapter.js';

test('unapproved AI HTML save cannot reach a production RPC transport', async () => {
  let calls = 0;
  const command = { requestId: 'synthetic-request', id: null, expectedRevision: null,
    document: { html: '<p>Synthetic lesson plan</p>' } };
  const invokeRpc = async () => { calls += 1; throw new Error('Unexpected RPC call'); };

  const production = await createProductionPersistence().execute('SaveAiHtmlLessonPlan', 'synthetic-session', command);
  const adapter = await createPostgresPersistence({ invokeRpc }).execute('SaveAiHtmlLessonPlan', 'synthetic-session', command);

  assert.deepEqual([production.code, adapter.code], ['integration_blocked', 'integration_blocked']);
  assert.equal(production.durable, false);
  assert.equal(adapter.durable, false);
  assert.equal(calls, 0);
});
