// ============================================
// FILE: src/components/clarity/teacher/materials/materialsApi.js
// Learning Materials (M2): every read and write. Rows live in
// public.learning_materials (owner-only RLS) and files in the private
// learning-materials bucket under <teacher id>/. Writes are not retried, so
// nothing is saved twice. Signed URLs are never logged or kept.
// ============================================

import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
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

// Opens a URL in a new tab with rel="noopener noreferrer"; lives in lib/uploadRules.js (S3).
export { openInNewTab } from '../../../../lib/uploadRules';
