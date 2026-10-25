// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractAiAssessmentContext } from './assessmentContext';

describe('saved AI ILAW Assessment source extraction', () => {
  it('keeps Assessment activities and weekday formative work in calendar order only', () => {
    const html = `<div class="ilaw-letterhead">School and logos</div>
      <div class="ilaw-I"><div class="ilaw-field"><span class="ilaw-label">Learning Objectives</span>Identify cells.</div></div>
      <div class="ilaw-A"><div class="ilaw-field"><span class="ilaw-label">Assessment task</span>
      <p>Compare the two cell diagrams.</p></div><div class="ilaw-field"><span class="ilaw-label">Formative Assessment</span>
      <table><tr><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr>
      <tr><td>Label a cell diagram.</td><td></td><td>Explain cell functions.</td><td></td><td>Review cell differences.</td></tr></table></div></div>
      <div class="ilaw-signatures">Principal name</div>`;
    const result = extractAiAssessmentContext(html);
    expect(result.activities).toEqual(['Compare the two cell diagrams.']);
    expect(Object.keys(result.weekdayFormativeAssessments)).toEqual(['Monday', 'Wednesday', 'Friday']);
    expect(result.weekdayFormativeAssessments.Wednesday).toBe('Explain cell functions.');
    expect(JSON.stringify(result)).not.toMatch(/School|Principal|Identify cells/);
  });

  it('fails closed for missing, placeholder, and script-only Assessment', () => {
    expect(extractAiAssessmentContext('<h2>Learning Objectives</h2><p>Identify cells.</p>')).toBeNull();
    expect(extractAiAssessmentContext('<div class="ilaw-A"><p>[Assessment for Monday]</p></div>')).toBeNull();
    expect(extractAiAssessmentContext('<div class="ilaw-A"><script>alert(1)</script></div>')).toBeNull();
  });

  it('reads a legacy Assessment heading without adopting neighboring sections', () => {
    expect(extractAiAssessmentContext('<h2>Assessment</h2><p>Compare two cell diagrams.</p><h2>Ways Forward</h2><p>Unrelated reflection.</p>'))
      .toEqual({ activities: ['Compare two cell diagrams.'], weekdayFormativeAssessments: {} });
  });
});
