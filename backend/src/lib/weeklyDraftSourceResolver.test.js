import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlankIlawDocument } from '../../../frontend/src/pages/dashboards/teacher/ilaw/ilawTemplateModel.js';
import { serializeManualIlawV2 } from '../../../frontend/src/pages/dashboards/teacher/ilaw/manualIlawV2.js';
import { validateWeeklySources } from './weeklyWorksheetGenerator.js';
import { resolveWeeklyDraftSourceDays, WeeklyDraftSourceError } from './weeklyDraftSourceResolver.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const teacherId = '11111111-1111-4111-8111-111111111111';
const planId = '22222222-2222-4222-8222-222222222222';
const subjectId = '33333333-3333-4333-8333-333333333333';
const row = objectives => ({ id: planId, teacher_id: teacherId, title: 'Synthetic ILAW',
  subject_id: subjectId, subject: 'Science', grade_level: 'Grade 7',
  status: 'draft', ai_generated: true, objectives });
const values = label => DAYS.map(day => `${label} for ${day}.`);
const horizontal = (section, label, entries) => `<div class="ilaw-section ${section}"><div class="ilaw-field">
  <span class="ilaw-label">${label}</span><table class="ilaw-week-table"><tr>
  ${DAYS.map(day => `<th>${day}</th>`).join('')}</tr><tr>
  ${entries.map(entry => `<td><p>${entry}</p></td>`).join('')}</tr></table></div></div>`;
const vertical = (section, label, entries) => `<div class="ilaw-section ${section}"><div class="ilaw-field">
  <span class="ilaw-label">${label}</span><table>${DAYS.map((day, index) =>
    `<tr><th>${day}</th><td>${entries[index]}</td></tr>`).join('')}</table></div></div>`;
const aiHtml = (objectives = values('Objective'), activities = values('Activity'),
  assessments = values('Assessment')) => `<div class="ilaw-lesson-plan">
  <div class="ilaw-section ilaw-I"><div class="ilaw-field"><span class="ilaw-label">Learning Competency</span>
  <p>Describe the weekly topic.</p></div><div class="ilaw-field"><span class="ilaw-label">Learning Objectives</span>
  <table class="ilaw-week-table"><tr>${DAYS.map(day => `<th>${day}</th>`).join('')}</tr>
  <tr>${objectives.map(value => `<td>${value}</td>`).join('')}</tr></table></div></div>
  ${horizontal('ilaw-L', 'Flow', activities)}
  ${horizontal('ilaw-A', 'Formative Assessment', assessments)}</div>`;

function manualRow() {
  const document = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7' });
  document.info.nameOfLesson = 'Synthetic ILAW';
  document.info.teachingDate = '2026-11-03';
  document.learningCompetency = 'Describe the weekly topic.';
  for (const day of DAYS) {
    document.weekly.learningObjectives[day] = `Objective for ${day}.`;
    document.weekly.flow[day] = `Activity for ${day}.`;
    document.weekly.formativeAssessment[day] = `Assessment for ${day}.`;
  }
  const payload = { kind: 'eduscribe.manual-ilaw', version: 2, teacherId, planId,
    title: 'Synthetic ILAW', assignment: { subjectId, subjectName: 'Science',
      gradeLevel: 'Grade 7', schoolYear: '2026-2027' }, workflowState: 'saved', document,
    sourceDetails: { classDuration: '45 minutes', teachingStrategy: 'Inquiry',
      learningObjectives: 'Describe the weekly topic.' } };
  return { ...row(serializeManualIlawV2(payload)), ai_generated: false, payload };
}

const rejects = value => assert.throws(() => resolveWeeklyDraftSourceDays(value), error =>
  error instanceof WeeklyDraftSourceError && error.code === 'invalid_weekly_source'
  && error.message === 'The saved lesson plan has no complete weekly source.');

test('saved AI ILAW HTML yields five ordered, validated daily sources without executing markup', () => {
  const objectives = values('Objective');
  const activities = values('Activity');
  const assessments = values('Assessment');
  const html = aiHtml(objectives, activities, assessments).replace('Activity for Monday.',
    'Read <strong>examples</strong><script>globalThis.weeklySourceScriptRan = true</script><p>Then practice.</p>');
  const plan = { ...row(html), sourceDays: DAYS.map(day => ({ day, objective: 'browser override' })) };
  const result = resolveWeeklyDraftSourceDays(plan);
  assert.deepEqual(result, validateWeeklySources(result));
  assert.deepEqual(result.map(day => day.day), DAYS);
  assert.deepEqual(result.map(day => day.objective), objectives);
  assert.deepEqual(result.map(day => day.assessment), assessments);
  assert.equal(result[0].activity, 'Read examples Then practice.');
  assert.equal(result[0].competency, 'Describe the weekly topic.');
  assert.equal(globalThis.weeklySourceScriptRan, undefined);
  assert.ok(result.every(day => day.objective !== 'browser override'));
});

test('a saved AI ILAW with an unambiguous vertical weekday table keeps day order', () => {
  const assessments = values('Assessment');
  const html = aiHtml().replace(horizontal('ilaw-A', 'Formative Assessment', assessments),
    vertical('ilaw-A', 'Formative Assessment', assessments));
  assert.deepEqual(resolveWeeklyDraftSourceDays(row(html)).map(day => day.assessment), assessments);
});

test('saved Manual ILAW v2 keeps the daily objective, flow and assessment order', () => {
  const plan = manualRow();
  const result = resolveWeeklyDraftSourceDays(plan);
  assert.deepEqual(result, validateWeeklySources(result));
  assert.deepEqual(result.map(day => day.day), DAYS);
  assert.equal(result[0].objective, 'Objective for Monday.');
  assert.equal(result[4].activity, 'Activity for Friday.');
  assert.equal(result[2].assessment, 'Assessment for Wednesday.');
  assert.ok(result.every(day => day.competency === 'Describe the weekly topic.'));
});

test('AI HTML rejects missing daily content, duplicate sections and oversized input', () => {
  rejects(row(aiHtml(values('Objective'), values('Activity'),
    values('Assessment').map((value, index) => index === 4 ? '[Assessment]' : value))));
  rejects(row(aiHtml() + horizontal('ilaw-A', 'Formative Assessment', values('Other'))));
  rejects(row(aiHtml() + 'x'.repeat(128 * 1024)));
  rejects(row('<p>Legacy HTML has no weekly ILAW fields.</p>'));
  rejects({ ...row(aiHtml()), subject: null });
  rejects({ ...row(aiHtml()), title: '' });
});

test('Manual ILAW rejects incomplete days, unsupported versions and mismatched metadata', () => {
  const plan = manualRow();
  plan.payload.document.weekly.flow.Tuesday = '';
  rejects({ ...plan, objectives: serializeManualIlawV2(plan.payload) });
  rejects({ ...plan, objectives: JSON.stringify({ ...plan.payload, version: 3 }) });
  rejects({ ...plan, title: 'Different title' });
  rejects({ ...plan, subject: 'Different subject' });
  rejects({ ...plan, teacher_id: 'another-teacher' });
  rejects({ ...plan, objectives: JSON.stringify({ ...plan.payload, workflowState: 'draft' }) });
});
