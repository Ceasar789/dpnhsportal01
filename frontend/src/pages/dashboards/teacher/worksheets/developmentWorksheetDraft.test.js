import { describe, expect, it } from 'vitest';
import { createDevelopmentWorksheetResponse } from './developmentWorksheetDraft';
import { createGeneratedDraft, studentDraftPreview, validateGeneratedWorksheet } from './generatedDraftModel';

const assessment = 'Label the nucleus and cell wall on a plant cell diagram and explain their functions.';
const context = (source = { kind: 'ai-html-text', lessonText: 'Identify plant cells.',
  assessment: { activities: [assessment], weekdayFormativeAssessments: {} } }) => ({
  lessonPlanId: 'synthetic-plan', lessonTitle: 'Synthetic Science',
  subjectId: 'synthetic-science', subjectName: 'Science', gradeLevel: 'Grade 7', source,
});

describe('Assessment-matched development worksheet fixtures', () => {
  it('returns relevant editable questions, groups, keys, and a truthful local-only label', () => {
    const response = createDevelopmentWorksheetResponse(context());
    expect(response).toMatchObject({ status: 'generated-draft', saved: false,
      generationLabel: 'Sample generated from a test Assessment fixture — not live AI.',
      sourceLessonPlan: { id: 'synthetic-plan', title: 'Synthetic Science', contentExcerpt: assessment },
      subjectId: 'synthetic-science', gradeLevel: 'Grade 7' });
    expect(response.sections[0].directions).toContain('Assessment');
    expect(response.questions.map(item => item.question)).toEqual([
      'Which two structures does the Assessment ask you to label?',
      'Explain the functions of the nucleus and cell wall.',
    ]);
    const draft = createGeneratedDraft(response, 'ai');
    expect(validateGeneratedWorksheet(draft)).toEqual([]);
    expect(draft.answerKey).toEqual([{ localId: 'fixture-1', correct_answer: 'Nucleus and cell wall' }]);
    expect(studentDraftPreview(draft)).not.toHaveProperty('answerKey');
    expect(JSON.stringify(studentDraftPreview(draft))).not.toContain('correct_answer');
  });

  it('keeps missing legacy assignment metadata unknown and does not change the source plan', () => {
    const source = context();
    const response = createDevelopmentWorksheetResponse({ ...source, subjectId: '', subjectName: '', gradeLevel: '' });
    expect(response).toMatchObject({ subjectId: '', subjectName: '', gradeLevel: '', assignmentVerified: false });
    expect(source.source.assessment.activities).toEqual([assessment]);
  });

  it('preserves a known source year without inventing one for legacy AI content', () => {
    expect(createGeneratedDraft(createDevelopmentWorksheetResponse(context()), 'ai').schoolYear).toBe('');
    const dated = createGeneratedDraft(createDevelopmentWorksheetResponse({ ...context(), schoolYear: '2030-2031' }), 'manual');
    expect(dated.schoolYear).toBe('2030-2031');
  });

  it('matches only the controlled Assessment, never unrelated or missing text', () => {
    expect(() => createDevelopmentWorksheetResponse(context({ kind: 'ai-html-text', lessonText: 'Other lesson',
      assessment: { activities: ['Assess an unrelated history topic.'], weekdayFormativeAssessments: {} } })))
      .toThrow('No local test fixture matches');
    expect(() => createDevelopmentWorksheetResponse(context({ kind: 'ai-html-text', lessonText: 'No assessment' })))
      .toThrow('No local test fixture matches');
  });

  it('preserves Monday-to-Friday order and group-specific directions in a weekday fixture', () => {
    const response = createDevelopmentWorksheetResponse(context({ kind: 'ai-html-text', lessonText: 'Plant cells',
      assessment: { activities: [], weekdayFormativeAssessments: {
        Wednesday: 'Compare the nucleus and cell wall.', Monday: 'Label the nucleus in a plant cell diagram.',
      } } }));
    expect(response.sections.map(section => section.title)).toEqual(['Monday Assessment', 'Wednesday Assessment']);
    expect(response.sourceLessonPlan.contentExcerpt).toBe('Label the nucleus in a plant cell diagram. Compare the nucleus and cell wall.');
    expect(response.questions.map(item => item.sectionId)).toEqual(['fixture-monday', 'fixture-wednesday']);
    expect(validateGeneratedWorksheet(createGeneratedDraft(response, 'ai'))).toEqual([]);
  });
});
