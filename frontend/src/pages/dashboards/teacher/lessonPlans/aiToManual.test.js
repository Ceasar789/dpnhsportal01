// @vitest-environment jsdom
// R36 (4g): Edit as manual copies the AI plan into a new Manual draft; the AI plan itself is untouched.
import { describe, expect, it } from 'vitest';
import { manualDraftFromAiPlan } from './aiToManual';
import { WEEKDAYS } from './weeklyWorksheetSource';

const field = (section, label, entries) => `<div class="${section}"><div class="ilaw-field"><span class="ilaw-label">${label}</span><table><tr>${WEEKDAYS.map(day => `<th>${day}</th>`).join('')}</tr><tr>${entries.map(value => `<td>${value}</td>`).join('')}</tr></table></div></div>`;
const html = '<table class="ilaw-info-table"><tr><th>Term No. and Week No.</th><td>Term 1, Week 3</td><th>Teaching Date</th><td>October 12–16</td></tr></table>'
  + '<div class="ilaw-I"><div class="ilaw-field"><span class="ilaw-label">Learning Competency</span><p>Describe matter.</p></div></div>'
  + field('ilaw-I', 'Learning Objectives', WEEKDAYS.map(d => `Objective ${d}`))
  + field('ilaw-L', 'Flow', WEEKDAYS.map(d => `Flow ${d}`))
  + field('ilaw-A', 'Formative Assessment', WEEKDAYS.map(d => (d === 'Friday' ? '[Assessment]' : `Check ${d}`)));
const plan = { id: 'p1', title: 'States of Matter', subject: 'Science', grade_level: 'Grade 7', ai_generated: true, objectives: html };

describe('manualDraftFromAiPlan', () => {
  it('copies title, subject, grade, week, date, competency and the three daily fields', () => {
    const { draft, copied } = manualDraftFromAiPlan(plan, 'teacher-1', { name: 'Ana Reyes' });
    expect(draft.kind).toBe('eduscribe.temporary-manual-ilaw');
    expect(draft.teacherId).toBe('teacher-1');
    expect(draft.document.info).toMatchObject({ nameOfLesson: 'States of Matter', learningArea: 'Science', gradeSection: 'Grade 7',
      termWeek: 'Term 1, Week 3', teachingDate: 'October 12–16' });
    expect(draft.document.learningCompetency).toBe('Describe matter.');
    expect(draft.document.weekly.learningObjectives.Monday).toBe('Objective Monday');
    expect(draft.document.weekly.flow.Thursday).toBe('Flow Thursday');
    expect(draft.document.weekly.formativeAssessment.Wednesday).toBe('Check Wednesday');
    expect(draft.document.signatures.preparedBy.name).toBe('Ana Reyes');
    expect(copied).toBe(14);
  });
  it('never invents text: placeholders and missing fields stay blank', () => {
    const { draft } = manualDraftFromAiPlan(plan, 'teacher-1');
    expect(draft.document.weekly.formativeAssessment.Friday).toBe('');
    expect(draft.document.weekly.learnerContext.Monday).toBe('');
    const empty = manualDraftFromAiPlan({ ...plan, objectives: '<p>Unstructured</p>' }, 'teacher-1');
    expect(empty.copied).toBe(0);
    expect(empty.draft.document.info.nameOfLesson).toBe('States of Matter');
  });
  it('the AI plan object is left exactly as it was', () => {
    const before = JSON.stringify(plan);
    manualDraftFromAiPlan(plan, 'teacher-1');
    expect(JSON.stringify(plan)).toBe(before);
  });
});
