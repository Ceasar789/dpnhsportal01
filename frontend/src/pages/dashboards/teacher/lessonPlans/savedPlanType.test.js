import { describe, expect, it } from 'vitest';
import { createBlankIlawDocument } from '../ilaw/ilawTemplateModel';
import { serializeManualIlawDraft } from '../ilaw/fullManualIlawModel';
import { serializeManualIlawV2 } from '../ilaw/manualIlawV2';
import { savedPlanType } from './savedPlanType';

describe('saved lesson plan type', () => {
  it('identifies known AI records, including legacy HTML content', () => {
    expect(savedPlanType({ ai_generated: true, objectives: '<p>Generated lesson</p>' })).toBe('ai');
  });

  it('keeps false and missing AI flags as other without a validated document', () => {
    expect(savedPlanType({ ai_generated: false, objectives: '<p>Old manual notes</p>' })).toBe('other');
    expect(savedPlanType({ objectives: '' })).toBe('other');
    expect(savedPlanType({ ai_generated: false, objectives: '{"kind":"eduscribe.manual-ilaw"}' })).toBe('other');
  });

  it('requires a complete versioned document bound to the saved Teacher and plan', () => {
    const objectives = serializeManualIlawDraft({
      teacherId: 'teacher-1', planId: 'plan-1',
      assignment: { subjectId: 'math', subjectName: 'Mathematics', gradeLevel: 'Grade 8' },
      document: createBlankIlawDocument(),
    });
    const row = { id: 'plan-1', teacher_id: 'teacher-1', ai_generated: false, objectives };
    expect(savedPlanType(row)).toBe('manual');
    expect(savedPlanType({ ...row, id: 'different-plan' })).toBe('other');
    expect(savedPlanType({ ...row, teacher_id: 'different-teacher' })).toBe('other');
  });

  it('recognizes synthetic version 2 Manual ILAW without reclassifying AI or legacy rows', () => {
    const document = createBlankIlawDocument();
    document.info.nameOfLesson = 'Synthetic plan';
    const objectives = serializeManualIlawV2({
      kind: 'eduscribe.manual-ilaw', version: 2, teacherId: 'teacher-1', planId: 'plan-1',
      title: 'Synthetic plan', workflowState: 'draft', document,
      assignment: { subjectId: 'science', subjectName: 'Science', gradeLevel: 'Grade 7', schoolYear: '2026-2027' },
      sourceDetails: { classDuration: '45', teachingStrategy: 'Inquiry', learningObjectives: 'One\nTwo' },
    });
    const row = { id: 'plan-1', teacher_id: 'teacher-1', ai_generated: false, objectives };
    expect(savedPlanType(row)).toBe('manual');
    expect(savedPlanType({ ...row, ai_generated: true })).toBe('ai');
    expect(savedPlanType({ ...row, id: 'another-plan' })).toBe('other');
    expect(savedPlanType({ ...row, objectives: '<p>Legacy notes</p>' })).toBe('other');
  });
});
