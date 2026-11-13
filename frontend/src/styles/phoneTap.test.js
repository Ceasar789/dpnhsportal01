// G9a: three small phone fixes, pinned on the stylesheet text.
// 1. The admin Profile's "Change Password" (shared classic ProfileTab) gets a
//    44px tap target in the Clarity shells, on phones and landscape phones only.
// 2. The classic teacher Toast sits at the bottom on phones when a Clarity
//    teacher tab that uses it is on screen; Attendance's save-bar toast does not move.
// 3. Public header brand and footer links get an invisible 44px hit area on phones.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const norm = t => t.replace(/\r\n/g, '\n');
const components = norm(readFileSync(join(here, 'clarity-components.css'), 'utf8'));
const tap = norm(readFileSync(join(here, 'phone-tap.css'), 'utf8'));
const src = rel => norm(readFileSync([join(here, '..', rel)].find(existsSync), 'utf8'));
const P = `html.${['theme', 'clarity'].join('-')} `;
const PHONE = '@media (max-width: 767px)';
const LANDSCAPE = '@media (max-width: 1023.98px) and (max-height: 500px)';

describe('1. admin Profile "Change Password" (Clarity stylesheet)', () => {
  const at = components.indexOf('/* G9a:');
  const block = components.slice(at, components.indexOf('/* M2: Teacher Learning Materials'));

  it('sits after the last reduced-motion block and before the M2 section', () => {
    expect(at).toBeGreaterThan(components.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(at).toBeLessThan(components.indexOf('/* M2: Teacher Learning Materials'));
  });

  it('44px on phones and landscape phones only; nothing at the top level', () => {
    const rule = `${P}.x-content button:has(> .lucide-lock) { min-height: 44px; }`;
    expect(block).toContain(`${PHONE} {\n  ${rule}\n}`);
    expect(block).toContain(`${LANDSCAPE} {\n  ${rule}\n}`);
    const outside = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{[^{}]*\{[^{}]*\}\s*\}/g, '').trim();
    expect(outside).toBe('');
  });
});

describe('2. teacher toast (phone-tap.css)', () => {
  it('on phones, the classic toast of a Clarity teacher tab sits at the bottom above the safe area', () => {
    expect(tap).toContain(`${PHONE} {\n  html:has(.x-tch .x-tlm, .x-tch .x-tgr, .x-tch .x-tst, .x-tch .x-tat) body > [data-modal-live-region] > div:not([data-attendance-toast]) {\n    top: auto;\n    bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);\n  }\n}`);
  });

  it("Attendance's save-bar toast is excluded and still renders with that marker", () => {
    expect(tap).toContain(':not([data-attendance-toast])');
    expect(src('components/clarity/teacher/ClarityTeacherAttendanceTab.jsx')).toContain('data-attendance-toast="top"');
  });

  it('the four tabs named in the selector are the Clarity teacher tabs that render the classic Toast', () => {
    for (const [file, root] of [['Materials', 'x-tlm'], ['Grading', 'x-tgr'], ['Students', 'x-tst'], ['Attendance', 'x-tat']]) {
      const s = src(`components/clarity/teacher/ClarityTeacher${file}Tab.jsx`);
      expect(s, file).toContain(`<div className="${root}">`);
      expect(s, file).toMatch(/<Toast toast=\{toast\} \/>/);
    }
    expect(src('components/clarity/teacher/ClarityTeacherAnnouncementsTab.jsx')).not.toContain('<Toast');
  });
});

describe('3. public header and footer hit areas (phone-tap.css)', () => {
  const media = '@media (max-width: 767px), (max-width: 1099.98px) and (max-height: 500px) {';
  const block = tap.slice(tap.indexOf(media));

  it('only inside the phone and landscape-phone query', () => {
    expect(tap.indexOf(media)).toBeGreaterThan(-1);
    expect(tap.indexOf('.public-shell')).toBeGreaterThan(tap.indexOf(media));
  });

  it('footer links: an invisible, centred area at least 44px each way; nothing visible changes', () => {
    expect(block).toMatch(/\.public-shell footer a::after \{\s*content: '';\s*position: absolute;\s*left: 50%;\s*top: 50%;\s*width: max\(100%, 44px\);\s*height: max\(100%, 44px\);\s*transform: translate\(-50%, -50%\);\s*\}/);
  });

  it('brand link: a 44px area that grows upward only (clear of the link row below)', () => {
    expect(block).toMatch(/\.public-shell nav a\[aria-label="EduScribe home"\]::after \{\s*content: '';\s*position: absolute;\s*left: 0;\s*right: 0;\s*bottom: 0;\s*height: max\(100%, 44px\);\s*\}/);
  });

  it('no colour, size or spacing changes, and no transitions', () => {
    const bodies = [...block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\{([^{}]*)\}/g)].map(m => m[1]).join(';');
    const decls = [...bodies.matchAll(/([a-z-]+)\s*:/g)].map(m => m[1]);
    expect(decls.length).toBeGreaterThan(10);
    for (const d of decls) expect(['position', 'content', 'left', 'right', 'top', 'bottom', 'width', 'height', 'transform', 'max-height', 'max-width'], d).toContain(d);
  });
});

describe('loading the stylesheet', () => {
  it('is imported by the public header, the public footer and the Clarity teacher shell', () => {
    expect(src('components/PublicHeader.jsx')).toContain("import '../styles/phone-tap.css';");
    expect(src('components/PublicFooter.jsx')).toContain("import '../styles/phone-tap.css';");
    expect(src('components/clarity/teacher/ClarityTeacherLayout.jsx')).toContain("import '../../../styles/phone-tap.css';");
  });

  it('never names the dashboard theme class (it stays inert outside its own hooks)', () => {
    expect(tap).not.toContain(['theme', 'clarity'].join('-'));
  });
});
