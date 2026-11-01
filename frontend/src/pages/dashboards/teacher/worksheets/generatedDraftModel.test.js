import { describe, expect, it } from 'vitest';
import {
  createGeneratedDraft, editableDraftItems, hasUnsavedGeneratedChanges,
  restoreLocallySavedWorksheet, saveGeneratedWorksheetLocally, studentDraftPreview,
  updateGeneratedDraft, validateGeneratedWorksheet,
} from './generatedDraftModel';

const generated = () => ({
  status: 'generated-draft', saved: false, title: 'Plant cells worksheet',
  subjectId: 'science-id', subjectName: 'Science', gradeLevel: 'Grade 7',
  sourceLessonPlan: { id: 'source-1', title: 'Plant cells' },
  questions: [
    { localId: 'draft-1', question: 'Which part controls the cell?', item_type: 'multiple_choice',
      options: ['Nucleus', 'Cell wall'], points: 2 },
    { localId: 'draft-2', question: 'Explain cells.', item_type: 'essay', options: [], points: 3 },
  ],
  answerKey: [{ localId: 'draft-1', correct_answer: 'Nucleus' }],
});

describe('isolated generated Worksheet draft model', () => {
  it('keeps enumeration alternatives private and requires manual checking for order or alternatives', () => {
    const source = generated();
    source.questions = [{ localId: 'enum-1', question: 'Name two structures.', item_type: 'enumeration',
      options: [], points: 2, enumeration: { alternatives: ['cell wall, nucleus'], orderSensitive: true } }];
    source.answerKey = [{ localId: 'enum-1', correct_answer: 'nucleus, cell wall' }];
    const initial = { ...createGeneratedDraft(source, 'ai'), collectionId: 'week-1', day: 'Monday' };
    const items = editableDraftItems(initial);
    items[0].enumeration.alternatives[0] = 'nucleus, membrane';
    const draft = updateGeneratedDraft(initial, { title: initial.title, items, checkingMode: 'manual' });
    expect(draft.questions[0].enumeration.alternatives).toEqual(['nucleus, membrane']);
    expect(validateGeneratedWorksheet(draft)).toEqual([]);
    expect(validateGeneratedWorksheet({ ...draft, checkingMode: 'auto' }).map(error => error.field)).toContain('checkingMode');
    expect(JSON.stringify(studentDraftPreview(draft))).not.toContain('nucleus, membrane');
    expect(JSON.stringify(studentDraftPreview(draft))).not.toContain('nucleus, cell wall');
    const saved = saveGeneratedWorksheetLocally(draft);
    expect(saved.localSavedContent.questions[0].enumeration.orderSensitive).toBe(true);
  });
  it('creates a separate unsaved identity without a persisted Worksheet ID', () => {
    const draft = createGeneratedDraft(generated(), 'ai');
    expect(draft.draftId).toBeTruthy();
    expect(draft.saved).toBe(false);
    expect(draft).not.toHaveProperty('id');
    expect(draft.sourceLessonPlan).toEqual({ id: 'source-1', title: 'Plant cells' });
    expect(() => createGeneratedDraft({ ...generated(), saved: true }, 'ai')).toThrow();
    expect(() => createGeneratedDraft({ ...generated(), questions: [{ ...generated().questions[0], question: '' }] }, 'ai'))
      .toThrow('incomplete');
  });

  it('keeps question and Teacher key aligned after editing and reordering', () => {
    const initial = createGeneratedDraft(generated(), 'manual');
    const items = editableDraftItems(initial);
    expect(items[0].correct_answer).toBe('Nucleus');
    items[0].question = 'Which part is green?';
    items[0].options[0] = 'Chloroplast';
    items[0].correct_answer = 'Chloroplast';
    const edited = updateGeneratedDraft(initial, {
      title: 'Edited title', items: [items[1], items[0]], checkingMode: 'manual',
    });
    expect(edited.sourceLessonPlan).toEqual({ id: 'source-1', title: 'Plant cells' });
    expect(edited.title).toBe('Edited title');
    expect(edited.questions.map(item => item.localId)).toEqual(['draft-2', 'draft-1']);
    expect(edited.answerKey).toEqual([{ localId: 'draft-1', correct_answer: 'Chloroplast' }]);
    expect(editableDraftItems(edited)[1].correct_answer).toBe('Chloroplast');
  });

  it('student preview excludes keys, draft identity, and source metadata', () => {
    const draft = createGeneratedDraft(generated(), 'ai');
    const student = studentDraftPreview(draft);
    expect(student.questions[0]).toEqual({
      question: 'Which part controls the cell?', item_type: 'multiple_choice',
      options: ['Nucleus', 'Cell wall'], points: 2,
    });
    expect(JSON.stringify(student)).not.toContain('correct_answer');
    expect(student).not.toHaveProperty('answerKey');
    expect(student).not.toHaveProperty('sourceLessonPlan');
    expect(student).not.toHaveProperty('draftId');
  });

  it('validates required title, questions, choices, keys, types and points without changing the draft', () => {
    const draft = createGeneratedDraft(generated(), 'ai');
    expect(validateGeneratedWorksheet(draft)).toEqual([]);
    expect(validateGeneratedWorksheet({ ...draft, title: ' ', questions: [] }).map(error => error.field))
      .toEqual(['title', 'items']);
    const broken = { ...draft, questions: [{ ...draft.questions[0], question: '', item_type: 'multiple_choice',
      points: '', options: ['A', 'A', '', ''] }], answerKey: [{ localId: 'draft-1', correct_answer: 'Missing' }] };
    expect(validateGeneratedWorksheet(broken).map(error => error.field)).toEqual([
      'question-1-text', 'question-1-points', 'question-1-choices', 'question-1-answer',
    ]);
    expect(validateGeneratedWorksheet({ ...draft, questions: [{ ...draft.questions[0], item_type: 'unknown' }] })
      .map(error => error.field)).toContain('question-1-type');
    expect(validateGeneratedWorksheet({ ...draft, questions: [{ ...draft.questions[0], points: -1 }] })
      .map(error => error.field)).toContain('question-1-points');
  });

  it('saves locally under the same draft identity and restores the last saved content', () => {
    const initial = createGeneratedDraft(generated(), 'manual');
    const saved = saveGeneratedWorksheetLocally(initial);
    expect(saved.draftId).toBe(initial.draftId);
    expect(saved).not.toHaveProperty('id');
    expect(saved.saved).toBe(true);
    expect(saved.status).toBe('local-saved');
    expect(saved.sourceLessonPlan).toEqual(initial.sourceLessonPlan);
    expect(hasUnsavedGeneratedChanges(saved)).toBe(false);
    const edited = { ...saved, title: 'Changed without saving' };
    expect(hasUnsavedGeneratedChanges(edited)).toBe(true);
    expect(restoreLocallySavedWorksheet(edited).title).toBe(saved.title);
    expect(saveGeneratedWorksheetLocally(edited).draftId).toBe(initial.draftId);
    expect(() => saveGeneratedWorksheetLocally({ ...initial, id: 'database-row' })).toThrow('only');
    expect(() => saveGeneratedWorksheetLocally({ ...initial, title: '' })).toThrow('highlighted');
    expect(studentDraftPreview(saved)).not.toHaveProperty('answerKey');
  });

  it('keeps multiline directions through local save, reopen and student preview without exposing keys', () => {
    const initial = createGeneratedDraft(generated(), 'ai');
    const edited = updateGeneratedDraft(initial, {
      title: initial.title, instructions: 'Read each item.\nAnswer clearly.',
      items: editableDraftItems(initial), checkingMode: 'manual',
    });
    const saved = saveGeneratedWorksheetLocally(edited);
    expect(saved.localSavedContent.instructions).toBe('Read each item.\nAnswer clearly.');
    expect(studentDraftPreview(saved).instructions).toBe('Read each item.\nAnswer clearly.');
    expect(studentDraftPreview(saved)).not.toHaveProperty('answerKey');
    expect(hasUnsavedGeneratedChanges({ ...saved, instructions: 'Changed' })).toBe(true);
    expect(restoreLocallySavedWorksheet({ ...saved, instructions: 'Changed' }).instructions)
      .toBe('Read each item.\nAnswer clearly.');
    expect(saveGeneratedWorksheetLocally({ ...saved, instructions: 'Changed' }).draftId).toBe(saved.draftId);
    expect(validateGeneratedWorksheet({ ...saved, instructions: 'x'.repeat(2001) })[0].field).toBe('instructions');
  });

  it('keeps ordered section directions and question numbering through local save and reopen', () => {
    const source = generated();
    source.sections = [
      { id: 'mc', title: 'Multiple choice', directions: 'Choose one.\nRead carefully.' },
      { id: 'essay', title: 'Essay', directions: 'Explain your answer.' },
    ];
    source.questions[0].sectionId = 'mc';
    source.questions[1].sectionId = 'essay';
    const initial = createGeneratedDraft(source, 'ai');
    const edited = updateGeneratedDraft(initial, {
      title: initial.title, instructions: 'General introduction.',
      sections: [...initial.sections].reverse(), items: editableDraftItems(initial), checkingMode: 'manual',
    });
    expect(edited.questions.map(item => item.localId)).toEqual(['draft-2', 'draft-1']);
    expect(edited.questions.map(item => item.points)).toEqual([3, 2]);
    expect(edited.answerKey).toEqual([{ localId: 'draft-1', correct_answer: 'Nucleus' }]);
    expect(studentDraftPreview(edited).sections.map(section => section.questionIndexes)).toEqual([[0], [1]]);
    expect(studentDraftPreview(edited).sections[1].directions).toBe('Choose one.\nRead carefully.');
    const saved = saveGeneratedWorksheetLocally(edited);
    expect(restoreLocallySavedWorksheet({ ...saved, sections: [] }).sections).toEqual(edited.sections);
    expect(restoreLocallySavedWorksheet(saved).answerKey).toEqual(edited.answerKey);
    expect(studentDraftPreview(saved)).not.toHaveProperty('answerKey');
  });

  it('keeps weekly essay guidance private through edit, local save, and student preview', () => {
    const source = generated();
    source.questions[1].essay = {
      referenceAnswer: 'Explain how cells work together.', minWords: 20, maxWords: 100,
      rubric: [{ criterion: 'Accurate explanation', points: 3 }],
    };
    const initial = { ...createGeneratedDraft(source, 'ai'), collectionId: 'weekly-1', day: 'Thursday' };
    const items = editableDraftItems(initial);
    items[1].essay.referenceAnswer = 'Revised private explanation.';
    const edited = updateGeneratedDraft(initial, {
      title: initial.title, items, checkingMode: 'manual',
    });
    expect(validateGeneratedWorksheet(edited)).toEqual([]);
    const saved = saveGeneratedWorksheetLocally(edited);
    expect(restoreLocallySavedWorksheet(saved).questions[1].essay.referenceAnswer)
      .toBe('Revised private explanation.');
    expect(JSON.stringify(studentDraftPreview(saved))).not.toContain('Revised private explanation.');
    expect(JSON.stringify(studentDraftPreview(saved))).not.toContain('Accurate explanation');
    expect(validateGeneratedWorksheet({ ...edited, questions: edited.questions.map(item =>
      item.item_type === 'essay' ? { ...item, essay: { ...item.essay, referenceAnswer: '' } } : item) })
      .map(error => error.field)).toContain('question-2-essay');
  });

  it('rejects malformed sections and preserves a legacy worksheet in one section', () => {
    const legacy = generated();
    const draft = createGeneratedDraft(legacy, 'manual');
    expect(draft.sections).toHaveLength(1);
    expect(studentDraftPreview(draft).sections[0].questionIndexes).toEqual([0, 1]);
    expect(validateGeneratedWorksheet({ ...draft, sections: [{ ...draft.sections[0], title: '' }] })
      .map(error => error.field)).toContain('section-1');
    expect(validateGeneratedWorksheet({ ...draft, questions: [{ ...draft.questions[0], sectionId: 'missing' }] })
      .map(error => error.field)).toContain('sections');
  });
});
