import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeScoreChange, validateQuestionScores, authorizeAttendanceChange,
  authorizeStudentResultRead, nextReviewState } from './teacherWorkflowContract.js';

const scoreFacts = () => ({
  actor: { id: 'teacher-1', role: 'teacher', status: 'active' },
  worksheet: { id: 'sheet-1', teacher_id: 'teacher-1', subject_id: 'math', grade_level: 'Grade 7', school_year: '2026-2027' },
  submission: { id: 'sub-1', worksheet_id: 'sheet-1', student_id: 'student-1', section_id: 'section-1', status: 'submitted', released: false },
  section: { id: 'section-1', grade_level: 'Grade 7', school_year: '2026-2027' },
  posting: { worksheet_id: 'sheet-1', section_id: 'section-1' },
  enrollment: { student_id: 'student-1', section_id: 'section-1', status: 'active' },
  load: { teacher_id: 'teacher-1', subject_id: 'math', grade_level: 'Grade 7', school_year: '2026-2027' },
  officialYear: '2026-2027',
});

test('synthetic score contract checks the complete current assignment path', () => {
  assert.deepEqual(authorizeScoreChange(scoreFacts()), { ok: true });
  const cases = [
    [facts => { facts.actor = null; }, 'not_authenticated'],
    [facts => { facts.actor.status = 'inactive'; }, 'inactive_or_wrong_role'],
    [facts => { facts.actor.role = 'student'; }, 'inactive_or_wrong_role'],
    [facts => { facts.worksheet.teacher_id = 'other'; }, 'worksheet_denied'],
    [facts => { facts.worksheet.subject_id = null; }, 'worksheet_denied'],
    [facts => { facts.submission.worksheet_id = 'other'; }, 'worksheet_denied'],
    [facts => { facts.submission.section_id = 'other'; }, 'section_denied'],
    [facts => { facts.posting.section_id = 'other'; }, 'section_denied'],
    [facts => { facts.enrollment.student_id = 'other'; }, 'enrollment_denied'],
    [facts => { facts.enrollment = null; }, 'enrollment_denied'],
    [facts => { facts.enrollment.section_id = 'other'; }, 'enrollment_denied'],
    [facts => { facts.load = null; }, 'assignment_denied'],
    [facts => { facts.load.subject_id = 'science'; }, 'assignment_denied'],
    [facts => { facts.load.grade_level = 'Grade 8'; }, 'assignment_denied'],
    [facts => { facts.load.school_year = '2025-2026'; }, 'assignment_denied'],
    [facts => { facts.worksheet.school_year = null; }, 'historical_write_blocked'],
    [facts => { facts.section.school_year = '2025-2026'; }, 'historical_write_blocked'],
    [facts => { facts.submission.status = 'in_progress'; }, 'invalid_state'],
    [facts => { facts.submission.released = true; }, 'invalid_state'],
  ];
  for (const [change, code] of cases) {
    const facts = scoreFacts();
    change(facts);
    assert.equal(authorizeScoreChange(facts).code, code);
  }
});

test('question scores use trusted item points and reject incomplete, duplicate, and excessive marks', () => {
  const items = [{ id: 'a', points: 2 }, { id: 'b', points: 3 }];
  assert.deepEqual(validateQuestionScores(items, [{ item_id: 'a', points_earned: 1.5 },
    { item_id: 'b', points_earned: 3 }]), { ok: true, score: 4.5, maximum: 5 });
  for (const marks of [
    [{ item_id: 'a', points_earned: 1 }],
    [{ item_id: 'a', points_earned: 1 }, { item_id: 'a', points_earned: 2 }],
    [{ item_id: 'a', points_earned: 3 }, { item_id: 'b', points_earned: 3 }],
    [{ item_id: 'a', points_earned: -1 }, { item_id: 'b', points_earned: 3 }],
    [{ item_id: 'a', points_earned: NaN }, { item_id: 'b', points_earned: 3 }],
    [{ item_id: 'a', points_earned: 1.234 }, { item_id: 'b', points_earned: 3 }],
  ]) assert.equal(validateQuestionScores(items, marks).code, 'invalid_scores');
});

test('synthetic attendance contract pins adviser, section, enrollment, year, and date', () => {
  const facts = () => ({ actor: { id: 'teacher-1', role: 'teacher', status: 'active' },
    section: { id: 'section-1', adviser_id: 'teacher-1', school_year: '2026-2027' },
    enrollment: { student_id: 'student-1', section_id: 'section-1', status: 'active' },
    studentId: 'student-1', officialYear: '2026-2027', date: '2026-10-22' });
  assert.deepEqual(authorizeAttendanceChange(facts()), { ok: true });
  const cases = [
    [f => { f.section.adviser_id = 'other'; }, 'section_denied'],
    [f => { f.section.school_year = '2025-2026'; }, 'section_denied'],
    [f => { f.enrollment.section_id = 'other'; }, 'enrollment_denied'],
    [f => { f.enrollment.student_id = 'other'; }, 'enrollment_denied'],
    [f => { f.enrollment.status = 'inactive'; }, 'enrollment_denied'],
    [f => { f.enrollment = null; }, 'enrollment_denied'],
    [f => { f.date = '2026-02-31'; }, 'invalid_date'],
    [f => { f.date = '2026-05-31'; }, 'invalid_date'],
  ];
  for (const [change, code] of cases) { const value = facts(); change(value);
    assert.equal(authorizeAttendanceChange(value).code, code); }
});

test('synthetic student gate denies other students, unreleased results, and answer keys', () => {
  const actor = { id: 'student-1', role: 'student', status: 'active' };
  assert.deepEqual(authorizeStudentResultRead({ actor, submission: { student_id: 'student-1', released: true } }), { ok: true });
  assert.equal(authorizeStudentResultRead({ actor, submission: { student_id: 'student-2', released: true } }).code, 'not_found');
  assert.equal(authorizeStudentResultRead({ actor, submission: { student_id: 'student-1', released: false } }).code, 'not_found');
  assert.equal(authorizeStudentResultRead({ actor, submission: { student_id: 'student-1', released: true }, kind: 'answer_key' }).code, 'not_found');
});

test('synthetic review transitions invalidate approval and keep release separate', () => {
  const draft = { status: 'draft', approved: false, complete: true, revision: 1, released: false };
  const approval = nextReviewState({ review: draft, action: 'approve', expectedRevision: 1 });
  assert.equal(approval.status, 'approved');
  assert.equal(approval.revision, 2);
  assert.equal(nextReviewState({ review: draft, action: 'release', expectedRevision: 1 }).code, 'invalid_transition');
  assert.deepEqual(nextReviewState({ review: { ...draft, ...approval }, action: 'edit', expectedRevision: 2 }),
    { ok: true, status: 'draft', approved: false, revision: 3 });
  assert.equal(nextReviewState({ review: { ...draft, ...approval }, action: 'release', expectedRevision: 1 }).code, 'revision_conflict');
  assert.equal(nextReviewState({ review: { ...draft, complete: false }, action: 'approve', expectedRevision: 1 }).code, 'invalid_transition');
});
