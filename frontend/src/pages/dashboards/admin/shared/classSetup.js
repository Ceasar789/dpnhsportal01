// Read-only "class setup" facts for one section, from data the academic tabs
// already load for the school year: who teaches which subject, and when.
// "Teacher X teaches subject Y in section Z" exists only as schedules rows.

export const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dayIndex = (day) => {
  const index = DAY_ORDER.indexOf(day);
  return index === -1 ? DAY_ORDER.length : index;
};

// Monday first, then by start time. The read orders day_of_week as text,
// which would put Friday before Monday.
export const sortPeriods = (rows) => [...(rows || [])].sort((a, b) =>
  dayIndex(a.day_of_week) - dayIndex(b.day_of_week)
  || String(a.start_time ?? '').localeCompare(String(b.start_time ?? '')));

// How many of the active subjects have at least one period with a teacher.
export const subjectCoverage = (sectionId, schedules, activeSubjects) => {
  const active = new Set((activeSubjects || []).map(subject => subject.id));
  const filled = new Set((schedules || [])
    .filter(row => row.section_id === sectionId && row.teacher_id && active.has(row.subject_id))
    .map(row => row.subject_id)).size;
  return { filled, total: active.size };
};

export const coverageText = ({ filled, total }) => `${filled} of ${total} subjects have a teacher`;

// Distinct teachers for a subject's periods, in period order.
export const teacherNamesFor = (rows, teachers) => [...new Set((rows || []).map(row => row.teacher_id).filter(Boolean))]
  .map(id => (teachers || []).find(teacher => teacher.id === id)?.name || 'Unknown teacher');
