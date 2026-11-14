// X2: the trusted backend refuses a Grade 11/12 assignment even if an old
// teacher_subjects row still names it. Synthetic repository only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrustedPersistence } from './trustedPersistence.js';
import { syntheticRepository } from './testing/syntheticRepository.js';
import { createBlankIlawDocument } from '../../../frontend/src/pages/dashboards/teacher/ilaw/ilawTemplateModel.js';

const year = '2034-2035';
function setup() {
  const repository = syntheticRepository({ profiles: [{ id: 'teacher-a', role: 'teacher', status: 'active' }],
    settings: [{ school_year: year }], subjects: [{ id: 'science', name: 'Science', is_active: true }],
    assignments: [
      { teacher_id: 'teacher-a', subject_id: 'science', grade_level: 'Grade 7', school_year: year },
      { teacher_id: 'teacher-a', subject_id: 'science', grade_level: 'Grade 11', school_year: year },
    ] });
  let next = 0;
  const service = createTrustedPersistence({ enabled: true, repository,
    resolveIdentity: async token => (token === 'verified-a' ? { id: 'teacher-a' } : null), newId: () => `record-${++next}` });
  return (op, command) => service.execute(op, 'verified-a', command);
}
const manual = (grade) => {
  const document = createBlankIlawDocument({ subject: 'Science', grade });
  return { kind: 'eduscribe.manual-ilaw', version: 2, title: '', document,
    assignment: { subjectId: 'science', gradeLevel: grade, schoolYear: year },
    sourceDetails: { classDuration: '', teachingStrategy: '', learningObjectives: '' } };
};
const create = document => ({ requestId: 'create-1', id: null, expectedRevision: null, document });

test('a lesson-plan draft under an old Grade 11 load row is denied', async () => {
  const call = setup();
  assert.equal((await call('CreateIncompleteDraft', create(manual('Grade 11')))).code, 'assignment_denied');
});

test('the same teacher can still save a Grade 7 draft', async () => {
  const call = setup();
  const result = await call('CreateIncompleteDraft', create(manual('Grade 7')));
  assert.equal(result.ok, true, JSON.stringify(result));
});
