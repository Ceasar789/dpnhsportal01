// L2: the shared skeleton stylesheet, pinned on its text: transform and
// opacity motion only, sk- keyframes, a delayed reveal, a static reduced-motion
// fallback, token colours with neutral fallbacks, and none of the dashboard
// theme class (it applies everywhere).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const raw = readFileSync(join(here, 'skeleton.css'), 'utf8').replace(/\r\n/g, '\n');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?\})\s*\}/g)].map(m => [m[1], m[2]]);

describe('skeleton.css', () => {
  it('keyframes are sk- prefixed and animate only opacity or transform', () => {
    expect(keyframes.map(([n]) => n).sort()).toEqual(['sk-in', 'sk-shimmer']);
    for (const [, body] of keyframes) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map(m => m[1]);
      for (const p of props) expect(['opacity', 'transform'], p).toContain(p);
    }
  });

  it('a group appears only after 300ms (the useDelayedFlag wait) and holds its space from the start', () => {
    expect(css).toContain('.sk-in { animation: sk-in 1ms linear 300ms both; }');
  });

  it('the shimmer moves a highlight with transform; reduced motion removes it', () => {
    expect(css).toMatch(/\.sk-b::after \{[^}]*transform: translateX\(-100%\);[^}]*animation: sk-shimmer 1\.4s ease-in-out infinite;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.sk-b::after \{ display: none; animation: none; \}\s*\}/);
  });

  it('colours come from the dashboard tokens, with neutral fallbacks only', () => {
    const colours = [...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map(m => m[0].toLowerCase());
    expect(colours.sort()).toEqual(['#e5e7eb', '#f3f4f6']);
    expect(css).toContain('background: var(--cl-bd, #e5e7eb);');
    expect(css).toContain('var(--cl-side-hov, #f3f4f6)');
    expect(css).not.toMatch(/rgba?\(|hsla?\(|!important/);
  });

  it('never names the dashboard theme class, so it is inert until a page uses it', () => {
    expect(raw).not.toContain(['theme', 'clarity'].join('-'));
  });
});
