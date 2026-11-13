// ============================================
// FILE: src/components/clarity/teacher/materials/materialRules.js
// Learning Materials (M2): the pure rules. File types, size, links, safe
// storage names and paths, labels, filters and the form draft. The limits
// match the public.learning_materials checks and the learning-materials
// bucket (20 MB, the same ten MIME types).
// ============================================

export const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 2000;
export const LINK_MAX = 2048;
export const FILE_NAME_MAX = 255;
const STORED_NAME_MAX = 120;

// Extension -> MIME type and label. The upload sends this MIME type, because
// browsers report an empty type or application/octet-stream for some files.
export const MATERIAL_TYPES = {
  pdf: { mime: 'application/pdf', label: 'PDF' },
  doc: { mime: 'application/msword', label: 'Word' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word' },
  ppt: { mime: 'application/vnd.ms-powerpoint', label: 'PowerPoint' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PowerPoint' },
  xls: { mime: 'application/vnd.ms-excel', label: 'Excel' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel' },
  jpg: { mime: 'image/jpeg', label: 'Image' },
  jpeg: { mime: 'image/jpeg', label: 'Image' },
  png: { mime: 'image/png', label: 'Image' },
  txt: { mime: 'text/plain', label: 'Text' },
};
const LABEL_BY_MIME = Object.fromEntries(Object.values(MATERIAL_TYPES).map(t => [t.mime, t.label]));

export const MATERIAL_ACCEPT = Object.keys(MATERIAL_TYPES).map(ext => `.${ext}`).join(',');
export const MATERIAL_FILE_GUIDANCE = 'PDF, Word, PowerPoint, Excel, JPG, PNG or plain text · up to 20 MB';

export const extensionOf = (name) => {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(name ?? ''));
  return match ? match[1].toLowerCase() : '';
};

export const mimeForFileName = name => MATERIAL_TYPES[extensionOf(name)]?.mime ?? null;

export const formatBytes = (bytes) => {
  if (bytes === null || bytes === undefined || bytes === '') return '';
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

// A message for a file that cannot be stored, else null.
export const fileProblem = (file) => {
  if (!file) return 'Choose a file to upload.';
  if (!mimeForFileName(file.name)) return 'This file type is not allowed. Use PDF, Word, PowerPoint, Excel, JPG, PNG or plain text.';
  if (!(file.size > 0)) return 'This file is empty.';
  if (file.size > MAX_MATERIAL_BYTES) return `This file is ${formatBytes(file.size)}. The limit is 20 MB.`;
  return null;
};

// The link as typed when it is a usable http(s) address, else null. Rejects
// javascript:, data:, ftp: and every other scheme, spaces and over-long links.
export const safeLink = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > LINK_MAX || /\s/.test(raw)) return null;
  if (!/^https?:\/\/[^/?#]+/i.test(raw)) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return null;
  return raw;
};

export const linkProblem = value => (safeLink(value) ? null : 'Enter a full link that starts with http:// or https://.');

// Storage names: letters, digits, dot, dash and underscore only, no "..",
// at most 120 characters with the extension kept.
export const safeMaterialFileName = (name) => {
  const safe = String(name ?? '').replace(/[^A-Za-z0-9._-]/g, '-').replace(/\.{2,}/g, '.');
  const ext = extensionOf(safe);
  const tail = ext ? safe.slice(safe.length - ext.length - 1) : '';
  let base = (tail ? safe.slice(0, -tail.length) : safe).replace(/^[.-]+/, '').replace(/[.-]+$/, '');
  if (base.length + tail.length > STORED_NAME_MAX) base = base.slice(0, STORED_NAME_MAX - tail.length).replace(/[.-]+$/, '');
  return `${base || 'material'}${tail}`;
};

// <teacher id>/<uuid>-<safe name>: the folder is the owner's, as the bucket policies require.
export const materialPath = (teacherId, id, name) => `${teacherId}/${id}-${safeMaterialFileName(name)}`;

export const titleProblem = (title) => {
  const t = String(title ?? '').trim();
  if (!t) return 'Enter a title.';
  if (t.length > TITLE_MAX) return `Keep the title to ${TITLE_MAX} characters.`;
  return null;
};

export const descriptionProblem = description => (String(description ?? '').length > DESCRIPTION_MAX
  ? `Keep the description to ${DESCRIPTION_MAX} characters.` : null);

export const typeLabel = (row) => {
  if (row?.kind === 'link') return 'Link';
  return LABEL_BY_MIME[row?.mime_type] || MATERIAL_TYPES[extensionOf(row?.file_name)]?.label || 'File';
};

export const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// "Science · Grade 7", only the parts that exist.
export const subjectGradeLine = row => [row?.subjects?.name, row?.grade_level].filter(Boolean).join(' · ');

// The host of a usable link ("www.deped.gov.ph"), else ''.
export const linkHost = (url) => {
  const link = safeLink(url);
  if (!link) return '';
  try { return new URL(link).hostname; } catch { return ''; }
};

// "2.4 MB · Nov 13, 2026" for a file, "example.org · Nov 13, 2026" for a link;
// only the parts that exist.
export const metaLine = row => [row?.kind === 'file' ? formatBytes(row.size_bytes) : linkHost(row?.link_url), formatDate(row?.created_at)]
  .filter(Boolean).join(' · ');

// The teacher's own subjects with their grade levels, from teacher_subjects rows.
export const subjectOptions = (assignmentRows) => {
  const byId = new Map();
  (assignmentRows || []).forEach((r) => {
    if (!r?.subject_id || r.subjects?.id !== r.subject_id || !r.subjects?.name || !r.grade_level) return;
    if (!byId.has(r.subject_id)) byId.set(r.subject_id, { id: r.subject_id, name: r.subjects.name, grades: [] });
    const subject = byId.get(r.subject_id);
    if (!subject.grades.includes(r.grade_level)) subject.grades.push(r.grade_level);
  });
  return [...byId.values()]
    .map(s => ({ ...s, grades: [...s.grades].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

// Chips and the type filter only offer what the materials actually have.
export const subjectChips = (rows) => {
  const byId = new Map();
  (rows || []).forEach((r) => { if (r.subject_id && r.subjects?.name && !byId.has(r.subject_id)) byId.set(r.subject_id, r.subjects.name); });
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
};

export const typeOptions = rows => [...new Set((rows || []).map(typeLabel))].sort((a, b) => a.localeCompare(b));

export const filterMaterials = (rows, { query = '', subjectId = '', type = '' } = {}) => {
  const q = query.trim().toLowerCase();
  return (rows || []).filter((r) => {
    if (subjectId && r.subject_id !== subjectId) return false;
    if (type && typeLabel(r) !== type) return false;
    if (!q) return true;
    return [r.title, r.description, r.file_name, r.link_url, r.subjects?.name, r.grade_level]
      .some(v => String(v ?? '').toLowerCase().includes(q));
  });
};

// ---------- The form draft ----------
export const emptyDraft = () => ({ kind: 'file', title: '', description: '', subjectId: '', gradeLevel: '', url: '', file: null });

export const draftFromRow = row => ({
  kind: row.kind,
  title: row.title || '',
  description: row.description || '',
  subjectId: row.subject_id || '',
  gradeLevel: row.grade_level || '',
  url: row.kind === 'link' ? row.link_url || '' : '',
  file: null,
});

export const draftIsDirty = (draft, baseline) => ['kind', 'title', 'description', 'subjectId', 'gradeLevel', 'url']
  .some(k => String(draft[k] ?? '') !== String(baseline[k] ?? '')) || Boolean(draft.file);

// The first problem with a draft (null when it can be saved).
export const draftProblem = (draft, { editing = false } = {}) => titleProblem(draft.title)
  || descriptionProblem(draft.description)
  || (draft.kind === 'link' ? linkProblem(draft.url) : editing ? null : fileProblem(draft.file));

// The shared columns of a row, from a draft (empty values become null).
export const rowFields = draft => ({
  title: draft.title.trim(),
  description: draft.description.trim() || null,
  subject_id: draft.subjectId || null,
  grade_level: draft.subjectId && draft.gradeLevel ? draft.gradeLevel : null,
});
