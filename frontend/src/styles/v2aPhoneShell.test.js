// V2a: shared phone layout and navigation, pinned on the stylesheet and
// source text (jsdom computes no layout; the browser checks measure it).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = rel => readFileSync(join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');
const P = `html.${['theme', 'clarity'].join('-')}`;
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const bodyAt = (text, at) => {
  let i = text.indexOf('{', at) + 1; let depth = 1; const start = i;
  while (depth) { if (text[i] === '{') depth += 1; else if (text[i] === '}') depth -= 1; i += 1; }
  return text.slice(start, i - 1);
};
const LAYOUTS = ['components/clarity/admin/ClarityAdminLayout.jsx', 'components/clarity/teacher/ClarityTeacherLayout.jsx',
  'components/clarity/student/ClarityStudentLayout.jsx'];

// WCAG relative luminance contrast of two #rrggbb colours.
const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

describe('top-title.css: one-line page title in the phone top bar', () => {
  const css = read('styles/top-title.css');
  const body = strip(css);

  it('clamps to one line with an ellipsis, never white-space: nowrap', () => {
    expect(body).toMatch(/\.x-top \.x-top-title \{[^}]*-webkit-line-clamp: 1;[^}]*overflow: hidden;/);
    expect(body).toContain('-webkit-box-orient: vertical;');
    expect(body).toContain('min-width: 0;');
    expect(body).not.toMatch(/white-space/);
  });

  it('only the title gives way on a narrow bar: the other top-bar items never shrink below 44px', () => {
    expect(body).toMatch(/@media \(max-width: 1023\.98px\) \{\s*\.x-top > :not\(\.x-top-title\) \{ flex-shrink: 0; \}\s*\}/);
  });

  it('hidden from 1024px (the sidebar is visible there); no theme literal, no !important, no motion', () => {
    expect(body).toMatch(/@media \(min-width: 1024px\) \{\s*\.x-top \.x-top-title \{ display: none; \}\s*\}/);
    expect(css).not.toContain(['theme', 'clarity'].join('-'));
    expect(body).not.toMatch(/!important|transition|animation|@import|url\(/);
    for (const [, name] of body.matchAll(/var\((--[\w-]+)/g)) expect(name).toMatch(/^--cl-/);
  });

  it.each(LAYOUTS)('%s imports it and renders the title between the menu button and the spacer', (file) => {
    const src = read(file);
    expect(src).toContain("import '../../../styles/top-title.css';");
    // SHELL: the header is the shared ClarityTopBar (one component for the three shells).
    expect(src).toMatch(/<ClarityTopBar[\s\S]*?pageTitle=\{pageTitle\}[\s\S]*?\/>/);
    const bar = read('components/clarity/ClarityTopBar.jsx');
    const top = bar.slice(bar.indexOf('<header ref={headerRef} className="x-top">'), bar.indexOf('</header>'));
    const menu = top.indexOf('x-menubtn');
    const title = top.indexOf('className="x-top-title" title={pageTitle} aria-hidden="true"');
    expect(menu).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(menu);
    expect(top.indexOf('<span className="x-sp" />')).toBeGreaterThan(title);
  });
});

describe('clarity-components.css additions', () => {
  const raw = read('styles/clarity-components.css');
  const css = strip(raw);
  const g10 = raw.indexOf('/* G10: phones first');
  const g10Phone = bodyAt(raw, raw.indexOf('@media (max-width: 767px) {', g10));
  const landscape = bodyAt(raw, raw.indexOf('@media (max-width: 1023.98px) and (max-height: 500px) {'));

  it('a search input fills its box, so the whole box takes the tap', () => {
    expect(css).toContain(`${P} .x-search input { flex: 1; align-self: stretch;`);
  });

  it('search boxes are a 44px tap area on phones, portrait and landscape', () => {
    expect(g10Phone).toContain(`${P} .x-search { min-height: 44px; }`);
    expect(landscape).toContain(`${P} .x-search { min-height: 44px; }`);
  });

  it('drawer items are 44px on landscape phones too', () => {
    expect(landscape).toContain(`${P} .x-nav { min-height: 44px; }`);
  });

  it('sideways rows get scroll shadows on phones (page-colour covers move, edges stay)', () => {
    const rule = g10Phone.slice(g10Phone.indexOf(`${P} .x-usr-tabs, ${P} .x-set-layout > .x-set-nav {`));
    const decl = rule.slice(0, rule.indexOf('}'));
    expect(decl).toMatch(/var\(--cl-bg\) 30%, transparent\) left \/ 40px 100% no-repeat local/);
    expect(decl).toMatch(/var\(--cl-bg\) 30%, transparent\) right \/ 40px 100% no-repeat local/);
    // D7: a subtle edge (border colour, 10px), tuned from the screenshots.
    expect(decl).toMatch(/var\(--cl-bd2\), transparent\) left \/ 10px 100% no-repeat scroll/);
    expect(decl).toMatch(/var\(--cl-bd2\), transparent\) right \/ 10px 100% no-repeat scroll/);
    // Outranks the G11b "background: none" on the Settings nav.
    expect(raw.indexOf(`${P} .x-set-nav { height: auto; padding: 0; background: none;`)).toBeGreaterThan(-1);
  });
});

describe('landscape phones: 16px text fields for classic forms and auth pages', () => {
  it('the global field rule covers phones held sideways', () => {
    const css = read('styles/index.css');
    expect(css).toMatch(/@media \(max-width: 767px\), \(max-width: 1023\.98px\) and \(max-height: 500px\) \{\s*:root :is\([\s\S]*?\)\s*\{\s*font-size: 16px;\s*\}\s*\}/);
  });
});

describe('selected tab stays in view', () => {
  it.each([
    ['components/clarity/admin/ClarityAdminUsersTab.jsx', 'roleTabsRef', 'roleFilter', 'className="x-usr-tabs"'],
    ['components/clarity/admin/ClarityAdminSettingsTab.jsx', 'sectionNavRef', 'activeSettingsSub', 'className="x-set-nav"'],
  ])('%s', (file, ref, dep, cls) => {
    const src = read(file);
    expect(src).toContain(`useEffect(() => { centerSelectedInRow(${ref}.current); }, [${dep}]);`);
    expect(src).toContain(`ref={${ref}} ${cls}`);
  });
});

describe('public pages', () => {
  it('the header Login button reads at least 4.5:1 (white on green)', () => {
    const src = read('components/PublicHeader.jsx');
    const bg = src.match(/LoginButton[\s\S]*?backgroundColor: '(#[0-9a-fA-F]{6})'/)[1];
    expect(contrast('#ffffff', bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('the phone link row wraps (200% text) and the bar grows with it', () => {
    const src = read('components/PublicHeader.jsx');
    expect(src).toContain('minHeight: isMobile ? PUBLIC_HEADER_HEIGHT.mobile : PUBLIC_HEADER_HEIGHT.desktop,');
    expect(src).not.toMatch(/\bheight: isMobile \?/);
    expect(src).toContain('<div className="flex flex-wrap items-center gap-1">');
  });

  it('Login: the Terms and Privacy links never break across lines', () => {
    const src = read('pages/public/Login.jsx');
    expect(src).toMatch(/<a href="\/terms" className="whitespace-nowrap /);
    expect(src).toMatch(/<a href="\/privacy" className="whitespace-nowrap /);
  });
});

describe('classic dark accent (classic-contrast.css, loaded for the whole app)', () => {
  it('accent text in the classic dashboards takes the light dark-mode accent', () => {
    const css = read('styles/classic-contrast.css');
    expect(css).toContain('html.dark .dashboard-shell:not(.x-tch-classic) :is(.sidebar-item.active, .sidebar-sub.active, .btn-ghost, .edit-action, .archive-toggle:hover, .archive-toggle.active, .teacher-option-avatar, .teacher-summary-avatar, .teaching-empty-icon, .subject-chip-state, .grade-tab.active, .news-action.blue, .cal-agenda-today, .settings-hint a, .teacher-sidebar-link-active, .student-sidebar-link-active, [style^="color: var(--accent)"], button.mt-auto:has(> .lucide-lock)) { color: var(--heading-accent) !important; }');
    expect(read('main.jsx')).toContain("import './styles/classic-contrast.css';");
  });

  it('the light dark-mode accent reads 4.5:1 on the darkest classic dark surfaces', () => {
    const css = read('styles/index.css');
    const dark = css.slice(css.indexOf(':root.dark {'), css.indexOf('}', css.indexOf(':root.dark {')));
    const accent = dark.match(/--heading-accent: (#[0-9a-f]{6})/i)[1];
    for (const token of ['--bg', '--sidebar-bg', '--card-bg', '--card2']) {
      const value = dark.match(new RegExp(`${token}: (#[0-9a-f]{6})`, 'i'));
      expect(value, token).toBeTruthy();
      expect(contrast(accent, value[1]), token).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('teacher Overview: the Getting started card sits outside the copied lines', () => {
  const src = read('components/clarity/teacher/ClarityTeacherOverviewTab.jsx');
  it('after the last TEMPORARY copy, before the error card, in the order classes, task, distribute, submissions', () => {
    const copyEnd = src.lastIndexOf('// ---- end of the copy ----');
    const steps = src.indexOf('const firstSteps = [');
    const card = src.indexOf('<GettingStartedCard role="teacher" uid={userData?.uid} steps={firstSteps} />');
    expect(steps).toBeGreaterThan(copyEnd);
    expect(card).toBeGreaterThan(src.indexOf('<h1 className="x-h1">Dashboard Overview</h1>'));
    expect(card).toBeLessThan(src.indexOf('{overviewError && ('));
    const ids = [...src.slice(steps, src.indexOf('];', steps)).matchAll(/id: '([\w-]+)'/g)].map(m => m[1]);
    expect(ids).toEqual(['classes', 'task', 'distribute', 'submissions']);
    expect(src).toContain("go: go('/teacher-dashboard/students')");
    // D8: Check submissions opens Grading, where the scores are given.
    expect(src).toContain("{ id: 'submissions', title: 'Check submissions', text: 'See who turned in work and give scores.', action: 'Open Grading', go: go('/teacher-dashboard/grades') },");
  });
  it('no lesson plans yet: one clear button to create the first one', () => {
    expect(src).toMatch(/<p>No lesson plans yet\.<\/p>\s*<button type="button" className="x-btn pri"[^>]*onClick=\{go\('\/teacher-dashboard\/lesson-plans'\)\}>Create your first lesson plan<\/button>/);
  });
});

describe('student Profile fields: the form kit calm ring, no halo (D6)', () => {
  const css = read('styles/clarity-components.css');
  const tokens = read('styles/clarity.css');
  it('removes the 3px halo and draws a 2px soft ring 1px out, above the dark-mode ring colour', () => {
    expect(css).toContain(`${P} .x-sprof .x-input:focus { box-shadow: none; }`);
    expect(css).toContain(`${P} .x-app .x-sprof .x-input:focus-visible { outline: 2px solid var(--cl-ring-soft); outline-offset: 1px; }`);
    // Must come before the reduced-motion block (main section), not in the pinned own blocks.
    expect(css.indexOf(`${P} .x-app .x-sprof .x-input:focus-visible`)).toBeLessThan(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  });
  it('the soft ring matches the form kit tints in light and dark', () => {
    const blocks = tokens.split(`${P}.dark`);
    expect(blocks[0]).toContain('--cl-ring-soft: rgba(61, 52, 224, 0.6);');
    expect(blocks[1]).toContain('--cl-ring-soft: rgba(154, 148, 255, 0.7);');
    const kit = read('styles/form-kit.css');
    expect(kit).toContain('--fk-ring: rgba(61, 52, 224, 0.6);');
    expect(kit).toContain('--fk-ring: rgba(154, 148, 255, 0.7);');
  });
});
