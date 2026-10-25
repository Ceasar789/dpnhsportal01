export const WEEKDAYS = Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);

export const WEEKLY_FIELDS = [
  ['learningObjectives', 'Learning Objectives'],
  ['learnerContext', 'Learner Context'],
  ['preLesson', 'Pre-Lesson'],
  ['flow', 'Flow'],
  ['learningResources', 'Learning Resources'],
  ['integration', 'Opportunities for Integration'],
  ['formativeAssessment', 'Formative Assessment'],
  ['extendedLearning', 'Extended Learning Opportunities'],
  ['reflections', 'Reflections'],
];

// A fresh object per draft: no Teacher, AI, database, or Storage state enters here.
export const createBlankIlawDocument = ({ subject = '', grade = '' } = {}) => ({
  info: {
    nameOfLesson: '', teachingDate: '', learningArea: subject,
    termWeek: '', designedBy: '', gradeSection: grade,
    sessions: '', references: '', aiUseDeclaration: '',
  },
  learningCompetency: '',
  weekly: Object.fromEntries(WEEKLY_FIELDS.map(([key]) => [key, Object.fromEntries(WEEKDAYS.map(day => [day, '']))])),
  signatures: {
    preparedBy: { name: '', role: '' },
    checkedBy: { name: '', role: '' },
    notedBy: { name: '', role: '' },
  },
});
