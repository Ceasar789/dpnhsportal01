import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSIGNABLE_ROLES } from './onboarding.js';

// One set guards both the admin invite (POST /invite) and password-setup
// completion (POST /complete): the app has three roles.
test('only student, teacher and main_admin can be invited or completed', () => {
  assert.deepEqual([...ASSIGNABLE_ROLES].sort(), ['main_admin', 'student', 'teacher']);
});

test('faculty, registrar, guest and the admin alias are refused', () => {
  for (const role of ['faculty', 'registrar', 'guest', 'admin', '', 'Teacher']) {
    assert.equal(ASSIGNABLE_ROLES.has(role), false, role);
  }
});
