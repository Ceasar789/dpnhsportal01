// Clarity G1: the shell layout rules and the Admin Calendar fix, pinned on the
// CSS text (jsdom computes no layout). Also: no visible "Classic view" button.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = rel => readFileSync(join(here, '..', rel), 'utf8');
const css = read('styles/clarity-components.css').replace(/\/\*[\s\S]*?\*\//g, '');
const P = `html.${['theme', 'clarity'].join('-')} `;

// The body of the block that opens with `prelude {` (an @media or a rule).
const block = (text, prelude) => {
  const at = text.indexOf(`${prelude} {`);
  if (at === -1) return null;
  let i = text.indexOf('{', at) + 1; let depth = 1; const start = i;
  while (depth) { if (text[i] === '{') depth += 1; else if (text[i] === '}') depth -= 1; i += 1; }
  return text.slice(start, i - 1);
};
const rule = (sel, text = css) => block(text, P + sel);

describe('the sidebar stays put; only the page scrolls', () => {
  const desktop = block(css, '@media screen and (min-width: 1024px)');
  it('desktop screens: sticky, full viewport height (dvh with a vh fallback), own scroll', () => {
    const side = rule('.x-side', desktop);
    expect(side).toMatch(/position: sticky; top: 0;/);
    expect(side).toMatch(/height: 100vh; height: 100dvh;/);
    expect(side).toMatch(/overflow-y: auto/);
  });
  it('the top bar stays sticky; the drawer and the collapsed width are unchanged', () => {
    expect(rule('.x-top')).toMatch(/position: sticky; top: 0;/);
    expect(rule('.x-side', block(css, '@media (max-width: 1023.98px)'))).toMatch(/position: fixed;.*transform: translateX\(-102%\)/);
    expect(rule('.x-side.x-tch-mini')).toMatch(/width: 76px/);
  });
});

describe('fluid content', () => {
  it('fills the area right of the sidebar with 28px padding, capped at 1680px, not centred', () => {
    const content = rule('.x-content');
    expect(content).toMatch(/padding: 28px;/);
    expect(content).toMatch(/max-width: 1680px;/);
    expect(content).toMatch(/margin: 0;/);
    expect(css).not.toMatch(/max-width: 1240px/);
  });
});

describe('Admin Calendar layout', () => {
  const tab = read('components/clarity/admin/ClarityAdminCalendarTab.jsx');
  it('the page root is not the 7-column month grid class', () => {
    expect(tab).not.toMatch(/className="x-cal"/);
    expect(tab).toMatch(/<div className="x-calpage">/);
    expect(rule('.x-calpage')).toMatch(/display: block/);
    expect(rule('.x-cal')).toMatch(/grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  });
  it('the week view keeps its own grid and per-day lists', () => {
    expect(rule('.x-cal-week')).toMatch(/display: grid/);
    expect(rule('.x-cal-day')).toMatch(/min-width: 0; display: flex; flex-direction: column/);
    expect(tab).toMatch(/className="x-cal-week" style=\{\{ gridTemplateColumns: `repeat\(\$\{weekDays.length\}, minmax\(140px, 1fr\)\)` \}\}/);
  });
});

describe('Student sizing', () => {
  const AUTO = /grid-template-columns: repeat\(auto-fill, minmax\(min\(200px, 100%\), 1fr\)\)/;
  it('Scores: denser auto-fill cards and 64px rings', () => {
    expect(rule('.x-sc-grid')).toMatch(AUTO);
    expect(rule('.x-sc-ring')).toMatch(/width: 64px/);
    const scores = read('components/clarity/student/ClarityScoresTab.jsx');
    expect(scores).toMatch(/className="x-sc-grid"/);
    expect(scores).not.toMatch(/x-grid2/);
    expect(scores.match(/<span className="x-sc-ring"><ProgressRing /g)).toHaveLength(2);
  });
  it('Overview: 56px rings and denser subject cards', () => {
    expect(rule('.x-sov-ring')).toMatch(/width: 56px/);
    expect(rule('.x-sov .x-grid3')).toMatch(AUTO);
  });
});

describe('no visible "Classic view" button; ?clarity=0 remains', () => {
  it.each(['admin/ClarityAdminLayout.jsx', 'student/ClarityStudentLayout.jsx', 'teacher/ClarityTeacherLayout.jsx',
    'admin/AdminShellSwitch.jsx', 'student/StudentShellSwitch.jsx', 'teacher/TeacherShellSwitch.jsx'])('%s', (file) => {
    const src = read(`components/clarity/${file}`);
    expect(src).not.toMatch(/>Classic view</);
    expect(src).not.toMatch(/onClassicView/);
  });
  it('the flag hook still reads ?clarity=0', () => {
    expect(read('components/clarity/useClarityFlag.js')).toMatch(/turnOff/);
  });
});
