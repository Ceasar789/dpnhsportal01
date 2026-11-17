// U6: the live checklist (PASSWORD_RULES) is the real policy (shared/passwordPolicy.js),
// never weaker: whenever every rule is ticked, the server-side check passes too.
import { describe, expect, it } from 'vitest';
import { PASSWORD_RULES, validatePassword } from './passwordPolicy';
import { unmetRules } from './formRules';

const SAMPLES = ['', 'a', 'short1!A', 'abcdefghijkl', 'ABCDEFGHIJKL', 'Abcdefghijkl', 'abcdefghij1!', 'Abcdefghijk1', 'Abcdefghij!!',
  'Abcdefghij1!', 'ABCDEFGHIJ1!', 'Abcdefghi1! ', '           A1!', 'Ñandú2026!!x', 'ÑANDÚ2026!!x', 'Passw0rd!xyz', 'Passw0rd!xy',
  '😀Abcdefghi1!', '😀😀Abcdefg1!', 'a'.repeat(200) + 'A1!', '12345678901!', 'ValidPassword1!'];

describe('U6 password checklist = the real policy', () => {
  it('lists the four policy rules, in order', () => {
    expect(PASSWORD_RULES.map(rule => rule.id)).toEqual(['length', 'uppercase', 'number', 'special']);
    expect(PASSWORD_RULES[0].label).toBe('At least 12 characters');
  });

  it.each(SAMPLES)('%j: never weaker (all ticked -> the policy accepts it)', (value) => {
    if (unmetRules(PASSWORD_RULES, value).length === 0) expect(validatePassword(value)).toBeNull();
  });

  it.each(SAMPLES.filter(v => !/[\u{10000}-\u{10FFFF}]/u.test(v)))('%j: the checklist and the policy agree', (value) => {
    expect(unmetRules(PASSWORD_RULES, value).length === 0).toBe(validatePassword(value) === null);
  });

  it('each rule alone flips at the policy boundary', () => {
    const tick = (value, id) => PASSWORD_RULES.find(rule => rule.id === id).test(value);
    expect([tick('Abcdefghij1', 'length'), tick('Abcdefghij1!', 'length')]).toEqual([false, true]);
    expect([tick('abcdefghij1!', 'uppercase'), tick('Abcdefghij1!', 'uppercase')]).toEqual([false, true]);
    expect([tick('Abcdefghijk!', 'number'), tick('Abcdefghij1!', 'number')]).toEqual([false, true]);
    expect([tick('Abcdefghijk1', 'special'), tick('Abcdefghij1!', 'special')]).toEqual([false, true]);
  });

  it('cannot be changed at runtime', () => {
    expect(Object.isFrozen(PASSWORD_RULES)).toBe(true);
  });
});
