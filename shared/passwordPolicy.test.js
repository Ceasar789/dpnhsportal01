// P2: the one password policy, used by the browser and by the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePassword } from './passwordPolicy.js';

test('12 characters with an uppercase letter, a number and a special character', () => {
  assert.equal(validatePassword('Abcdefghij1!'), null);
  assert.equal(validatePassword('Abcdefghi1!'), 'Password must be at least 12 characters');
  assert.equal(validatePassword(''), 'Password must be at least 12 characters');
  assert.equal(validatePassword(null), 'Password must be at least 12 characters');
  assert.equal(validatePassword('abcdefghij1!'), 'Password must contain at least one uppercase letter');
  assert.equal(validatePassword('Abcdefghijk!'), 'Password must contain at least one number');
  assert.equal(validatePassword('Abcdefghijk1'), 'Password must contain at least one special character');
});
