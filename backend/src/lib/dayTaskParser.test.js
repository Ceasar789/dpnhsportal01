import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDayTask } from './dayTaskParser.js';

const counts = { multiple_choice: 1, true_false: 1, identification: 1, enumeration: 1 };
const quizTask = { taskType: 'quiz', itemCount: 4, typeCounts: counts };
const essayTask = { taskType: 'assignment', itemCount: 1, typeCounts: { essay: 1 } };
const activityTask = { taskType: 'activity' };

const quiz = () => ({ title: 'Cells quiz', directions: 'Answer every item.', questions: [
  { question: 'Which part controls the cell?', item_type: 'multiple_choice',
    options: ['Nucleus', 'Wall', 'Vacuole', 'Ribosome'], correct_answer: 'nucleus' },
  { question: 'Cells are the unit of life.', item_type: 'true_false', options: [], correct_answer: 'true' },
  { question: 'Name the powerhouse of the cell.', item_type: 'identification', options: [],
    correct_answer: 'mitochondrion, mitochondria' },
  { question: 'List two cell types.', item_type: 'enumeration', options: [], correct_answer: 'plant, animal',
    enumeration: { alternatives: [], orderSensitive: false } },
] });
const assignment = () => ({ title: 'Cells essay', directions: 'Write in sentences.', questions: [
  { question: 'Explain why cells divide.', item_type: 'essay', options: [], correct_answer: '',
    essay: { referenceAnswer: 'Cells divide to grow and repair.', minWords: 40, maxWords: 80,
      rubric: [{ criterion: 'Accuracy', points: 3 }, { criterion: 'Clarity', points: 2 }] } },
] });
const activity = () => ({ language: 'en', title: 'Cell map', objective: 'Describe cells.', materials: ['Paper'],
  procedure: ['Draw a cell.', 'Label it.', 'Share it.'], grouping: 'Pairs', durationMinutes: 20,
  successCriteria: ['Labels are correct.', 'Parts are explained.'] });

const rejects = (value, task, category) => assert.throws(
  () => parseDayTask(typeof value === 'string' ? value : JSON.stringify(value), task),
  error => error.code === 'AI_RESPONSE_INVALID' && error.validation.category === category);
const withQuiz = change => { const value = quiz(); change(value.questions, value); return value; };
const withEssay = change => { const value = assignment(); change(value.questions[0].essay, value.questions[0]); return value; };

test('valid quiz is normalized, ids assigned, and points set by code', () => {
  const value = quiz();
  value.questions.forEach(item => { item.points = 99; });
  const result = parseDayTask(JSON.stringify(value), quizTask);
  assert.deepEqual(result.questions.map(item => [item.localId, item.item_type, item.points]), [
    ['draft-1', 'multiple_choice', 1], ['draft-2', 'true_false', 1],
    ['draft-3', 'identification', 1], ['draft-4', 'enumeration', 2],
  ]);
  assert.deepEqual(result.answerKey, [
    { localId: 'draft-1', correct_answer: 'Nucleus' }, { localId: 'draft-2', correct_answer: 'True' },
    { localId: 'draft-3', correct_answer: 'mitochondrion, mitochondria' }, { localId: 'draft-4', correct_answer: 'plant, animal' },
  ]);
  assert.deepEqual(result.questions[3].enumeration, { alternatives: [], orderSensitive: false });
  assert.equal(Object.hasOwn(result.questions[0], 'correct_answer'), false);
});

test('enumeration metadata defaults when omitted', () => {
  const value = withQuiz(questions => { delete questions[3].enumeration; });
  assert.deepEqual(parseDayTask(JSON.stringify(value), quizTask).questions[3].enumeration,
    { alternatives: [], orderSensitive: false });
});

test('valid essay ignores AI points and has no answer key', () => {
  const value = assignment();
  value.questions[0].points = 40;
  const result = parseDayTask(JSON.stringify(value), essayTask);
  assert.equal(result.questions[0].points, 5);
  assert.deepEqual(result.answerKey, []);
  assert.equal(result.questions[0].essay.rubric.length, 2);
});

test('invalid or truncated JSON is rejected', () => {
  rejects('not json', quizTask, 'syntax');
  rejects(JSON.stringify(quiz()).slice(0, 40), quizTask, 'syntax');
  rejects('[]', quizTask, 'missing_required');
  rejects('null', activityTask, 'missing_required');
});

test('wrong item count is rejected in both directions', () => {
  rejects(withQuiz(questions => { questions.pop(); }), quizTask, 'question_count');
  rejects(withQuiz(questions => { questions.push({ ...questions[1], question: 'Another statement.' }); }), quizTask, 'question_count');
});

test('per-type count mismatch is rejected', () => {
  rejects(withQuiz(questions => { questions[2] = { ...questions[1], question: 'Plants have cells.' }; }), quizTask, 'type_distribution');
  rejects(assignment(), { taskType: 'quiz', itemCount: 1, typeCounts: { multiple_choice: 1 } }, 'type_distribution');
});

test('unsupported item type is rejected', () => {
  rejects(withQuiz(questions => { questions[1].item_type = 'matching'; }), quizTask, 'unsupported_question_type');
  rejects(withQuiz(questions => { questions[1].item_type = ['true_false']; }), quizTask, 'unsupported_question_type');
  rejects(withQuiz(questions => { questions[1].item_type = 'constructor'; }), quizTask, 'unsupported_question_type');
});

test('duplicate questions are rejected after case and whitespace folding', () => {
  rejects(withQuiz(questions => { questions[1].question = '  WHICH part   controls the CELL? '; }), quizTask, 'duplicate_question');
});

test('angle brackets are rejected in every text field', () => {
  for (const mark of ['<', '>']) {
    rejects(withQuiz((_questions, value) => { value.title = `Cells ${mark} quiz`; }), quizTask, 'invalid_field');
    rejects(withQuiz((_questions, value) => { value.directions = `Answer ${mark}`; }), quizTask, 'invalid_field');
    rejects(withQuiz(questions => { questions[0].question = `Which ${mark}?`; }), quizTask, 'invalid_field');
    rejects(withQuiz(questions => { questions[0].options[1] = `Wall ${mark}`; }), quizTask, 'invalid_field');
    rejects(withQuiz(questions => { questions[2].correct_answer = `mito${mark}`; }), quizTask, 'invalid_field');
    rejects(withQuiz(questions => { questions[3].enumeration.alternatives = [`a${mark}, b`]; }), quizTask, 'invalid_field');
    rejects(withEssay(essay => { essay.referenceAnswer = `Cells ${mark}`; }), essayTask, 'invalid_field');
    rejects(withEssay(essay => { essay.rubric[0].criterion = `Accuracy ${mark}`; }), essayTask, 'invalid_field');
    rejects({ ...activity(), objective: `Describe ${mark}` }, activityTask, 'invalid_field');
    rejects({ ...activity(), procedure: ['a', 'b', `c${mark}`] }, activityTask, 'invalid_field');
  }
});

test('blank and overlong strings are rejected', () => {
  rejects(withQuiz((_questions, value) => { value.title = '   '; }), quizTask, 'invalid_field');
  rejects(withQuiz((_questions, value) => { value.title = 'x'.repeat(301); }), quizTask, 'invalid_field');
  rejects(withQuiz(questions => { questions[0].question = 7; }), quizTask, 'invalid_field');
});

test('multiple choice needs 4 distinct options and one matching answer', () => {
  rejects(withQuiz(questions => { questions[0].options.pop(); }), quizTask, 'invalid_field');
  rejects(withQuiz(questions => { questions[0].options[1] = 'NUCLEUS'; }), quizTask, 'invalid_field');
  rejects(withQuiz(questions => { questions[0].correct_answer = 'Golgi'; }), quizTask, 'invalid_answer_key');
});

test('non-multiple-choice items must have empty options', () => {
  rejects(withQuiz(questions => { questions[1].options = ['True', 'False']; }), quizTask, 'invalid_field');
  rejects(withEssay((_essay, item) => { item.options = null; }), essayTask, 'invalid_field');
});

test('invalid true/false answers are rejected', () => {
  for (const answer of ['Yes', 'Tama', '', true]) {
    rejects(withQuiz(questions => { questions[1].correct_answer = answer; }), quizTask, 'invalid_answer_key');
  }
});

test('empty identification and enumeration answers are rejected', () => {
  rejects(withQuiz(questions => { questions[2].correct_answer = ''; }), quizTask, 'invalid_field');
  rejects(withQuiz(questions => { questions[2].correct_answer = 'mitochondrion,,'; }), quizTask, 'invalid_field');
  rejects(withQuiz(questions => { questions[2].correct_answer = `${'x'.repeat(301)}, y`; }), quizTask, 'invalid_field');
  rejects(withQuiz(questions => { questions[3].correct_answer = ' '; }), quizTask, 'invalid_field');
});

test('enumeration needs two distinct items and matching alternatives', () => {
  rejects(withQuiz(questions => { questions[3].correct_answer = 'plant'; }), quizTask, 'invalid_answer_key');
  rejects(withQuiz(questions => { questions[3].correct_answer = 'plant, PLANT'; }), quizTask, 'invalid_answer_key');
  rejects(withQuiz(questions => { questions[3].enumeration = []; }), quizTask, 'invalid_field');
  rejects(withQuiz(questions => { questions[3].enumeration.orderSensitive = 'no'; }), quizTask, 'invalid_field');
  rejects(withQuiz(questions => { questions[3].enumeration.alternatives = ['only one']; }), quizTask, 'invalid_field');
});

test('essay configuration is enforced', () => {
  rejects(withEssay(essay => { essay.rubric[0].points = 4; }), essayTask, 'invalid_essay');
  rejects(withEssay(essay => { essay.rubric = [{ criterion: 'Only', points: 5 }]; }), essayTask, 'invalid_essay');
  rejects(withEssay(essay => { essay.maxWords = 301; }), essayTask, 'invalid_essay');
  rejects(withEssay(essay => { essay.minWords = 90; }), essayTask, 'invalid_essay');
  rejects(withEssay((_essay, item) => { delete item.essay; }), essayTask, 'invalid_essay');
  rejects(withEssay((_essay, item) => { item.correct_answer = 'An answer'; }), essayTask, 'invalid_answer_key');
});

test('activity fields are enforced', () => {
  assert.equal(parseDayTask(JSON.stringify({ ...activity(), materials: [] }), activityTask).activity.title, 'Cell map');
  rejects({ ...activity(), materials: Array(11).fill('Paper') }, activityTask, 'invalid_field');
  rejects({ ...activity(), procedure: ['One', 'Two'] }, activityTask, 'invalid_field');
  rejects({ ...activity(), procedure: Array(9).fill('Step') }, activityTask, 'invalid_field');
  rejects({ ...activity(), durationMinutes: 4 }, activityTask, 'invalid_field');
  rejects({ ...activity(), durationMinutes: 91 }, activityTask, 'invalid_field');
  rejects({ ...activity(), durationMinutes: 20.5 }, activityTask, 'invalid_field');
  rejects({ ...activity(), successCriteria: ['One'] }, activityTask, 'invalid_field');
  rejects({ ...activity(), grouping: '' }, activityTask, 'invalid_field');
});

test('activity language must be exactly en or fil', () => {
  for (const language of ['en', 'fil']) {
    assert.equal(parseDayTask(JSON.stringify({ ...activity(), language }), activityTask).activity.language, language);
  }
  const missing = activity();
  delete missing.language;
  rejects(missing, activityTask, 'invalid_field');
  for (const language of ['es', 'FIL', ' en', 'Filipino', '', null, 1, ['en']]) {
    rejects({ ...activity(), language }, activityTask, 'invalid_field');
  }
});

test('error messages never repeat AI text', () => {
  const value = withQuiz(questions => { questions[0].question = 'SECRET-AI-TEXT <b>'; });
  assert.throws(() => parseDayTask(JSON.stringify(value), quizTask),
    error => !JSON.stringify({ message: error.message, ...error.validation }).includes('SECRET-AI-TEXT'));
});
