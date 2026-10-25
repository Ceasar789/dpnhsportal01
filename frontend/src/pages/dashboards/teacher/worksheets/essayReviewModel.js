// Fictional, development-only review data. No student records or AI calls.
export const ESSAY_FIXTURE = {
  id: 'cell-nucleus-demo-v1',
  questions: [
    { id: 'nucleus', text: 'Explain how the nucleus helps a plant cell function.', points: 5 },
    { id: 'cell-wall', text: 'Explain how the cell wall supports a plant cell.', points: 4 },
  ],
  responses: [
    { id: 'student-a', name: 'Sample Learner A', questionId: 'nucleus',
      answer: 'The nucleus stores DNA and helps control the activities of the cell.' },
    { id: 'student-b', name: 'Sample Learner B', questionId: 'nucleus',
      answer: 'The nucleus is a part of the cell.' },
  ],
  rubric: [
    { id: 'content', title: 'Scientific content', description: 'Explains the role of DNA and cell control.', guidance: 'Look for both ideas.', maxPoints: 3 },
    { id: 'clarity', title: 'Clear explanation', description: 'Communicates the idea clearly.', guidance: '', maxPoints: 2 },
  ],
};

const finitePoints = value => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
export const sumPoints = values => {
  const numbers = values.map(value => Number(value || 0));
  return numbers.every(Number.isFinite) ? Math.round(numbers.reduce((sum, value) => sum + value, 0) * 100) / 100 : null;
};

export function validateRubric(criteria, questionPoints) {
  const errors = {};
  if (!criteria.length) errors.rubric = 'Add at least one criterion.';
  const ids = new Set();
  criteria.forEach((criterion, index) => {
    if (!criterion.title.trim()) errors[`title-${index}`] = 'Enter a criterion title.';
    if (!criterion.id || ids.has(criterion.id)) errors[`id-${index}`] = 'Each criterion needs a unique identity.';
    ids.add(criterion.id);
    if (!finitePoints(criterion.maxPoints)) errors[`max-${index}`] = 'Enter points from 0 to 100.';
  });
  if (!Object.keys(errors).length && sumPoints(criteria.map(item => item.maxPoints)) !== Number(questionPoints)) {
    errors.total = `Rubric total must equal the question maximum of ${questionPoints} points.`;
  }
  return errors;
}

export function validateMarks(criteria, marks) {
  const errors = {};
  criteria.forEach((criterion, index) => {
    const value = marks[criterion.id];
    if (!finitePoints(value) || Number(value) > Number(criterion.maxPoints)) {
      errors[criterion.id] = `Enter a score from 0 to ${criterion.maxPoints} for criterion ${index + 1}.`;
    }
  });
  return errors;
}

export const reviewFingerprint = ({ fixtureId, response, question, criteria }) => JSON.stringify([
  fixtureId, response?.id, response?.questionId, response?.answer, question?.id, question?.text, question?.points,
  criteria.map(item => [item.id, item.title, item.description, item.guidance, item.maxPoints]),
]);

export function evaluateSyntheticEssay({ fixtureId, response, question, criteria }) {
  if (fixtureId !== ESSAY_FIXTURE.id || response?.id !== 'student-a' || question?.id !== 'nucleus'
    || response?.answer !== ESSAY_FIXTURE.responses[0].answer
    || JSON.stringify(criteria) !== JSON.stringify(ESSAY_FIXTURE.rubric)) {
    throw new Error('No local evaluation fixture matches this response and rubric. Enter scores manually.');
  }
  return {
    label: 'Simulated evaluation — not live AI', fixtureId,
    marks: { content: 3, clarity: 2 }, total: 5,
    strengths: 'Identifies DNA storage and cell control.',
    improvements: 'Could add an example of a cell activity.',
    feedback: 'You explained the nucleus clearly. Add an example to strengthen the answer.',
  };
}
