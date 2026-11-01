// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractWeeklyWorksheetSource, WEEKDAYS } from './weeklyWorksheetSource';

const field = (section, label, entries) => `<div class="${section}"><div class="ilaw-field"><span class="ilaw-label">${label}</span><table><tr>${WEEKDAYS.map(day => `<th>${day}</th>`).join('')}</tr><tr>${entries.map(value => `<td>${value}</td>`).join('')}</tr></table></div></div>`;
const html = (objectives, activities, assessments) => [
  field('ilaw-I', 'Learning Objectives', objectives),
  field('ilaw-L', 'Flow', activities),
  field('ilaw-A', 'Formative Assessment', assessments),
].join('');
const objectives = WEEKDAYS.map(day => `Describe the ${day} concept.`);
const activities = WEEKDAYS.map(day => `Practice the ${day} activity.`);
const assessments = WEEKDAYS.map(day => `Explain the ${day} result.`);

describe('weekly AI ILAW source extraction', () => {
  it('keeps distinct objectives, activities and assessments for each day', () => {
    const result = extractWeeklyWorksheetSource('<table class="ilaw-info-table"><tr><th>Term No. and Week No.</th><td>Term 1, Week 3</td><th>Teaching Date</th><td>October 12–16</td></tr></table>'
      + html(objectives, activities, assessments));
    expect(result.issues).toEqual([]);
    expect(result.sourceWeek).toBe('Term 1, Week 3');
    expect(result.teachingDate).toBe('October 12–16');
    expect(result.days).toHaveLength(5);
    expect(result.days[0]).toEqual({ day: 'Monday', objective: objectives[0], activity: activities[0], assessment: assessments[0] });
    expect(result.days[4].assessment).toBe(assessments[4]);
  });

  it('adds an actual weekly competency to each day without inventing one when absent', () => {
    const competency = '<div class="ilaw-I"><div class="ilaw-field"><span class="ilaw-label">Learning Competency</span><p>Analyze Filipino poetry.</p></div></div>';
    const result = extractWeeklyWorksheetSource(competency + html(objectives, activities, assessments));
    expect(result.days.every(day => day.competency === 'Analyze Filipino poetry.')).toBe(true);
    expect(extractWeeklyWorksheetSource(html(objectives, activities, assessments)).days[0]).not.toHaveProperty('competency');
  });

  it('reports missing or ambiguous cells rather than inventing a daily lesson', () => {
    const missing = extractWeeklyWorksheetSource(html(objectives.map((value, index) => index === 1 ? '[Objective]' : value), activities, assessments));
    expect(missing.issues).toContainEqual({ field: 'objective', day: 'Tuesday', code: 'missing', message: 'Tuesday learning objectives is missing.' });
    expect(missing.days[1].objective).toBeUndefined();
    const ambiguous = extractWeeklyWorksheetSource(html(objectives, activities, assessments)
      + field('ilaw-A', 'Formative Assessment', assessments));
    expect(ambiguous.issues).toContainEqual({ field: 'assessment', day: null, code: 'ambiguous', message: 'Formative Assessment must appear once in the weekly ILAW.' });
  });

  it('ignores executable markup and unrelated headings', () => {
    const result = extractWeeklyWorksheetSource(html(objectives, activities, assessments)
      + '<script>alert(1)</script><h2>Other heading</h2>');
    expect(JSON.stringify(result)).not.toMatch(/alert|Other heading/);
  });

  it('maps a Filipino 7 ILAW with abbreviated and vertical weekday tables', () => {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const horizontal = (section, label, entries) => `<div class="${section}"><div class="ilaw-field">
      <strong class="ilaw-label">${label}:</strong><table><thead><tr>${dayNames.map(day => `<th>${day}</th>`).join('')}</tr></thead>
      <tbody><tr>${entries.map(value => `<td><p>${value}</p></td>`).join('')}</tr></tbody></table></div></div>`;
    const vertical = (section, label, entries) => `<div class="${section}"><div class="ilaw-field">
      <span class="ilaw-label">${label}</span><table><tbody>${WEEKDAYS.map((day, index) =>
        `<tr><th>${day}</th><td>${entries[index]}</td></tr>`).join('')}</tbody></table></div></div>`;
    const filipinoObjectives = WEEKDAYS.map(day => `Natutukoy ang pandiwa sa aralin ng ${day}.`);
    const filipinoActivities = WEEKDAYS.map(day => `Suriin ang pangungusap para sa ${day}.`);
    const filipinoAssessments = WEEKDAYS.map(day => `Pagsusulit sa ${day}.`);
    const result = extractWeeklyWorksheetSource(horizontal('ilaw-I', 'Learning Objective', filipinoObjectives)
      + vertical('ilaw-L', 'Teaching Activities', filipinoActivities)
      + horizontal('ilaw-A', 'Assessment', filipinoAssessments));
    expect(result.issues).toEqual([]);
    expect(result.days[0].objective).toBe(filipinoObjectives[0]);
    expect(result.days[1].activity).toBe(filipinoActivities[1]);
    expect(result.days[4].assessment).toBe(filipinoAssessments[4]);
  });

  it('identifies a missing Friday assessment in a vertical table', () => {
    const verticalAssessment = `<div class="ilaw-A"><div class="ilaw-field"><span class="ilaw-label">Assessment</span>
      <table>${WEEKDAYS.map((day, index) => `<tr><th>${day}</th><td>${index === 4 ? '[Assessment]' : assessments[index]}</td></tr>`).join('')}</table></div></div>`;
    const result = extractWeeklyWorksheetSource(field('ilaw-I', 'Learning Objectives', objectives)
      + field('ilaw-L', 'Flow', activities) + verticalAssessment);
    expect(result.issues).toContainEqual({ field: 'assessment', day: 'Friday', code: 'missing',
      message: 'Friday formative assessment is missing.' });
  });
});
