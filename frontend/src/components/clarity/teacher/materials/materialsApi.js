// ============================================
// FILE: src/components/clarity/teacher/materials/materialsApi.js
// Learning Materials (M2): every read and write. Rows live in
// public.learning_materials (owner-only RLS) and files in the private
// learning-materials bucket under <teacher id>/. Writes are not retried, so
// nothing is saved twice. Signed URLs are never logged or kept.
// ============================================

import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import { friendlyError } from '../../../../lib/friendlyError';
import { fileProblem, linkProblem, materialPath, mimeForFileName, safeLink, FILE_NAME_MAX } from './materialRules';

export const MATERIALS_BUCKET = 'learning-materials';
const TABLE = 'learning_materials';
export const MATERIAL_COLUMNS = 'id, teacher_id, title, description, subject_id, grade_level, kind, file_path, file_name, '
  + 'mime_type, size_bytes, link_url, created_at, updated_at, subjects(id, name)';
const SIGNED_URL_SECONDS = 300;

const SAVE_FAILED = 'The material could not be saved. Check your connection and try again.';
const ORPHAN_NOTE = ' The uploaded file also could not be removed automatically.';

const removeFile = async (client, path) => {
  try {
    const { error } = await client.storage.from(MATERIALS_BUCKET).remove([path]);
    return !error;
  } catch {
    return false;
  }
};

export async function listMaterials(teacherId, { client = supabase, sleep } = {}) {
  const { data, error } = await withRetry(
    () => client.from(TABLE).select(MATERIAL_COLUMNS).eq('teacher_id', teacherId).order('created_at', { ascending: false }),
    { label: 'Learning materials fetch', ...(sleep ? { sleep } : {}) },
  );
  if (error || !Array.isArray(data)) throw new Error('Learning materials could not be loaded.');
  return data;
}

// The official school year from Settings (the same read as the Worksheets tab), or null.
export async function loadOfficialSchoolYear({ client = supabase, sleep } = {}) {
  const { data, error } = await withRetry(
    () => client.from('school_settings').select('school_year').eq('id', 1).single(),
    { label: 'Official academic year fetch', ...(sleep ? { sleep } : {}) },
  );
  const year = data?.school_year;
  return !error && typeof year === 'string' && /^\d{4}-\d{4}$/.test(year) ? year : null;
}

// Upload, then insert. If the insert fails, the upload is removed.
export async function createFileMaterial({ teacherId, file, fields, client = supabase, newId = () => crypto.randomUUID() }) {
  const problem = fileProblem(file);
  if (problem) return { ok: false, error: problem };
  const path = materialPath(teacherId, newId(), file.name);
  const contentType = mimeForFileName(file.name);
  let uploadError;
  try {
    ({ error: uploadError } = await client.storage.from(MATERIALS_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType }));
  } catch (thrown) {
    uploadError = thrown;
  }
  if (uploadError) return { ok: false, error: 'The file could not be uploaded. Check your connection and try again.' };

  const row = {
    teacher_id: teacherId, ...fields, kind: 'file', file_path: path,
    file_name: String(file.name).slice(0, FILE_NAME_MAX), mime_type: contentType, size_bytes: file.size, link_url: null,
  };
  let data; let error;
  try {
    ({ data, error } = await client.from(TABLE).insert(row).select(MATERIAL_COLUMNS).single());
  } catch (thrown) {
    error = thrown;
  }
  if (error || !data) {
    const removed = await removeFile(client, path);
    return { ok: false, error: SAVE_FAILED + (removed ? '' : ORPHAN_NOTE), orphan: !removed };
  }
  return { ok: true, row: data };
}

export async function createLinkMaterial({ teacherId, url, fields, client = supabase }) {
  const link = safeLink(url);
  if (!link) return { ok: false, error: linkProblem(url) };
  const row = { teacher_id: teacherId, ...fields, kind: 'link', link_url: link, file_path: null, file_name: null, mime_type: null, size_bytes: null };
  try {
    const { data, error } = await client.from(TABLE).insert(row).select(MATERIAL_COLUMNS).single();
    if (error || !data) return { ok: false, error: SAVE_FAILED };
    return { ok: true, row: data };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

// Edit: the title, description, subject and grade; for a link also its URL.
// A file's stored object is never changed here.
export async function updateMaterial({ row, fields, url, client = supabase }) {
  const changes = { ...fields };
  if (row.kind === 'link') {
    const link = safeLink(url);
    if (!link) return { ok: false, error: linkProblem(url) };
    changes.link_url = link;
  }
  try {
    const { data, error } = await client.from(TABLE).update(changes).eq('id', row.id).select(MATERIAL_COLUMNS).single();
    if (error || !data) return { ok: false, error: SAVE_FAILED };
    return { ok: true, row: data };
  } catch {
    return { ok: false, error: SAVE_FAILED };
  }
}

// Delete the row first, then its file. A file left behind is reported.
export async function deleteMaterial({ row, client = supabase }) {
  let data; let error;
  try {
    ({ data, error } = await client.from(TABLE).delete().eq('id', row.id).select('id'));
  } catch (thrown) {
    error = thrown;
  }
  if (error || !Array.isArray(data) || data.length !== 1) {
    return { ok: false, error: 'The material could not be deleted. Check your connection and try again.' };
  }
  if (row.kind !== 'file' || !row.file_path) return { ok: true, orphan: false };
  const removed = await removeFile(client, row.file_path);
  return { ok: true, orphan: !removed };
}

// A short-lived signed URL for a file, or null. Callers open it at once.
export async function signedMaterialUrl(row, { client = supabase } = {}) {
  if (row?.kind !== 'file' || !row.file_path) return null;
  try {
    const { data, error } = await client.storage.from(MATERIALS_BUCKET).createSignedUrl(row.file_path, SIGNED_URL_SECONDS);
    return !error && data?.signedUrl ? data.signedUrl : null;
  } catch {
    return null;
  }
}

// ---------- Classes (U-PDF-T-FIX-B; needs the class-materials SQL) ----------
// The teacher's real classes (schedules + advised) and a class's active roster are
// read exactly as Distribute / postToClass.js read them.
export { loadTeacherSections, loadClassList } from '../../../../pages/dashboards/teacher/lessonPlans/postToClass';

// Which classes the teacher's materials are shared to, with each class's name and
// grade. The join table's owner-only RLS returns only shares of the caller's own
// materials. Throws when the read fails.
export async function listMaterialClasses({ client = supabase, sleep } = {}) {
  const { data, error } = await withRetry(
    () => client.from('learning_material_classes').select('material_id, section_id, all_students, sections(id, name, grade_level)'),
    { label: 'Learning material classes fetch', ...(sleep ? { sleep } : {}) },
  );
  if (error || !Array.isArray(data)) throw new Error('Learning material classes could not be loaded.');
  return data;
}

// The share function's own codes (RAISE EXCEPTION 'CM_...'), as sentences. The
// code is only READ from the error to pick one; friendlyError writes the text.
export const SHARE_MESSAGES = Object.freeze({
  CM_NOT_OWNER: 'Only the teacher who added this material can share it.',
  CM_NOT_YOUR_CLASS: 'You can only share with your own classes.',
  CM_GRADE_MISMATCH: 'This material is for another grade. Choose a class of the same grade.',
  CM_ALREADY_POSTED: 'This material is already posted to that class.',
  CM_NO_STUDENTS: 'Tick at least one student.',
  CM_NOT_IN_CLASS: 'Some ticked students are no longer in this class. Close and try again.',
});
const SHARE_FAILED = 'The material could not be shared. Check your connection and try again.';
export const shareError = (error) => {
  const code = Object.keys(SHARE_MESSAGES).find(key => String(error?.message ?? '').includes(key));
  return friendlyError(code ? { code } : error, { overrides: SHARE_MESSAGES, fallback: SHARE_FAILED });
};

// Share a material to one class: everyone (studentIds null) or the ticked students.
// Not retried, so a share is never written twice.
export async function shareMaterialToClass({ materialId, sectionId, studentIds = null, client = supabase }) {
  try {
    const { error } = await client.rpc('eduscribe_material_post_to_class',
      { p_material: materialId, p_section: sectionId, p_student_ids: studentIds });
    return error ? { ok: false, error: shareError(error) } : { ok: true };
  } catch (thrown) {
    return { ok: false, error: shareError(thrown) };
  }
}

// Opens a URL in a new tab with rel="noopener noreferrer"; lives in lib/uploadRules.js (S3).
export { openInNewTab } from '../../../../lib/uploadRules';
