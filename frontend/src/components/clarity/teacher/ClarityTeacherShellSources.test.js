// Clarity T1: the TEMPORARY copy in the Teacher Clarity shell is still word
// for word the classic TeacherLayout code (two declared substitutions), the
// entry file only gained the switch, and the new CSS is scoped.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
const read = rel => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const lines = text => text.split('\n').map(l => l.trim()).filter(Boolean);

// In Clarity the page scrolls, not <main>.
const SUBSTITUTIONS = [
  ['window.scrollTo?.(0, scrollPositionsRef.current.get(location.key));', 'main.scrollTo?.(0, scrollPositionsRef.current.get(location.key));'],
  ['window.scrollTo?.(0, 0);', 'main.scrollTo?.(0, 0);'],
];

describe('T1 sources', () => {
  const entry = read('pages/dashboards/teacher/TeacherDashboard.jsx');
  const classic = entry.split('\n');
  const clarity = read('components/clarity/teacher/ClarityTeacherLayout.jsx');
  const blocks = [...clarity.matchAll(/TEMPORARY copy \(TeacherDashboard\.jsx:(\d+)-(\d+)\)[^\n]*\n([\s\S]*?)\n[^\n]*---- end of the copy ----/g)];

  it('the copy names the classic TeacherLayout lines it came from', () => {
    expect(blocks.map(b => `${b[1]}-${b[2]}`)).toEqual(['44-165']);
    // The named range is the classic TeacherLayout body, still in the classic file.
    expect(classic[43].trim()).toBe('const { dark, toggleDark } = useTheme();');
    expect(classic[164].trim()).toBe('];');
  });

  it('identical to those lines, apart from the declared substitutions', () => {
    const [, from, to, body] = blocks[0];
    let copied = body;
    for (const [mine, theirs] of SUBSTITUTIONS) {
      expect(copied.split(mine).length - 1, mine).toBe(1);
      copied = copied.replace(mine, theirs);
    }
    expect(lines(copied)).toEqual(lines(classic.slice(Number(from) - 1, Number(to)).join('\n')));
  });

  it('the entry file keeps the classic layout and only switches it, as the Student dashboard does', () => {
    expect(entry).toMatch(/const TeacherLayout = \(\{ children \}\) => \{/);
    expect(entry).toMatch(/<TeacherShellSwitch classic=\{TeacherLayout\}>/);
    expect(entry.match(/TeacherShellSwitch/g)).toHaveLength(4); // import name, import path, open and close tags
    expect(read('pages/dashboards/student/StudentDashboard.jsx')).toMatch(/<StudentShellSwitch classic=\{StudentLayout\}>/);
  });

  it('every x-tch selector is scoped under the theme class, with no !important or nowrap', () => {
    const css = read('styles/clarity-components.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const scope = ['html.theme', 'clarity'].join('-');
    const groups = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => m[1].includes('.x-tch'));
    expect(groups.length).toBeGreaterThanOrEqual(3);
    for (const [, selectors, body] of groups) {
      for (const sel of selectors.split(',').filter(s => s.includes('.x-tch'))) expect(sel.trim().startsWith(`${scope} .x-`), sel).toBe(true);
      expect(body, selectors).not.toMatch(/!important|nowrap/);
    }
  });
});
