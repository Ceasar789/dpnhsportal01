// V2b-1: Admin tabs on phones and desktop, pinned on the stylesheets and the
// classic style text (jsdom computes no layout; the browser run measures it).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { avatarColor } from '../pages/dashboards/admin/shared/helpers';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = rel => readFileSync(join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');
const P = `html.${['theme', 'clarity'].join('-')}`;
const css = read('styles/clarity-components.css');
const bodyAt = (text, at) => {
  let i = text.indexOf('{', at) + 1; let depth = 1; const start = i;
  while (depth) { if (text[i] === '{') depth += 1; else if (text[i] === '}') depth -= 1; i += 1; }
  return text.slice(start, i - 1);
};
const g10 = css.indexOf('/* G10');
const phone = bodyAt(css, css.indexOf('@media (max-width: 767px) {', g10));
const landscape = bodyAt(css, css.indexOf('@media (max-width: 1023.98px) and (max-height: 500px) {'));
const lum = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const onWhite = hex => 1.05 / (lum(hex) + 0.05);

describe('V2b Clarity admin CSS', () => {
  it('Schedules header: the section picker and the action row may shrink to the page', () => {
    expect(css).toContain(`${P} .x-sch-pick { min-width: min(220px, 100%); max-width: 100%; }`);
    expect(css).toContain(`${P} .x-head > .x-act { min-width: 0; max-width: 100%; }`);
  });
  it('KPI values: a line box no shorter than the glyphs (1.25)', () => {
    expect(css).toMatch(new RegExp(`${P.replace(/\./g, '\\.')} \\.x-kv \\{[^}]*line-height: 1\\.25;`));
  });
  it('nav group headings and count badges are 12px', () => {
    expect(css).toMatch(/\.x-grp \{ font-size: 12px;/);
    expect(css).toMatch(/\.x-nav \.cnt \{ margin-left: auto; font-size: 12px;/);
  });
  it('Users on phones: cards, header cells read by screen readers only, 44px names', () => {
    expect(phone).toContain(`${P} .x-table.x-usr-table { min-width: 0; }`);
    expect(phone).toContain(`${P} .x-usr-table thead th { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); }`);
    expect(phone).toContain(`${P} .x-usr-table tbody tr { display: grid;`);
    expect(phone).toContain(`${P} .x-usr-table tbody td:nth-child(3) { grid-column: 1 / -1; order: 1; }`);
    expect(phone).toContain(`${P} .x-usr-pick { min-height: 44px; }`);
  });
  it('landscape phones: 44px fields and name buttons', () => {
    expect(landscape).toContain(`${P} .x-input, ${P} .x-usr-pick { min-height: 44px; }`);
  });
  it('Clarity dark: classic ghost buttons inside dialogs use the readable accent', () => {
    const g11b = css.slice(css.indexOf('/* G11b'), css.indexOf('/* G9a'));
    expect(g11b).toContain(`${P}.dark .ux-modal .btn-ghost { color: var(--cl-ac); }`);
  });
});

describe('V2b classic admin style text (both copies, word for word)', () => {
  for (const file of ['pages/dashboards/admin/AdminDashboard.jsx', 'components/clarity/admin/ClassicAdminStyles.jsx']) {
    const text = read(file);
    it(`${file}: 44px phone targets and readable red/green action text`, () => {
      expect(text).toContain('.admin-profile-row > button { min-height: 44px; }');
      expect(text).toContain('.toolbar input, .picker-search input, .settings-input-row input, .grade-tab, .admin-profile-row > button { min-height: 44px; }');
      expect(text).toContain('.dark .btn-danger, .dark .news-action.red { color: #f87171; }');
      expect(text).toContain(':root:not(.dark) .news-action.green { color: #15803d; }');
    });
  }
  it('the red text reads 4.5:1 on the dark card, the green on white', () => {
    const dark = lum('#23272f');
    expect((lum('#f87171') + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(onWhite('#15803d')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('V2b avatar colours', () => {
  it('white initials reach 4.5:1 on every colour the palette can give', () => {
    const colours = new Set();
    for (let i = 0; i < 400; i += 1) colours.add(avatarColor(`Person ${i} ${String.fromCharCode(65 + (i % 26))}`));
    expect(colours.size).toBe(8);
    for (const c of colours) expect(onWhite(c), c).toBeGreaterThanOrEqual(4.5);
  });
});
