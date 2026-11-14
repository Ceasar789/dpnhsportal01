// S4: the review dialog's stylesheet.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`].find(existsSync), 'utf8').replace(/\r\n/g, '\n');
const css = read('pages/dashboards/teacher/worksheets/attachment-review.css');
const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rule = sel => body.match(new RegExp(`(^|\\n)${sel.replace(/[.[\]$"=-]/g, m => `\\${m}`)} \\{([^}]*)\\}`))?.[2] ?? '';

describe('attachment-review.css', () => {
  it('is imported by the dialog only, and nothing goes into the shared stylesheets', () => {
    expect(read('pages/dashboards/teacher/worksheets/AttachmentReviewModal.jsx')).toContain("import './attachment-review.css';");
    for (const shared of ['styles/clarity-components.css', 'styles/index.css']) {
      expect(read(shared), shared).not.toMatch(/\.arv[-\s{.]|attachment-review|\.ctm-form/);
    }
  });

  it('never names the theme class, never uses !important, and scopes every rule to the dialog', () => {
    expect(css).not.toContain(['theme', 'clarity'].join('-'));
    expect(body).not.toContain('!important');
    const selectors = [...body.replace(/@media[^{]*\{/g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(m => m[1].split(','))
      .map(s => s.trim()).filter(Boolean);
    expect(selectors.length).toBeGreaterThan(30);
    for (const s of selectors) expect(s, s).toMatch(/^(textarea)?\.arv\b/);
  });

  it('colours come from the dashboard tokens (the only literals are the primary button, as in the shared Btn)', () => {
    expect([...new Set([...body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]))].sort()).toEqual(['#1908DF', '#ffffff']);
    expect(rule('.arv-pill.late')).toContain('var(--badge-red-fg)');
    expect(rule('.arv-error')).toContain('var(--badge-red-fg)');
  });

  it('44px targets, 16px inputs on phones, visible focus, reduced motion', () => {
    for (const sel of ['.arv-chip', '.arv-input', '.arv-row', '.arv .arv-btn', '.arv-fallback a']) expect(rule(sel), sel).toMatch(/min-height: 44px;/);
    expect(body).toMatch(/@media \(max-width: 767px\) \{[\s\S]*?\.arv-input \{ font-size: 16px; \}[\s\S]*?\}/);
    expect(body).toMatch(/@media \(max-width: 1099\.98px\) and \(max-height: 500px\) \{\s*\.arv-input \{ font-size: 16px; \}\s*\}/);
    expect(body).toMatch(/\.arv button:focus-visible,\n\.arv-input:focus-visible,\n\.arv-title:focus-visible \{ outline: 2px solid var\(--banner-accent\); outline-offset: 2px; \}/);
    expect(body).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.arv button \{ transition: none; \}\s*\}/);
    expect(body).not.toMatch(/animation|@keyframes/);
  });

  it('phones: one column, list above the detail', () => {
    expect(body).toMatch(/@media \(max-width: 767px\) \{\s*\.arv-body \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });
});
