// Clarity phase 2: the component vocabulary is scoped, uses only defined
// tokens, honours reduced motion and the app's phone rules, and is inert.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(here, '..');
const strip = text => text.replace(/\/\*[\s\S]*?\*\//g, '');
const css = strip(readFileSync(join(here, 'clarity-components.css'), 'utf8'));
const tokensCss = strip(readFileSync(join(here, 'clarity.css'), 'utf8'));

// A small block parser: top-level rules, rules inside @media, and @keyframes.
const parse = (text, media = null) => {
  const out = { rules: [], keyframes: [] };
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open === -1) break;
    const prelude = text.slice(i, open).trim();
    let depth = 1; let j = open + 1;
    while (j < text.length && depth) { if (text[j] === '{') depth += 1; else if (text[j] === '}') depth -= 1; j += 1; }
    const body = text.slice(open + 1, j - 1);
    if (prelude.startsWith('@media')) {
      const inner = parse(body, prelude);
      out.rules.push(...inner.rules); out.keyframes.push(...inner.keyframes);
    } else if (prelude.startsWith('@keyframes')) {
      out.keyframes.push(prelude.replace('@keyframes', '').trim());
    } else {
      const decls = Object.fromEntries(body.split(';').map(d => d.split(':')).filter(p => p.length > 1)
        .map(([k, ...v]) => [k.trim(), v.join(':').trim()]));
      out.rules.push({ media, selectors: prelude.split(',').map(s => s.trim().replace(/\s+/g, ' ')), decls, body });
    }
    i = j;
  }
  return out;
};
const { rules, keyframes } = parse(css);
const blockVars = (sel) => {
  const m = tokensCss.match(new RegExp(`${sel.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`));
  return new Set([...m[1].matchAll(/(--cl-[a-z0-9-]+)\s*:/g)].map(x => x[1]));
};
const LIGHT = blockVars('html.theme-clarity');
const DARK = blockVars('html.theme-clarity.dark');
const PHONE = '@media (max-width: 767px)';
const REDUCED = '@media (prefers-reduced-motion: reduce)';
const inMedia = media => rules.filter(r => r.media === media);
const find = (media, selector) => inMedia(media).find(r => r.selectors.includes(`html.theme-clarity ${selector}`));

describe('scope and safety', () => {
  it('has rules, and every selector starts with html.theme-clarity followed by a class (no element rules)', () => {
    expect(rules.length).toBeGreaterThan(100);
    for (const { selectors } of rules) {
      for (const s of selectors) expect(s, s).toMatch(/^html\.theme-clarity(\.dark)? \./);
    }
  });

  it('uses no color-mix, backdrop-filter, !important, @import, @font-face or url()', () => {
    expect(css).not.toMatch(/color-mix|backdrop-filter|!important|@import|@font-face|url\(/i);
  });

  it('every var(--cl-*) it uses is defined in both the light and the dark token block', () => {
    const used = new Set([...css.matchAll(/var\((--cl-[a-z0-9-]+)/g)].map(m => m[1]));
    expect(used.size).toBeGreaterThan(30);
    for (const name of used) {
      expect(LIGHT.has(name), `${name} in light`).toBe(true);
      expect(DARK.has(name), `${name} in dark`).toBe(true);
    }
  });

  it('only uses --cl- custom properties', () => {
    const others = [...css.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]).filter(n => !n.startsWith('--cl-'));
    expect(others).toEqual([]);
  });
});

describe('motion', () => {
  const animationNames = rules.flatMap(r => ['animation', 'animation-name'].filter(p => r.decls[p]).map(p => r.decls[p]))
    .map(v => v.split(/\s+/)[0]).filter(n => n !== 'none');

  it('every @keyframes is cl- prefixed and used; every animation names a defined cl- keyframe', () => {
    expect(keyframes.length).toBeGreaterThan(5);
    for (const name of keyframes) {
      expect(name.startsWith('cl-'), name).toBe(true);
      expect(animationNames, name).toContain(name);
    }
    for (const name of animationNames) expect(keyframes, name).toContain(name);
  });

  it('a prefers-reduced-motion block turns off every animation and transition', () => {
    const reduced = inMedia(REDUCED).find(r => r.decls.animation === 'none' && r.decls.transition === 'none');
    expect(reduced).toBeTruthy();
    const covered = new Set(reduced.selectors);
    const moving = rules.filter(r => r.media !== REDUCED && (r.decls.animation || r.decls.transition));
    expect(moving.length).toBeGreaterThan(20);
    for (const r of moving) for (const s of r.selectors) expect(covered.has(s), s).toBe(true);
  });
});

describe("the app's phone and accessibility rules", () => {
  it('form controls are 16px on phones (no iOS zoom)', () => {
    for (const sel of ['.x-input', '.x-select', '.x-search input']) {
      expect(find(PHONE, sel)?.decls['font-size'], sel).toBe('16px');
    }
  });

  it('buttons, chips, tabs, segments and icon buttons are at least 40px on phones', () => {
    for (const sel of ['.x-btn', '.x-chip', '.x-seg button', '.r-tabs button', '.x-pst button', '.x-nav']) {
      expect(parseInt(find(PHONE, sel)?.decls['min-height'], 10), sel).toBeGreaterThanOrEqual(40);
    }
    const icon = find(PHONE, '.x-iconbtn');
    expect(parseInt(icon.decls.width, 10)).toBeGreaterThanOrEqual(40);
    expect(parseInt(icon.decls.height, 10)).toBeGreaterThanOrEqual(40);
  });

  it('the toast sits at the top and is click-through on phones', () => {
    const toast = find(PHONE, '.x-toast');
    expect(toast.decls.top).toContain('12px');
    expect(toast.decls.bottom).toBe('auto');
    expect(toast.decls['pointer-events']).toBe('none');
  });

  it('tables scroll inside their wrapper on phones', () => {
    expect(find(PHONE, '.x-tw')?.decls['overflow-x']).toBe('auto');
    expect(find(null, '.x-tw')?.decls['overflow-x']).toBe('auto');
  });

  it('modals use dvh with a vh fallback, scroll inside, and pin header and footer', () => {
    const modal = find(null, '.x-modal');
    expect(modal.body).toMatch(/max-height: calc\(100vh - 32px\);\s*max-height: calc\(100dvh - 32px\)/);
    expect(find(PHONE, '.x-modal').body).toMatch(/max-height: 92vh;\s*max-height: 92dvh/);
    expect(find(null, '.x-mb').decls['overflow-y']).toBe('auto');
    expect(find(null, '.x-mf').decls['flex-shrink']).toBe('0');
    expect(find(null, '.x-mh').decls['flex-shrink']).toBe('0');
  });

  it('every interactive piece has a visible focus ring', () => {
    const focus = rules.find(r => r.selectors.includes('html.theme-clarity .x-btn:focus-visible'));
    for (const sel of ['.x-nav', '.x-iconbtn', '.x-btn', '.x-chip', '.x-seg button', '.r-tabs button', '.x-input', '.x-select',
      '.x-memo-item', '.r-post', '.x-pst button', '.r-mini button', '.x-subnav a', '.o-tile', '.o-new', '.x-link']) {
      expect(focus.selectors, sel).toContain(`html.theme-clarity ${sel}:focus-visible`);
    }
    expect(focus.decls.outline).toBe('2px solid var(--cl-ac)');
  });

  it('long text wraps: no white-space: nowrap anywhere', () => {
    expect(css).not.toMatch(/white-space:\s*nowrap/);
  });

  it('safe-area insets are only used with a fallback', () => {
    for (const m of css.matchAll(/env\(([^)]*)\)/g)) expect(m[1]).toMatch(/,\s*0px$/);
  });
});

describe('classes for data the app does not have were not added', () => {
  const SKIPPED = ['x-spark', 'x-up', 'r-feat', 'r-recips', 'o-sec', 'r-wk', 'r-ab', 'r-chk', 'r-bulk', 'x-tabbar'];
  it.each(SKIPPED)('.%s is absent', (name) => {
    expect(css).not.toMatch(new RegExp(`\\.${name}(?![a-z0-9-])`));
  });
});

describe('still inert', () => {
  const walk = dir => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  it('no source file under frontend/src applies the theme-clarity class', () => {
    const appliers = walk(SRC)
      .filter(p => /\.(jsx?|tsx?|html)$/.test(p))
      .filter(p => !/clarity(Components)?\.test\.js$|[\\/]components[\\/]clarity[\\/]student[\\/]ClarityStudentLayout\.jsx$/.test(p))
      .filter(p => readFileSync(p, 'utf8').includes('theme-clarity'));
    expect(appliers).toEqual([]);
  });
});
