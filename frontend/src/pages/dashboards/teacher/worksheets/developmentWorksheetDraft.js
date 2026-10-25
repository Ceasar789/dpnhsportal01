// Controlled local QA fixtures. Matching is exact so an arbitrary saved
// Assessment never receives unrelated questions disguised as generated work.
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SAMPLE_LABEL = 'Sample generated from a test Assessment fixture — not live AI.';
const clean = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

const fixtures = [
  {
    activities: ['Label the nucleus and cell wall on a plant cell diagram and explain their functions.'], weekdays: {},
    sections: [{ id: 'fixture-questions', title: 'Questions', directions: 'Use the plant cell diagram described in the Assessment.' }],
    questions: [
      { localId: 'fixture-1', sectionId: 'fixture-questions', question: 'Which two structures does the Assessment ask you to label?',
        item_type: 'multiple_choice', options: ['Nucleus and cell wall', 'Roots and stem'], points: 1 },
      { localId: 'fixture-2', sectionId: 'fixture-questions', question: 'Explain the functions of the nucleus and cell wall.',
        item_type: 'essay', options: [], points: 2 },
    ],
    answerKey: [{ localId: 'fixture-1', correct_answer: 'Nucleus and cell wall' }],
  },
  {
    activities: ['Identify the subject and predicate in each sentence.'], weekdays: {},
    sections: [
      { id: 'fixture-subject', title: 'Subject', directions: 'Identify who or what the sentence is about.' },
      { id: 'fixture-predicate', title: 'Predicate', directions: 'Explain what the subject does.' },
    ],
    questions: [
      { localId: 'fixture-1', sectionId: 'fixture-subject', question: 'What is the subject in “Birds build nests”?',
        item_type: 'multiple_choice', options: ['Birds', 'Build nests'], points: 1 },
      { localId: 'fixture-2', sectionId: 'fixture-predicate', question: 'What is the predicate in “Birds build nests”?',
        item_type: 'identification', options: [], points: 1 },
    ],
    answerKey: [
      { localId: 'fixture-1', correct_answer: 'Birds' },
      { localId: 'fixture-2', correct_answer: 'build nests' },
    ],
  },
  {
    activities: [],
    weekdays: { Monday: 'Label the nucleus in a plant cell diagram.', Wednesday: 'Compare the nucleus and cell wall.' },
    sections: [
      { id: 'fixture-monday', title: 'Monday Assessment', directions: 'Refer to the plant cell diagram.' },
      { id: 'fixture-wednesday', title: 'Wednesday Assessment', directions: 'Compare the two named structures.' },
    ],
    questions: [
      { localId: 'fixture-1', sectionId: 'fixture-monday', question: 'Which structure must be labeled on Monday?',
        item_type: 'identification', options: [], points: 1 },
      { localId: 'fixture-2', sectionId: 'fixture-wednesday', question: 'Compare the nucleus and cell wall.',
        item_type: 'essay', options: [], points: 2 },
    ],
    answerKey: [{ localId: 'fixture-1', correct_answer: 'nucleus' }],
  },
];

function assessmentFrom(source) {
  if (source?.kind === 'ai-html-text') {
    return { activities: source.assessment?.activities, weekdays: source.assessment?.weekdayFormativeAssessments };
  }
  if (source?.kind === 'manual-ilaw-v2') {
    return { activities: [], weekdays: source.formativeAssessments };
  }
  return null;
}

function matches(fixture, assessment) {
  if (!Array.isArray(assessment?.activities)) return false;
  const activities = assessment.activities.map(clean).filter(Boolean);
  if (JSON.stringify(activities) !== JSON.stringify(fixture.activities)) return false;
  return DAYS.every(day => clean(assessment.weekdays?.[day]) === (fixture.weekdays[day] || ''));
}

// Development-only presentation response. No AI, backend, database, or Storage.
export function createDevelopmentWorksheetResponse(context) {
  if (!import.meta.env.DEV) throw new Error('The worksheet preview is available only in local development.');
  if (!context?.lessonPlanId || !context?.lessonTitle || !context?.source) {
    throw new Error('A saved lesson plan with usable Assessment content is required.');
  }
  const assessment = assessmentFrom(context.source);
  const fixture = fixtures.find(item => matches(item, assessment));
  if (!fixture) {
    throw new Error('No local test fixture matches this Assessment. Nothing was generated or saved.');
  }
  const sourceExcerpt = [...fixture.activities, ...DAYS.map(day => fixture.weekdays[day]).filter(Boolean)].join(' ').slice(0, 240);
  return {
    status: 'generated-draft', saved: false, generationLabel: SAMPLE_LABEL,
    title: `${context.lessonTitle} — sample worksheet`,
    subjectId: context.subjectId || '', subjectName: context.subjectName || '',
    gradeLevel: context.gradeLevel || '', schoolYear: context.schoolYear || '', assignmentVerified: false,
    sourceLessonPlan: { id: context.lessonPlanId, title: context.lessonTitle, contentExcerpt: sourceExcerpt },
    sections: fixture.sections.map(section => ({ ...section })),
    questions: fixture.questions.map(question => ({ ...question, options: [...question.options] })),
    answerKey: fixture.answerKey.map(key => ({ ...key })),
  };
}
