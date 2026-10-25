import { describe, expect, it } from 'vitest';
import { validateLessonPlanTitle } from './lessonPlanTitle';

describe('saved lesson plan title validation', () => {
  it('trims a valid title while preserving internal spaces and Unicode', () => {
    expect(validateLessonPlanTitle('  Filipino 7 Lesson Plan  ')).toEqual({ title: 'Filipino 7 Lesson Plan', error: '' });
    expect(validateLessonPlanTitle('  Araling Panlipunan – Baitang 7  ').error).toBe('');
  });

  it('rejects blank, multiline, control-character, and overlong titles', () => {
    for (const title of ['', '  ', 'Line\nTwo', 'Line\u2028Two', 'Control\u0000Name', 'A'.repeat(256)]) {
      expect(validateLessonPlanTitle(title).error).not.toBe('');
    }
    expect(validateLessonPlanTitle('A'.repeat(255)).error).toBe('');
  });
});
