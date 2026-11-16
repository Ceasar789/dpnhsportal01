// U4: the pure rules of the admin form dialogs (validators, form checks,
// server-error mapping). No raw database text may ever come back out.
import { describe, expect, it } from 'vitest';
import {
  EVENT_FIELDS, FORM_MESSAGES, LIMITS, MEMO_FIELDS, NEWS_FIELDS, SCHEDULE_FIELDS, SECTION_FIELDS, SUBJECT_FIELDS,
  eventRules, sectionSaveError, subjectRules, subjectSaveError, toastError,
  validateEventForm, validateMemoForm, validateNewsForm, validateScheduleForm, validateSectionForm, validateSubjectForm,
} from './adminForms';

const RAW = [
  { code: 'XX000', message: 'duplicate key value violates unique constraint "memos_pkey"' },
  { code: 'XX001', message: 'new row violates row-level security policy for table "news"' },
  { message: 'JWT expired' },
  new TypeError('Failed to fetch'),
  { message: 'relation "calendar_events" does not exist', details: 'select * from calendar_events' },
];
const ids = problems => problems.map(p => p.fieldId);

describe('validators', () => {
  it('subject name and code: required (spaces do not count) and capped at the column size', () => {
    expect(subjectRules.name('   ')).toBe(FORM_MESSAGES.subjectName);
    expect(subjectRules.code('')).toBe(FORM_MESSAGES.subjectCode);
    expect(subjectRules.name('x'.repeat(LIMITS.subjectName))).toBeNull();
    expect(subjectRules.name('x'.repeat(LIMITS.subjectName + 1))).toMatch(/100 characters or fewer/);
    expect(subjectRules.code('x'.repeat(LIMITS.subjectCode + 1))).toMatch(/20 characters or fewer/);
    expect(subjectRules.code('MATH')).toBeNull();
  });

  it('event title is capped at 255; the start date is required', () => {
    expect(eventRules.title('x'.repeat(256))).toMatch(/255 characters or fewer/);
    expect(eventRules.start('')).toBe(FORM_MESSAGES.eventDate);
  });
});

describe('validate*Form: every problem, in the order the fields appear', () => {
  it('subject', () => {
    expect(ids(validateSubjectForm({ name: '', code: '' }))).toEqual([SUBJECT_FIELDS.name, SUBJECT_FIELDS.code]);
    expect(validateSubjectForm({ name: 'Mathematics', code: 'MATH' })).toEqual([]);
  });

  it('section: name, grade, then capacity with the same messages as sectionsValidation', () => {
    const problems = validateSectionForm({ name: '', grade: '', capacity: '61' });
    expect(ids(problems)).toEqual([SECTION_FIELDS.name, SECTION_FIELDS.grade, SECTION_FIELDS.capacity]);
    expect(problems[2].message).toBe('Capacity must be a whole number from 1 to 60.');
    expect(validateSectionForm({ name: '7-Rizal', grade: 'Grade 7', capacity: '40' })).toEqual([]);
  });

  it('memo: only the subject is required', () => {
    expect(ids(validateMemoForm({ subject: ' ' }))).toEqual([MEMO_FIELDS.subject]);
    expect(validateMemoForm({ subject: 'Faculty meeting' })).toEqual([]);
  });

  it('event: title, start, an end before the start, and the custom type only when chosen', () => {
    expect(ids(validateEventForm({ title: '', start: '', end: '', type: 'Event', custom: '' })))
      .toEqual([EVENT_FIELDS.title, EVENT_FIELDS.start]);
    expect(validateEventForm({ title: 'Fair', start: '2026-11-12', end: '2026-11-10', type: 'Event', custom: '' }))
      .toEqual([{ fieldId: EVENT_FIELDS.end, message: FORM_MESSAGES.eventRange }]);
    expect(ids(validateEventForm({ title: 'Fair', start: '2026-11-12', end: '', type: 'Custom Type', custom: '' })))
      .toEqual([EVENT_FIELDS.custom]);
    expect(validateEventForm({ title: 'Fair', start: '2026-11-12', end: '2026-11-12', type: 'Event', custom: '' })).toEqual([]);
  });

  it('news: the title, and the custom audience only when "custom" is chosen', () => {
    expect(ids(validateNewsForm({ title: '', target: 'custom', custom: '' }))).toEqual([NEWS_FIELDS.title, NEWS_FIELDS.custom]);
    expect(validateNewsForm({ title: 'Fair', target: 'all', custom: '' })).toEqual([]);
  });

  it('schedule: the teacher only when one can be chosen; the end must be after the start', () => {
    expect(ids(validateScheduleForm({ teacher: '', start: '10:00', end: '09:00', teacherChoosable: true })))
      .toEqual([SCHEDULE_FIELDS.teacher, SCHEDULE_FIELDS.end]);
    expect(validateScheduleForm({ teacher: '', start: '08:00', end: '09:00', teacherChoosable: false })).toEqual([]);
    expect(ids(validateScheduleForm({ teacher: 't', start: '09:00', end: '09:00', teacherChoosable: true }))).toEqual([SCHEDULE_FIELDS.end]);
  });
});

describe('server errors', () => {
  it('a 23505 on the subject code or name lands on that field; the database text is never returned', () => {
    const code = { code: '23505', message: 'duplicate key value violates unique constraint "subjects_code_key"', details: 'Key (code)=(MATH) already exists.' };
    const name = { code: '23505', message: 'duplicate key value violates unique constraint "subjects_name_key"', details: 'Key (name)=(Math) already exists.' };
    expect(subjectSaveError(code)).toEqual({ fieldId: SUBJECT_FIELDS.code, message: FORM_MESSAGES.subjectCodeTaken });
    expect(subjectSaveError(name)).toEqual({ fieldId: SUBJECT_FIELDS.name, message: FORM_MESSAGES.subjectNameTaken });
  });

  it('a subject error with no field goes to a friendly sentence', () => {
    expect(subjectSaveError({ code: '42501', message: 'permission denied for table subjects' }).message).toBe("You don't have permission to do that.");
    expect(subjectSaveError({ code: '23505', message: 'duplicate key' }).message).toBe('This already exists.');
    expect(subjectSaveError(null)).toEqual({ message: FORM_MESSAGES.subjectSaveFailed });
  });

  it('a section 23505 is the per-year name rule, on the Name field', () => {
    expect(sectionSaveError({ code: '23505' }, { name: '7-Rizal', schoolYear: '2026-2027' }))
      .toEqual({ fieldId: SECTION_FIELDS.name, message: 'A section named "7-Rizal" already exists for 2026-2027.' });
    expect(sectionSaveError({ code: 'XX000', message: 'boom' }, { name: 'x', schoolYear: 'y' })).toEqual({ message: FORM_MESSAGES.sectionSaveFailed });
  });

  it.each(RAW)('toastError never returns raw text (%#)', (error) => {
    const sentence = toastError(error, FORM_MESSAGES.memoSaveFailed);
    for (const piece of [error.message, error.details].filter(Boolean)) expect(sentence).not.toContain(piece);
    expect(sentence.length).toBeGreaterThan(10);
  });
});
