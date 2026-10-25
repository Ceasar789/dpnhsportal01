import { describe, expect, it } from 'vitest';
import { resolveLessonPlanDownloadFilename, suggestLessonPlanFilename } from './lessonPlanFilename';

describe('lesson plan download filename', () => {
  it('starts from the plan title and uses a PDF suggestion', () => {
    expect(suggestLessonPlanFilename('Grade 8 Fractions')).toBe('Grade 8 Fractions');
    expect(resolveLessonPlanDownloadFilename('My review', 'Original title')).toBe('My review.pdf');
    expect(resolveLessonPlanDownloadFilename('  Filipino 7 Lesson Plan  ', '')).toBe('Filipino 7 Lesson Plan.pdf');
  });

  it('falls back safely when the input or title is empty or invalid', () => {
    expect(resolveLessonPlanDownloadFilename('', 'Fractions')).toBe('Fractions.pdf');
    expect(resolveLessonPlanDownloadFilename('..', '')).toBe('ILAW_Lesson_Plan.pdf');
    expect(resolveLessonPlanDownloadFilename('///', '<>')).toBe('ILAW_Lesson_Plan.pdf');
  });

  it('removes path traversal, illegal characters, and reserved device names', () => {
    expect(resolveLessonPlanDownloadFilename('../CON', 'ignored')).toBe('ILAW_CON.pdf');
    expect(resolveLessonPlanDownloadFilename('C:\\work\\my:plan?*', '')).toBe('C_work_my_plan.pdf');
    expect(resolveLessonPlanDownloadFilename('LPT1', '')).toBe('ILAW_LPT1.pdf');
    expect(resolveLessonPlanDownloadFilename('COM¹', '')).toBe('ILAW_COM¹.pdf');
    expect(resolveLessonPlanDownloadFilename('CONOUT$', '')).toBe('ILAW_CONOUT$.pdf');
    expect(resolveLessonPlanDownloadFilename('name\u0000\u0001', '')).toBe('name.pdf');
    expect(resolveLessonPlanDownloadFilename(' Araling\tPanlipunan\n7 ', '')).toBe('Araling Panlipunan 7.pdf');
  });

  it('does not duplicate or mislabel document extensions', () => {
    expect(resolveLessonPlanDownloadFilename('lesson.DOC.doc', '')).toBe('lesson.pdf');
    expect(resolveLessonPlanDownloadFilename('lesson.docx', '')).toBe('lesson.pdf');
    expect(resolveLessonPlanDownloadFilename('lesson.pdf.PDF', '')).toBe('lesson.pdf');
    expect(resolveLessonPlanDownloadFilename('lesson.doc.', '')).toBe('lesson.pdf');
  });
});
