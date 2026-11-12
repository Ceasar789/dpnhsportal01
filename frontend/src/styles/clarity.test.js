// Clarity phase 1: the design tokens are present, exact, scoped and inert.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(here, '..');
const css = readFileSync(join(here, 'clarity.css'), 'utf8');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
  selector: sel.trim(),
  vars: Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()])),
}));
const light = rules.find(r => r.selector === 'html.theme-clarity')?.vars;
const dark = rules.find(r => r.selector === 'html.theme-clarity.dark')?.vars;

// Handoff README section 3 (and alt.css .alt.va / .alt.va.dark), verbatim.
const HANDOFF_LIGHT = {
  // dim and ok were darkened from #7d86a0 and #12805c for WCAG AA contrast (owner-approved on 2026-11-11).
  bg: '#f6f7fb', card: '#fff', side: '#fff', bd: '#e7e9f1', bd2: '#d6dae8', tx: '#0f162b', mu: '#545b6d', dim: '#68718c',
  // c2 and c3 darkened from #00a9c9 and #e8a600 for 3:1 non-text contrast (owner-approved 2026-11-11).
  ac: '#3d34e0', 'ac-s': '#eeedfd', 'ac-t': '#fff', c1: '#3d34e0', c2: '#0096b3', c3: '#b87d00',
  ok: '#117a58', 'ok-s': '#e3f5ee', wa: '#885d03', 'wa-s': '#fdf1d3', er: '#c4311f', 'er-s': '#fde9e6',
  r: '12px', sh: '0 1px 2px rgba(20,27,52,.04)', shh: '0 10px 28px rgba(20,27,52,.09)',
  'side-tx': '#566079', 'side-on': '#eeedfd', 'side-on-tx': '#3d35b5', 'side-bd': '#e7e9f1', 'side-head': '#0f162b', 'side-hov': '#f3f4f9',
  ease: 'cubic-bezier(.2,.8,.2,1)',
};
const HANDOFF_DARK = {
  bg: '#0c0f1c', card: '#141830', side: '#10132a', bd: '#232845', bd2: '#32385c', tx: '#eceefb', mu: '#a1a8c6', dim: '#7e86a8',
  ac: '#9a94ff', 'ac-s': '#23265a', 'ac-t': '#0c0f1c', c1: '#9a94ff', c2: '#38d0ee', c3: '#ffc542',
  ok: '#4fd1a1', 'ok-s': '#12332a', wa: '#f5c451', 'wa-s': '#3a2f10', er: '#ff8a7a', 'er-s': '#3b1a17',
  sh: 'none', shh: '0 12px 32px rgba(0,0,0,.45)',
  'side-tx': '#a1a8c6', 'side-on': '#23265a', 'side-on-tx': '#c9c6ff', 'side-bd': '#1b1c38', 'side-head': '#eceefb', 'side-hov': '#191d3a',
};

const full = h => (h.length === 4 ? `#${[...h.slice(1)].map(c => c + c).join('')}` : h).toLowerCase();
const rgb = h => [1, 3, 5].map(i => parseInt(full(h).slice(i, i + 2), 16));
const hex = c => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, p, b) => hex(rgb(a).map((v, i) => v * p + rgb(b)[i] * (1 - p)));
const alpha = (a, p) => `rgba(${rgb(a).join(', ')}, ${p})`;
const lum = h => {
  const [r, g, b] = rgb(h).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const v = (t, k) => t[`--cl-${k}`];

describe('clarity.css: scope and safety', () => {
  it('has exactly the two scoped blocks, and every rule starts with html.theme-clarity', () => {
    expect(rules.map(r => r.selector)).toEqual(['html.theme-clarity', 'html.theme-clarity.dark']);
    for (const { selector } of rules) expect(selector.startsWith('html.theme-clarity')).toBe(true);
  });

  it('declares only --cl- variables, and light and dark declare the same set', () => {
    for (const t of [light, dark]) for (const k of Object.keys(t)) expect(k.startsWith('--cl-')).toBe(true);
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it('uses no color-mix, backdrop-filter, !important, @import, keyframes, font files or element rules', () => {
    expect(bare).not.toMatch(/color-mix|backdrop-filter|!important|@import|@keyframes|@font-face|url\(/i);
    expect(bare.match(/@/g)).toBeNull();
  });
});

describe('clarity.css: values match the handoff exactly', () => {
  it.each(Object.entries(HANDOFF_LIGHT))('light --cl-%s = %s', (k, want) => {
    expect(v(light, k)).toBe(want);
  });
  it.each(Object.entries(HANDOFF_DARK))('dark --cl-%s = %s', (k, want) => {
    expect(v(dark, k)).toBe(want);
  });
  it('radius and easing carry over to dark unchanged, and the font stack lists Inter then system fonts', () => {
    expect(v(dark, 'r')).toBe(HANDOFF_LIGHT.r);
    expect(v(dark, 'ease')).toBe(HANDOFF_LIGHT.ease);
    for (const t of [light, dark]) expect(v(t, 'font')).toBe("'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif");
  });
});

describe('clarity.css: pre-computed color-mix() results', () => {
  const FORMULAS = {
    'top-bg': t => alpha(v(t, 'bg'), 0.86),
    'tabbar-bg': t => alpha(v(t, 'card'), 0.9),
    'focus-ring': t => alpha(v(t, 'ac'), 0.18),
    'btn-hover': t => mix(v(t, 'card'), 0.92, v(t, 'tx')),
    'pri-hover': t => mix(v(t, 'ac'), 0.88, '#000000'),
    'pri-shadow': t => alpha(v(t, 'ac'), 0.32),
    'dng-hover': t => mix(v(t, 'er'), 0.88, '#000000'),
    'row-hover': t => alpha(v(t, 'ac-s'), 0.55),
    'table-hover': t => alpha(v(t, 'ac-s'), 0.5),
    'cal-hover': t => alpha(v(t, 'ac-s'), 0.45),
    'modal-foot-bg': t => mix(v(t, 'bg'), 0.6, v(t, 'card')),
    'cal-out-bg': t => mix(v(t, 'bg'), 0.55, v(t, 'card')),
    'feat-art-end': t => mix(v(t, 'ac'), 0.4, '#ffc542'),
  };
  it.each(Object.keys(FORMULAS))('--cl-%s equals its formula in light and dark', (k) => {
    expect(v(light, k)).toBe(FORMULAS[k](light));
    expect(v(dark, k)).toBe(FORMULAS[k](dark));
  });
});

describe('clarity.css: WCAG contrast (normal text needs 4.5:1)', () => {
  const PAIRS = [['tx', 'bg'], ['tx', 'card'], ['mu', 'card'], ['ac-t', 'ac'], ['ac', 'ac-s'],
    ['ok', 'ok-s'], ['wa', 'wa-s'], ['er', 'er-s'], ['side-on-tx', 'side-on']];
  for (const [mode, t] of [['light', light], ['dark', dark]]) {
    it.each(PAIRS)(`${mode}: --cl-%s on --cl-%s`, (fg, bg) => {
      expect(ratio(v(t, fg), v(t, bg))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('light: --cl-dim reads at 4.5:1 on card and on bg, and stays lighter than --cl-mu', () => {
    expect(ratio(v(light, 'dim'), v(light, 'card'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(v(light, 'dim'), v(light, 'bg'))).toBeGreaterThanOrEqual(4.5);
    expect(lum(v(light, 'dim'))).toBeGreaterThan(lum(v(light, 'mu')));
  });
});

describe('clarity theme is inert', () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  it('no source file under frontend/src applies the theme-clarity class yet', () => {
    const offenders = walk(SRC)
      .filter(p => /\.(jsx?|tsx?|html|css)$/.test(p))
      .filter(p => !/[\\/](clarity|clarity-components)\.css$|[\\/]clarity(Components)?\.test\.js$|[\\/]components[\\/]clarity[\\/]student[\\/]ClarityStudentLayout\.jsx$|[\\/]components[\\/]clarity[\\/]admin[\\/]ClarityAdminLayout\.jsx$|[\\/]components[\\/]clarity[\\/]teacher[\\/]ClarityTeacherLayout\.jsx$/.test(p))
      .filter(p => readFileSync(p, 'utf8').includes('theme-clarity'));
    expect(offenders).toEqual([]);
    expect(readFileSync(join(SRC, '..', 'index.html'), 'utf8')).not.toContain('theme-clarity');
  });
});
