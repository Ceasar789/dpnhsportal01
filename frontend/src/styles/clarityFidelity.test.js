// Clarity F1: token and shell fidelity fixes from the F0b audit of the final
// designs. New values, the new --cl-in token, contrast for every changed
// pair, the three rule changes, scoping, and the Inter stylesheet link.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const strip = text => text.replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = strip(readFileSync(join(here, 'clarity.css'), 'utf8'));
const components = strip(readFileSync(join(here, 'clarity-components.css'), 'utf8'));
const indexHtml = readFileSync(join(here, '..', '..', 'index.html'), 'utf8');

const SCOPE = ['html.theme', 'clarity'].join('-');
const block = (sel) => {
  const m = tokens.match(new RegExp(`${sel.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`));
  return Object.fromEntries([...m[1].matchAll(/(--cl-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(x => [x[1], x[2].trim()]));
};
const light = block(SCOPE);
const dark = block(`${SCOPE}.dark`);
const v = (t, k) => t[`--cl-${k}`];

const full = h => (h.length === 4 ? `#${[...h.slice(1)].map(c => c + c).join('')}` : h).toLowerCase();
const rgb = h => [1, 3, 5].map(i => parseInt(full(h).slice(i, i + 2), 16));
const hex = c => `#${c.map(x => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, p, b) => hex(rgb(a).map((x, i) => x * p + rgb(b)[i] * (1 - p)));
const lum = h => {
  const [r, g, b] = rgb(h).map(x => { const c = x / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

describe('F1 token values', () => {
  it('light: the five changed values and the new --cl-in', () => {
    expect([v(light, 'tx'), v(light, 'mu'), v(light, 'side-on-tx'), v(light, 'side-head'), v(light, 'wa'), v(light, 'in')])
      .toEqual(['#0f162b', '#545b6d', '#3d35b5', '#0f162b', '#885d03', '#3e35b6']);
  });

  it('dark: the sidebar border and the new --cl-in; text tokens unchanged', () => {
    expect([v(dark, 'side-bd'), v(dark, 'in')]).toEqual(['#1b1c38', '#9a94ff']);
    expect([v(dark, 'tx'), v(dark, 'side-head')]).toEqual(['#eceefb', '#eceefb']);
  });

  it('--cl-dim is deliberately unchanged (WCAG), in light and dark', () => {
    expect([v(light, 'dim'), v(dark, 'dim')]).toEqual(['#68718c', '#7e86a8']);
  });

  it('--cl-btn-hover is the 92% card / 8% text mix in light and dark', () => {
    expect(v(light, 'btn-hover')).toBe(mix(v(light, 'card'), 0.92, v(light, 'tx')));
    expect(v(light, 'btn-hover')).toBe('#ececee');
    expect(v(dark, 'btn-hover')).toBe(mix(v(dark, 'card'), 0.92, v(dark, 'tx')));
  });
});

describe('F1 contrast (normal text, 4.5:1)', () => {
  const PAIRS = [
    ['indigo pill: --cl-in on --cl-ac-s', 'in', 'ac-s'],
    ['active nav: --cl-side-on-tx on --cl-side-on', 'side-on-tx', 'side-on'],
    ['idle nav: --cl-side-head on --cl-side', 'side-head', 'side'],
    ['danger button: --cl-ac-t on --cl-er', 'ac-t', 'er'],
  ];
  for (const [mode, t] of [['light', light], ['dark', dark]]) {
    it.each(PAIRS)(`${mode}: %s`, (_, fg, bg) => {
      expect(ratio(v(t, fg), v(t, bg))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('the danger button text is still white in light mode', () => {
    expect(full(v(light, 'ac-t'))).toBe('#ffffff');
  });
});

describe('F1 component rules', () => {
  const rule = sel => components.match(new RegExp(`${SCOPE.replace(/\./g, '\\.')} ${sel.replace(/\./g, '\\.')} \\{([^}]*)\\}`))[1];
  it('.x-nav text uses --cl-side-head; hover and active still set their own colour', () => {
    expect(rule('.x-nav')).toMatch(/color: var\(--cl-side-head\)/);
    expect(rule('.x-nav:hover')).toMatch(/color: var\(--cl-side-head\)/);
    expect(rule('.x-nav.on')).toMatch(/color: var\(--cl-side-on-tx\)/);
  });
  it('.x-badge.in uses --cl-in on --cl-ac-s', () => {
    expect(rule('.x-badge.in')).toMatch(/background: var\(--cl-ac-s\); color: var\(--cl-in\)/);
  });
  it('.x-btn.dng text uses --cl-ac-t (no hard-coded white)', () => {
    expect(rule('.x-btn.dng')).toMatch(/color: var\(--cl-ac-t\)/);
    expect(rule('.x-btn.dng')).not.toMatch(/#fff/);
  });
  it('every selector in both files is scoped under the theme class', () => {
    const preludes = text => [...text.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '').matchAll(/([^{}]+)\{/g)]
      .map(m => m[1].trim()).filter(p => p && !p.startsWith('@'));
    for (const prelude of [...preludes(tokens), ...preludes(components)]) {
      for (const sel of prelude.split(',').map(s => s.trim())) expect(sel.startsWith(SCOPE), sel).toBe(true);
    }
  });
});

describe('F1 Inter font', () => {
  it('index.html loads Inter 400-700 with display=swap, next to the preconnects', () => {
    expect(indexHtml).toContain('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">');
    expect(indexHtml).toContain('<link rel="preconnect" href="https://fonts.googleapis.com">');
    expect(indexHtml).toContain('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
  });
});
