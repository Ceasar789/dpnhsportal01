// G2: a student's LRN on the admin invite and in the user directory. The
// handlers run against a fake Supabase client; nothing leaves this process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteUser, listDirectory, LRN_PATTERN } from './onboarding.js';

process.env.APP_URL = 'https://portal.example.test';

// A fake client: every call is recorded; `rows` decides what each read returns.
const fakeClient = ({ lrnOwner = null, studentInsertError = null, inviteError = null, students = [] } = {}) => {
  const calls = [];
  const query = (table) => {
    const q = { table, ops: [] };
    const record = (op, arg) => { q.ops.push([op, arg]); return builder; };
    const result = () => {
      const [first] = q.ops;
      if (table === 'profiles' && first[0] === 'select' && first[1] === '*') {
        return { data: [{ id: 'p1', email: 'kid@school.test', role: 'student', status: 'active' }, { id: 'p2', email: 't@school.test', role: 'teacher', status: 'active' }], error: null };
      }
      if (table === 'profiles' && first[0] === 'select') return { data: null, error: null };
      if (table === 'profiles' && first[0] === 'insert') return { data: { id: 'new-user', ...first[1] }, error: null };
      if (table === 'students' && first[0] === 'select' && first[1] === 'id') return { data: lrnOwner, error: null };
      if (table === 'students' && first[0] === 'select') return { data: students, error: null };
      if (table === 'students' && first[0] === 'insert') return { data: null, error: studentInsertError };
      return { data: null, error: null };
    };
    const builder = {
      select: a => record('select', a), eq: (k, v) => record('eq', [k, v]), order: a => record('order', a),
      insert: a => record('insert', a), delete: () => record('delete'),
      maybeSingle: () => Promise.resolve(result()), single: () => Promise.resolve(result()),
      then: (ok, bad) => Promise.resolve(result()).then(ok, bad),
    };
    calls.push(q);
    return builder;
  };
  const authLog = [];
  return {
    calls, authLog,
    from: query,
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [] }, error: null }),
        generateLink: async () => { authLog.push('generateLink'); return { data: { user: { id: 'new-user', app_metadata: {} } }, error: null }; },
        updateUserById: async () => { authLog.push('updateUserById'); return { error: null }; },
        inviteUserByEmail: async () => { authLog.push('inviteUserByEmail'); return { error: inviteError }; },
        deleteUser: async (id) => { authLog.push(`deleteUser:${id}`); return { error: null }; },
      },
    },
  };
};
const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};
const invite = async (body, client) => {
  const res = fakeRes();
  await inviteUser({ body }, res, () => client);
  return res;
};
const ops = (client, table, op) => client.calls.filter(c => c.table === table && c.ops[0][0] === op);
const quiet = () => { const e = console.error; console.error = () => {}; return () => { console.error = e; }; };

test('the LRN pattern is exactly twelve digits', () => {
  for (const ok of ['108123456789', '000000000000']) assert.equal(LRN_PATTERN.test(ok), true, ok);
  for (const bad of ['', '10812345678', '1081234567890', '10812345678a', ' 108123456789', '1081-2345-678']) assert.equal(LRN_PATTERN.test(bad), false, bad);
});

test('a student invite without a valid LRN is refused before anything is created', async () => {
  for (const lrn of [undefined, '', '   ', '12345', '10812345678x', '1081234567890']) {
    const client = fakeClient();
    const res = await invite({ name: 'Kid', email: 'kid@school.test', role: 'student', lrn }, client);
    assert.equal(res.statusCode, 400, String(lrn));
    assert.deepEqual(res.body, { error: 'A 12-digit LRN is required for a student.' });
    assert.equal(client.calls.length, 0);
    assert.deepEqual(client.authLog, []);
  }
});

test('a student LRN already in use is refused with 409 before anything is created', async () => {
  const client = fakeClient({ lrnOwner: { id: 'someone' } });
  const res = await invite({ name: 'Kid', email: 'kid@school.test', role: 'student', lrn: '108123456789' }, client);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: 'This LRN is already used by another student.' });
  assert.deepEqual(ops(client, 'students', 'select')[0].ops, [['select', 'id'], ['eq', ['lrn', '108123456789']]]);
  assert.deepEqual(client.authLog, []);
  assert.equal(ops(client, 'profiles', 'insert').length, 0);
});

test('a student invite trims the LRN, inserts the students row after the profile, and returns it', async () => {
  const client = fakeClient();
  const res = await invite({ name: 'Kid', email: 'kid@school.test', role: 'student', lrn: ' 108123456789 ' }, client);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.lrn, '108123456789');
  const order = client.calls.map(c => `${c.table}:${c.ops[0][0]}`);
  assert.ok(order.indexOf('profiles:insert') < order.indexOf('students:insert'));
  assert.deepEqual(ops(client, 'students', 'insert')[0].ops[0], ['insert', { id: 'new-user', lrn: '108123456789' }]);
  assert.deepEqual(client.authLog, ['generateLink', 'updateUserById', 'inviteUserByEmail']);
});

test('a unique-violation race on the students insert returns 409 and removes the profile and the auth user', async () => {
  const restore = quiet();
  try {
    const client = fakeClient({ studentInsertError: { code: '23505', message: 'duplicate key' } });
    const res = await invite({ name: 'Kid', email: 'kid@school.test', role: 'student', lrn: '108123456789' }, client);
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { error: 'This LRN is already used by another student.' });
    assert.deepEqual(ops(client, 'profiles', 'delete')[0].ops, [['delete', undefined], ['eq', ['id', 'new-user']]]);
    assert.ok(client.authLog.includes('deleteUser:new-user'));
    assert.equal(client.authLog.includes('inviteUserByEmail'), false);
  } finally { restore(); }
});

test('a failure after the students row was created rolls back the students row, the profile and the auth user', async () => {
  const restore = quiet();
  try {
    const client = fakeClient({ inviteError: new Error('mail down') });
    const res = await invite({ name: 'Kid', email: 'kid@school.test', role: 'student', lrn: '108123456789' }, client);
    assert.equal(res.statusCode, 502);
    assert.deepEqual(ops(client, 'students', 'delete')[0].ops, [['delete', undefined], ['eq', ['id', 'new-user']]]);
    assert.equal(ops(client, 'profiles', 'delete').length, 1);
    assert.ok(client.authLog.includes('deleteUser:new-user'));
  } finally { restore(); }
});

test('teacher and admin invites ignore lrn: no LRN check, no students row, the same response as before', async () => {
  for (const role of ['teacher', 'main_admin']) {
    const client = fakeClient({ lrnOwner: { id: 'someone' } });
    const res = await invite({ name: 'T', email: 't@school.test', role, lrn: 'not-an-lrn' }, client);
    assert.equal(res.statusCode, 201, role);
    assert.equal('lrn' in res.body.user, false);
    assert.equal(client.calls.filter(c => c.table === 'students').length, 0);
    assert.deepEqual(ops(client, 'profiles', 'insert')[0].ops[0][1], { id: 'new-user', email: 't@school.test', name: 'T', role: 'guest', department: null, status: 'inactive' });
  }
});

test('the directory adds lrn from students for each profile, null when there is none', async () => {
  const client = fakeClient({ students: [{ id: 'p1', lrn: '108123456789' }] });
  const res = fakeRes();
  await listDirectory(res, () => client);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.users.map(u => [u.id, u.lrn]), [['p1', '108123456789'], ['p2', null]]);
  assert.deepEqual(ops(client, 'students', 'select')[0].ops, [['select', 'id, lrn']]);
});
