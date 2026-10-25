// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  lessonPlanFilenamePreferenceKey, readLessonPlanFilenamePreference,
  removeLessonPlanFilenamePreference, writeLessonPlanFilenamePreference,
} from './lessonPlanFilenamePreference';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('saved lesson plan filename preferences', () => {
  it('uses Teacher and saved plan IDs, never the plan title', () => {
    const key = lessonPlanFilenamePreferenceKey('teacher/one', 'plan:one');
    expect(key).toBe('eduscribe:lesson-plan-pdf-filename:v1:teacher%2Fone:plan%3Aone');
    expect(lessonPlanFilenamePreferenceKey(null, 'plan:one')).toBeNull();
    expect(lessonPlanFilenamePreferenceKey('teacher/one', null)).toBeNull();
  });

  it('keeps two plans and two Teachers independent', () => {
    writeLessonPlanFilenamePreference('teacher-a', 'plan-1', 'A English');
    writeLessonPlanFilenamePreference('teacher-a', 'plan-2', 'A Science');
    writeLessonPlanFilenamePreference('teacher-b', 'plan-1', 'B English');
    expect(readLessonPlanFilenamePreference('teacher-a', 'plan-1')).toBe('A English');
    expect(readLessonPlanFilenamePreference('teacher-a', 'plan-2')).toBe('A Science');
    expect(readLessonPlanFilenamePreference('teacher-b', 'plan-1')).toBe('B English');
    expect(readLessonPlanFilenamePreference('teacher-b', 'plan-2')).toBeNull();
    removeLessonPlanFilenamePreference('teacher-a', 'plan-1');
    expect(readLessonPlanFilenamePreference('teacher-a', 'plan-1')).toBeNull();
    expect(readLessonPlanFilenamePreference('teacher-b', 'plan-1')).toBe('B English');
  });

  it('falls back when storage is corrupt or unavailable', () => {
    const key = lessonPlanFilenamePreferenceKey('teacher-a', 'plan-1');
    localStorage.setItem(key, '{broken');
    expect(readLessonPlanFilenamePreference('teacher-a', 'plan-1')).toBeNull();
    localStorage.setItem(key, JSON.stringify({ filename: 42 }));
    expect(readLessonPlanFilenamePreference('teacher-a', 'plan-1')).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    expect(readLessonPlanFilenamePreference('teacher-a', 'plan-1')).toBeNull();
    expect(() => writeLessonPlanFilenamePreference('teacher-a', 'plan-1', 'Draft')).not.toThrow();
    expect(() => removeLessonPlanFilenamePreference('teacher-a', 'plan-1')).not.toThrow();
  });
});
