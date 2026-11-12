// Clarity A7: every TEMPORARY copy in the Clarity Settings tab is still word
// for word the classic code (no substitutions), the new CSS is scoped, and
// only the Clarity layout swaps the Settings page.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
const read = rel => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const lines = text => text.split('\n').map(l => l.trim()).filter(Boolean);

describe('A7 sources', () => {
  const classic = read('pages/dashboards/admin/tabs/SettingsTab.jsx').split('\n');
  const clarity = read('components/clarity/admin/ClarityAdminSettingsTab.jsx');
  const blocks = [...clarity.matchAll(/TEMPORARY copy \(SettingsTab\.jsx:(\d+)-(\d+)\)[^\n]*\n([\s\S]*?)\n[^\n]*---- end of the copy ----/g)];

  it('has the two declared copies', () => {
    expect(blocks.map(b => `${b[1]}-${b[2]}`)).toEqual(['35-48', '62-75']);
  });

  it.each([0, 1])('copy %#: identical to the classic lines it names', (i) => {
    const [, from, to, body] = blocks[i];
    expect(lines(body)).toEqual(lines(classic.slice(Number(from) - 1, Number(to)).join('\n')));
  });

  it('the theme options are the classic ones (no new option)', () => {
    const classicValues = [...classic.join('\n').matchAll(/<option value="(dark|light|auto)">/g)].map(m => m[1]);
    const clarityValues = [...clarity.matchAll(/\['(dark|light|auto)', '/g)].map(m => m[1]);
    expect(clarityValues).toEqual(classicValues);
  });

  it('every x-set- selector is scoped under the theme class, with no !important or nowrap', () => {
    const css = read('styles/clarity-components.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const scope = ['html.theme', 'clarity'].join('-');
    const groups = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => m[1].includes('.x-set-'));
    expect(groups.length).toBeGreaterThanOrEqual(25);
    for (const [, selectors, body] of groups) {
      for (const sel of selectors.split(',').filter(s => s.includes('.x-set-'))) expect(sel.trim().startsWith(`${scope} .x-`), sel).toBe(true);
      expect(body, selectors).not.toMatch(/!important|nowrap/);
    }
  });

  it('flag OFF: the classic shell still renders the classic Settings tab', () => {
    expect(read('pages/dashboards/admin/AdminDashboard.jsx')).toMatch(/page === 'settings' && <SettingsTab \/>/);
    expect(read('components/clarity/admin/ClarityAdminLayout.jsx')).toMatch(/page === 'settings' && <ClarityAdminSettingsTab \/>/);
  });
});
