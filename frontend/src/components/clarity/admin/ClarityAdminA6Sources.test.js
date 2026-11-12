// Clarity A6: every TEMPORARY copy in the Clarity Teaching Load tab is still
// word for word the classic code (one declared substitution), the new CSS
// is scoped, and only the Clarity layout swaps the Teaching Load page.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
const read = rel => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const lines = text => text.split('\n').map(l => l.trim()).filter(Boolean);

// The only intended difference: removeSubject's focus selectors name this
// tab's rows (classic chips do not exist here).
const SUBSTITUTIONS = [
  ["'.x-tld-rows, .x-tld-detail',", "'.assigned-subjects, .teaching-detail',"],
  ["'.x-tld-remove',", "'.subject-chip-remove',"],
  ["'.x-tld-rows-title, #teaching-subject',", "'.subject-section-title, #teaching-subject',"],
];

describe('A6 sources', () => {
  const classic = read('pages/dashboards/admin/tabs/TeachingLoadTab.jsx').split('\n');
  const clarity = read('components/clarity/admin/ClarityAdminTeachingLoadTab.jsx');
  const blocks = [...clarity.matchAll(/TEMPORARY copy \(TeachingLoadTab\.jsx:(\d+)-(\d+)\)[^\n]*\n([\s\S]*?)\n[^\n]*---- end of the copy ----/g)];

  it('has the three declared copies', () => {
    expect(blocks.map(b => `${b[1]}-${b[2]}`)).toEqual(['22-57', '60-329', '340-365']);
  });

  it.each([0, 1, 2])('copy %#: identical to the classic lines it names', (i) => {
    const [, from, to, body] = blocks[i];
    let copied = body;
    for (const [mine, theirs] of SUBSTITUTIONS) copied = copied.replace(mine, theirs);
    expect(lines(copied)).toEqual(lines(classic.slice(Number(from) - 1, Number(to)).join('\n')));
  });

  it('every x-tld selector is scoped under the theme class, with no !important or nowrap', () => {
    const css = read('styles/clarity-components.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const scope = ['html.theme', 'clarity'].join('-');
    const groups = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => m[1].includes('.x-tld'));
    expect(groups.length).toBeGreaterThanOrEqual(35);
    for (const [, selectors, body] of groups) {
      for (const sel of selectors.split(',').filter(s => s.includes('.x-tld'))) expect(sel.trim().startsWith(`${scope} .x-`), sel).toBe(true);
      expect(body, selectors).not.toMatch(/!important|nowrap/);
    }
  });

  it('flag OFF: the classic shell still renders the classic Teaching Load tab', () => {
    expect(read('pages/dashboards/admin/AdminDashboard.jsx')).toMatch(/page === 'teaching-load' && <TeachingLoadTab \/>/);
    expect(read('components/clarity/admin/ClarityAdminLayout.jsx')).toMatch(/page === 'teaching-load' && <ClarityAdminTeachingLoadTab \/>/);
  });
});
