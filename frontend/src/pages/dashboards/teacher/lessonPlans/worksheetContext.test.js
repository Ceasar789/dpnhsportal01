// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createBlankIlawDocument } from '../ilaw/ilawTemplateModel';
import { serializeManualIlawV2 } from '../ilaw/manualIlawV2';
import { prepareAiAssessmentWorksheetContext, prepareDevelopmentWorksheetContext, prepareWorksheetContext } from './worksheetContext';
import { createDevelopmentWorksheetResponse } from '../worksheets/developmentWorksheetDraft';

const teacherId = 'teacher-1';
const schoolYear = '2026-2027';
const assignments = [{
  subject_id: 'subject-science', grade_level: 'Grade 7',
  subjects: { id: 'subject-science', name: 'Science' },
}];
const input = (plan, overrides = {}) => ({
  plan, teacherId, schoolYear, sourceTeacherId: teacherId,
  sourceSchoolYear: schoolYear, assignmentRows: assignments, ...overrides,
});

describe('development-only saved-plan handoff', () => {
  it('uses owned legacy AI content without inventing missing subject or grade', () => {
    const result = prepareDevelopmentWorksheetContext({
      plan: aiPlan({ subject_id: null, grade_level: null, subject: 'ILAW Lesson Plan' }), teacherId,
    });
    expect(result.status).toBe('ready');
    expect(result.context).toMatchObject({
      lessonPlanId: 'plan-1', lessonTitle: 'Cells and organisms',
      subjectId: '', subjectName: '', gradeLevel: '', assignmentVerified: false,
      source: { kind: 'ai-html-text', assessment: { activities: ['Label the nucleus and cell wall on a plant cell diagram and explain their functions.'] } },
    });
  });

  it('preserves available saved metadata without claiming it is an official assignment', () => {
    const result = prepareDevelopmentWorksheetContext({ plan: aiPlan({ grade_level: null }), teacherId });
    expect(result.context.subjectId).toBe('subject-science');
    expect(result.context.gradeLevel).toBe('');
    expect(result.context.assignmentVerified).toBe(false);
  });

  it('carries a complete synthetic AI subject, grade and year to the local worksheet only', () => {
    const result = prepareDevelopmentWorksheetContext({ plan: aiPlan({
      subject_id: 'subject-english', subject: 'English', grade_level: 'Grade 7', academic_year: schoolYear,
    }), teacherId });
    expect(result.status).toBe('ready');
    expect(result.context).toMatchObject({ subjectId: 'subject-english', subjectName: 'English',
      gradeLevel: 'Grade 7', schoolYear, assignmentVerified: false });
    const draft = createDevelopmentWorksheetResponse(result.context);
    expect(draft).toMatchObject({ subjectId: 'subject-english', subjectName: 'English', gradeLevel: 'Grade 7',
      schoolYear, assignmentVerified: false, saved: false });
    expect(draft).not.toHaveProperty('distribution');
  });

  it('carries the saved Manual ILAW year into worksheet generation context', () => {
    const prepared = prepareDevelopmentWorksheetContext({ plan: manualPlan(), teacherId });
    expect(prepared.status).toBe('ready');
    expect(prepared.context.schoolYear).toBe(schoolYear);
    expect(prepared.context.assignmentVerified).toBe(false);
  });

  it('rejects wrong ownership, empty AI content, and contradictory Manual ILAW metadata', () => {
    expect(prepareDevelopmentWorksheetContext({ plan: aiPlan(), teacherId: 'other' }).status).toBe('ineligible');
    expect(prepareDevelopmentWorksheetContext({ plan: aiPlan({ objectives: '<script>alert(1)</script>' }), teacherId }).status).toBe('ineligible');
    expect(prepareDevelopmentWorksheetContext({ plan: { ...manualPlan(), subject_id: 'different' }, teacherId }).status).toBe('ineligible');
  });
});
const aiPlan = (overrides = {}) => ({
  id: 'plan-1', teacher_id: teacherId, ai_generated: true,
  title: 'Cells and organisms', subject_id: 'subject-science', grade_level: 'Grade 7',
  objectives: '<h2>Learning objectives</h2><p>Identify plant cells.</p><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>', ...overrides,
});
const manualPlan = () => {
  const document = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7' });
  document.info.nameOfLesson = 'Cells and organisms';
  document.weekly.learningObjectives.Monday = 'Describe a plant cell.';
  document.weekly.flow.Monday = 'Observe a model.';
  document.weekly.formativeAssessment.Monday = 'Label a cell diagram.';
  return {
    id: 'plan-1', teacher_id: teacherId, ai_generated: false,
    title: 'Cells and organisms', subject_id: 'subject-science', grade_level: 'Grade 7',
    objectives: serializeManualIlawV2({
      kind: 'eduscribe.manual-ilaw', version: 2, teacherId, planId: 'plan-1',
      title: 'Cells and organisms', workflowState: 'saved', document,
      assignment: { subjectId: 'subject-science', subjectName: 'Science', gradeLevel: 'Grade 7', schoolYear },
      sourceDetails: { classDuration: '45', teachingStrategy: 'Inquiry', learningObjectives: 'Identify cell structures.' },
    }),
  };
};

describe('isolated lesson-plan worksheet context', () => {
  it('requires saved AI Assessment content and preserves source identity without inventing metadata', () => {
    const missing = prepareAiAssessmentWorksheetContext(input(aiPlan({
      objectives: '<h2>Learning Objectives</h2><p>Identify plant cells.</p>',
    })));
    expect(missing.status).toBe('ineligible');
    expect(missing.reason).toContain('A — Assessment');
    const present = prepareAiAssessmentWorksheetContext(input(aiPlan({
      objectives: '<h2>Learning Objectives</h2><p>Identify plant cells.</p><div class="ilaw-A"><p>Label a plant cell diagram.</p></div>',
    })));
    expect(present.status).toBe('ready');
    expect(present.context.lessonPlanId).toBe('plan-1');
    expect(present.context.source.assessment.activities).toEqual(['Label a plant cell diagram.']);
    expect(prepareAiAssessmentWorksheetContext(input(aiPlan({ subject_id: null, grade_level: null }))).status)
      .toBe('needs-confirmation');
  });
  it('keeps an eligible AI plan identity and plain lesson text without executable HTML', () => {
    const result = prepareWorksheetContext(input(aiPlan({
      objectives: '<h2>Learning Objectives</h2><p>Identify plant cells.</p><script>alert(1)</script><a href="javascript:alert(1)">Read</a>',
    })));
    expect(result.status).toBe('ready');
    expect(result.context.lessonPlanId).toBe('plan-1');
    expect(result.context.subjectId).toBe('subject-science');
    expect(result.context.gradeLevel).toBe('Grade 7');
    expect(result.context.source.kind).toBe('ai-html-text');
    expect(result.context.source.lessonText).toContain('Identify plant cells.');
    expect(result.context.source.lessonText).not.toMatch(/alert|script|javascript:/);
  });

  it('requires explicit current-assignment confirmation for legacy AI plans without subject or grade IDs', () => {
    const plan = aiPlan({ subject_id: null, grade_level: null, subject: 'ILAW Lesson Plan' });
    const first = prepareWorksheetContext(input(plan));
    expect(first.status).toBe('needs-confirmation');
    expect(first.assignmentOptions).toEqual([{ id: 'subject-science', name: 'Science', grades: ['Grade 7'] }]);
    expect(prepareWorksheetContext(input(plan, {
      selectedSubjectId: 'subject-other', selectedGradeLevel: 'Grade 7',
    })).status).toBe('needs-confirmation');
    const confirmed = prepareWorksheetContext(input(plan, {
      selectedSubjectId: 'subject-science', selectedGradeLevel: 'Grade 7',
    }));
    expect(confirmed.status).toBe('ready');
    expect(confirmed.context.subjectName).toBe('Science');
  });

  it('never lets a local selection override reliable saved subject or grade metadata', () => {
    const subjectOnly = aiPlan({ grade_level: null });
    expect(prepareWorksheetContext(input(subjectOnly, {
      selectedSubjectId: 'subject-other', selectedGradeLevel: 'Grade 7',
    })).status).toBe('ineligible');
    expect(prepareWorksheetContext(input(subjectOnly, {
      selectedSubjectId: 'subject-science', selectedGradeLevel: 'Grade 7',
    })).status).toBe('ready');
    const gradeOnly = aiPlan({ subject_id: null });
    expect(prepareWorksheetContext(input(gradeOnly, {
      selectedSubjectId: 'subject-science', selectedGradeLevel: 'Grade 8',
    })).status).toBe('ineligible');
    expect(prepareWorksheetContext(input(gradeOnly, {
      selectedSubjectId: 'subject-science', selectedGradeLevel: 'Grade 7',
    })).status).toBe('ready');
    expect(prepareWorksheetContext(input(aiPlan({ subject_id: 'subject-other', grade_level: null }))).status)
      .toBe('ineligible');
  });

  it('uses validated Manual ILAW V2 objectives and activities without inventing weekday content', () => {
    const result = prepareWorksheetContext(input(manualPlan()));
    expect(result.status).toBe('ready');
    expect(result.context.source).toMatchObject({
      kind: 'manual-ilaw-v2', learningObjectives: 'Identify cell structures.',
      teachingStrategy: 'Inquiry',
      weekdayObjectives: { Monday: 'Describe a plant cell.', Tuesday: '' },
      learningActivities: { Monday: 'Observe a model.', Tuesday: '' },
      formativeAssessments: { Monday: 'Label a cell diagram.', Tuesday: '' },
    });
  });

  it('fails closed for stale identity, year, missing assignment, adviser-only context, and unassigned historical plans', () => {
    expect(prepareWorksheetContext(input(aiPlan(), { teacherId: 'teacher-2' })).status).toBe('ineligible');
    expect(prepareWorksheetContext(input(aiPlan(), { sourceSchoolYear: '2025-2026' })).status).toBe('ineligible');
    expect(prepareWorksheetContext(input(aiPlan(), { assignmentRows: [] })).status).toBe('ineligible');
    expect(prepareWorksheetContext(input(aiPlan(), { assignmentRows: [], adviserSectionId: 'section-1' })).status).toBe('ineligible');
    expect(prepareWorksheetContext(input(aiPlan({ subject_id: 'old-subject' }))).status).toBe('ineligible');
  });

  it('rejects damaged, unsupported, or mismatched saved content without generating or saving anything', () => {
    expect(prepareWorksheetContext(input(aiPlan({ ai_generated: false, objectives: '<p>Legacy HTML</p>' }))).status).toBe('ineligible');
    expect(prepareWorksheetContext(input(aiPlan({ title: '' }))).status).toBe('ineligible');
    expect(prepareWorksheetContext(input(aiPlan({ objectives: '<script>alert(1)</script>' }))).status).toBe('ineligible');
    expect(prepareWorksheetContext(input(manualPlan(), { teacherId: 'other' })).status).toBe('ineligible');
    expect(prepareWorksheetContext(input({ ...manualPlan(), title: 'Different title' })).status).toBe('ineligible');
    const damaged = { ...manualPlan(), objectives: '{"kind":"eduscribe.manual-ilaw"}' };
    expect(prepareWorksheetContext(input(damaged)).status).toBe('ineligible');
  });

  it('extracts instructional ILAW fields while excluding letterhead and signatories', () => {
    const objectives = `<div class="ilaw-letterhead"><p>Republic of the Philippines</p><p>Dela Paz National High School</p></div>
      <div class="ilaw-I"><div class="ilaw-field"><span class="ilaw-label">Learning Objectives</span>
      <span class="ilaw-label-hint">Instructional hint</span><table><tr><td>Identify plant cells.</td></tr></table></div></div>
      <div class="ilaw-L"><div class="ilaw-field"><span class="ilaw-label">Flow</span><p>Observe a cell model.</p></div></div>
      <div class="ilaw-A"><div class="ilaw-field"><span class="ilaw-label">Formative Assessment</span><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div></div>
      <div class="ilaw-signatures">Prepared by School Principal</div>`;
    const result = prepareDevelopmentWorksheetContext({ plan: aiPlan({ objectives }), teacherId });
    expect(result.status).toBe('ready');
    expect(result.context.source.lessonText).toContain('Identify plant cells.');
    expect(result.context.source.lessonText).toContain('Observe a cell model.');
    expect(result.context.source.lessonText).toContain('Label the nucleus and cell wall');
    expect(result.context.source.lessonText).not.toMatch(/Republic|Dela Paz|Principal|Instructional hint/);
    const sample = createDevelopmentWorksheetResponse(result.context);
    expect(sample.questions[0].question).toContain('Assessment');
    expect(sample.questions[0].question).not.toMatch(/Republic|Dela Paz/);
  });

  it('does not concatenate weekday headings into AI worksheet context', () => {
    const objectives = `<div class="ilaw-I"><div class="ilaw-field">
      <span class="ilaw-label">Learning Objectives</span>
      <table><tr><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr>
      <tr><td>Identify plant cells.</td><td>Compare cell types.</td></tr></table>
    </div></div><div class="ilaw-A"><p>Label the nucleus and cell wall on a plant cell diagram and explain their functions.</p></div>`;
    const result = prepareDevelopmentWorksheetContext({ plan: aiPlan({ objectives }), teacherId });
    expect(result.status).toBe('ready');
    expect(result.context.source.lessonText).toContain('Identify plant cells. Compare cell types.');
    expect(result.context.source.lessonText).not.toMatch(/Monday|Tuesday|Wednesday|Thursday|Friday/);
  });

  it('rejects letterhead-only AI HTML rather than inventing instructional context', () => {
    const result = prepareDevelopmentWorksheetContext({ plan: aiPlan({
      objectives: '<div class="ilaw-letterhead"><p>Republic of the Philippines</p></div>',
    }), teacherId });
    expect(result.status).toBe('ineligible');
    expect(result.reason).toContain('identifiable instructional content');
    expect(prepareDevelopmentWorksheetContext({ plan: aiPlan({
      objectives: '<h2>Learning Objectives</h2><p>[Objective for Mon]</p>',
    }), teacherId }).status).toBe('ineligible');
  });
});
