// X2: the shared contracts refuse Grade 11/12 (the school offers Grades 7-10).
import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKSHEET_KIND, validateWorksheetDraft } from './contracts.js';
import { authorizeScoreChange } from './teacherWorkflowContract.js';

const draft = gradeLevel => ({ kind: WORKSHEET_KIND, version: 1, title: 'Cells', workflowState: 'draft',
  assignment: { subjectId: 'science', gradeLevel, schoolYear: '2034-2035' }, sourcePlanId: null,
  instructions: 'Read carefully.', groups: [], questions: [], answerKeys: {} });

test('a worksheet draft for Grade 11 or 12 is refused; Grade 7-10 still pass', () => {
  for (const grade of ['Grade 11', 'Grade 12', '12', 'grade 11']) {
    assert.throws(() => validateWorksheetDraft(draft(grade)), { code: 'assignment_denied' });
  }
  for (const grade of ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']) {
    assert.doesNotThrow(() => validateWorksheetDraft(draft(grade)));
  }
});

test('a score change under a Grade 11 load and section is denied', () => {
  const facts = grade => ({
    actor: { id: 'teacher-1', role: 'teacher', status: 'active' },
    worksheet: { id: 'sheet-1', teacher_id: 'teacher-1', subject_id: 'math', grade_level: grade, school_year: '2026-2027' },
    submission: { id: 'sub-1', worksheet_id: 'sheet-1', student_id: 'student-1', section_id: 'section-1', status: 'submitted', released: false },
    section: { id: 'section-1', grade_level: grade, school_year: '2026-2027' },
    posting: { worksheet_id: 'sheet-1', section_id: 'section-1' },
    enrollment: { student_id: 'student-1', section_id: 'section-1', status: 'active' },
    load: { teacher_id: 'teacher-1', subject_id: 'math', grade_level: grade, school_year: '2026-2027' },
    officialYear: '2026-2027',
  });
  assert.deepEqual(authorizeScoreChange(facts('Grade 11')), { ok: false, code: 'assignment_denied' });
  assert.deepEqual(authorizeScoreChange(facts('Grade 10')), { ok: true });
});
