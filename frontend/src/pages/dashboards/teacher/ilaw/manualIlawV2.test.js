import { describe, expect, it } from 'vitest';
import { createBlankIlawDocument, WEEKDAYS, WEEKLY_FIELDS } from './ilawTemplateModel';
import { parseManualIlawDraft, serializeManualIlawDraft } from './fullManualIlawModel';
import { parseManualIlawV2, serializeManualIlawV2, validateManualIlawSave } from './manualIlawV2';

const assignment = { subjectId: 'synthetic-subject', subjectName: 'Science', gradeLevel: 'Grade 7', schoolYear: '2026-2027' };
const makePayload = () => {
  const document = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7, A' });
  document.info.nameOfLesson = 'Cells';
  document.info.teachingDate = '2026-10-16';
  for (const [field] of WEEKLY_FIELDS) for (const day of WEEKDAYS) document.weekly[field][day] = `${field} / ${day}`;
  for (const key of Object.keys(document.signatures)) document.signatures[key] = { name: `${key} name`, role: `${key} role` };
  return {
    kind: 'eduscribe.manual-ilaw', version: 2, teacherId: 'synthetic-teacher', planId: 'synthetic-plan',
    title: 'Cells', assignment, workflowState: 'saved', document,
    sourceDetails: { classDuration: '45 minutes', teachingStrategy: 'Inquiry', learningObjectives: 'First line\nSecond line' },
  };
};

describe('Manual ILAW version 2 contract', () => {
  it('round-trips every editor field, assignment, year, source detail, and private state', () => {
    const value = makePayload();
    const parsed = parseManualIlawV2(serializeManualIlawV2(value), { teacherId: value.teacherId, planId: value.planId });
    expect(parsed).toEqual(value);
    expect(validateManualIlawSave(parsed)).toEqual({});
    expect(parseManualIlawV2(serializeManualIlawV2({ ...value, workflowState: 'draft' })).workflowState).toBe('draft');
  });

  it('rejects malformed, unsupported, cross-Teacher, and title-mismatched payloads', () => {
    const value = makePayload();
    expect(() => parseManualIlawV2('{')).toThrow(/JSON/);
    expect(() => serializeManualIlawV2({ ...value, version: 3 })).toThrow(/Unsupported/);
    expect(() => serializeManualIlawV2({ ...value, title: 'Other' })).toThrow(/title/);
    expect(() => parseManualIlawV2(serializeManualIlawV2(value), { teacherId: 'another' })).toThrow(/different Teacher/);
    expect(() => serializeManualIlawV2({ ...value, sourceDetails: {} })).toThrow(/Unsupported/);
  });

  it('keeps the existing version 1 reader and AI HTML separate', () => {
    const value = makePayload();
    const v1 = serializeManualIlawDraft({ teacherId: value.teacherId, planId: value.planId,
      assignment: { subjectId: assignment.subjectId, subjectName: assignment.subjectName, gradeLevel: assignment.gradeLevel },
      document: value.document });
    expect(parseManualIlawDraft(v1).version).toBe(1);
    expect(() => parseManualIlawV2(v1)).toThrow(/Unsupported/);
    expect(() => parseManualIlawV2('<h1>AI content</h1>')).toThrow(/JSON/);
  });

  it('requires the seven approved fields for Saved while allowing incomplete Draft content', () => {
    const value = makePayload();
    value.document.info.nameOfLesson = '';
    value.title = '';
    value.document.info.teachingDate = '';
    value.document.info.learningArea = '';
    value.document.info.gradeSection = '';
    value.sourceDetails.learningObjectives = '  ';
    for (const day of WEEKDAYS) {
      value.document.weekly.learningObjectives[day] = ' ';
      value.document.weekly.preLesson[day] = ' ';
      value.document.weekly.flow[day] = ' ';
      value.document.weekly.formativeAssessment[day] = ' ';
    }
    const errors = validateManualIlawSave(value);
    for (const key of ['nameOfLesson', 'teachingDate', 'learningArea', 'gradeSection', 'objectives', 'activities', 'assessment']) {
      expect(errors[key]).toBeTruthy();
    }
    expect(parseManualIlawV2(serializeManualIlawV2({ ...value, workflowState: 'draft' })).workflowState).toBe('draft');
  });
});
