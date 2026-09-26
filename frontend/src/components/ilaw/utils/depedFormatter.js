// ============================================
// DEPED LESSON PLAN FORMATTER
// ============================================

export const formatDepEdLessonPlan = (lessonData) => {
  return {
    header: formatHeader(lessonData),
    competency: formatCompetency(lessonData),
    objectives: formatObjectives(lessonData),
    subjectMatter: formatSubjectMatter(lessonData),
    learningResources: formatLearningResources(lessonData),
    procedures: formatProcedures(lessonData),
    assessment: formatAssessment(lessonData),
    reflection: formatReflection(lessonData),
    footer: formatFooter(lessonData)
  };
};

const formatHeader = (data) => ({
  school: data.school || 'School Name',
  division: 'Division/District',
  grade: data.gradeLevel || 'Grade Level',
  subject: data.subject || 'Subject',
  quarter: data.quarter || 'Quarter',
  week: data.week || 'Week',
  date: data.date || new Date().toLocaleDateString(),
  section: data.section || 'Section',
  teacher: data.teacherName || 'Teacher Name',
  learningArea: data.learningArea || 'Learning Area'
});

const formatCompetency = (data) => ({
  melc: data.competency || 'Most Essential Learning Competency',
  competencyCode: data.competencyCode || 'Code not specified'
});

const formatObjectives = (data) => {
  const objectives = data.objectives || '';
  return {
    knowledge: extractByCategory(objectives, 'knowledge'),
    skills: extractByCategory(objectives, 'skills'),
    attitude: extractByCategory(objectives, 'attitude'),
    values: extractByCategory(objectives, 'values'),
    rawObjectives: objectives
  };
};

const formatSubjectMatter = (data) => ({
  mainTopic: data.mainTopic || 'Main Topic',
  subtopics: data.subtopics || [],
  keyConceptsAndValues: data.keyConceptsAndValues || [],
  content: data.content || 'Content to be filled'
});

const formatLearningResources = (data) => ({
  books: data.books || [],
  modules: data.modules || [],
  audiovisuals: data.audiovisuals || [],
  websites: data.websites || [],
  others: data.others || []
});

const formatProcedures = (data) => ({
  a_review: {
    title: 'A. Review',
    description: data.review || 'Review of previous learning',
    duration: '5-10 minutes'
  },
  b_motivation: {
    title: 'B. Motivation',
    description: data.motivation || 'Engagement and motivation activity',
    duration: '5-10 minutes'
  },
  c_lessonProper: {
    title: 'C. Lesson Proper',
    phases: {
      instruction: data.instruction || 'Teacher instruction and explanation',
      practice: data.guidedPractice || 'Guided practice activities',
      application: data.application || 'Application of concepts'
    },
    duration: '20-30 minutes'
  },
  d_guidedPractice: {
    title: 'D. Guided Practice',
    activities: data.guidedActivities || [],
    duration: '10-15 minutes'
  },
  e_independentPractice: {
    title: 'E. Independent Practice',
    activities: data.independentActivities || [],
    duration: '10-15 minutes'
  },
  f_assessment: {
    title: 'F. Assessment',
    formative: data.formativeAssessment || 'In-class assessment',
    summative: data.summativeAssessment || 'End-lesson assessment',
    duration: '5-10 minutes'
  },
  g_assignment: {
    title: 'G. Assignment',
    homework: data.assignment || 'Take-home activities',
    enrichment: data.enrichment || 'Enrichment activities'
  }
});

const formatAssessment = (data) => ({
  formative: data.formativeAssessment || 'Classroom observations, questioning, seatwork',
  summative: data.summativeAssessment || 'Quiz, performance task, recitation',
  tools: data.assessmentTools || ['Rubric', 'Checklist', 'Rating Scale']
});

const formatReflection = (data) => ({
  studentReflection: data.studentReflection || 'Students reflect on their learning',
  teacherReflection: data.teacherReflection || 'Teacher notes on effectiveness of lesson',
  areasOfImprovement: data.improvementAreas || []
});

const formatFooter = (data) => ({
  preparedBy: {
    name: data.teacherName || 'Teacher Name',
    signature: '_____________________',
    date: data.date || new Date().toLocaleDateString()
  },
  checkedBy: {
    name: 'Mentor Teacher/Master Teacher',
    signature: '_____________________',
    date: data.date || new Date().toLocaleDateString()
  },
  approvedBy: {
    name: 'Head Teacher/Principal',
    signature: '_____________________',
    date: data.date || new Date().toLocaleDateString()
  }
});

const extractByCategory = (text, category) => {
  if (!text) return [];
  // Simple extraction - can be improved based on format
  return text.split('\n').filter(line => 
    line.toLowerCase().includes(category.toLowerCase())
  );
};

export const generateDepEdTableFormat = (data) => {
  return `
╔══════════════════════════════════════════════════════════════════════════╗
║                        DEPED LESSON PLAN FORMAT                          ║
╠══════════════════════════════════════════════════════════════════════════╣
║ School: ${padRight(data.school, 62)} ║
║ Division: ${padRight('', 57)} ║
║ Grade & Section: ${padRight(data.gradeLevel + ' - ' + data.section, 48)} ║
║ Subject/Learning Area: ${padRight(data.subject, 43)} ║
║ Quarter: ${padRight(data.quarter, 58)} Week: ${data.week} ║
║ Date: ${padRight(data.date, 62)} ║
╠══════════════════════════════════════════════════════════════════════════╣
║ LEARNING COMPETENCY: ${data.competency?.substring(0, 45)} ║
╠══════════════════════════════════════════════════════════════════════════╣
║ LEARNING OBJECTIVES: ║
║ Knowledge: ║
║ Skills: ║
║ Attitude: ║
║ Values: ║
╚══════════════════════════════════════════════════════════════════════════╝
`;
};

const padRight = (text, width) => {
  text = text || '';
  return text.padEnd(width, ' ').substring(0, width);
};

export const validateDepEdFormat = (lessonPlan) => {
  const errors = [];
  
  if (!lessonPlan.school) errors.push('School name is required');
  if (!lessonPlan.subject) errors.push('Subject is required');
  if (!lessonPlan.gradeLevel) errors.push('Grade level is required');
  if (!lessonPlan.competency) errors.push('Learning competency is required');
  if (!lessonPlan.objectives) errors.push('Learning objectives are required');
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
};
