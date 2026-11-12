// A student's LRN (students.lrn): a DepEd Learner Reference Number, exactly
// twelve digits. The backend invite route applies the same rule and messages.
export const LRN_PATTERN = /^\d{12}$/;
export const LRN_REQUIRED = 'A 12-digit LRN is required for a student.';
export const LRN_TAKEN = 'This LRN is already used by another student.';
// The field accepts digits only, at most twelve.
export const lrnInput = value => String(value).replace(/\D/g, '').slice(0, 12);
