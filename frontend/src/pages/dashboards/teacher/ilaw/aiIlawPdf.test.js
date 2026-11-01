// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildAiIlawPdfDefinition, parseAiIlawHtml } from './aiIlawPdf';

const logos = Object.fromEntries(['depedLogo', 'schoolSeal', 'eduscribeLogo'].map(key =>
  [key, 'data:image/png;base64,iVBORw0KGgo=']));
const week = '<table class="ilaw-week-table"><tr><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr><tr><td>Mon objective</td><td>Tue objective</td><td>Wed objective</td><td>Thu objective</td><td>Fri objective</td></tr></table>';
const html = `<div class="ilaw-lesson-plan"><div class="ilaw-letterhead"><p>Republic of the Philippines</p><p class="ilaw-school-name">Dela Paz National High School</p></div><h2 class="ilaw-title">ILAW English</h2><table class="ilaw-info-table"><tr><th>Grade and Section</th><td>Grade 7 Emerald</td><th>Teacher</th><td>Alex Rivera</td></tr><tr><th>References</th><td colspan="3">Synthetic book</td></tr></table><div class="ilaw-section ilaw-I"><div class="ilaw-section-header">I — Intentions</div><div class="ilaw-field"><span class="ilaw-label">Learning Objectives</span>${week}</div></div><div class="ilaw-section ilaw-L"><h3>Learning Experience</h3><p>Edited Monday activity</p></div><div class="ilaw-section ilaw-A"><h3>Assessment</h3><p>Teacher-edited quiz</p></div><div class="ilaw-section ilaw-W"><h3>Ways Forward</h3><p>Reflect on progress</p></div><div class="ilaw-signatures"><p>Prepared by Alex Rivera</p></div></div>`;

describe('saved AI ILAW PDF model', () => {
  it('preserves saved content, weekday order, merged cells, school header and brand slots', () => {
    const parsed = parseAiIlawHtml(html);
    const definition = buildAiIlawPdfDefinition(parsed, logos, 'English 7');
    const text = JSON.stringify(definition.content);
    for (const value of ['ILAW English', 'Grade 7 Emerald', 'Alex Rivera', 'Synthetic book',
      'Mon objective', 'Tue objective', 'Wed objective', 'Thu objective', 'Fri objective',
      'Edited Monday activity', 'Teacher-edited quiz', 'Reflect on progress', 'Prepared by']) {
      expect(text).toContain(value);
    }
    expect(text.indexOf('Mon objective')).toBeLessThan(text.indexOf('Tue objective'));
    expect(text.indexOf('Tue objective')).toBeLessThan(text.indexOf('Fri objective'));
    expect(text.match(/Dela Paz National High School/g)).toHaveLength(1);
    expect(definition.content[0].columns[0].image).toBe(logos.depedLogo);
    expect(definition.content[0].columns[2].columns).toHaveLength(2);
    expect(definition.content.find(block => block.table?.body?.length === 2).table.body[1][1].colSpan).toBe(3);
  });

  it('keeps incomplete legacy text without fabricating weekday sections', () => {
    const parsed = parseAiIlawHtml('<h2>Old ILAW</h2><p>Teacher note</p>');
    const text = JSON.stringify(parsed.content);
    expect(text).toContain('Teacher note');
    expect(text).not.toContain('Monday');
    expect(parsed.letterheadLines).toContain('DELA PAZ NATIONAL HIGH SCHOOL');
  });

  it('rejects unsafe and unsupported markup instead of silently omitting it', () => {
    for (const fragment of [
      '<p>Safe</p><script>alert(1)</script>',
      '<p onclick="alert(1)">Safe</p>',
      '<p>Safe</p><iframe src="https://example.org"></iframe>',
      '<svg><text>Hidden</text></svg>',
      '<a href="javascript:alert(1)">Unsafe link</a>',
      '<table><tr><td rowspan="2">Two days</td></tr><tr><td>Other</td></tr></table>',
      '<table class="ilaw-week-table"><tr><th>Monday</th><th>Tuesday</th></tr><tr><td>A</td><td>B</td></tr></table>',
      '<table><tr><td>One</td><td>Two</td></tr><tr><td>Uneven</td></tr></table>',
    ]) expect(() => parseAiIlawHtml(fragment)).toThrow(/PDF download is unavailable/);
  });

  it('preserves nested emphasis and ordered list sequence', () => {
    const parsed = parseAiIlawHtml('<h2>Lesson</h2><p>Explain <strong>fractions</strong> clearly.</p><ol><li>First step</li><li>Second step</li></ol>');
    const text = JSON.stringify(parsed.content);
    expect(text).toContain('fractions');
    expect(text).toContain('1. ');
    expect(text).toContain('2. ');
    expect(text.indexOf('First step')).toBeLessThan(text.indexOf('Second step'));
  });

  it('adds layout-only break opportunities for uninterrupted weekday text', () => {
    const token = 'abcdefghijklmnopqrstuvwxyabcdefghijklmnopqrstuvwxy';
    const parsed = parseAiIlawHtml(`<p>${token}</p>`);
    const displayed = parsed.content[0].text[0].text;
    expect(displayed).toContain('\u200b');
    expect(displayed.replace(/\u200b/g, '')).toBe(token);
  });
});
