import { describe, expect, it } from 'vitest';
import { savedWorksheetToDraft } from './savedWorksheetDraft';
import { studentDraftPreview } from './generatedDraftModel';

const worksheet = { id: 'w-1', title: 'Cells - Tuesday Quiz', subject: 'Science', grade_level: 'Grade 7', instructions: 'Answer all.' };
const items = [
  { id: 'i-2', position: 2, question: 'Second', item_type: 'true_false', options: null, points: 1 },
  { id: 'i-1', position: 1, question: 'First', item_type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], points: '2' },
];
const keys = { 'i-1': { correct_answer: 'A' }, 'i-2': { correct_answer: 'True' } };

describe('savedWorksheetToDraft', () => {
  it('maps the worksheet, items, and keys', () => {
    expect(savedWorksheetToDraft({ worksheet, items, keys })).toEqual({
      title: 'Cells - Tuesday Quiz', subjectName: 'Science', gradeLevel: 'Grade 7', instructions: 'Answer all.',
      questions: [
        { localId: 'i-1', question: 'First', item_type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], points: 2, sectionId: undefined },
        { localId: 'i-2', question: 'Second', item_type: 'true_false', options: [], points: 1, sectionId: undefined },
      ],
      answerKey: [{ localId: 'i-1', correct_answer: 'A' }, { localId: 'i-2', correct_answer: 'True' }],
    });
  });

  it('sorts by position, keeps ties in order, and puts a bad position last', () => {
    const rows = [{ id: 'c', position: 'x' }, { id: 'b', position: 2 }, { id: 'a', position: 1 }, { id: 'b2', position: 2 }];
    expect(savedWorksheetToDraft({ items: rows }).questions.map(item => item.localId)).toEqual(['a', 'b', 'b2', 'c']);
  });

  it('keeps identification and enumeration keys as lists', () => {
    const draft = savedWorksheetToDraft({ items: [{ id: 'i-1', position: 1, item_type: 'enumeration' }],
      keys: { 'i-1': { correct_answer: ['plant', 'animal'] } } });
    expect(draft.answerKey[0].correct_answer).toEqual(['plant', 'animal']);
  });

  it('treats zero items as a valid empty draft', () => {
    const draft = savedWorksheetToDraft({ worksheet, items: [], keys: {} });
    expect(draft.questions).toEqual([]);
    expect(draft.answerKey).toEqual([]);
    expect(studentDraftPreview(draft).sections[0].questionIndexes).toEqual([]);
  });

  it('handles null keys, items, and options', () => {
    expect(savedWorksheetToDraft({ worksheet, items: null, keys: null }).questions).toEqual([]);
    const draft = savedWorksheetToDraft({ worksheet, items, keys: null });
    expect(draft.answerKey.map(key => key.correct_answer)).toEqual([undefined, undefined]);
    expect(draft.questions[1].options).toEqual([]);
  });

  it('never throws on garbage and returns only renderable values', () => {
    const garbage = [undefined, null, 7, 'text', [], {}, { id: {} }, [null, 3, 'x', { id: 'i' }]];
    expect(() => savedWorksheetToDraft()).not.toThrow();
    for (const value of garbage) {
      const draft = savedWorksheetToDraft({ worksheet: value, items: value, keys: value });
      expect(typeof draft.title).toBe('string');
      expect(Array.isArray(draft.questions)).toBe(true);
    }
    const draft = savedWorksheetToDraft({
      worksheet: { title: {}, subject: [], grade_level: null, instructions: 5, sections: 'x' },
      items: [null, 'x', { id: 'i-1', position: 1, question: {}, item_type: 9, options: 'A', points: {} },
        { id: 'i-2', position: 2, options: [{}, 'B', null] }],
      keys: { 'i-1': { correct_answer: { nested: true } }, 'i-2': { correct_answer: [{}, 'B'] } },
    });
    expect(draft.title).toBe('');
    expect(draft.instructions).toBe('5');
    expect(draft.questions[0]).toMatchObject({ question: '', item_type: '9', options: [], points: 0 });
    expect(draft.questions[1].options).toEqual(['B']);
    expect(draft.answerKey.map(key => key.correct_answer)).toEqual([undefined, ['B']]);
  });

  it('turns a boolean key into text and an empty list into no answer', () => {
    const draft = savedWorksheetToDraft({ items: [{ id: 'a', position: 1 }, { id: 'b', position: 2 }],
      keys: { a: { correct_answer: true }, b: { correct_answer: [] } } });
    expect(draft.answerKey.map(key => key.correct_answer)).toEqual(['true', undefined]);
  });

  it('never loses a question to a section id the template cannot match', () => {
    const shown = draft => studentDraftPreview(draft).sections.flatMap(section => section.questionIndexes);
    const orphan = [{ id: 'a', position: 1, question: 'Q', sectionId: 'gone' }];
    expect(shown(savedWorksheetToDraft({ items: orphan }))).toEqual([0]);
    expect(shown(savedWorksheetToDraft({ items: orphan, worksheet: { sections: [{ id: 's-1', title: 'Part' }] } }))).toEqual([0]);
  });

  it('keeps a matching section and leaves out an empty section list', () => {
    const rows = [{ id: 'a', position: 1, sectionId: 's-2' }];
    const draft = savedWorksheetToDraft({ items: rows, worksheet: { sections: [{ id: 's-1' }, { id: 's-2', title: 'Two', directions: 'Go' }] } });
    expect(draft.questions[0].sectionId).toBe('s-2');
    expect(draft.sections[1]).toEqual({ id: 's-2', title: 'Two', directions: 'Go' });
    expect(Object.hasOwn(savedWorksheetToDraft({ worksheet: { sections: [] } }), 'sections')).toBe(false);
  });
});
