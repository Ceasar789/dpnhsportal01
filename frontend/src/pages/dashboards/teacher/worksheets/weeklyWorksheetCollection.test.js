// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createWeeklyWorksheetCollection, createWeeklyJobDraftCollection, shuffleWeeklyWorksheet, updateWeeklyWorksheet } from './weeklyWorksheetCollection';
import { WEEKDAYS } from '../lessonPlans/weeklyWorksheetSource';

const teacherId = 'teacher-1';
const plan = { id: 'plan-1', teacher_id: teacherId, title: 'English, week 3', subject: 'English',
  subject_id: 'english', grade_level: 'Grade 7' };
const sources = WEEKDAYS.map(day => ({ day, objective: `Understand ${day}`, activity: `Practice ${day}`, assessment: `Explain ${day}` }));
const responses = WEEKDAYS.map(day => ({ status: 'generated-draft', saved: false, day,
  title: `${day} questions`, sourceLessonPlan: { id: plan.id, title: plan.title },
  sections: [{ id: 'questions', title: 'Questions', directions: 'Answer each question.' }],
  questions: [{ localId: 'question-1', sectionId: 'questions', question: `What happened on ${day}?`,
    item_type: 'identification', options: [], points: 1 }],
  answerKey: [{ localId: 'question-1', correct_answer: day }],
}));

describe('local weekly worksheet collection', () => {
  it('adapts a completed job into five stable editable drafts without changing question order or answers', () => {
    const jobId = '823ebbd4-1bfe-459c-97e6-0200e738a5cb';
    const result = { kind: 'weekly-worksheet-collection', status: 'local-draft', saved: false,
      teacherId, sourceLessonPlan: { id: plan.id, title: plan.title },
      worksheets: WEEKDAYS.map(day => ({ status: 'generated-draft', saved: false, day,
        title: `${day} questions`, instructions: 'Answer every question.',
        sourceLessonPlan: { id: plan.id, title: plan.title },
        sourceContext: sources.find(source => source.day === day),
        subjectId: 'english', subjectName: 'English', gradeLevel: 'Grade 7', schoolYear: '',
        questions: Array.from({ length: 20 }, (_, index) => ({
          localId: `draft-${index + 1}`, question: `${day} question ${index + 1}`,
          item_type: 'identification', options: [], points: 1 })),
        answerKey: Array.from({ length: 20 }, (_, index) => ({
          localId: `draft-${index + 1}`, correct_answer: `${day} answer ${index + 1}` })),
      })) };
    const collection = createWeeklyJobDraftCollection({ jobId, result, teacherId });
    expect(collection).toMatchObject({ collectionId: jobId, sourceJobId: jobId, teacherId, saved: false,
      status: 'local-draft', sourceLessonPlan: { id: plan.id, title: plan.title } });
    expect(collection.worksheets.map(day => day.day)).toEqual(WEEKDAYS);
    expect(collection.worksheets.map(day => day.draftId)).toEqual(WEEKDAYS.map(day => `${jobId}:${day}`));
    expect(collection.worksheets.every(day => day.collectionId === jobId && day.saved === false
      && day.sections.length > 0)).toBe(true);
    expect(collection.worksheets[0].questions.map(item => item.question))
      .toEqual(result.worksheets[0].questions.map(item => item.question));
    expect(collection.worksheets[0].answerKey.map(item => item.correct_answer))
      .toEqual(result.worksheets[0].answerKey.map(item => item.correct_answer));
    expect(collection.worksheets[0].questions.map(item => item.localId))
      .toEqual(collection.worksheets[0].answerKey.map(item => item.localId));
    expect(createWeeklyJobDraftCollection({ jobId, result, teacherId }).worksheets[0].questions)
      .toEqual(collection.worksheets[0].questions);
    expect(result.worksheets[0].questions[0].localId).toBe('draft-1');
    expect(() => createWeeklyJobDraftCollection({ jobId, result, teacherId: 'other' })).toThrow();
  });
  it('creates five distinct editable daily documents under one versioned collection', () => {
    const collection = createWeeklyWorksheetCollection({ plan, teacherId, sources, responses });
    expect(collection).toMatchObject({ kind: 'weekly-worksheet-collection', version: 1, saved: false,
      title: 'English 7 — Weekly Worksheets', sourceLessonPlan: { id: 'plan-1' } });
    expect(collection.worksheets.map(item => item.day)).toEqual(WEEKDAYS);
    expect(new Set(collection.worksheets.map(item => item.draftId)).size).toBe(5);
    expect(new Set(collection.worksheets.flatMap(item => item.questions.map(question => question.localId))).size).toBe(5);
    expect(collection.worksheets.every(item => item.answerKey[0].localId === item.questions[0].localId)).toBe(true);
    expect(collection.worksheets.every(item => item.collectionId === collection.collectionId && !item.saved)).toBe(true);
    const changed = updateWeeklyWorksheet(collection, { ...collection.worksheets[1], title: 'Edited Tuesday' });
    expect(changed.worksheets[1].title).toBe('Edited Tuesday');
    expect(changed.worksheets[0]).toBe(collection.worksheets[0]);
  });

  it('rejects an incomplete week, mismatched day, or foreign Teacher', () => {
    expect(() => createWeeklyWorksheetCollection({ plan, teacherId, sources: sources.slice(0, 4), responses })).toThrow();
    expect(() => createWeeklyWorksheetCollection({ plan, teacherId, sources, responses: responses.map((item, index) =>
      index === 2 ? { ...item, day: 'Monday' } : item) })).toThrow(/Wednesday/);
    expect(() => createWeeklyWorksheetCollection({ plan, teacherId: 'other', sources, responses })).toThrow();
    expect(() => createWeeklyWorksheetCollection({ plan, teacherId, sources, responses, questionCount: 30 })).toThrow(/Monday/);
  });

  it('uses a historical Filipino title for display without inventing metadata', () => {
    const historical = { ...plan, title: 'Filipino 7 Lesson Plan', subject: 'ILAW Lesson Plan',
      subject_id: null, grade_level: null };
    const collection = createWeeklyWorksheetCollection({ plan: historical, teacherId, sources,
      responses: responses.map(item => ({ ...item, sourceLessonPlan: { id: historical.id, title: historical.title } })) });
    expect(collection.title).toBe('Filipino 7 — Weekly Worksheets');
    expect(collection.subjectId).toBeFalsy();
    expect(collection.gradeLevel).toBeFalsy();
    expect(collection.worksheets.every(item => item.assignmentVerified === false)).toBe(true);
  });

  it('shuffles stable question identities while answer keys remain attached to their IDs', () => {
    const collection = createWeeklyWorksheetCollection({ plan, teacherId, sources, responses });
    const monday = collection.worksheets[0];
    const expanded = { ...monday, questions: [
      { ...monday.questions[0], localId: 'a', question: 'First' },
      { ...monday.questions[0], localId: 'b', question: 'Second' },
      { ...monday.questions[0], localId: 'c', question: 'Third' },
    ], answerKey: ['a', 'b', 'c'].map(localId => ({ localId, correct_answer: localId })) };
    const shuffled = shuffleWeeklyWorksheet(expanded, () => 0);
    expect(shuffled.questions.map(item => item.localId)).toEqual(['b', 'c', 'a']);
    expect(shuffled.answerKey).toEqual(expanded.answerKey);
    expect(shuffled.questions.map(item => shuffled.answerKey.find(key => key.localId === item.localId).correct_answer)).toEqual(['b', 'c', 'a']);
    expect(expanded.questions.map(item => item.localId)).toEqual(['a', 'b', 'c']);
  });
});
