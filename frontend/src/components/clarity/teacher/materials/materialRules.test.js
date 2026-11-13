// Learning Materials (M2): the pure rules, matched to the public.learning_materials
// checks and the learning-materials bucket (20 MB, ten MIME types).
import { describe, expect, it } from 'vitest';
import {
  MAX_MATERIAL_BYTES, MATERIAL_ACCEPT, MATERIAL_TYPES, draftFromRow, draftIsDirty, draftProblem, emptyDraft,
  extensionOf, fileProblem, filterMaterials, formatBytes, linkHost, materialPath, metaLine, mimeForFileName, rowFields,
  safeLink, safeMaterialFileName, subjectChips, subjectGradeLine, subjectOptions, titleProblem, typeLabel, typeOptions,
} from './materialRules';

const UID = '0b4e3c3a-1d2e-4f5a-8b9c-0d1e2f3a4b5c';
const ID = 'f0e1d2c3-b4a5-4968-8776-655443322110';
// The database check on file_path (learning_materials_file_check).
const DB_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,120}$/;
// The database check on link_url (learning_materials_link_check), case-insensitive.
const DB_LINK = /^https?:\/\/[^\s/?#]+[^\s]*$/i;

describe('file types and size', () => {
  it('allows exactly the eleven extensions, each with the bucket MIME type', () => {
    expect(Object.keys(MATERIAL_TYPES)).toEqual(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'txt']);
    expect(new Set(Object.values(MATERIAL_TYPES).map(t => t.mime)).size).toBe(10);
    expect(MATERIAL_ACCEPT).toBe('.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.txt');
  });

  it('takes the MIME type from the extension, case-insensitively, never from the browser', () => {
    expect(mimeForFileName('Lesson.DOCX')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(mimeForFileName('photo.JPEG')).toBe('image/jpeg');
    expect(mimeForFileName('notes.txt')).toBe('text/plain');
    expect(mimeForFileName('archive.zip')).toBeNull();
    expect(mimeForFileName('no-extension')).toBeNull();
    expect(extensionOf('a.b.PdF')).toBe('pdf');
  });

  it('rejects other types, empty files and anything over 20 MB (the limit itself is allowed)', () => {
    expect(fileProblem(null)).toMatch(/Choose a file/);
    expect(fileProblem({ name: 'run.exe', size: 10 })).toMatch(/not allowed/);
    expect(fileProblem({ name: 'a.pdf', size: 0 })).toMatch(/empty/);
    expect(fileProblem({ name: 'a.pdf', size: MAX_MATERIAL_BYTES })).toBeNull();
    expect(fileProblem({ name: 'a.pdf', size: MAX_MATERIAL_BYTES + 1 })).toMatch(/limit is 20 MB/);
    expect(MAX_MATERIAL_BYTES).toBe(20971520);
  });

  it('formats sizes', () => {
    expect([formatBytes(512), formatBytes(2048), formatBytes(2.5 * 1024 * 1024), formatBytes(undefined)]).toEqual(['512 B', '2.0 KB', '2.5 MB', '']);
  });
});

describe('links', () => {
  it('accepts http and https links as typed (trimmed), and they pass the database check', () => {
    for (const url of ['https://www.deped.gov.ph/k-to-12/', 'http://example.org', 'HTTPS://Example.org/a?b=c#d']) {
      expect(safeLink(`  ${url} `)).toBe(url);
      expect(url).toMatch(DB_LINK);
    }
  });

  it('rejects javascript:, data:, ftp:, mailto:, relative links, spaces and over-long links', () => {
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,hi', 'ftp://files.example.org', 'mailto:a@b.c',
      '//example.org', 'example.org', 'https://', 'https://exa mple.org', 'https:/example.org', `https://e.org/${'a'.repeat(2048)}`, '', null]) {
      expect(safeLink(bad), String(bad)).toBeNull();
    }
  });

  it('shows the host of a link', () => {
    expect(linkHost('https://www.deped.gov.ph/k-to-12/')).toBe('www.deped.gov.ph');
    expect(linkHost('javascript:alert(1)')).toBe('');
  });
});

describe('storage names and paths', () => {
  it('keeps letters, digits, dot, dash and underscore; no ".."; at most 120 characters with the extension', () => {
    expect(safeMaterialFileName('Week 1 — Cells (final).PDF')).toBe('Week-1---Cells--final.PDF');
    expect(safeMaterialFileName('../../etc/passwd.txt')).toBe('etc-passwd.txt');
    expect(safeMaterialFileName('ñ.png')).toBe('material.png');
    expect(safeMaterialFileName('.png')).toBe('material.png');
    expect(safeMaterialFileName('README')).toBe('README');
    const long = safeMaterialFileName(`${'a'.repeat(300)}.docx`);
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith('.docx')).toBe(true);
    expect(long).not.toMatch(/\.\./);
  });

  it('builds <teacher id>/<uuid>-<safe name>, which passes the database path check', () => {
    for (const name of ['Week 1 — Cells.pdf', '../x.png', `${'b'.repeat(400)}.pptx`, 'plain.txt']) {
      const path = materialPath(UID, ID, name);
      expect(path.startsWith(`${UID}/${ID}-`)).toBe(true);
      expect(path, name).toMatch(DB_PATH);
      expect(path).not.toMatch(/\.\./);
    }
  });
});

describe('labels and lines (only real fields)', () => {
  const file = { kind: 'file', mime_type: 'application/pdf', file_name: 'a.pdf', size_bytes: 2048, created_at: '2026-11-13T08:00:00Z', subjects: { name: 'Science' }, grade_level: 'Grade 7' };
  it('type badge text', () => {
    expect(typeLabel(file)).toBe('PDF');
    expect(typeLabel({ kind: 'link' })).toBe('Link');
    expect(typeLabel({ kind: 'file', mime_type: 'image/png' })).toBe('Image');
    expect(typeLabel({ kind: 'file', mime_type: null, file_name: 'x.xlsx' })).toBe('Excel');
  });
  it('subject · grade and size · date drop the parts that are missing', () => {
    expect(subjectGradeLine(file)).toBe('Science · Grade 7');
    expect(subjectGradeLine({ grade_level: null, subjects: null })).toBe('');
    expect(metaLine(file)).toMatch(/^2\.0 KB · /);
    expect(metaLine({ kind: 'link', link_url: 'https://example.org/x', created_at: 'not a date' })).toBe('example.org');
    expect(metaLine({ kind: 'file', size_bytes: null, created_at: null })).toBe('');
  });
});

describe('subjects, chips, type options and filtering', () => {
  const assignments = [
    { subject_id: 's2', grade_level: 'Grade 8', subjects: { id: 's2', name: 'Science' } },
    { subject_id: 's1', grade_level: 'Grade 10', subjects: { id: 's1', name: 'English' } },
    { subject_id: 's1', grade_level: 'Grade 7', subjects: { id: 's1', name: 'English' } },
    { subject_id: 's1', grade_level: 'Grade 7', subjects: { id: 's1', name: 'English' } },
    { subject_id: 's3', grade_level: 'Grade 9', subjects: null },
  ];
  it('the teacher\'s own subjects, each with its grades, sorted; malformed rows skipped', () => {
    expect(subjectOptions(assignments)).toEqual([
      { id: 's1', name: 'English', grades: ['Grade 7', 'Grade 10'] },
      { id: 's2', name: 'Science', grades: ['Grade 8'] },
    ]);
    expect(subjectOptions(null)).toEqual([]);
  });

  const rows = [
    { id: 1, kind: 'file', title: 'Cell diagram', description: 'Labelled parts', mime_type: 'image/png', subject_id: 's2', subjects: { name: 'Science' }, grade_level: 'Grade 8' },
    { id: 2, kind: 'link', title: 'DepEd K to 12', link_url: 'https://www.deped.gov.ph', subject_id: null, subjects: null },
    { id: 3, kind: 'file', title: 'Reading list', file_name: 'list.docx', mime_type: 'application/msword', subject_id: 's1', subjects: { name: 'English' }, grade_level: 'Grade 7' },
  ];
  it('chips and types come only from the materials themselves', () => {
    expect(subjectChips(rows)).toEqual([{ id: 's1', name: 'English' }, { id: 's2', name: 'Science' }]);
    expect(typeOptions(rows)).toEqual(['Image', 'Link', 'Word']);
    expect(subjectChips([])).toEqual([]);
  });
  it('search (title, description, file name, link, subject, grade), subject and type combine', () => {
    const ids = opts => filterMaterials(rows, opts).map(r => r.id);
    expect(ids({})).toEqual([1, 2, 3]);
    expect(ids({ query: 'LABELLED' })).toEqual([1]);
    expect(ids({ query: 'deped.gov' })).toEqual([2]);
    expect(ids({ query: 'grade 7' })).toEqual([3]);
    expect(ids({ subjectId: 's2' })).toEqual([1]);
    expect(ids({ type: 'Link' })).toEqual([2]);
    expect(ids({ query: 'list', subjectId: 's2' })).toEqual([]);
  });
});

describe('the form draft', () => {
  it('a new draft is clean; any change, or a chosen file, makes it dirty', () => {
    const base = emptyDraft();
    expect(draftIsDirty(base, base)).toBe(false);
    expect(draftIsDirty({ ...base, title: 'x' }, base)).toBe(true);
    expect(draftIsDirty({ ...base, file: { name: 'a.pdf' } }, base)).toBe(true);
  });

  it('problems in order: title, description, then the link or (new only) the file', () => {
    expect(titleProblem('   ')).toMatch(/Enter a title/);
    expect(titleProblem('a'.repeat(201))).toMatch(/200/);
    expect(draftProblem({ ...emptyDraft(), title: 'T', description: 'd'.repeat(2001) })).toMatch(/2000/);
    expect(draftProblem({ ...emptyDraft(), title: 'T' })).toMatch(/Choose a file/);
    expect(draftProblem({ ...emptyDraft(), title: 'T' }, { editing: true })).toBeNull();
    expect(draftProblem({ ...emptyDraft(), kind: 'link', title: 'T', url: 'javascript:alert(1)' })).toMatch(/http:\/\/ or https:\/\//);
    expect(draftProblem({ ...emptyDraft(), kind: 'link', title: 'T', url: 'https://example.org' })).toBeNull();
  });

  it('row fields: trimmed, empty values become null, and a grade needs a subject', () => {
    expect(rowFields({ ...emptyDraft(), title: '  Title  ', description: '  ', gradeLevel: 'Grade 7' }))
      .toEqual({ title: 'Title', description: null, subject_id: null, grade_level: null });
    expect(rowFields({ ...emptyDraft(), title: 'T', description: 'D', subjectId: 's1', gradeLevel: 'Grade 7' }))
      .toEqual({ title: 'T', description: 'D', subject_id: 's1', grade_level: 'Grade 7' });
  });

  it('an edit starts from the row', () => {
    expect(draftFromRow({ kind: 'link', title: 'L', description: null, subject_id: 's1', grade_level: 'Grade 7', link_url: 'https://e.org' }))
      .toEqual({ kind: 'link', title: 'L', description: '', subjectId: 's1', gradeLevel: 'Grade 7', url: 'https://e.org', file: null });
  });
});
