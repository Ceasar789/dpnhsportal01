// Learning Materials (M2): reads and writes against a fake Supabase client.
// Upload then insert (the upload is removed if the insert fails), delete the
// row then the file, the MIME type from the extension, upsert false, the
// <teacher id>/<uuid>-<name> path, short signed URLs that are never logged.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../config/supabase', () => ({ supabase: {} }));

import {
  MATERIALS_BUCKET, createFileMaterial, createLinkMaterial, deleteMaterial, listMaterials, loadOfficialSchoolYear,
  openInNewTab, signedMaterialUrl, updateMaterial,
} from './materialsApi';

const UID = '0b4e3c3a-1d2e-4f5a-8b9c-0d1e2f3a4b5c';
const ID = 'f0e1d2c3-b4a5-4968-8776-655443322110';
const noSleep = () => Promise.resolve();

// A chainable fake: every call is recorded; the terminal result comes from `results`.
const fakeClient = (results = {}) => {
  const calls = [];
  const builder = (table) => {
    const q = { table, ops: [] };
    const chain = {
      select: (...a) => { q.ops.push(['select', ...a]); return chain; },
      insert: (...a) => { q.ops.push(['insert', ...a]); return chain; },
      update: (...a) => { q.ops.push(['update', ...a]); return chain; },
      delete: () => { q.ops.push(['delete']); return chain; },
      eq: (...a) => { q.ops.push(['eq', ...a]); return chain; },
      order: (...a) => { q.ops.push(['order', ...a]); return Promise.resolve(results[`${table}.list`] ?? { data: [], error: null }); },
      single: () => Promise.resolve(results[`${table}.single`] ?? { data: null, error: null }),
      then: (resolve, reject) => Promise.resolve(results[`${table}.then`] ?? { data: [], error: null }).then(resolve, reject),
    };
    calls.push(q);
    return chain;
  };
  const storageCalls = [];
  const storage = {
    from: bucket => ({
      upload: (...a) => { storageCalls.push(['upload', bucket, ...a]); return Promise.resolve(results.upload ?? { data: {}, error: null }); },
      remove: (...a) => { storageCalls.push(['remove', bucket, ...a]); return Promise.resolve(results.remove ?? { data: [], error: null }); },
      createSignedUrl: (...a) => { storageCalls.push(['sign', bucket, ...a]); return Promise.resolve(results.sign ?? { data: { signedUrl: 'https://x.supabase.co/storage/v1/object/sign/learning-materials/a?token=t' }, error: null }); },
    }),
  };
  return { client: { from: builder, storage }, calls, storageCalls };
};

const fields = { title: 'Cells', description: null, subject_id: 's1', grade_level: 'Grade 7' };
const file = (name = 'Week 1 Cells.docx', size = 2048) => ({ name, size, type: '' });

afterEach(() => vi.restoreAllMocks());

describe('reads', () => {
  it('lists only the teacher\'s rows, newest first, with the subject name', async () => {
    const { client, calls } = fakeClient({ 'learning_materials.list': { data: [{ id: 1 }], error: null } });
    expect(await listMaterials(UID, { client })).toEqual([{ id: 1 }]);
    const ops = calls[0].ops;
    expect(calls[0].table).toBe('learning_materials');
    expect(ops[0][1]).toMatch(/subjects\(id, name\)/);
    expect(ops).toContainEqual(['eq', 'teacher_id', UID]);
    expect(ops).toContainEqual(['order', 'created_at', { ascending: false }]);
  });

  it('a failed list throws (after one retry)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client, calls } = fakeClient({ 'learning_materials.list': { data: null, error: { message: 'x' } } });
    await expect(listMaterials(UID, { client, sleep: noSleep })).rejects.toThrow(/could not be loaded/);
    expect(calls).toHaveLength(2);
  });

  it('the official school year from Settings, or null', async () => {
    expect(await loadOfficialSchoolYear({ client: fakeClient({ 'school_settings.single': { data: { school_year: '2026-2027' }, error: null } }).client })).toBe('2026-2027');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadOfficialSchoolYear({ client: fakeClient({ 'school_settings.single': { data: null, error: { message: 'x' } } }).client, sleep: noSleep })).toBeNull();
    expect(await loadOfficialSchoolYear({ client: fakeClient({ 'school_settings.single': { data: { school_year: 'bad' }, error: null } }).client })).toBeNull();
  });
});

describe('create a file material', () => {
  it('uploads to <uid>/<uuid>-<safe name> with the MIME type from the extension and upsert false, then inserts', async () => {
    const { client, calls, storageCalls } = fakeClient({ 'learning_materials.single': { data: { id: 'r1' }, error: null } });
    const result = await createFileMaterial({ teacherId: UID, file: file(), fields, client, newId: () => ID });
    expect(result).toEqual({ ok: true, row: { id: 'r1' } });
    const [op, bucket, path, sent, options] = storageCalls[0];
    expect([op, bucket, path]).toEqual(['upload', MATERIALS_BUCKET, `${UID}/${ID}-Week-1-Cells.docx`]);
    expect(sent.name).toBe('Week 1 Cells.docx');
    expect(options).toEqual({ cacheControl: '3600', upsert: false, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const insert = calls[0].ops.find(o => o[0] === 'insert')[1];
    expect(insert).toEqual({
      teacher_id: UID, ...fields, kind: 'file', file_path: `${UID}/${ID}-Week-1-Cells.docx`, file_name: 'Week 1 Cells.docx',
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size_bytes: 2048, link_url: null,
    });
  });

  it('a rejected file never reaches storage', async () => {
    const { client, storageCalls, calls } = fakeClient();
    expect((await createFileMaterial({ teacherId: UID, file: file('x.exe'), fields, client })).ok).toBe(false);
    expect((await createFileMaterial({ teacherId: UID, file: file('a.pdf', 20 * 1024 * 1024 + 1), fields, client })).error).toMatch(/20 MB/);
    expect(storageCalls).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('a failed upload inserts nothing', async () => {
    const { client, calls } = fakeClient({ upload: { data: null, error: { message: 'denied' } } });
    const result = await createFileMaterial({ teacherId: UID, file: file(), fields, client, newId: () => ID });
    expect(result).toEqual({ ok: false, error: 'The file could not be uploaded. Check your connection and try again.' });
    expect(calls).toEqual([]);
  });

  it('a failed insert removes the uploaded file', async () => {
    const { client, storageCalls } = fakeClient({ 'learning_materials.single': { data: null, error: { message: 'rls' } } });
    const result = await createFileMaterial({ teacherId: UID, file: file(), fields, client, newId: () => ID });
    expect(result).toEqual({ ok: false, error: 'The material could not be saved. Check your connection and try again.', orphan: false });
    expect(storageCalls[1]).toEqual(['remove', MATERIALS_BUCKET, [`${UID}/${ID}-Week-1-Cells.docx`]]);
  });

  it('when that removal also fails, the result says the file was left behind', async () => {
    const { client } = fakeClient({ 'learning_materials.single': { data: null, error: { message: 'rls' } }, remove: { data: null, error: { message: 'x' } } });
    const result = await createFileMaterial({ teacherId: UID, file: file(), fields, client, newId: () => ID });
    expect(result.orphan).toBe(true);
    expect(result.error).toMatch(/could not be removed automatically/);
  });
});

describe('links, edits and deletes', () => {
  it('a link is stored as typed, with every file field null', async () => {
    const { client, calls } = fakeClient({ 'learning_materials.single': { data: { id: 'l1' }, error: null } });
    expect((await createLinkMaterial({ teacherId: UID, url: ' https://www.deped.gov.ph ', fields, client })).ok).toBe(true);
    expect(calls[0].ops.find(o => o[0] === 'insert')[1]).toEqual({
      teacher_id: UID, ...fields, kind: 'link', link_url: 'https://www.deped.gov.ph', file_path: null, file_name: null, mime_type: null, size_bytes: null,
    });
  });

  it('javascript:, data: and ftp: links are refused before any request', async () => {
    const { client, calls } = fakeClient();
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'ftp://e.org']) {
      expect((await createLinkMaterial({ teacherId: UID, url, fields, client })).ok).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it('an edit updates only the shared fields (and a link\'s URL) of that row', async () => {
    const { client, calls } = fakeClient({ 'learning_materials.single': { data: { id: 'r1' }, error: null } });
    await updateMaterial({ row: { id: 'r1', kind: 'file' }, fields, client });
    expect(calls[0].ops.slice(0, 2)).toEqual([['update', fields], ['eq', 'id', 'r1']]);
    await updateMaterial({ row: { id: 'l1', kind: 'link' }, fields, url: 'https://e.org/x', client });
    expect(calls[1].ops[0]).toEqual(['update', { ...fields, link_url: 'https://e.org/x' }]);
    expect((await updateMaterial({ row: { id: 'l1', kind: 'link' }, fields, url: 'javascript:x', client })).ok).toBe(false);
  });

  it('delete removes the row first, then the file', async () => {
    const { client, calls, storageCalls } = fakeClient({ 'learning_materials.then': { data: [{ id: 'r1' }], error: null } });
    expect(await deleteMaterial({ row: { id: 'r1', kind: 'file', file_path: 'p/f.pdf' }, client })).toEqual({ ok: true, orphan: false });
    expect(calls[0].ops).toEqual([['delete'], ['eq', 'id', 'r1'], ['select', 'id']]);
    expect(storageCalls).toEqual([['remove', MATERIALS_BUCKET, ['p/f.pdf']]]);
  });

  it('a row that was not deleted keeps its file; a file left behind is reported', async () => {
    const none = fakeClient({ 'learning_materials.then': { data: [], error: null } });
    expect((await deleteMaterial({ row: { id: 'r1', kind: 'file', file_path: 'p/f.pdf' }, client: none.client })).ok).toBe(false);
    expect(none.storageCalls).toEqual([]);
    const orphan = fakeClient({ 'learning_materials.then': { data: [{ id: 'r1' }], error: null }, remove: { data: null, error: { message: 'x' } } });
    expect(await deleteMaterial({ row: { id: 'r1', kind: 'file', file_path: 'p/f.pdf' }, client: orphan.client })).toEqual({ ok: true, orphan: true });
    const link = fakeClient({ 'learning_materials.then': { data: [{ id: 'l1' }], error: null } });
    expect(await deleteMaterial({ row: { id: 'l1', kind: 'link' }, client: link.client })).toEqual({ ok: true, orphan: false });
    expect(link.storageCalls).toEqual([]);
  });
});

describe('opening', () => {
  it('signs a file for five minutes; links and failures give null', async () => {
    const { client, storageCalls } = fakeClient();
    expect(await signedMaterialUrl({ kind: 'file', file_path: 'p/f.pdf' }, { client })).toMatch(/^https:\/\//);
    expect(storageCalls[0]).toEqual(['sign', MATERIALS_BUCKET, 'p/f.pdf', 300]);
    expect(await signedMaterialUrl({ kind: 'link' }, { client })).toBeNull();
    expect(await signedMaterialUrl({ kind: 'file', file_path: 'p' }, { client: fakeClient({ sign: { data: null, error: { message: 'x' } } }).client })).toBeNull();
  });

  it('opens http(s) only, in a new tab with rel="noopener noreferrer", and leaves nothing behind', () => {
    const clicked = [];
    const doc = {
      body: { appendChild: (a) => { a.parent = true; } },
      createElement: () => ({ style: {}, click() { clicked.push({ href: this.href, target: this.target, rel: this.rel }); }, remove() { this.parent = false; } }),
    };
    expect(openInNewTab('https://e.org/a', doc)).toBe(true);
    expect(clicked).toEqual([{ href: 'https://e.org/a', target: '_blank', rel: 'noopener noreferrer' }]);
    expect(openInNewTab('javascript:alert(1)', doc)).toBe(false);
    expect(clicked).toHaveLength(1);
  });

  it('never logs a signed URL', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await signedMaterialUrl({ kind: 'file', file_path: 'p/f.pdf' }, { client: fakeClient().client });
    const all = [...log.mock.calls, ...warn.mock.calls, ...error.mock.calls].flat().join(' ');
    expect(all).not.toMatch(/token=|sign\//);
  });
});
