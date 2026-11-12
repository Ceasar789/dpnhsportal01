// Clarity A4: the new News/Memos CSS is scoped, and only the Clarity layout
// swaps the News and Memos pages (the classic shell keeps its own tabs).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
const read = rel => readFileSync(join(SRC, rel), 'utf8');

describe('A4 sources', () => {
  it('every x-news / x-memo rule is scoped under the theme class, with no !important or nowrap', () => {
    const css = read('styles/clarity-components.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const scope = ['html.theme', 'clarity'].join('-');
    const lines = css.split(/\r?\n/).filter(l => /\.x-(news|memo-(layout|col|card|aud|date|fields|body|stats))/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(30);
    for (const line of lines) {
      for (const sel of line.trim().split('{')[0].split(',')) expect(sel.trim().startsWith(`${scope} .x-`), line).toBe(true);
      expect(line, line).not.toMatch(/!important|nowrap/);
    }
  });

  it('flag OFF: the classic shell still renders the classic News and Memos tabs', () => {
    const dashboard = read('pages/dashboards/admin/AdminDashboard.jsx');
    expect(dashboard).toMatch(/page === 'news' && <NewsTab \/>/);
    expect(dashboard).toMatch(/page === 'memos' && <MemosTab \/>/);
    const layout = read('components/clarity/admin/ClarityAdminLayout.jsx');
    expect(layout).toMatch(/page === 'news' && <ClarityAdminNewsTab \/>/);
    expect(layout).toMatch(/page === 'memos' && <ClarityAdminMemosTab \/>/);
  });
});
