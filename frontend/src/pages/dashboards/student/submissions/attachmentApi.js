// ============================================
// FILE: src/pages/dashboards/student/submissions/attachmentApi.js
// File/link submissions (S3): every read and write the student's Your work
// panel makes. Reads retry once (withRetry); writes are never retried, so
// nothing is saved twice. Every write is scoped to the row id AND the student,
// and expects exactly one row back. Database text is never shown: failures
// map to attachmentRules MESSAGES. Signed URLs are returned to the caller to
// open at once; they are never logged or stored here.
// ============================================

import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import { SUBMISSION_STATE_FIELDS } from '../../../../lib/studentTaskGraph';
import { FILE_NAME_MAX, fileProblem, linkProblem, mimeForFileName, safeLink } from '../../../../lib/uploadRules';
import {
  MESSAGES, SUBMISSIONS_BUCKET, attachmentPath, cleanNote, isAttachmentRequired, isGradedRefusal,
  isStorageRefusal, noteProblem,
} from './attachmentRules';

const TABLE = 'worksheet_submission_attachments';
export const ATTACHMENT_COLUMNS = 'id, submission_id, kind, file_path, file_name, mime_type, size_bytes, link_url, note';
export const SIGNED_URL_SECONDS = 60;

const retryOpts = (label, sleep) => ({ label, ...(sleep ? { sleep } : {}) });

// Runs one write. A thrown error (offline, aborted) becomes { error }.
const once = async (fn) => {
  try {
    const result = await fn();
    return { data: result?.data ?? null, error: result?.error ?? null };
  } catch (thrown) {
    return { data: null, error: thrown || new Error('failed') };
  }
};

const removeObject = async (client, path) => {
  const { error } = await once(() => client.storage.from(SUBMISSIONS_BUCKET).remove([path]));
  return !error;
};

const rowCount = data => (Array.isArray(data) ? data.length : data ? 1 : 0);
const firstRow = data => (Array.isArray(data) ? data[0] : data) ?? null;
const rlsRefusal = error => error?.code === '42501' || /row-level security/i.test(String(error?.message ?? ''));

// The attachment and, only for a released submission, the teacher's feedback.
// The remarks query itself carries released = true, so an unreleased remark is
// never requested. A failed feedback read keeps the work on screen.
export async function loadYourWork({ submission, studentId, client = supabase, sleep }) {
  if (!submission?.id) return { ok: true, attachment: null, feedback: null, feedbackFailed: false };
  const att = await withRetry(
    () => client.from(TABLE).select(ATTACHMENT_COLUMNS).eq('submission_id', submission.id).eq('student_id', studentId).maybeSingle(),
    retryOpts('Student attachment fetch', sleep),
  );
  if (att.error) return { ok: false, error: MESSAGES.loadFailed };
  let feedback = null;
  let feedbackFailed = false;
  if (submission.released === true) {
    const fb = await withRetry(
      () => client.from('worksheet_submissions').select('remarks')
        .eq('id', submission.id).eq('student_id', studentId).eq('released', true).maybeSingle(),
      retryOpts('Student released feedback fetch', sleep),
    );
    if (fb.error) feedbackFailed = true;
    else feedback = typeof fb.data?.remarks === 'string' && fb.data.remarks.trim() ? fb.data.remarks : null;
  }
  return { ok: true, attachment: att.data ?? null, feedback, feedbackFailed };
}

// The student's in-progress submission for this task, created on the first
// attach exactly as TasksTab creates one for a worksheet. section_id must be
// the assignment's (the RLS check pins it). A 23505 means one already exists:
// it is read back instead.
export async function ensureSubmission({ row, studentId, client = supabase, sleep }) {
  if (row.submission?.id) return { ok: true, submission: row.submission };
  const { data, error } = await once(() => client.from('worksheet_submissions').insert([{
    worksheet_id: row.sheet.id, student_id: studentId, section_id: row.assignee.section_id,
    source: 'online', status: 'in_progress',
  }]).select(SUBMISSION_STATE_FIELDS).single());
  if (!error && data) return { ok: true, submission: data };
  if (error?.code === '23505') {
    const existing = await withRetry(
      () => client.from('worksheet_submissions').select(SUBMISSION_STATE_FIELDS)
        .eq('worksheet_id', row.sheet.id).eq('student_id', studentId).single(),
      retryOpts('Student existing submission recovery fetch', sleep),
    );
    if (!existing.error && existing.data) return { ok: true, submission: existing.data };
  }
  return { ok: false, error: MESSAGES.startFailed };
}

// Validates what the student is adding; returns { problem } or the row fields.
const prepare = ({ kind, file, link, note }) => {
  const problem = noteProblem(note) || (kind === 'link' ? linkProblem(link) : fileProblem(file));
  if (problem) return { problem };
  if (kind === 'link') {
    return { fields: { kind: 'link', link_url: safeLink(link), file_path: null, file_name: null, mime_type: null, size_bytes: null, note: cleanNote(note) } };
  }
  return { fields: { kind: 'file', link_url: null, file_name: String(file.name).slice(0, FILE_NAME_MAX), mime_type: mimeForFileName(file.name), size_bytes: file.size, note: cleanNote(note) } };
};

const upload = async ({ client, studentId, taskId, file, contentType, newId }) => {
  const path = attachmentPath(studentId, taskId, newId(), file.name);
  const { error } = await once(() => client.storage.from(SUBMISSIONS_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType }));
  if (error) return { error: isStorageRefusal(error) ? MESSAGES.notOpen : MESSAGES.uploadFailed };
  return { path };
};

const writeFailure = (error, orphan) => {
  if (error?.code === '23505') return MESSAGES.duplicate + (orphan ? MESSAGES.orphan : '');
  if (rlsRefusal(error)) return MESSAGES.notOpen + (orphan ? MESSAGES.orphan : '');
  return MESSAGES.saveFailed + (orphan ? MESSAGES.orphan : '');
};

// Adds the first file or link. A file is uploaded, then its row inserted; if the
// insert fails, the upload is removed (a failed removal is reported as an orphan).
export async function addAttachment({ submission, taskId, studentId, kind, file, link, note, client = supabase, newId = () => crypto.randomUUID() }) {
  const prepared = prepare({ kind, file, link, note });
  if (prepared.problem) return { ok: false, error: prepared.problem, field: true };
  const fields = { ...prepared.fields };
  if (kind !== 'link') {
    const up = await upload({ client, studentId, taskId, file, contentType: fields.mime_type, newId });
    if (up.error) return { ok: false, error: up.error };
    fields.file_path = up.path;
  }
  const { data, error } = await once(() => client.from(TABLE)
    .insert([{ submission_id: submission.id, student_id: studentId, ...fields }]).select(ATTACHMENT_COLUMNS).single());
  if (!error && data) return { ok: true, attachment: data };
  const orphan = fields.file_path ? !(await removeObject(client, fields.file_path)) : false;
  return { ok: false, error: writeFailure(error, orphan), orphan };
}

// Replaces the work. The new file is uploaded FIRST; then the existing row is
// updated in place (one statement switches the kind, path or link). If the
// upload or the update fails, the old row and its file are untouched (a new
// upload is removed). Only after a successful update is the old file removed.
export async function replaceAttachment({ current, taskId, studentId, kind, file, link, note, client = supabase, newId = () => crypto.randomUUID() }) {
  const prepared = prepare({ kind, file, link, note });
  if (prepared.problem) return { ok: false, error: prepared.problem, field: true };
  const fields = { ...prepared.fields };
  if (kind !== 'link') {
    const up = await upload({ client, studentId, taskId, file, contentType: fields.mime_type, newId });
    if (up.error) return { ok: false, error: up.error };
    fields.file_path = up.path;
  }
  const { data, error } = await once(() => client.from(TABLE).update(fields)
    .eq('id', current.id).eq('student_id', studentId).select(ATTACHMENT_COLUMNS));
  if (error || rowCount(data) !== 1) {
    const orphan = fields.file_path ? !(await removeObject(client, fields.file_path)) : false;
    return { ok: false, error: error ? writeFailure(error, orphan) : MESSAGES.notOpen + (orphan ? MESSAGES.orphan : ''), orphan };
  }
  let orphan = false;
  if (current.kind === 'file' && current.file_path && current.file_path !== fields.file_path) {
    orphan = !(await removeObject(client, current.file_path));
  }
  return { ok: true, attachment: firstRow(data), orphan };
}

// Removes the work: the row first, then its file (a file left behind is reported).
export async function removeAttachment({ current, studentId, client = supabase }) {
  const { data, error } = await once(() => client.from(TABLE).delete()
    .eq('id', current.id).eq('student_id', studentId).select('id'));
  if (error) return { ok: false, error: rlsRefusal(error) ? MESSAGES.notOpen : MESSAGES.removeFailed };
  if (rowCount(data) !== 1) return { ok: false, error: MESSAGES.notOpen };
  const orphan = current.kind === 'file' && current.file_path ? !(await removeObject(client, current.file_path)) : false;
  return { ok: true, orphan };
}

export async function saveNote({ current, studentId, note, client = supabase }) {
  const problem = noteProblem(note);
  if (problem) return { ok: false, error: problem, field: true };
  const { data, error } = await once(() => client.from(TABLE).update({ note: cleanNote(note) })
    .eq('id', current.id).eq('student_id', studentId).select(ATTACHMENT_COLUMNS));
  if (error) return { ok: false, error: rlsRefusal(error) ? MESSAGES.notOpen : MESSAGES.saveFailed };
  if (rowCount(data) !== 1) return { ok: false, error: MESSAGES.notOpen };
  return { ok: true, attachment: firstRow(data) };
}

// Turn in and Unsubmit change ONLY the status, scoped to the row and the
// student. The server stamps submitted_at and is_late. Zero rows back means the
// row is no longer the student's to change: the teacher has graded it.
const moveStatus = async ({ submission, studentId, status, client, failed }) => {
  const { data, error } = await once(() => client.from('worksheet_submissions').update({ status })
    .eq('id', submission.id).eq('student_id', studentId).select(SUBMISSION_STATE_FIELDS));
  if (error) {
    if (isAttachmentRequired(error)) return { ok: false, error: MESSAGES.attachmentRequired };
    if (isGradedRefusal(error)) return { ok: false, error: MESSAGES.alreadyGraded };
    return { ok: false, error: failed };
  }
  if (rowCount(data) !== 1) return { ok: false, error: MESSAGES.alreadyGraded };
  return { ok: true, submission: firstRow(data) };
};

export const turnIn = ({ submission, studentId, client = supabase }) =>
  moveStatus({ submission, studentId, status: 'submitted', client, failed: MESSAGES.turnInFailed });

export const unsubmit = ({ submission, studentId, client = supabase }) =>
  moveStatus({ submission, studentId, status: 'in_progress', client, failed: MESSAGES.unsubmitFailed });

// A short-lived signed URL for the student's own file, or null. The caller
// opens it at once and drops it.
export async function signedOwnFileUrl({ current, client = supabase }) {
  if (current?.kind !== 'file' || !current.file_path) return null;
  const { data, error } = await once(() => client.storage.from(SUBMISSIONS_BUCKET).createSignedUrl(current.file_path, SIGNED_URL_SECONDS));
  return !error && data?.signedUrl ? data.signedUrl : null;
}
