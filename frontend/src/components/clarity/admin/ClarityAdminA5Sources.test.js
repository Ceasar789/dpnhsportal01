// Clarity A5: the new User Management CSS is scoped, and only the Clarity
// layout swaps the Users page (the classic shell keeps its own tab).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
const read = rel => readFileSync(join(SRC, rel), 'utf8');

describe('A5 sources', () => {
  it('every x-usr selector is scoped under the theme class, with no !important or nowrap', () => {
    const css = read('styles/clarity-components.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const scope = ['html.theme', 'clarity'].join('-');
    const groups = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => m[1].includes('.x-usr'));
    expect(groups.length).toBeGreaterThanOrEqual(25);
    for (const [, selectors, body] of groups) {
      for (const sel of selectors.split(',').filter(s => s.includes('.x-usr'))) expect(sel.trim().startsWith(`${scope} .x-`), sel).toBe(true);
      expect(body, selectors).not.toMatch(/!important|nowrap/);
    }
  });

  it('flag OFF: the classic shell still renders the classic Users tab', () => {
    expect(read('pages/dashboards/admin/AdminDashboard.jsx')).toMatch(/page === 'users' && <UsersTab \/>/);
    expect(read('components/clarity/admin/ClarityAdminLayout.jsx')).toMatch(/page === 'users' && <ClarityAdminUsersTab \/>/);
  });
});
