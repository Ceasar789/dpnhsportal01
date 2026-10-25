import { describe, expect, it } from 'vitest';
import {
  createManualWorksheetDraft, editableDraftItems, hasUnsavedGeneratedChanges,
  restoreLocallySavedWorksheet, saveGeneratedWorksheetLocally, studentDraftPreview,
  updateGeneratedDraft, validateGeneratedWorksheet,
} from './generatedDraftModel';

const assigned = () => ({ subjectId: 'math-id', subjectName: 'Mathematics', gradeLevel: 'Grade 7', assignmentVerified: true });
const officialYear = '2030-2031';

function authored() {
  const draft = createManualWorksheetDraft('teacher-1', officialYear);
  return updateGeneratedDraft(draft, {
    title: 'Fractions', instructions: 'Read carefully.', checkingMode: 'manual', assignment: assigned(),
    sections: [{ ...draft.sections[0], title: 'Practice', directions: 'Show your work.' }],
    items: [{ uid: 'q-1', sectionId: draft.sections[0].id, question: 'One half plus one half?',
      item_type: 'multiple_choice', options: ['One', 'Two', '', ''], correct_answer: 'One', points: 2 },
    { uid: 'q-2', sectionId: draft.sections[0].id, question: 'Explain why.',
      item_type: 'essay', options: [], correct_answer: '', points: 3 }],
  });
}

describe('manual worksheet in-memory draft', () => {
  it('starts blank with one editable group and no database identity or lesson source', () => {
    const draft = createManualWorksheetDraft('teacher-1', officialYear);
    expect(draft).toMatchObject({ teacherId: 'teacher-1', title: '', subjectId: '', gradeLevel: '',
      questions: [], answerKey: [], saved: false, sourceType: 'manual-authored' });
    expect(draft.sections).toHaveLength(1);
    expect(draft).not.toHaveProperty('id');
    expect(draft).not.toHaveProperty('sourceLessonPlan');
    expect(validateGeneratedWorksheet(draft).map(error => error.field)).toEqual(['title', 'items']);
    expect(() => createManualWorksheetDraft('teacher-1')).toThrow('Official academic year');
    expect(() => createManualWorksheetDraft('teacher-1', '2030-2032')).toThrow('Official academic year');
  });

  it('retains sections, choices, points, keys and safe student preview', () => {
    const draft = authored();
    expect(validateGeneratedWorksheet(draft)).toEqual([]);
    expect(editableDraftItems(draft)).toHaveLength(2);
    expect(draft.answerKey).toEqual([{ localId: 'q-1', correct_answer: 'One' }]);
    const preview = studentDraftPreview(draft);
    expect(preview.sections[0].directions).toBe('Show your work.');
    expect(preview.questions[1].item_type).toBe('essay');
    expect(JSON.stringify(preview)).not.toContain('correct_answer');
    expect(JSON.stringify(preview)).not.toContain('teacher-1');
  });

  it('saves under the same local ID and restores edits without making a persisted record', () => {
    const draft = authored();
    const saved = saveGeneratedWorksheetLocally(draft, officialYear);
    expect(saved.draftId).toBe(draft.draftId);
    expect(saved).not.toHaveProperty('id');
    expect(hasUnsavedGeneratedChanges(saved)).toBe(false);
    const edited = { ...saved, title: 'Edited', sections: [{ ...saved.sections[0], directions: 'New directions' }] };
    expect(hasUnsavedGeneratedChanges(edited)).toBe(true);
    expect(restoreLocallySavedWorksheet(edited)).toMatchObject({ title: 'Fractions', sections: saved.sections });
    expect(saveGeneratedWorksheetLocally(edited, officialYear).draftId).toBe(draft.draftId);
  });

  it('rejects a forged or incomplete local assignment', () => {
    const draft = authored();
    expect(() => saveGeneratedWorksheetLocally({ ...draft, assignmentVerified: false }, officialYear)).toThrow();
    expect(() => saveGeneratedWorksheetLocally({ ...draft, teacherId: '' }, officialYear)).toThrow();
    expect(() => saveGeneratedWorksheetLocally({ ...draft, schoolYear: 'old-year' }, officialYear)).toThrow();
    expect(() => saveGeneratedWorksheetLocally({ ...draft, questions: [] }, officialYear)).toThrow();
    expect(() => saveGeneratedWorksheetLocally(draft)).toThrow();
  });
});
