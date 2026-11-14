// ============================================
// FILE: src/components/clarity/teacher/materials/materialRules.js
// Learning Materials (M2): the pure rules. File types, size, links, safe
// storage names and paths, labels, filters and the form draft. The limits
// match the public.learning_materials checks and the learning-materials
// bucket (20 MB, the same ten MIME types).
// ============================================

import {
  MATERIAL_TYPES, extensionOf, formatBytes, fileProblem, linkProblem, safeMaterialFileName, linkHost,
} from '../../../../lib/uploadRules';

// The shared file and link rules live in lib/uploadRules.js (S3); these names
// are re-exported unchanged.
export {
  MAX_MATERIAL_BYTES, LINK_MAX, FILE_NAME_MAX, MATERIAL_TYPES, MATERIAL_ACCEPT, MATERIAL_FILE_GUIDANCE,
  extensionOf, mimeForFileName, formatBytes, fileProblem, safeLink, linkProblem, safeMaterialFileName, linkHost,
} from '../../../../lib/uploadRules';

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 2000;
const LABEL_BY_MIME = Object.fromEntries(Object.values(MATERIAL_TYPES).map(t => [t.mime, t.label]));

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
