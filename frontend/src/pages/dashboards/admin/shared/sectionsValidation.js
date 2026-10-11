export const MIN_SECTION_CAPACITY = 1;
export const MAX_SECTION_CAPACITY = 60;

export const validateSectionCapacity = (value) => {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return { valid: false, value: null, message: 'Capacity is required.' };
  if (!/^\d+$/.test(raw)) {
    return { valid: false, value: null, message: 'Capacity must be a whole number from 1 to 60.' };
  }

  const capacity = Number(raw);
  if (!Number.isSafeInteger(capacity) || capacity < MIN_SECTION_CAPACITY || capacity > MAX_SECTION_CAPACITY) {
    return { valid: false, value: null, message: 'Capacity must be a whole number from 1 to 60.' };
  }
  return { valid: true, value: capacity, message: '' };
};

export const isActiveSectionAdviser = (teacher) => teacher?.role === 'teacher'
  && teacher?.status === 'active';

export const validateSectionAdviser = ({ adviserId, teachers, existingAdviserId }) => {
  if (!adviserId || (existingAdviserId && adviserId === existingAdviserId)) {
    return { valid: true, message: '' };
  }
  const teacher = teachers.find((candidate) => candidate.id === adviserId);
  return isActiveSectionAdviser(teacher)
    ? { valid: true, message: '' }
    : { valid: false, message: 'Choose an active teacher as the section adviser.' };
};

export const validateCapacityAgainstEnrollment = (capacity, enrolledCount) => (
  capacity < enrolledCount
    ? { valid: false, message: `Capacity cannot be lower than the current enrollment of ${enrolledCount}.` }
    : { valid: true, message: '' }
);
