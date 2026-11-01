import { describe, expect, it } from 'vitest';
import { createBlankIlawDocument, WEEKDAYS, WEEKLY_FIELDS } from './ilawTemplateModel';
import { createTemporaryManualIlawDraft, normalizeManualIlawDocument, parseManualIlawDraft, parseTemporaryManualIlawDraft, serializeManualIlawDraft, serializeTemporaryManualIlawDraft, validateManualIlawDocument } from './fullManualIlawModel';
import { ILAW_TEMPLATE_SIGNATORIES } from './ilawSignatoryDefaults';

const assignment = { subjectId: 'mock-subject', subjectName: 'Science', gradeLevel: 'Grade 7' };
const identity = { teacherId: 'mock-teacher', planId: 'mock-plan', assignment };
const validDocument = () => {
  const document = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7, Sample' });
  document.info.nameOfLesson = 'Cells';
  document.info.teachingDate = '2026-10-15';
  return document;
};

describe('isolated full manual ILAW payload', () => {
  it('MUX1 starts a versioned blank temporary document without assignment claims', () => {
    const draft = createTemporaryManualIlawDraft('synthetic-teacher');
    expect(draft.version).toBe(1);
    expect(draft.teacherId).toBe('synthetic-teacher');
    expect(draft.document.info).toEqual(createBlankIlawDocument().info);
    expect(draft.document.signatures.preparedBy).toEqual({ name: '', role: '' });
    expect(draft.document.signatures.checkedBy).toEqual(ILAW_TEMPLATE_SIGNATORIES.checkedBy);
    expect(draft.document.signatures.notedBy).toEqual(ILAW_TEMPLATE_SIGNATORIES.notedBy);
    expect(draft.sourceDetails).toEqual({ classDuration: '', teachingStrategy: '', learningObjectives: '' });
    expect(validateManualIlawDocument(draft.document, null, { allowManualMetadata: true }).assignment).toBeUndefined();
    expect(() => createTemporaryManualIlawDraft('')).toThrow();
  });

  it('MUX1-F1 applies profile and source-document signatories only when creating a new temporary draft', () => {
    const profile = { name: '  Synthetic Teacher  ' };
    const first = createTemporaryManualIlawDraft('synthetic-teacher', profile);
    expect(first.document.signatures.preparedBy).toEqual({ name: 'Synthetic Teacher', role: '' });
    expect(first.document.signatures.checkedBy).toEqual({ name: 'REXES MARLON A. TEODORO', role: 'TLE Coordinator' });
    expect(first.document.signatures.notedBy).toEqual({ name: 'MARIA BEATRIZ T. MANAIG', role: 'School Principal II' });
    first.document.signatures.checkedBy.name = 'Teacher-edited checker';
    first.document.signatures.notedBy.role = 'Teacher-edited designation';
    const downloaded = JSON.parse(serializeTemporaryManualIlawDraft(first));
    expect(downloaded.document.signatures).toEqual(first.document.signatures);
    expect(first.document.signatures.checkedBy.name).toBe('Teacher-edited checker');
    expect(createTemporaryManualIlawDraft('another-teacher', { name: '' }).document.signatures.preparedBy.name).toBe('');
    expect(createTemporaryManualIlawDraft('another-teacher', { name: 42 }).document.signatures.preparedBy.name).toBe('');
    expect(serializeTemporaryManualIlawDraft(first)).toContain('Teacher-edited designation');
  });

  it('MUX1-F1 completes a full device-file round trip and rejects unsupported or cross-Teacher drafts', () => {
    const draft = createTemporaryManualIlawDraft('synthetic-teacher', { name: 'Teacher Example' });
    for (const key of Object.keys(draft.document.info)) draft.document.info[key] = `metadata:${key}`;
    draft.document.learningCompetency = 'Teacher competency';
    for (const [field] of WEEKLY_FIELDS) for (const day of WEEKDAYS) draft.document.weekly[field][day] = `${field}:${day}`;
    draft.document.signatures.checkedBy.name = 'Edited checker';
    draft.sourceDetails = { classDuration: '45 minutes', teachingStrategy: 'Discussion', learningObjectives: 'One\nTwo' };
    const raw = serializeTemporaryManualIlawDraft(draft);
    expect(parseTemporaryManualIlawDraft(raw, 'synthetic-teacher')).toEqual(draft);
    expect(() => parseTemporaryManualIlawDraft('{', 'synthetic-teacher')).toThrow(/valid JSON/);
    expect(() => parseTemporaryManualIlawDraft(raw, 'other-teacher')).toThrow(/different Teacher/);
    expect(() => parseTemporaryManualIlawDraft(JSON.stringify({ ...draft, version: 2 }), 'synthetic-teacher')).toThrow(/version/);
    expect(() => parseTemporaryManualIlawDraft(JSON.stringify({ ...draft, document: { info: {} } }), 'synthetic-teacher')).toThrow(/incomplete or damaged/);
    expect(() => parseTemporaryManualIlawDraft(JSON.stringify({ ...draft, sourceDetails: {} }), 'synthetic-teacher')).toThrow(/incomplete lesson-wide/);
  });

  it('MI-01 MI-07 MI-08 MI-09 starts blank without invented optional or AI content', () => {
    const document = createBlankIlawDocument();
    expect(document.info.aiUseDeclaration).toBe('');
    expect(document.weekly.reflections.Friday).toBe('');
    expect(document.signatures.notedBy.name).toBe('');
    expect(normalizeManualIlawDocument(document)).toEqual(document);
  });

  it('MI-02 MI-03 MI-04 MI-05 round-trips every metadata, weekday, and signature field', () => {
    const document = validDocument();
    for (const key of Object.keys(document.info)) document.info[key] = `value:${key}`;
    document.info.learningArea = assignment.subjectName;
    document.info.gradeSection = assignment.gradeLevel;
    document.learningCompetency = 'Teacher-entered competency';
    for (const [field] of WEEKLY_FIELDS) for (const day of WEEKDAYS) document.weekly[field][day] = `${field}:${day}`;
    for (const key of Object.keys(document.signatures)) {
      document.signatures[key] = { name: `${key}:name`, role: `${key}:role` };
    }
    const raw = serializeManualIlawDraft({ ...identity, document });
    const result = parseManualIlawDraft(raw, identity);
    expect(result.version).toBe(1);
    expect(result.document).toEqual(document);
    expect(validateManualIlawDocument(result.document, assignment)).toEqual({});
  });

  it('MI-06 MI-15 requires minimal metadata and matching assignment evidence', () => {
    const empty = createBlankIlawDocument();
    expect(Object.keys(validateManualIlawDocument(empty, null))).toEqual([
      'nameOfLesson', 'teachingDate', 'learningArea', 'gradeSection', 'assignment',
    ]);
    const document = validDocument();
    expect(validateManualIlawDocument(document, assignment)).toEqual({});
    document.info.learningArea = 'Unassigned subject';
    expect(validateManualIlawDocument(document, assignment).assignment).toMatch(/match/);
  });

  it('MI-10 MI-11 rejects unsupported, corrupt, and cross-Teacher payloads without changing caller content', () => {
    const document = validDocument();
    const original = JSON.stringify(document);
    const raw = serializeManualIlawDraft({ ...identity, document });
    expect(() => parseManualIlawDraft('{', identity)).toThrow();
    expect(() => parseManualIlawDraft(JSON.stringify({ ...JSON.parse(raw), version: 2 }), identity)).toThrow(/version/);
    expect(() => parseManualIlawDraft(JSON.stringify({ ...JSON.parse(raw), document: { info: {} } }), identity)).toThrow();
    expect(() => parseManualIlawDraft(raw, { ...identity, teacherId: 'other' })).toThrow(/different Teacher/);
    expect(() => parseManualIlawDraft(raw, { ...identity, planId: 'other' })).toThrow(/different Teacher/);
    expect(JSON.stringify(document)).toBe(original);
  });

  it('MI-14 uses distinct synthetic Teacher and plan identities', () => {
    const document = validDocument();
    const raw = serializeManualIlawDraft({ ...identity, document });
    expect(() => parseManualIlawDraft(raw, { ...identity, assignment: { ...assignment, subjectId: 'other' } })).toThrow(/assignment/);
    const second = serializeManualIlawDraft({ ...identity, planId: 'second', document });
    expect(() => parseManualIlawDraft(second, identity)).toThrow();
  });
});
