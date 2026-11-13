// L1: the About page's reveal CSS. It hides nothing unless .reveal-on is on
// the page, animates opacity and transform only, and reduced motion shows
// everything.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const raw = readFileSync(join(here, 'index.css'), 'utf8').replace(/\r\n/g, '\n');
const start = raw.indexOf('/* ===== L1: About page reveal-on-scroll');
const block = raw.slice(start).replace(/\/\*[\s\S]*?\*\//g, '');

describe('About reveal CSS', () => {
  it('is appended at the end, after the global reduced-motion block', () => {
    expect(start).toBeGreaterThan(raw.indexOf('@media (prefers-reduced-motion: reduce)'));
  });

  it('every rule is scoped under .reveal-on [data-reveal]', () => {
    const selectors = [...block.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m => m[1].replace(/^[\s\S]*\{/, '').trim());
    expect(selectors.length).toBe(3);
    for (const sel of selectors) expect(sel.startsWith('.reveal-on [data-reveal]'), sel).toBe(true);
  });

  it('transitions opacity and transform only, with the stagger as the delay', () => {
    expect(block).toContain('transition-property: opacity, transform;');
    expect(block).toContain('transition-delay: var(--reveal-delay, 0ms);');
    expect(block).not.toMatch(/\b(top|left|height|width|margin|padding):/);
  });

  it('hides only items not yet revealed, and reduced motion shows them', () => {
    expect(block).toMatch(/\.reveal-on \[data-reveal\]:not\(\.is-in\) \{\s*opacity: 0;\s*transform: translateY\(16px\);\s*\}/);
    expect(block).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.reveal-on \[data-reveal\]:not\(\.is-in\) \{ opacity: 1; transform: none; \}\s*\}/);
  });
});
