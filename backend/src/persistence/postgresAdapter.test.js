import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresPersistence, createIsolatedPostgresPersistence,
  createUserScopedRpcTransport } from './postgresAdapter.js';
import { WORKSHEET_KIND } from '../../../shared/trustedPersistence/contracts.js';
import { createBlankIlawDocument } from '../../../frontend/src/pages/dashboards/teacher/ilaw/ilawTemplateModel.js';

const id = '11111111-1111-4111-8111-111111111111';
const subject = '22222222-2222-4222-8222-222222222222';
const command = document => ({ requestId: 'request-1', id: null, expectedRevision: null, document });
const manual = () => {
  const document = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7' });
  return { kind: 'eduscribe.manual-ilaw', version: 2, title: '',
    assignment: { subjectId: subject, gradeLevel: 'Grade 7', schoolYear: '2034-2035' },
    document, sourceDetails: { classDuration: '', teachingStrategy: '', learningObjectives: '' } };
};
const worksheet = () => ({ kind: WORKSHEET_KIND, version: 1, title: '',
  assignment: null, sourcePlanId: null, instructions: '', workflowState: 'draft',
  groups: [{ id: 'group-1', title: '', directions: 'Work in progress' }],
  questions: [{ id: 'question-1', groupId: 'group-1', type: null, text: '', options: [''], points: null }],
  answerKeys: {} });
const response = document => ({ data: { ok: true, durable: true,
  record: { id, ownerId: id, type: document.kind === WORKSHEET_KIND ? 'worksheet' : 'manual',
    revision: 1, schoolYear: '2034-2035', document } }, error: null });

test('production adapter cannot call an injected RPC even when constructed with one', async () => {
  let calls = 0;
  const service = createPostgresPersistence({ invokeRpc: async () => { calls++; return response(manual()); } });
  assert.equal(service.enabled, false);
  assert.equal((await service.execute('CreateIncompleteDraft', 'jwt', command(manual()))).code, 'integration_blocked');
  assert.equal(calls, 0);
});

test('isolated adapter maps valid Manual and incomplete Worksheet commands to single user-scoped RPC calls', async () => {
  const calls = [];
  const service = createIsolatedPostgresPersistence({ invokeRpc: async (name, args, token) => {
    calls.push({ name, args, token }); return response(args.p_document);
  } });
  const m = await service.execute('CreateIncompleteDraft', 'synthetic-jwt', command(manual()));
  const w = await service.execute('CreatePrivateWorksheetDraft', 'synthetic-jwt', command(worksheet()));
  assert.equal(m.ok, true); assert.equal(w.ok, true);
  assert.deepEqual(calls.map(c => c.name), ['eduscribe_manual_write_v1', 'eduscribe_worksheet_write_v1']);
  assert.deepEqual(calls.map(c => c.args.p_action), ['create', 'create']);
  assert.equal(calls[0].args.p_document.teacher_id, undefined);
  assert.equal(calls[1].args.p_document.answerKeys['question-1'], undefined);
  assert.equal(calls[1].token, 'synthetic-jwt');
});

test('reopen and complete projection require the owner-scoped RPC and preserve private draft distinctions', async () => {
  const names = [];
  const service = createIsolatedPostgresPersistence({ invokeRpc: async name => {
    names.push(name); return response(worksheet());
  } });
  assert.equal((await service.execute('ReopenPrivateWorksheetDraft', 'jwt', { id })).record.id, id);
  const check = await service.execute('ValidateWorksheetForDistribution', 'jwt', { id });
  assert.equal(check.valid, false); assert.equal(check.distributionAuthorized, false);
  assert.equal((await service.execute('PrepareNormalizedAssessmentProjection', 'jwt', { id })).code, 'incomplete_worksheet');
  assert.deepEqual(names, ['eduscribe_worksheet_read_v1', 'eduscribe_worksheet_projection_v1',
    'eduscribe_worksheet_projection_v1']);
});

test('forged identities, stale writes, unknown outcomes, and unauthorized RPC errors fail closed', async () => {
  let calls = 0;
  const service = createIsolatedPostgresPersistence({ invokeRpc: async () => {
    calls++; return { data: null, error: { message: 'revision_conflict' } };
  } });
  assert.equal((await service.execute('CreateIncompleteDraft', 'jwt',
    command({ ...manual(), teacher_id: id }))).code, 'invalid_document');
  assert.equal((await service.execute('CreateIncompleteDraft', null, command(manual()))).code, 'not_authenticated');
  assert.equal((await service.execute('UpdateIncompleteDraft', 'jwt',
    { ...command(manual()), id, expectedRevision: 1 })).code, 'revision_conflict');
  assert.equal(calls, 1);
  const unknown = createIsolatedPostgresPersistence({ invokeRpc: async () => ({ data: null, error: null }) });
  assert.equal((await unknown.execute('CreateIncompleteDraft', 'jwt', command(manual()))).code, 'integration_blocked');
});

test('user-scoped transport uses only anon key and caller bearer token', async () => {
  const made = [];
  const transport = createUserScopedRpcTransport({ url: 'https://abcdefghijklmnopqrst.supabase.co',
    anonKey: 'synthetic-public-anon', createClientImpl: (url, key, options) => {
      made.push({ url, key, options }); return { rpc: async (name, args) => ({ data: { name, args }, error: null }) };
    } });
  await transport('eduscribe_manual_read_v1', { p_id: id }, 'synthetic-jwt');
  assert.equal(made[0].key, 'synthetic-public-anon');
  assert.equal(await made[0].options.accessToken(), 'synthetic-jwt');
  assert.equal(made[0].options.auth.persistSession, false);
  assert.throws(() => createUserScopedRpcTransport({
    url: 'https://jllstakxiamxiycnwrbd.supabase.co', anonKey: 'synthetic-public-anon',
  }), error => error.code === 'integration_blocked');
  const testDataTransport = createUserScopedRpcTransport({
    url: 'https://jllstakxiamxiycnwrbd.supabase.co', anonKey: 'synthetic-public-anon',
    allowTestDataProject: true, createClientImpl: () => ({ rpc: async () => ({ data: { ok: true }, error: null }) }),
  });
  assert.deepEqual((await testDataTransport('synthetic_rpc', {}, 'synthetic-jwt')).data, { ok: true });
  assert.throws(() => createUserScopedRpcTransport({
    url: 'http://127.0.0.1:54322', anonKey: 'synthetic-public-anon',
  }), error => error.code === 'integration_blocked');
});

test('only an exact explicit production approval opens the production transport', async () => {
  const productionUrl = 'https://jllstakxiamxiycnwrbd.supabase.co';
  const options = { url: productionUrl, anonKey: 'synthetic-public-anon',
    createClientImpl: (_url, _key, config) => ({ rpc: async () => ({
      data: { scopedToken: await config.accessToken() }, error: null,
    }) }) };
  for (const change of [
    {}, { approvedProductionProjectRef: 'abcdefghijklmnopqrst' },
    { approvedProductionProjectRef: 'jllstakxiamxiycnwrbd', url: 'https://abcdefghijklmnopqrst.supabase.co/' },
  ]) assert.throws(() => createUserScopedRpcTransport({ ...options, ...change }),
    error => error.code === 'integration_blocked');
  const transport = createUserScopedRpcTransport({ ...options,
    approvedProductionProjectRef: 'jllstakxiamxiycnwrbd' });
  assert.deepEqual((await transport('synthetic_rpc', {}, 'synthetic-jwt')).data,
    { scopedToken: 'synthetic-jwt' });
  assert.throws(() => createUserScopedRpcTransport({ url: 'https://abcdefghijklmnopqrst.supabase.co/',
    anonKey: 'synthetic-public-anon', approvedProductionProjectRef: 'jllstakxiamxiycnwrbd' }),
  error => error.code === 'integration_blocked');
});
