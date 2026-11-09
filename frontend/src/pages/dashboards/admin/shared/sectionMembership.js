// Removing a student from a section: why, and what that writes. Dropped and
// Transferred keep the section_students row (history); Added by mistake
// deletes it, as removal always did. No reason note or date is stored: there
// is no column for either (future work).
export const REMOVAL_REASONS = [
  { value: 'dropped', label: 'Dropped (no longer attending)', status: 'dropped' },
  { value: 'transferred', label: 'Transferred (moved to another school)', status: 'transferred' },
  { value: 'mistake', label: 'Added by mistake / wrong section', status: null },
];

// The status a reason writes, or null when the row is deleted instead.
export const statusForReason = reason => REMOVAL_REASONS.find(r => r.value === reason)?.status ?? null;

export const MEMBERSHIP_STATUS_LABELS = {
  dropped: 'Dropped', transferred: 'Transferred', graduated: 'Graduated',
};
export const membershipStatusLabel = status => MEMBERSHIP_STATUS_LABELS[status] || 'Not active';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// section_students.enrollment_date is a DATE: shown as that calendar day.
export const formatEnrollmentDate = (value) => {
  const text = String(value || '').trim();
  if (!DATE_ONLY.test(text)) return text || '—';
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(`${text}T00:00:00Z`));
};
