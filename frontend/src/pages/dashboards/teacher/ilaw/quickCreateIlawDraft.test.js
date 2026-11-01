import { describe, expect, it } from 'vitest';
import { createQuickCreateIlawDraft, QUICK_CREATE_ILAW_KIND, QUICK_CREATE_ILAW_VERSION } from './quickCreateIlawDraft';
import { WEEKDAYS, WEEKLY_FIELDS } from './ilawTemplateModel';

describe('Quick Create to structured ILAW handoff', () => {
  const payload = { teacher_id: 'synthetic-teacher', subject_id: 'math', subject: 'Mathematics',
    grade_level: 'Grade 8', title: 'Cells', duration: '45 minutes', strategy: 'Peer instruction',
    objectives: 'Describe cells\nCompare tissues' };

  it('keeps all Quick Create data in a versioned in-memory ILAW draft without inventing weekday content', () => {
    const draft = createQuickCreateIlawDraft(payload, '2026-2027');
    expect([draft.kind, draft.version]).toEqual([QUICK_CREATE_ILAW_KIND, QUICK_CREATE_ILAW_VERSION]);
    expect(draft.assignment).toEqual({ subjectId: 'math', subjectName: 'Mathematics', gradeLevel: 'Grade 8' });
    expect(draft.document.info.nameOfLesson).toBe('Cells');
    expect(draft.document.info.learningArea).toBe('Mathematics');
    expect(draft.document.info.gradeSection).toBe('Grade 8');
    expect(draft.sourceDetails).toEqual({ classDuration: '45 minutes', teachingStrategy: 'Peer instruction',
      learningObjectives: 'Describe cells\nCompare tissues' });
    for (const [field] of WEEKLY_FIELDS) for (const day of WEEKDAYS) expect(draft.document.weekly[field][day]).toBe('');
    expect(draft.document.info.aiUseDeclaration).toBe('');
    expect(draft.document.signatures.preparedBy.name).toBe('');
  });

  it('fails closed without a validated assignment and title', () => {
    expect(() => createQuickCreateIlawDraft({ ...payload, subject_id: '' }, '2026-2027')).toThrow();
    expect(() => createQuickCreateIlawDraft({ ...payload, title: '' }, '2026-2027')).toThrow();
  });
});
