// V2c: teacher tabs (classic files, also shown inside the Clarity teacher shell):
// the Worksheets helper line, readable muted text and accent buttons in light and
// dark, and 44px targets on phones and tablets. Pinned on the source; the browser
// run measures the result.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = rel => readFileSync(join(here, rel), 'utf8').replace(/\r\n/g, '\n');
const worksheets = read('tabs/WorksheetsTab.jsx');
const ui = read('shared/ui.jsx');
const announcements = read('tabs/AnnouncementsTab.jsx');
const overview = read('tabs/OverviewTab.jsx');
const css = readFileSync(join(here, '../../../styles/index.css'), 'utf8');

const lum = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const token = (name, block) => css.slice(css.indexOf(block)).match(new RegExp(`${name}: (#[0-9a-fA-F]{6})`))[1];

describe('V2c Worksheets', () => {
  it('a short plain-language helper line under the title (the tab keeps its name)', () => {
    expect(worksheets).toMatch(/>Worksheets<\/h1>\n\s*<p className="text-sm mt-1" style=\{\{ color: 'var\(--text-muted\)' \}\}>Create tasks here and send them to your classes\.<\/p>/);
  });
  it('selected chips and Preview: dark text on the light accent in dark (white was 2.72:1), white in light', () => {
    expect(worksheets).toContain("color: activeFilter === f ? (dark ? '#0f172a' : '#ffffff') : 'var(--text)'");
    expect(worksheets).toContain("color: sourceFilter === f ? (dark ? '#0f172a' : '#ffffff') : 'var(--text)'");
    expect(worksheets).toContain("style={{ backgroundColor: 'var(--banner-accent)', color: dark ? '#0f172a' : '#ffffff' }}>");
    expect(worksheets).toContain("style={{ color: dark ? '#0f172a' : '#fff', backgroundColor: 'var(--banner-accent)' }}>");
    // --banner-accent: dark #8b93ff (navy text), light #1908DF (white text).
    expect(ratio('#0f172a', token('--banner-accent', ':root.dark {'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#ffffff', token('--banner-accent', ':root {'))).toBeGreaterThanOrEqual(4.5);
  });
  it('the Distributed / Not distributed badge reads 4.5:1 in light and dark', () => {
    expect(worksheets).toContain("<Badge color={distributedCount > 0 ? (dark ? '#4ade80' : '#15803d') : (dark ? '#fbbf24' : '#b45309')}");
    for (const [fg, bg] of [['#15803d', '#ffffff'], ['#b45309', '#ffffff'], ['#4ade80', '#23272f'], ['#fbbf24', '#23272f']]) {
      expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('the "More actions" button is 44px on phones and tablets', () => {
    expect(worksheets).toContain('className="h-10 min-w-10 max-lg:h-11 max-lg:min-w-11 px-2 rounded-lg flex items-center justify-center"');
  });
});

describe('V2c muted text and targets in the teacher classic files', () => {
  it('no slate-400 text on the light cards (2.56:1); slate-500 in light, slate-400 in dark', () => {
    for (const [name, src] of [['WorksheetsTab', worksheets], ['ui', ui], ['AnnouncementsTab', announcements]]) {
      expect(src, name).not.toContain("dark ? '#64748b' : '#94a3b8'");
    }
    expect(ratio('#64748b', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#94a3b8', '#23272f')).toBeGreaterThanOrEqual(4.5);
  });
  it('teacher text inputs (search included) are 44px on phones and tablets', () => {
    expect(ui).toContain('<input className={`w-full h-10 max-lg:h-11 px-3 rounded-lg');
  });
  it('the Overview "View all lesson plans" link is a 44px target on phones and tablets', () => {
    expect(overview).toContain('className="text-sm font-semibold hover:underline max-lg:inline-flex max-lg:items-center max-lg:min-h-11"');
  });
});
