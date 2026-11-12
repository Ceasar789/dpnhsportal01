// Clarity T2: every TEMPORARY copy in the three Teacher tabs is still word for
// word the classic code (one declared added line in the Overview), the new
// CSS is scoped, and the Clarity layout swaps only these three routes.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
const read = rel => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const lines = text => text.split('\n').map(l => l.trim()).filter(Boolean);
const blocksOf = (text, file) => [...text.matchAll(new RegExp(`TEMPORARY copy \\(${file.replace('.', '\\.')}:(\\d+)-(\\d+)\\)[^\\n]*\\n([\\s\\S]*?)\\n[^\\n]*---- end of the copy ----`, 'g'))];

// The one declared addition: the Overview keeps today's list for display.
const ADDED = /\/\/ Clarity: keep today's list for display$/;

const CASES = [
  ['ClarityTeacherOverviewTab.jsx', 'OverviewTab.jsx', ['20-45', '62-213']],
  ['ClarityTeacherStudentsTab.jsx', 'StudentsTab.jsx', ['20-60', '102-208', '212-214']],
  ['ClarityTeacherAnnouncementsTab.jsx', 'AnnouncementsTab.jsx', ['17-65']],
];

describe('T2 sources', () => {
  it.each(CASES)('%s: the declared copies of %s are identical to the classic lines', (mine, theirs, ranges) => {
    const clarity = read(`components/clarity/teacher/${mine}`);
    const classic = read(`pages/dashboards/teacher/tabs/${theirs}`).split('\n');
    const blocks = blocksOf(clarity, theirs);
    expect(blocks.map(b => `${b[1]}-${b[2]}`)).toEqual(ranges);
    for (const [, from, to, body] of blocks) {
      const copied = lines(body).filter(l => !ADDED.test(l));
      expect(copied, `${mine} ${from}-${to}`).toEqual(lines(classic.slice(Number(from) - 1, Number(to)).join('\n')));
    }
  });

  it('the only added line is the declared one, in the Overview', () => {
    const all = CASES.map(([mine]) => read(`components/clarity/teacher/${mine}`)).join('\n');
    expect(all.split('\n').filter(l => ADDED.test(l.trim()))).toEqual(["      setTodaysClasses(todays); // Clarity: keep today's list for display"]);
  });

  it('the layout renders the Clarity tabs for exactly these three routes', () => {
    const layout = read('components/clarity/teacher/ClarityTeacherLayout.jsx');
    const map = layout.match(/const CLARITY_TABS = \{([\s\S]*?)\};/)[1];
    expect(lines(map)).toEqual([
      "'/teacher-dashboard': ClarityTeacherOverviewTab,",
      "'/teacher-dashboard/students': ClarityTeacherStudentsTab,",
      "'/teacher-dashboard/grades': ClarityTeacherGradingTab,",
      "'/teacher-dashboard/attendance': ClarityTeacherAttendanceTab,",
      "'/teacher-dashboard/announcements': ClarityTeacherAnnouncementsTab,",
    ]);
  });

  it('every x-tov / x-tst / x-tan selector is scoped under the theme class, with no !important or nowrap', () => {
    const css = read('styles/clarity-components.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const scope = ['html.theme', 'clarity'].join('-');
    const groups = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => /\.x-(tov|tst|tan)-/.test(m[1]));
    expect(groups.length).toBeGreaterThanOrEqual(35);
    for (const [, selectors, body] of groups) {
      for (const sel of selectors.split(',').filter(s => /\.x-(tov|tst|tan)-/.test(s))) expect(sel.trim().startsWith(`${scope} .x-`), sel).toBe(true);
      expect(body, selectors).not.toMatch(/!important|nowrap/);
    }
  });
});
