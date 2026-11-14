// ============================================
// FILE: src/lib/uploadRules.js
// The shared file and link rules for uploads to the private buckets: file
// types, the 20 MB limit, safe storage names, http(s)-only links, and opening
// a URL in a new tab. Moved here from the Learning Materials rules (M2) so the
// student submission code can use them too; materialRules.js and
// materialsApi.js re-export these names unchanged. The limits match the
// learning-materials and task-submissions buckets (20 MB, the same ten MIME
// types).
// ============================================

export const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;
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

// The host of a usable link ("www.deped.gov.ph"), else ''.
export const linkHost = (url) => {
  const link = safeLink(url);
  if (!link) return '';
  try { return new URL(link).hostname; } catch { return ''; }
};

// Opens a URL in a new tab with rel="noopener noreferrer". Only http(s).
export function openInNewTab(url, doc = document) {
  if (!safeLink(url)) return false;
  const a = doc.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
