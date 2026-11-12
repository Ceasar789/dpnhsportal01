// Clarity T3: every TEMPORARY copy in the Teacher Grading and Attendance tabs
// is still word for word the classic code (no substitutions), and the new
// CSS is scoped under the theme class.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
const read = rel => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const lines = text => text.split('\n').map(l => l.trim()).filter(Boolean);
const blocksOf = (text, file) => [...text.matchAll(new RegExp(`TEMPORARY copy \\(${file.replace('.', '\\.')}:(\\d+)(?:-(\\d+))?\\)[^\\n]*\\n([\\s\\S]*?)\\n[^\\n]*---- end of the copy ----`, 'g'))];

const CASES = [
  ['ClarityTeacherGradingTab.jsx', 'GradesTab.jsx', ['17-18', '26-36', '39-164']],
  ['ClarityTeacherAttendanceTab.jsx', 'AttendanceTab.jsx', ['23-33', '39-60', '63-347', '389-389']],
];

describe('T3 sources', () => {
  it.each(CASES)('%s: the declared copies of %s are identical to the classic lines', (mine, theirs, ranges) => {
    const clarity = read(`components/clarity/teacher/${mine}`);
    const classic = read(`pages/dashboards/teacher/tabs/${theirs}`).split('\n');
    const blocks = blocksOf(clarity, theirs);
    expect(blocks.map(b => `${b[1]}-${b[2] || b[1]}`)).toEqual(ranges);
    for (const [, from, to, body] of blocks) {
      expect(lines(body), `${mine} ${from}-${to || from}`).toEqual(lines(classic.slice(Number(from) - 1, Number(to || from)).join('\n')));
    }
  });

  it('every x-tgr / x-tat selector is scoped under the theme class, with no !important or nowrap', () => {
    const css = read('styles/clarity-components.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const scope = ['html.theme', 'clarity'].join('-');
    const groups = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => /\.x-(tgr|tat)/.test(m[1]));
    expect(groups.length).toBeGreaterThanOrEqual(50);
    for (const [, selectors, body] of groups) {
      for (const sel of selectors.split(',').filter(s => /\.x-(tgr|tat)/.test(s))) expect(sel.trim().startsWith(scope), sel).toBe(true);
      expect(body, selectors).not.toMatch(/!important|nowrap/);
    }
  });
});
