// @vitest-environment jsdom
// S3: every read and write of the student's file/link submission, against a
// recording fake Supabase client.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ATTACHMENT_COLUMNS, SIGNED_URL_SECONDS, addAttachment, ensureSubmission, loadYourWork, removeAttachment,
  replaceAttachment, saveNote, signedOwnFileUrl, turnIn, unsubmit,
} from './attachmentApi';
import { MESSAGES } from './attachmentRules';

const UID = '11111111-1111-4111-8111-111111111111';
const TASK = '22222222-2222-4222-8222-222222222222';
const NEW_ID = '33333333-3333-4333-8333-333333333333';
const sleep = () => Promise.resolve();

// results: { 'table:op': [ {data,error}, ... ] } consumed in order (the last one repeats).
// op is insert | update | delete | select (a read).
const fakeClient = (results = {}, storage = {}) => {
  const calls = [];
  const take = (key) => {
    const list = results[key];
    if (!list) return { data: null, error: null };
    return list.length > 1 ? list.shift() : list[0];
  };
  const client = {
    calls,
    from(table) {
      const call = { table, op: 'select', args: {}, filters: [] };
      calls.push(call);
      const q = {
        select(cols) { call.args.select = cols; return q; },
        insert(rows) { call.op = 'insert'; call.args.rows = rows; return q; },
        update(values) { call.op = 'update'; call.args.values = values; return q; },
        delete() { call.op = 'delete'; return q; },
        eq(col, val) { call.filters.push([col, val]); return q; },
        single() { return q; },
        maybeSingle() { return q; },
        then(resolve, reject) { return Promise.resolve(take(`${table}:${call.op}`)).then(resolve, reject); },
      };
      return q;
    },
    storage: {
      from(bucket) {
        return {
          upload: (path, file, opts) => { calls.push({ storage: 'upload', bucket, path, opts }); return Promise.resolve(storage.upload?.shift?.() ?? { error: null }); },
          remove: (paths) => { calls.push({ storage: 'remove', bucket, paths }); return Promise.resolve(storage.remove?.shift?.() ?? { error: null }); },
          createSignedUrl: (path, secs) => { calls.push({ storage: 'sign', bucket, path, secs }); return Promise.resolve(storage.sign ?? { data: { signedUrl: 'https://x.invalid/sign?token=t' }, error: null }); },
        };
      },
    },
  };
  return client;
};
const ops = client => client.calls.map(c => (c.storage ? `storage.${c.storage}` : `${c.table}:${c.op}`));
const pdf = (size = 2048) => ({ name: 'Final essay.pdf', size });
const submission = { id: 'sub-1', status: 'in_progress', released: false };
const fileRow = { id: 'att-1', kind: 'file', file_path: `${UID}/${TASK}/old-old.pdf`, file_name: 'old.pdf', size_bytes: 5, note: null };
const linkRow = { id: 'att-1', kind: 'link', link_url: 'https://example.org/a', note: 'hi' };

afterEach(() => vi.restoreAllMocks());

describe('loadYourWork', () => {
  it('reads the attachment scoped to the submission and the student; no feedback read when not released', async () => {
    const client = fakeClient({ 'worksheet_submission_attachments:select': [{ data: fileRow, error: null }] });
    const result = await loadYourWork({ submission, studentId: UID, client, sleep });
    expect(result).toEqual({ ok: true, attachment: fileRow, feedback: null, feedbackFailed: false });
    expect(client.calls[0].args.select).toBe(ATTACHMENT_COLUMNS);
    expect(client.calls[0].filters).toEqual([['submission_id', 'sub-1'], ['student_id', UID]]);
    expect(client.calls.filter(c => c.table === 'worksheet_submissions')).toHaveLength(0);
  });

  it('released: the remarks query itself carries released = true', async () => {
    const client = fakeClient({
      'worksheet_submission_attachments:select': [{ data: linkRow, error: null }],
      'worksheet_submissions:select': [{ data: { remarks: 'Good work.' }, error: null }],
    });
    const result = await loadYourWork({ submission: { ...submission, released: true }, studentId: UID, client, sleep });
    expect(result.feedback).toBe('Good work.');
    const fb = client.calls.find(c => c.table === 'worksheet_submissions');
    expect(fb.args.select).toBe('remarks');
    expect(fb.filters).toEqual([['id', 'sub-1'], ['student_id', UID], ['released', true]]);
  });

  it('a read retries once, then reports a load failure', async () => {
    const client = fakeClient({ 'worksheet_submission_attachments:select': [{ data: null, error: { message: 'down' } }] });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadYourWork({ submission, studentId: UID, client, sleep })).toEqual({ ok: false, error: MESSAGES.loadFailed });
    expect(client.calls).toHaveLength(2);
  });

  it('a failed feedback read keeps the work and flags it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient({
      'worksheet_submission_attachments:select': [{ data: fileRow, error: null }],
      'worksheet_submissions:select': [{ data: null, error: { message: 'down' } }],
    });
    const result = await loadYourWork({ submission: { ...submission, released: true }, studentId: UID, client, sleep });
    expect(result).toMatchObject({ ok: true, attachment: fileRow, feedback: null, feedbackFailed: true });
  });
});

describe('ensureSubmission', () => {
  const row = { sheet: { id: TASK }, assignee: { section_id: 'sec-1' }, submission: null };
  it('inserts an in-progress online row with the assignment section', async () => {
    const client = fakeClient({ 'worksheet_submissions:insert': [{ data: submission, error: null }] });
    expect(await ensureSubmission({ row, studentId: UID, client, sleep })).toEqual({ ok: true, submission });
    expect(client.calls[0].args.rows).toEqual([{ worksheet_id: TASK, student_id: UID, section_id: 'sec-1', source: 'online', status: 'in_progress' }]);
  });
  it('23505: reads the existing row back instead', async () => {
    const client = fakeClient({
      'worksheet_submissions:insert': [{ data: null, error: { code: '23505' } }],
      'worksheet_submissions:select': [{ data: submission, error: null }],
    });
    expect(await ensureSubmission({ row, studentId: UID, client, sleep })).toEqual({ ok: true, submission });
  });
  it('an existing submission is used as it is', async () => {
    const client = fakeClient();
    expect(await ensureSubmission({ row: { ...row, submission }, studentId: UID, client })).toEqual({ ok: true, submission });
    expect(client.calls).toHaveLength(0);
  });
});

describe('addAttachment', () => {
  const base = { submission, taskId: TASK, studentId: UID, newId: () => NEW_ID };

  it('a file: uploads with the extension MIME type and upsert false, then inserts the row', async () => {
    const client = fakeClient({ 'worksheet_submission_attachments:insert': [{ data: { id: 'att-2' }, error: null }] });
    const result = await addAttachment({ ...base, kind: 'file', file: pdf(), note: '  Read page 2  ', client });
    expect(result).toEqual({ ok: true, attachment: { id: 'att-2' } });
    expect(ops(client)).toEqual(['storage.upload', 'worksheet_submission_attachments:insert']);
    const up = client.calls[0];
    expect(up.bucket).toBe('task-submissions');
    expect(up.path).toBe(`${UID}/${TASK}/${NEW_ID}-Final-essay.pdf`);
    expect(up.opts).toEqual({ cacheControl: '3600', upsert: false, contentType: 'application/pdf' });
    expect(client.calls[1].args.rows).toEqual([{ submission_id: 'sub-1', student_id: UID, kind: 'file', link_url: null,
      file_name: 'Final essay.pdf', mime_type: 'application/pdf', size_bytes: 2048, note: 'Read page 2', file_path: up.path }]);
  });

  it('a link: no upload, http(s) only', async () => {
    const client = fakeClient({ 'worksheet_submission_attachments:insert': [{ data: { id: 'att-2' }, error: null }] });
    await addAttachment({ ...base, kind: 'link', link: 'https://docs.example.org/d', note: '', client });
    expect(ops(client)).toEqual(['worksheet_submission_attachments:insert']);
    expect(client.calls[0].args.rows[0]).toMatchObject({ kind: 'link', link_url: 'https://docs.example.org/d', file_path: null, note: null });
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.org']) {
      const c = fakeClient();
      expect(await addAttachment({ ...base, kind: 'link', link: bad, client: c })).toMatchObject({ ok: false, field: true });
      expect(c.calls).toHaveLength(0);
    }
  });

  it('refuses a bad file or a long note before any request', async () => {
    const client = fakeClient();
    expect(await addAttachment({ ...base, kind: 'file', file: { name: 'x.exe', size: 5 }, client })).toMatchObject({ ok: false, field: true });
    expect(await addAttachment({ ...base, kind: 'file', file: pdf(20 * 1024 * 1024 + 1), client })).toMatchObject({ ok: false, field: true });
    expect(await addAttachment({ ...base, kind: 'file', file: pdf(), note: 'x'.repeat(1001), client }))
      .toEqual({ ok: false, error: 'Keep your note to 1,000 characters.', field: true });
    expect(client.calls).toHaveLength(0);
  });

  it('an upload failure stops there (network, or storage refusing a closed submission)', async () => {
    const network = fakeClient({}, { upload: [{ error: { message: 'Failed to fetch' } }] });
    expect(await addAttachment({ ...base, kind: 'file', file: pdf(), client: network })).toEqual({ ok: false, error: MESSAGES.uploadFailed });
    const refused = fakeClient({}, { upload: [{ error: { statusCode: '403', message: 'new row violates row-level security policy' } }] });
    expect(await addAttachment({ ...base, kind: 'file', file: pdf(), client: refused })).toEqual({ ok: false, error: MESSAGES.notOpen });
    expect(ops(refused)).toEqual(['storage.upload']);
  });

  it('the insert fails: the upload is removed; the write is never retried', async () => {
    const client = fakeClient({ 'worksheet_submission_attachments:insert': [{ data: null, error: { message: 'down' } }] });
    const result = await addAttachment({ ...base, kind: 'file', file: pdf(), client });
    expect(result).toEqual({ ok: false, error: MESSAGES.saveFailed, orphan: false });
    expect(ops(client)).toEqual(['storage.upload', 'worksheet_submission_attachments:insert', 'storage.remove']);
    expect(client.calls[2].paths).toEqual([client.calls[0].path]);
  });

  it('the insert fails and the removal fails too: the orphan is reported', async () => {
    const client = fakeClient({ 'worksheet_submission_attachments:insert': [{ data: null, error: { code: '23505' } }] },
      { remove: [{ error: { message: 'down' } }] });
    expect(await addAttachment({ ...base, kind: 'file', file: pdf(), client }))
      .toEqual({ ok: false, error: MESSAGES.duplicate + MESSAGES.orphan, orphan: true });
  });

  it('RLS refuses the row (submission no longer open)', async () => {
    const client = fakeClient({ 'worksheet_submission_attachments:insert': [{ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }] });
    expect((await addAttachment({ ...base, kind: 'link', link: 'https://a.org', client })).error).toBe(MESSAGES.notOpen);
  });
});

describe('replaceAttachment', () => {
  const base = { taskId: TASK, studentId: UID, newId: () => NEW_ID };

  it('uploads the new file FIRST, updates the row in place, then removes the old file', async () => {
    const client = fakeClient({ 'worksheet_submission_attachments:update': [{ data: [{ id: 'att-1', kind: 'file' }], error: null }] });
    const result = await replaceAttachment({ ...base, current: fileRow, kind: 'file', file: pdf(), note: 'n', client });
    expect(result).toEqual({ ok: true, attachment: { id: 'att-1', kind: 'file' }, orphan: false });
    expect(ops(client)).toEqual(['storage.upload', 'worksheet_submission_attachments:update', 'storage.remove']);
    expect(client.calls[1].filters).toEqual([['id', 'att-1'], ['student_id', UID]]);
    expect(client.calls[2].paths).toEqual([fileRow.file_path]);
  });

  it('a failed upload changes nothing (the old work stays)', async () => {
    const client = fakeClient({}, { upload: [{ error: { message: 'Failed to fetch' } }] });
    expect(await replaceAttachment({ ...base, current: fileRow, kind: 'file', file: pdf(), client }))
      .toEqual({ ok: false, error: MESSAGES.uploadFailed });
    expect(ops(client)).toEqual(['storage.upload']);
  });

  it('a failed update removes only the NEW upload; the old file is untouched', async () => {
    const client = fakeClient({ 'worksheet_submission_attachments:update': [{ data: null, error: { message: 'down' } }] });
    const result = await replaceAttachment({ ...base, current: fileRow, kind: 'file', file: pdf(), client });
    expect(result).toEqual({ ok: false, error: MESSAGES.saveFailed, orphan: false });
    expect(ops(client)).toEqual(['storage.upload', 'worksheet_submission_attachments:update', 'storage.remove']);
    expect(client.calls[2].paths).toEqual([client.calls[0].path]);
    expect(client.calls[2].paths).not.toContain(fileRow.file_path);
  });

  it('zero rows updated (turned in meanwhile): the new upload is removed, nothing else', async () => {
    const client = fakeClient({ 'worksheet_submission_attachments:update': [{ data: [], error: null }] });
    expect((await replaceAttachment({ ...base, current: fileRow, kind: 'file', file: pdf(), client })).error).toBe(MESSAGES.notOpen);
    expect(client.calls.filter(c => c.storage === 'remove')[0].paths).toEqual([client.calls[0].path]);
  });

  it('file -> link: no upload; the old file is removed after the update; a failed removal is an orphan', async () => {
    const client = fakeClient({ 'worksheet_submission_attachments:update': [{ data: [{ id: 'att-1', kind: 'link' }], error: null }] },
      { remove: [{ error: { message: 'down' } }] });
    const result = await replaceAttachment({ ...base, current: fileRow, kind: 'link', link: 'https://a.org/x', client });
    expect(result.orphan).toBe(true);
    expect(ops(client)).toEqual(['worksheet_submission_attachments:update', 'storage.remove']);
    expect(client.calls[0].args.values).toMatchObject({ kind: 'link', link_url: 'https://a.org/x', file_path: null, file_name: null, mime_type: null, size_bytes: null });
  });

  it('link -> link: nothing to remove', async () => {
    const client = fakeClient({ 'worksheet_submission_attachments:update': [{ data: [{ id: 'att-1' }], error: null }] });
    await replaceAttachment({ ...base, current: linkRow, kind: 'link', link: 'https://b.org', client });
    expect(ops(client)).toEqual(['worksheet_submission_attachments:update']);
  });
});

describe('removeAttachment and saveNote', () => {
  it('remove: the row first (exactly one), then its file', async () => {
    const client = fakeClient({ 'worksheet_submission_attachments:delete': [{ data: [{ id: 'att-1' }], error: null }] });
    expect(await removeAttachment({ current: fileRow, studentId: UID, client })).toEqual({ ok: true, orphan: false });
    expect(ops(client)).toEqual(['worksheet_submission_attachments:delete', 'storage.remove']);
    expect(client.calls[0].filters).toEqual([['id', 'att-1'], ['student_id', UID]]);
  });
  it('remove: zero rows means it is no longer open; the file is kept', async () => {
    const client = fakeClient({ 'worksheet_submission_attachments:delete': [{ data: [], error: null }] });
    expect(await removeAttachment({ current: fileRow, studentId: UID, client })).toEqual({ ok: false, error: MESSAGES.notOpen });
    expect(ops(client)).toEqual(['worksheet_submission_attachments:delete']);
  });
  it('saveNote: only the note, trimmed, scoped; zero rows is not open', async () => {
    const ok = fakeClient({ 'worksheet_submission_attachments:update': [{ data: [{ id: 'att-1', note: 'x' }], error: null }] });
    expect(await saveNote({ current: linkRow, studentId: UID, note: '  x ', client: ok })).toEqual({ ok: true, attachment: { id: 'att-1', note: 'x' } });
    expect(ok.calls[0].args.values).toEqual({ note: 'x' });
    const none = fakeClient({ 'worksheet_submission_attachments:update': [{ data: [], error: null }] });
    expect(await saveNote({ current: linkRow, studentId: UID, note: 'x', client: none })).toEqual({ ok: false, error: MESSAGES.notOpen });
  });
});

describe('turnIn and unsubmit', () => {
  it('turn in sends ONLY the status, scoped to the row and the student, and takes the server state', async () => {
    const state = { id: 'sub-1', status: 'submitted', released: false, is_late: true, submitted_at: '2026-11-14 10:00:00' };
    const client = fakeClient({ 'worksheet_submissions:update': [{ data: [state], error: null }] });
    expect(await turnIn({ submission, studentId: UID, client })).toEqual({ ok: true, submission: state });
    expect(client.calls[0].args.values).toEqual({ status: 'submitted' });
    expect(client.calls[0].filters).toEqual([['id', 'sub-1'], ['student_id', UID]]);
    expect(client.calls[0].args.select).toBe('id, worksheet_id, status, released, is_late, submitted_at');
  });

  it.each([
    ['attachment_required', { data: null, error: { message: 'attachment_required' } }, MESSAGES.attachmentRequired],
    ['zero rows (graded)', { data: [], error: null }, MESSAGES.alreadyGraded],
    ['the guard refusing a graded row', { data: null, error: { message: 'Students may not move a submission from checked to submitted' } }, MESSAGES.alreadyGraded],
    ['anything else', { data: null, error: { message: 'Failed to fetch' } }, MESSAGES.turnInFailed],
  ])('turn in: %s', async (_name, result, message) => {
    const client = fakeClient({ 'worksheet_submissions:update': [result] });
    expect(await turnIn({ submission, studentId: UID, client })).toEqual({ ok: false, error: message });
    expect(client.calls).toHaveLength(1);
  });

  it('unsubmit sends only status in_progress; zero rows means the teacher graded it', async () => {
    const back = fakeClient({ 'worksheet_submissions:update': [{ data: [{ id: 'sub-1', status: 'in_progress' }], error: null }] });
    expect((await unsubmit({ submission, studentId: UID, client: back })).ok).toBe(true);
    expect(back.calls[0].args.values).toEqual({ status: 'in_progress' });
    const graded = fakeClient({ 'worksheet_submissions:update': [{ data: [], error: null }] });
    expect(await unsubmit({ submission, studentId: UID, client: graded })).toEqual({ ok: false, error: MESSAGES.alreadyGraded });
    const down = fakeClient({ 'worksheet_submissions:update': [{ data: null, error: { message: 'x' } }] });
    expect(await unsubmit({ submission, studentId: UID, client: down })).toEqual({ ok: false, error: MESSAGES.unsubmitFailed });
  });

  it('a thrown write (offline) is a friendly failure, not a crash, and is not retried', async () => {
    const client = fakeClient();
    client.from = () => { throw new Error('offline'); };
    expect(await turnIn({ submission, studentId: UID, client })).toEqual({ ok: false, error: MESSAGES.turnInFailed });
  });
});

describe('signedOwnFileUrl', () => {
  it('a 60-second URL for a file, never logged', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient();
    expect(await signedOwnFileUrl({ current: fileRow, client })).toBe('https://x.invalid/sign?token=t');
    expect(client.calls[0]).toMatchObject({ storage: 'sign', bucket: 'task-submissions', path: fileRow.file_path, secs: SIGNED_URL_SECONDS });
    expect(SIGNED_URL_SECONDS).toBe(60);
    expect([...log.mock.calls, ...warn.mock.calls].flat().join(' ')).not.toContain('token');
  });
  it('null for a link or a failure', async () => {
    expect(await signedOwnFileUrl({ current: linkRow, client: fakeClient() })).toBeNull();
    expect(await signedOwnFileUrl({ current: fileRow, client: fakeClient({}, { sign: { data: null, error: { message: 'x' } } }) })).toBeNull();
  });
});
