import { describe, expect, it } from 'vitest';
import { hasStudentAnswer } from './studentAnswers';

describe('hasStudentAnswer', () => {
  it.each([
    ['multiple choice', 'Nucleus'], ['true or false', 'True'], ['identification', 'mitochondrion'],
    ['essay', 'Cells divide to grow.'], ['enumeration', ['plant', 'animal']],
  ])('%s with a value is answered', (_type, value) => {
    expect(hasStudentAnswer(value)).toBe(true);
  });

  it.each([
    ['multiple choice', undefined], ['true or false', null], ['identification', ''], ['essay', ''], ['enumeration', []],
  ])('%s left empty is unanswered', (_type, value) => {
    expect(hasStudentAnswer(value)).toBe(false);
  });

  it.each([
    ['identification', '   '], ['essay', ' \n\t '], ['enumeration', ['  ', '\t']],
  ])('%s with only whitespace is unanswered', (_type, value) => {
    expect(hasStudentAnswer(value)).toBe(false);
  });

  it('counts an enumeration with one real line among blanks', () => {
    expect(hasStudentAnswer(['  ', 'plant'])).toBe(true);
  });

  it('never counts another kind of value', () => {
    for (const value of [0, 1, true, {}, [1, 2]]) expect(hasStudentAnswer(value)).toBe(false);
  });
});
