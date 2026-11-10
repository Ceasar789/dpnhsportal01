// A teacher's department subject: the one active subject whose name or code
// equals the department (trimmed, case-insensitive). profiles.department is
// set by a main admin only, so it counts as admin-assigned. Enforced in the
// browser only; database enforcement is future work.

const key = value => String(value ?? '').trim().toLowerCase();

// { subject, note }: subject when exactly one active subject matches; else a
// note (none for an empty department) and no lock.
export const departmentSubject = (department, subjects) => {
  const wanted = key(department);
  if (!wanted) return { subject: null, note: null };
  const matches = (subjects || []).filter(subject => subject && subject.is_active !== false
    && (key(subject.name) === wanted || key(subject.code) === wanted));
  if (matches.length === 1) return { subject: matches[0], note: null };
  return {
    subject: null,
    note: `Department '${String(department).trim()}' does not match a subject, so no subject is locked.`,
  };
};

// The locked subject id for a teacher, or null.
export const lockedSubjectId = (teacher, subjects) => departmentSubject(teacher?.department, subjects).subject?.id ?? null;

// True when a teacher_subjects row is that teacher's department subject.
export const isLockedLoadRow = (row, teachers, subjects) => {
  if (!row?.teacher_id || !row?.subject_id) return false;
  const teacher = (teachers || []).find(t => t.id === row.teacher_id);
  return lockedSubjectId(teacher, subjects) === row.subject_id;
};

export const LOCKED_REMOVAL_MESSAGE = "This subject comes from the teacher's department and cannot be removed here.";
