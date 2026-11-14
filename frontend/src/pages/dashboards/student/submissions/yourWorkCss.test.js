// @vitest-environment jsdom
// S3: the Your work panel's stylesheet and the graph columns it relies on.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SUBMISSION_SCORE_FIELDS, SUBMISSION_STATE_FIELDS } from '../../../../lib/studentTaskGraph';

const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`].find(existsSync), 'utf8').replace(/\r\n/g, '\n');
const css = read('pages/dashboards/student/submissions/your-work.css');
const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rule = sel => body.match(new RegExp(`(^|\\n)${sel.replace(/[.[\]$"=-]/g, m => `\\${m}`)} \\{([^}]*)\\}`))?.[2] ?? '';

describe('your-work.css', () => {
  it('is imported by the panel only, and nothing goes into the shared stylesheets', () => {
    expect(read('pages/dashboards/student/submissions/YourWorkPanel.jsx')).toContain("import './your-work.css';");
    for (const shared of ['styles/clarity-components.css', 'styles/index.css']) {
      expect(read(shared), shared).not.toMatch(/\.yw[-\s{.]|your-work/);
    }
  });

  it('never names the theme class, never uses !important, and scopes every rule to the panel', () => {
    expect(css).not.toContain(['theme', 'clarity'].join('-'));
    expect(body).not.toContain('!important');
    const selectors = [...body.replace(/@media[^{]*\{/g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(m => m[1].split(','))
      .map(s => s.trim()).filter(Boolean);
    expect(selectors.length).toBeGreaterThan(20);
    for (const s of selectors) expect(s, s).toMatch(/^(textarea)?\.yw\b/);
  });

  it('colours come from the dashboard tokens (Clarity first, classic fallback)', () => {
    const literals = [...body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
    // The only literals are the classic fallbacks of the primary button, as in the shared Btn.
    expect([...new Set(literals)].sort()).toEqual(['#1908DF', '#ffffff']);
    expect(body).toContain('var(--cl-card, var(--card-bg))');
    expect(body).toContain('var(--cl-er, var(--red))');
  });

  it('phone targets: every control at least 44px, inputs at 16px', () => {
    expect(rule('.yw-kind')).toMatch(/min-height: 44px;/);
    expect(rule('.yw-input')).toMatch(/min-height: 44px;[\s\S]*font-size: 16px;/);
    expect(rule('.yw .yw-btn')).toMatch(/min-height: 44px;/);
    expect(rule('.yw-fallback a')).toMatch(/min-height: 44px;/);
    expect(body).toMatch(/\.yw \[data-testid\$="-dropzone"\] label\[for\],\n\.yw \[data-testid\$="-dropzone"\] button \{ min-height: 44px; \}/);
  });

  it('visible focus on every control, and reduced motion removes the hover transition', () => {
    expect(body).toContain('.yw-input:focus-visible { outline: 2px solid');
    expect(body).toContain('.yw button:focus-visible { outline: 2px solid');
    expect(body).toContain('.yw-kind:focus-within { outline: 2px solid');
    expect(body).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.yw \.yw-btn,\s*\.yw button \{ transition: none; \}\s*\}/);
    expect(body).not.toMatch(/animation|@keyframes/);
  });
});

describe('the shared student graph', () => {
  it('reads the mode and the maximum with each task', () => {
    expect(read('lib/studentTaskGraph.js')).toContain(".select('id, title, subject, task_type, subject_id, items, instructions, submission_mode, max_points')");
  });

  it('still never reads a score or remarks outside the released-only query', () => {
    expect(SUBMISSION_STATE_FIELDS).toBe('id, worksheet_id, status, released, is_late, submitted_at');
    expect(SUBMISSION_SCORE_FIELDS).toBe('worksheet_id, score, total_points');
    expect(read('lib/studentTaskGraph.js')).toContain(".select(SUBMISSION_SCORE_FIELDS)\n      .eq('student_id', studentId).eq('released', true)");
    expect(read('lib/studentTaskGraph.js')).not.toContain('remarks');
  });
});
