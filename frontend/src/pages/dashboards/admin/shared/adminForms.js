// ============================================
// FILE: src/pages/dashboards/admin/shared/adminForms.js
// U4: the rules of the other admin dialogs (Subject, Section, Memo, Event,
// News, Schedule), kept pure so the classic and Clarity tabs and the logic
// hooks share one copy. Same shape as userForm.js (U3):
//   - field ids (unchanged from the old dialogs, so e2e selectors still work)
//   - validators with friendly messages, used on blur and on submit
//   - server-error mapping: a known database answer becomes a message on the
//     right field; anything else goes through friendlyError, so no raw
//     database or server text ever reaches the screen
// ============================================

import { compose, maxLength, required } from '../../../../lib/formRules';
import { friendlyError } from '../../../../lib/friendlyError';
import { validateSectionCapacity } from './sectionsValidation';
import { isInvalidCalendarRange } from '../../../../lib/calendarRules';

export const SUBJECT_FIELDS = Object.freeze({ name: 'subjects-subject-name', code: 'subjects-code', status: 'subjects-status' });
export const SECTION_FIELDS = Object.freeze({
  name: 'sections-section-name', grade: 'sections-grade-level', adviser: 'sections-adviser', capacity: 'sections-capacity',
});
export const MEMO_FIELDS = Object.freeze({ from: 'memos-from-office', to: 'memos-recipient', subject: 'memos-subject', body: 'memos-body' });
export const EVENT_FIELDS = Object.freeze({
  title: 'calendar-title', start: 'calendar-start-date', end: 'calendar-end-date-optional',
  type: 'calendar-type', custom: 'calendar-custom-event-type', desc: 'calendar-description',
});
export const NEWS_FIELDS = Object.freeze({
  title: 'news-title', category: 'news-category', target: 'news-target-audience', custom: 'news-custom-audience',
  author: 'news-author', content: 'news-content', image: 'news-attach-image', status: 'news-status', expires: 'news-expires-on-optional',
});
export const SCHEDULE_FIELDS = Object.freeze({
  teacher: 'schedules-teacher', day: 'schedules-day', start: 'schedules-start', end: 'schedules-end', room: 'schedules-room',
});

// Column sizes from the schema (phase1-01-academic-tables.sql and
// COMPLETE_DATABASE_SCHEMA_v2.sql), so a long value is caught on the field
// instead of coming back as a database error.
export const LIMITS = Object.freeze({ subjectName: 100, subjectCode: 20, title: 255 });

export const FORM_MESSAGES = Object.freeze({
  subjectName: 'Enter the subject name.',
  subjectCode: 'Enter a short code, like MATH.',
  subjectNameTaken: 'Another subject already has this name.',
  subjectCodeTaken: 'Another subject already uses this code.',
  subjectSaveFailed: 'The subject could not be saved. Please try again.',
  sectionName: 'Enter the section name.',
  sectionGrade: 'Choose a grade level.',
  sectionSaveFailed: 'The section could not be saved. Please try again.',
  memoSubject: 'Enter the memo subject.',
  memoSaveFailed: 'The memo could not be saved. Please try again.',
  eventTitle: 'Enter the event title.',
  eventDate: 'Choose the start date.',
  eventCustomType: 'Enter the custom event type.',
  eventRange: 'The end date cannot be before the start date.',
  eventSaveFailed: 'The event could not be saved. Please try again.',
  eventDeleteFailed: 'The event could not be deleted. Please try again.',
  eventsLoadFailed: 'Calendar events could not be loaded. Please try again.',
  newsTitle: 'Enter the post title.',
  newsCustomAudience: 'Enter who this post is for.',
  newsNotifyFailed: 'The post was saved, but the notifications could not be sent.',
  newsExpiryFailed: 'The expiry date could not be saved. Please try again.',
  newsStatusFailed: 'The post status could not be changed. Please try again.',
  scheduleTeacher: 'Choose a teacher.',
  scheduleTime: 'The end time must be after the start time.',
  loadSaveFailed: 'The teaching load could not be saved. Please try again.',
  loadReadFailed: year => `The teaching load for ${year} could not be read. Please try again.`,
  loadCopyFailed: year => `The teaching load from ${year} could not be copied. Please try again.`,
});

const titleRule = message => compose(required(message), maxLength(LIMITS.title));

export const subjectRules = Object.freeze({
  name: compose(required(FORM_MESSAGES.subjectName), maxLength(LIMITS.subjectName)),
  code: compose(required(FORM_MESSAGES.subjectCode), maxLength(LIMITS.subjectCode)),
});
export const sectionRules = Object.freeze({
  name: required(FORM_MESSAGES.sectionName),
  grade: required(FORM_MESSAGES.sectionGrade),
  capacity: value => validateSectionCapacity(value).message || null,
});
export const memoRules = Object.freeze({ subject: titleRule(FORM_MESSAGES.memoSubject) });
export const eventRules = Object.freeze({
  title: titleRule(FORM_MESSAGES.eventTitle),
  start: required(FORM_MESSAGES.eventDate),
  custom: required(FORM_MESSAGES.eventCustomType),
});
export const newsRules = Object.freeze({
  title: titleRule(FORM_MESSAGES.newsTitle),
  custom: required(FORM_MESSAGES.newsCustomAudience),
});

// Each validate*Form returns every problem, in the order the fields appear.
const collect = (pairs) => pairs
  .filter(([, message]) => message)
  .map(([fieldId, message]) => ({ fieldId, message }));

export const validateSubjectForm = ({ name, code }) => collect([
  [SUBJECT_FIELDS.name, subjectRules.name(name)],
  [SUBJECT_FIELDS.code, subjectRules.code(code)],
]);

export const validateSectionForm = ({ name, grade, capacity }) => collect([
  [SECTION_FIELDS.name, sectionRules.name(name)],
  [SECTION_FIELDS.grade, sectionRules.grade(grade)],
  [SECTION_FIELDS.capacity, sectionRules.capacity(capacity)],
]);

export const validateMemoForm = ({ subject }) => collect([[MEMO_FIELDS.subject, memoRules.subject(subject)]]);

export const validateEventForm = ({ title, start, end, type, custom }) => collect([
  [EVENT_FIELDS.title, eventRules.title(title)],
  [EVENT_FIELDS.start, eventRules.start(start)],
  [EVENT_FIELDS.end, isInvalidCalendarRange(start, end) ? FORM_MESSAGES.eventRange : null],
  [EVENT_FIELDS.custom, type === 'Custom Type' ? eventRules.custom(custom) : null],
]);

export const validateNewsForm = ({ title, target, custom }) => collect([
  [NEWS_FIELDS.title, newsRules.title(title)],
  [NEWS_FIELDS.custom, target === 'custom' ? newsRules.custom(custom) : null],
]);

// The teacher is only checked when there are teachers to choose from: with
// none (or while they load, or after a failed read) the dialog already says
// why next to the field, and a second message would only repeat it.
export const validateScheduleForm = ({ teacher, start, end, teacherChoosable }) => collect([
  [SCHEDULE_FIELDS.teacher, teacherChoosable && !teacher ? FORM_MESSAGES.scheduleTeacher : null],
  [SCHEDULE_FIELDS.end, end <= start ? FORM_MESSAGES.scheduleTime : null],
]);

// Which unique constraint a 23505 came from. The text is only READ to pick
// the field; it is never shown.
const violated = (error) => [error?.message, error?.details, error?.constraint]
  .filter(v => typeof v === 'string').join(' ');

/** A subject save error: a field message, or one sentence for a toast. */
export function subjectSaveError(error) {
  if (error?.code === '23505') {
    const text = violated(error);
    if (/code/i.test(text)) return { fieldId: SUBJECT_FIELDS.code, message: FORM_MESSAGES.subjectCodeTaken };
    if (/name/i.test(text)) return { fieldId: SUBJECT_FIELDS.name, message: FORM_MESSAGES.subjectNameTaken };
  }
  return { message: friendlyError(error, { fallback: FORM_MESSAGES.subjectSaveFailed }) };
}

/** A section save error. 23505 is the per-year name rule (UNIQUE(name, school_year)). */
export function sectionSaveError(error, { name, schoolYear }) {
  if (error?.code === '23505') {
    return { fieldId: SECTION_FIELDS.name, message: `A section named "${name}" already exists for ${schoolYear}.` };
  }
  return { message: friendlyError(error, { fallback: FORM_MESSAGES.sectionSaveFailed }) };
}

/** One sentence for a toast, never the raw text. */
export const toastError = (error, fallback) => friendlyError(error, { fallback });
