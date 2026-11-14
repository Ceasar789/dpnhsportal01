// G11b: the approved accessibility and dark-mode fixes from the G11 audit,
// pinned on the stylesheet and source text. Finding numbers follow the audit.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const norm = t => t.replace(/\r\n/g, '\n');
const components = norm(readFileSync(join(here, 'clarity-components.css'), 'utf8'));
const contrast = norm(readFileSync(join(here, 'classic-contrast.css'), 'utf8'));
const src = rel => norm(readFileSync([join(here, '..', rel)].find(existsSync), 'utf8'));
const P = `html.${['theme', 'clarity'].join('-')}`;
const start = components.indexOf('/* G11b:');
const block = components.slice(start, components.indexOf('/* G9a:'));
const rule = text => expect(block, text).toContain(text);

describe('placement', () => {
  it('after the last reduced-motion block, before the G9a and M2 sections', () => {
    expect(start).toBeGreaterThan(components.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(start).toBeLessThan(components.indexOf('/* G9a:'));
    expect(components.indexOf('/* G9a:')).toBeLessThan(components.indexOf('/* M2: Teacher Learning Materials'));
  });

  it('top-level rules only, every selector scoped to the theme class, no !important, no motion', () => {
    const body = block.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(body).not.toMatch(/@media|!important|transition|animation/);
    for (const [, sel] of body.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      for (const s of sel.split(',').map(x => x.trim())) expect(s, s).toMatch(new RegExp(`^${P.replace('.', '\\.')}(\\.dark)? \\.`));
    }
  });
});

describe('Clarity stylesheet fixes', () => {
  it('#1 the classic nav rule no longer paints the Settings subnav', () => {
    rule(`${P} .x-set-nav { height: auto; padding: 0; background: none; box-shadow: none; z-index: auto; }`);
  });
  it('#3 native selects and date pickers follow dark mode', () => {
    rule(`${P}.dark .x-app, ${P}.dark .x-back, ${P}.dark .modal-overlay { color-scheme: dark; }`);
  });
  it('#5 selected chips in the restyled Tasks and Worksheets bodies get dark text in dark', () => {
    rule(`${P}.dark .x-stk, ${P}.dark .x-tws { --on-accent: var(--cl-ac-t); }`);
  });
  it('#7 the selected Tasks chip has a visible ring', () => {
    rule(`${P} .x-stk [aria-label="Filter tasks"] > button:focus-visible { outline: 2px solid var(--cl-tx); outline-offset: 2px; }`);
  });
  it('#8 #9 the focus ring takes the accent in dark', () => {
    rule(`${P}.dark .x-app :focus-visible, ${P}.dark .x-back :focus-visible { outline-color: var(--cl-ac); }`);
  });
  it('#10 the tab scroller leaves room for the ring without moving its tabs', () => {
    rule(`${P} .x-usr-tabs { padding: 4px 4px 6px; margin: -4px -4px 12px; scroll-padding-inline: 4px; }`);
    // The grade tabs keep their own 8px gap below (4px margin + the 4px of extra padding).
    rule(`${P} .x-tld-grades { margin-bottom: 4px; }`);
  });
  it('#11 sidebar items and the Settings subnav draw their ring inside', () => {
    rule(`${P} .x-side .x-nav:focus-visible, ${P} .x-set-nav button:focus-visible { outline-offset: -2px; }`);
  });
  it('#13 the selected grade count badge', () => {
    rule(`${P} .x-tld-grades button.on .x-tld-n { background: var(--cl-ac); }`);
  });
  it('#15 placeholders: --cl-mu for the classic inputs, --cl-dim for the Clarity search and inputs', () => {
    rule(`${P} .x-content input::placeholder, ${P} .x-content textarea::placeholder { color: var(--cl-mu); }`);
    rule(`${P} .x-content .x-search input::placeholder, ${P} .x-content .x-input::placeholder { color: var(--cl-dim); }`);
    expect(block.indexOf('.x-search input::placeholder')).toBeGreaterThan(block.indexOf('.x-content input::placeholder'));
  });
  it('#17 the file picker label shows focus', () => {
    rule(`${P} .x-tlp .border-dashed:focus-within label[for] { outline: 2px solid var(--cl-ac); outline-offset: 2px; }`);
  });
  it('#20 the skip link: 44px, hidden off-screen until focused, then shown with a ring', () => {
    expect(block).toMatch(new RegExp(`${P.replace('.', '\\.')} \\.x-skip \\{[^}]*position: fixed;[^}]*min-height: 44px;[^}]*transform: translateY\\(-200%\\); \\}`));
    rule(`${P} .x-skip:focus { transform: none; outline: 2px solid var(--cl-ac); outline-offset: 2px; }`);
    rule(`${P} .x-content:focus { outline: none; }`);
  });
});

describe('classic-contrast.css (inline-styled classic markup, !important)', () => {
  it('#4 admin Profile Change Password in dark (the teacher shell keeps its own fix)', () => {
    expect(contrast).toContain('html.dark .x-app:not(.x-tch) .x-content button.mt-auto:has(> .lucide-lock) { color: var(--cl-ac) !important; }');
  });
  it('#12 the Profile Active status in light', () => {
    expect(contrast).toContain('html:not(.dark) .x-app .x-content .text-left > .justify-between > span[style*="capitalize"] { color: var(--cl-ok) !important; }');
  });
  it('#6 Worksheets stat labels', () => {
    expect(contrast).toContain('.x-app .x-tws .grid > .rounded-xl.p-4 > p.text-xs.mb-1:first-child { color: var(--cl-mu) !important; }');
  });
  it('#5 Worksheets selected filter chips in dark (inline white text)', () => {
    expect(contrast).toContain('html.dark .x-app .x-tws [role="group"][aria-label^="Filter worksheets"] > button[aria-pressed="true"] { color: var(--cl-ac-t) !important; }');
  });
  it('scoped to Clarity-only classes, never the theme class literal, imported by the admin and teacher shells', () => {
    const rules = [...contrast.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)].map(m => m[1].trim());
    expect(rules).toHaveLength(4);
    for (const r of rules) expect(r, r).toContain('.x-app');
    expect(contrast).not.toContain(['theme', 'clarity'].join('-'));
    expect(src('components/clarity/admin/ClarityAdminLayout.jsx')).toContain("import '../../../styles/classic-contrast.css';");
    expect(src('components/clarity/teacher/ClarityTeacherLayout.jsx')).toContain("import '../../../styles/classic-contrast.css';");
  });
});

describe('#20 in the sources', () => {
  it.each(['admin/ClarityAdminLayout.jsx', 'teacher/ClarityTeacherLayout.jsx', 'student/ClarityStudentLayout.jsx'])('%s: skip link first inside .x-app, main is its target', (file) => {
    const s = src(`components/clarity/${file}`);
    const app = s.indexOf('<div className="x-app');
    const skip = s.indexOf('<a href="#x-main" className="x-skip"');
    expect(skip).toBeGreaterThan(app);
    expect(s.slice(app, skip)).not.toMatch(/<(a|button|input|select|textarea)\b/);
    expect(s).toContain('Skip to content</a>');
    expect(s).toContain('<main ref={mainRef} id="x-main" tabIndex={-1} className="x-content">');
  });
});
