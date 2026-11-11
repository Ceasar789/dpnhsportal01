// @vitest-environment jsdom
// Clarity phase 3: the SVG chart components handle real and broken input,
// describe their values in words, use only Clarity tokens, and are unused.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ProgressRing from './ProgressRing';
import Donut from './Donut';
import RankedBars from './RankedBars';
import StackedBar from './StackedBar';

afterEach(cleanup);

// jsdom gives import.meta.url a non-file scheme, so resolve from the working directory.
const SRC = resolve(['src', 'frontend/src'].find(p => existsSync(join(p, 'components', 'clarity', 'charts'))));
const here = join(SRC, 'components', 'clarity', 'charts');
const LONG = 'Edukasyon sa Pagpapakatao at Araling Panlipunan para sa Ikapitong Baitang ng Paaralan';

// Rendered markup must never carry NaN/undefined/Infinity or a literal colour.
const clean = (container) => {
  const html = container.innerHTML;
  expect(html).not.toMatch(/NaN|undefined|Infinity/);
  for (const el of container.querySelectorAll('[style]')) {
    expect(el.getAttribute('style')).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  }
  for (const el of container.querySelectorAll('[fill],[stroke]')) {
    expect(`${el.getAttribute('fill') || ''}${el.getAttribute('stroke') || ''}`).toBe('');
  }
};
const imgLabel = () => screen.getByRole('img').getAttribute('aria-label');

describe('ProgressRing', () => {
  it('draws the value and says it in words with the detail', () => {
    const { container } = render(<ProgressRing value={93} label="Attendance rate" detail="42 of 45 days present" unit="present" />);
    expect(imgLabel()).toBe('Attendance rate: 93 percent, 42 of 45 days present');
    expect(container.querySelector('.x-seg-ring').getAttribute('stroke-dasharray')).toBe('93 7');
    clean(container);
  });
  it.each([[null], [undefined], [NaN], [''], ['abc'], [Infinity]])('%s shows "No data yet", no ring', (value) => {
    const { container } = render(<ProgressRing value={value} label="Average" />);
    expect(container.textContent).toBe('Average: No data yet');
    expect(container.querySelector('svg')).toBeNull();
    clean(container);
  });
  it('zero draws only the track, and says 0 percent', () => {
    const { container } = render(<ProgressRing value={0} label="Average" />);
    expect(imgLabel()).toBe('Average: 0 percent');
    expect(container.querySelector('.x-seg-ring')).toBeNull();
    clean(container);
  });
  it.each([[-12, '0 percent (recorded value -12 percent is outside 0 to 100)', '0'], [130, '100 percent (recorded value 130 percent is outside 0 to 100)', '100 0']])(
    'out-of-range %s is clamped for drawing and explained', (value, words, dash) => {
      const { container } = render(<ProgressRing value={value} label="Score" />);
      expect(imgLabel()).toBe(`Score: ${words}`);
      if (value > 0) expect(container.querySelector('.x-seg-ring').getAttribute('stroke-dasharray')).toBe(dash);
      clean(container);
    });
  it('a long label wraps and carries a title', () => {
    const { container } = render(<ProgressRing value={50} label={LONG} />);
    expect(container.querySelector('figcaption').getAttribute('title')).toBe(LONG);
    expect(container.querySelector('figcaption').style.overflowWrap).toBe('anywhere');
    clean(container);
  });
});

describe('Donut', () => {
  const roles = [{ label: 'Student', value: 120 }, { label: 'Teacher', value: 70 }, { label: 'Admin', value: 10 }];
  it('draws each share, totals in the centre, and lists every value in words and in the legend', () => {
    const { container } = render(<Donut segments={roles} label="Role distribution" totalLabel="users" />);
    expect(imgLabel()).toBe('Role distribution: 200 users. Student 120 (60 percent), Teacher 70 (35 percent), Admin 10 (5 percent)');
    expect(container.querySelectorAll('.x-seg-ring')).toHaveLength(3);
    expect([...container.querySelectorAll('.x-legend li b')].map(b => b.textContent)).toEqual(['120 · 60%', '70 · 35%', '10 · 5%']);
    clean(container);
  });
  it('shares add up to exactly 100 (largest remainder), like the current admin legend', () => {
    const { container } = render(<Donut segments={[{ label: 'A', value: 1 }, { label: 'B', value: 1 }, { label: 'C', value: 1 }]} />);
    const pcts = [...container.querySelectorAll('.x-legend li b')].map(b => Number(b.textContent.split('· ')[1].replace('%', '')));
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
    clean(container);
  });
  it.each([[[]], [null], [[{ label: 'A', value: 0 }]], [[{ label: 'A', value: null }, { label: 'B', value: NaN }]], [[{ label: 'A', value: -5 }]]])(
    'no usable total (%j) shows "No data yet"', (segments) => {
      const { container } = render(<Donut segments={segments} label="Role distribution" />);
      expect(container.textContent).toBe('Role distribution: No data yet');
      clean(container);
    });
  it('a single share fills the ring; a negative count is treated as zero', () => {
    const { container } = render(<Donut segments={[{ label: 'Student', value: 5 }, { label: 'Odd', value: -3 }]} />);
    expect(imgLabel()).toBe('5 total. Student 5 (100 percent), Odd 0 (0 percent)');
    expect(container.querySelectorAll('.x-seg-ring')).toHaveLength(1);
    clean(container);
  });
  it('100+ segments render without NaN; colours repeat but every value stays labelled', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ label: `Role ${i}`, value: i + 1 }));
    const { container } = render(<Donut segments={many} />);
    expect(container.querySelectorAll('.x-legend li')).toHaveLength(120);
    clean(container);
  });
  it('long labels wrap and carry a title', () => {
    const { container } = render(<Donut segments={[{ label: LONG, value: 3 }]} />);
    const span = container.querySelector('.x-legend li span[title]');
    expect(span.getAttribute('title')).toBe(LONG);
    clean(container);
  });
});

describe('RankedBars', () => {
  it('ranks high to low, lists missing values last in words, and says every value', () => {
    const rows = [{ label: 'Math', value: 72 }, { label: 'Science', value: null }, { label: 'English', value: 88 }];
    const { container } = render(<RankedBars rows={rows} label="Average by subject" />);
    expect(imgLabel()).toBe('Average by subject: English 88 percent, Math 72 percent, Science no released scores');
    expect([...container.querySelectorAll('.r .v')].map(v => v.textContent)).toEqual(['88%', '72%', '—']);
    expect(container.querySelector('.r i').style.width).toBe('88%');
    clean(container);
  });
  it.each([[[]], [null], [undefined]])('no rows (%j) shows "No data yet"', (rows) => {
    const { container } = render(<RankedBars rows={rows} label="Average by subject" />);
    expect(container.textContent).toBe('Average by subject: No data yet');
    clean(container);
  });
  it('zero, NaN, negative and over-100 values: clamped for drawing, explained in words, never NaN', () => {
    const rows = [{ label: 'A', value: 0 }, { label: 'B', value: NaN }, { label: 'C', value: -5 }, { label: 'D', value: 150 }];
    const { container } = render(<RankedBars rows={rows} />);
    expect(imgLabel()).toBe('D 100 percent (recorded value 150 percent is outside 0 to 100), A 0 percent, C 0 percent (recorded value -5 percent is outside 0 to 100), B no released scores');
    clean(container);
  });
  it('a single row, a long label and 100+ rows', () => {
    const { container, unmount } = render(<RankedBars rows={[{ label: LONG, value: 64 }]} />);
    expect(container.querySelector('.r span[title]').getAttribute('title')).toBe(LONG);
    clean(container);
    unmount();
    const many = Array.from({ length: 150 }, (_, i) => ({ label: `Subject ${i}`, value: i % 101 }));
    const big = render(<RankedBars rows={many} />);
    expect(big.container.querySelectorAll('.r')).toHaveLength(150);
    clean(big.container);
  });
});

describe('StackedBar', () => {
  const attendance = [{ label: 'Present', value: 42, tone: 'ok' }, { label: 'Late', value: 2, tone: 'wa' },
    { label: 'Absent', value: 1, tone: 'er' }, { label: 'Excused', value: 0, tone: 'in' }];
  it('draws non-zero parts, lists every part with count and share, and says them in words', () => {
    const { container } = render(<StackedBar segments={attendance} label="Attendance" unit="days" />);
    expect(imgLabel()).toBe('Attendance: 45 days in total. Present 42 (93 percent), Late 2 (5 percent), Absent 1 (2 percent), Excused 0 (0 percent)');
    expect(container.querySelectorAll('.x-stack i')).toHaveLength(3);
    expect(container.querySelector('.x-stack i').style.background).toBe('var(--cl-ok)');
    expect(container.querySelectorAll('.x-legend li')).toHaveLength(4);
    clean(container);
  });
  it.each([[[]], [null], [[{ label: 'Present', value: 0 }]], [[{ label: 'Present', value: undefined }]], [[{ label: 'Present', value: -2 }]]])(
    'no usable total (%j) shows "No data yet"', (segments) => {
      const { container } = render(<StackedBar segments={segments} label="Attendance" />);
      expect(container.textContent).toBe('Attendance: No data yet');
      clean(container);
    });
  it('a single part, a long label and 100+ parts', () => {
    const one = render(<StackedBar segments={[{ label: LONG, value: 7 }]} />);
    expect(one.container.querySelector('.x-legend span[title]').getAttribute('title')).toBe(LONG);
    clean(one.container);
    one.unmount();
    const many = render(<StackedBar segments={Array.from({ length: 110 }, (_, i) => ({ label: `S${i}`, value: 1 }))} />);
    expect(many.container.querySelectorAll('.x-stack i')).toHaveLength(110);
    clean(many.container);
  });
});

describe('no hover-only read-outs and nothing to tab to', () => {
  it('every value is visible as text, so no chart has focusable points or a hover read-out', () => {
    const { container } = render(<>
      <ProgressRing value={50} label="A" />
      <Donut segments={[{ label: 'A', value: 1 }]} />
      <RankedBars rows={[{ label: 'A', value: 1 }]} />
      <StackedBar segments={[{ label: 'A', value: 1 }]} />
    </>);
    expect(container.querySelectorAll('[tabindex], .x-hit, .x-read')).toHaveLength(0);
  });
});

describe('sources', () => {
  const files = readdirSync(here).filter(n => /\.(jsx?|tsx?)$/.test(n) && !/\.test\./.test(n));
  it('the chart folder holds the four components and the shared helper', () => {
    expect(files.sort()).toEqual(['Donut.jsx', 'ProgressRing.jsx', 'RankedBars.jsx', 'StackedBar.jsx', 'chartMath.js']);
  });
  it.each(files)('%s imports no chart library and no app state, and has no timers or animation loops', (name) => {
    const text = readFileSync(join(here, name), 'utf8');
    const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
    for (const from of imports) expect(['./chartMath', '../../../lib/percentages']).toContain(from);
    expect(text).not.toMatch(/requestAnimationFrame|setInterval|setTimeout|useEffect|useContext|supabase|fetch\(/);
    expect(text).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it('no file under frontend/src outside the chart folder imports from it (inert)', () => {
    const walk = dir => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
    // Written without "!" before a word: Tailwind scans tests too and would
    // turn such a token into an !important utility in the app's CSS.
    const pathInSrc = p => relative(SRC, p).split(sep).join('/');
    const chartDir = pathInSrc(here);
    const importers = walk(SRC)
      .filter(p => /\.(jsx?|tsx?)$/.test(p))
      .filter(p => pathInSrc(p).startsWith(chartDir) === false)
      .filter(p => /clarity\/charts/.test(readFileSync(p, 'utf8')));
    expect(chartDir).toBe('components/clarity/charts');
    expect(importers).toEqual([]);
  });
});

describe('chart colours: non-text contrast 3:1 against card and background', () => {
  const css = readFileSync(join(SRC, 'styles', 'clarity.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const block = sel => Object.fromEntries([...css.match(new RegExp(`${sel.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`))[1]
    .matchAll(/--cl-([a-z0-9-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
  // The scope selector is assembled so this test file never contains the
  // class name itself (the inertness tests look for it in every source file).
  const SCOPE = ['html.theme', 'clarity'].join('-');
  const THEMES = { light: block(SCOPE), dark: block(`${SCOPE}.dark`) };
  const full = h => (h.length === 4 ? `#${[...h.slice(1)].map(c => c + c).join('')}` : h);
  const lum = (h) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(full(h).slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const COLOURS = ['c1', 'c2', 'c3', 'mu', 'dim', 'ok', 'wa', 'er', 'ac'];

  for (const [mode, t] of Object.entries(THEMES)) {
    for (const surface of ['card', 'bg']) {
      it.each(COLOURS)(`${mode}: --cl-%s on --cl-${surface}`, (c) => {
        expect(ratio(t[c], t[surface])).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
