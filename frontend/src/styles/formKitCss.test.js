// U2 form kit: pins for styles/form-kit.css, in the style of the repo's
// other scoped-stylesheet pins (yourWorkCss.test.js,
// attachmentReviewCss.test.js) and of clarityComponents.test.js (16px and
// 40/44px controls on phones, dvh with a vh fallback, reduced motion).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = rel => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const css = read('styles/form-kit.css');
const body = css.replace(/\/\*[\s\S]*?\*\//g, '');

// [{ media, selectors, decls }] for every rule, inside or outside @media.
const parse = (text) => {
  const rules = [];
  const walk = (chunk, media) => {
    let i = 0;
    while (i < chunk.length) {
      const open = chunk.indexOf('{', i);
      if (open === -1) break;
      const prelude = chunk.slice(i, open).trim();
      let depth = 1; let j = open + 1;
      while (depth && j < chunk.length) { if (chunk[j] === '{') depth += 1; else if (chunk[j] === '}') depth -= 1; j += 1; }
      const inner = chunk.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) walk(inner, prelude);
      else {
        const decls = {};
        for (const d of inner.split(';')) { const k = d.indexOf(':'); if (k > 0) decls[d.slice(0, k).trim()] = d.slice(k + 1).trim(); }
        rules.push({ media, selectors: prelude.split(',').map(s => s.trim().replace(/\s+/g, ' ')), decls, inner });
      }
      i = j;
    }
  };
  walk(text, null);
  return rules;
};
const rules = parse(body);
const PHONE = '@media (max-width: 767.98px), (max-width: 1023.98px) and (max-height: 500px)';
const find = (media, selector) => rules.find(r => r.media === media && r.selectors.includes(selector));

describe('form-kit.css: scope and safety', () => {
  it('is imported by the kit only, and nothing kit-specific goes into the shared stylesheets', () => {
    const walk = dir => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const importers = walk(SRC)
      .filter(p => /\.(jsx?)$/.test(p) && !/\.test\.jsx?$/.test(p))
      .filter(p => /form-kit\.css/.test(readFileSync(p, 'utf8')))
      .map(p => relative(SRC, p).split(sep).join('/'))
      .sort();
    expect(importers).toEqual([
      'components/ui/ConfirmDialog.jsx', 'components/ui/form/Field.jsx',
      'components/ui/form/FormErrorSummary.jsx', 'components/ui/form/SegmentedChoice.jsx',
      'components/ui/form/ToggleChoice.jsx',
    ]);
    for (const shared of ['styles/index.css', 'styles/clarity.css', 'styles/clarity-components.css', 'styles/phone-tap.css', 'styles/classic-contrast.css']) {
      expect(read(shared), shared).not.toMatch(/\.fk-/);
    }
  });

  it('never names the theme class, and has no !important, nowrap, @import or url()', () => {
    expect(css).not.toContain(['theme', 'clarity'].join('-'));
    expect(body).not.toMatch(/!important|nowrap|@import|url\(/);
  });

  it('every selector is scoped to a kit class (.fk-), optionally under .dark', () => {
    expect(rules.length).toBeGreaterThan(40);
    for (const { selectors } of rules) for (const s of selectors) expect(s, s).toMatch(/^(\.dark )?\.fk-/);
  });

  it('colours come from the tokens (Clarity first, classic fallback); the only literals are the ring and backdrop tints', () => {
    expect(body).not.toMatch(/#[0-9a-f]{3,8}\b|hsla?\(|color-mix/i);
    expect([...new Set(body.match(/rgba\([^)]*\)/g))].sort()).toEqual([
      'rgba(10, 12, 24, 0.4)', 'rgba(10, 12, 24, 0.55)', 'rgba(154, 148, 255, 0.7)', 'rgba(61, 52, 224, 0.6)',
    ]);
    for (const [, name, rest] of body.matchAll(/var\(--(cl-[a-z0-9-]+)(,[^;]*)?/g)) {
      expect(rest, `--${name} needs a classic fallback`).toMatch(/^, var\(--[a-z]/);
    }
    for (const [, name] of body.matchAll(/var\(--(?!cl-|fk-)([a-z0-9-]+)\)/g)) {
      expect(['text', 'text-muted', 'text-dim', 'border', 'card-bg', 'bg', 'accent', 'banner-accent', 'on-accent', 'red', 'green'], name).toContain(name);
    }
  });

  it('the ring colour is defined for light and for dark', () => {
    expect(find(null, '.fk-field').decls['--fk-ring']).toBe('rgba(61, 52, 224, 0.6)');
    expect(find(null, '.dark .fk-field').decls['--fk-ring']).toBe('rgba(154, 148, 255, 0.7)');
  });
});

describe('form-kit.css: behaviour the kit promises', () => {
  it('a calm focus: accent border on focus, then a 2px reduced-strength ring 1px out (not the global 3px outline)', () => {
    expect(find(null, '.fk-field .fk-control:focus').decls['border-color']).toBe('var(--cl-ac, var(--accent))');
    const ring = find(null, '.fk-field .fk-control:focus-visible').decls;
    expect(ring.outline).toBe('2px solid var(--fk-ring)');
    expect(ring['outline-offset']).toBe('1px');
    for (const s of ['.fk-seg-opt:focus-visible', '.fk-btn:focus-visible', '.fk-pw-toggle:focus-visible']) {
      expect(find(null, s).decls.outline, s).toBe('2px solid var(--fk-ring)');
    }
    expect(body).not.toMatch(/outline: [3-9]px/);
  });

  it('placeholders read as placeholders: muted, italic, full opacity', () => {
    expect(find(null, '.fk-field .fk-control::placeholder').decls).toEqual({ color: 'var(--cl-mu, var(--text-muted))', 'font-style': 'italic', opacity: '1' });
  });

  it('errors: red text and a red border on an invalid control', () => {
    expect(find(null, '.fk-error').decls.color).toBe('var(--cl-er, var(--badge-red-fg, var(--red)))');
    expect(find(null, '.fk-field .fk-control[aria-invalid="true"]').decls['border-color']).toBe('var(--cl-er, var(--badge-red-fg, var(--red)))');
  });

  it('desktop: controls, segments and buttons are at least 40px', () => {
    for (const s of ['.fk-field .fk-control', '.fk-seg-opt', '.fk-btn']) {
      expect(parseInt(find(null, s).decls['min-height'], 10), s).toBeGreaterThanOrEqual(40);
    }
    expect(find(null, '.fk-pw-toggle').decls.width).toBe('40px');
  });

  it('phones: inputs at 16px and every target at least 44px', () => {
    const control = find(PHONE, '.fk-field .fk-control').decls;
    expect(control['font-size']).toBe('16px');
    expect(control['min-height']).toBe('44px');
    for (const s of ['.fk-seg-opt', '.fk-btn', '.fk-pw-toggle', '.fk-summary-list a']) {
      expect(parseInt(find(PHONE, s).decls['min-height'], 10), s).toBeGreaterThanOrEqual(44);
    }
    expect(find(PHONE, '.fk-pw-toggle').decls.width).toBe('44px');
    for (const s of ['.fk-seg-opt', '.fk-btn']) expect(find(PHONE, s).decls['font-size'], s).toBe('16px');
  });

  it('phones: the footer stacks with the primary (last in the markup) on top, full width (D7)', () => {
    expect(find(PHONE, '.fk-footer').decls['flex-direction']).toBe('column-reverse');
    expect(find(PHONE, '.fk-footer .fk-btn').decls.width).toBe('100%');
  });

  it('short screens and phones: a dialog footer (.fk-sticky) sticks to the bottom; a page form footer does not', () => {
    expect(find('@media (max-height: 560px)', '.fk-footer.fk-sticky').decls).toMatchObject({ position: 'sticky', bottom: '0' });
    expect(find(PHONE, '.fk-footer.fk-sticky').decls).toMatchObject({ position: 'sticky', bottom: '0' });
    expect(rules.filter(r => r.selectors.includes('.fk-footer') && r.decls.position)).toEqual([]);
  });

  it('the resting border of a text control is the stronger dim token (findable at 3:1), not the faint divider', () => {
    expect(find(null, '.fk-field .fk-control').decls.border).toBe('1px solid var(--cl-dim, var(--text-dim))');
  });

  it('segments keep whole words: never narrower than the label, wrapping as a row instead', () => {
    expect(find(null, '.fk-seg-opt').decls['min-width']).toBe('min(100%, max-content)');
    expect(find(null, '.fk-seg').decls['flex-wrap']).toBe('wrap');
  });

  it('the confirm dialog uses dvh with a vh fallback and scrolls inside', () => {
    expect(find(null, '.fk-confirm').inner).toMatch(/max-height: calc\(100vh - 32px\);\s*max-height: calc\(100dvh - 32px\)/);
    expect(find(null, '.fk-confirm').decls['overflow-y']).toBe('auto');
  });

  it('reduced motion turns off every transition the kit declares', () => {
    const moving = rules.filter(r => r.media === null && r.decls.transition).flatMap(r => r.selectors);
    expect(moving.length).toBeGreaterThanOrEqual(3);
    const reduced = rules.find(r => r.media === '@media (prefers-reduced-motion: reduce)');
    expect(reduced.decls.transition).toBe('none');
    for (const s of moving) expect(reduced.selectors, s).toContain(s);
  });
});

// T1: the toggle (ToggleChoice.jsx).
describe('form-kit.css: the T1 toggle', () => {
  it('the thumb slides with a transform only (0.22s, ease-out); no rule animates layout', () => {
    const thumb = find(null, '.fk-tg .fk-tg-thumb').decls;
    expect(thumb.transform).toBe('translateX(calc(var(--fk-i, 0) * (100% + 4px)))');
    expect(thumb.transition).toBe('transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.15s ease');
    for (const { selectors, decls } of rules) {
      if (decls.transition) expect(decls.transition, selectors.join(', ')).not.toMatch(/\b(all|width|height|left|right|top|bottom|margin|padding|inset)\b/);
    }
  });

  it('reduced motion: the thumb and the labels do not move, and the help swap has no transition', () => {
    const reduced = rules.find(r => r.media === '@media (prefers-reduced-motion: reduce)');
    for (const s of ['.fk-tg .fk-tg-thumb', '.fk-tg-text']) expect(reduced.selectors, s).toContain(s);
    expect(find(null, '.fk-tg-helps > .fk-help').decls.transition).toBeUndefined();
  });

  it('options: 40px and 14px on desktop, 44px and 16px on phones, labels wrap', () => {
    expect(find(null, '.fk-tg-text').decls).toMatchObject({ 'min-height': '40px', 'font-size': '14px', 'overflow-wrap': 'anywhere' });
    expect(find(PHONE, '.fk-tg-text').decls).toMatchObject({ 'min-height': '44px', 'font-size': '16px' });
  });

  it('the calm kit focus ring on the focused option', () => {
    expect(find(null, '.fk-tg-input:focus-visible + .fk-tg-text').decls.outline).toBe('2px solid var(--fk-ring)');
  });

  it('equal columns, and each native radio covers its option but is never seen', () => {
    expect(find(null, '.fk-tg').decls['grid-template-columns']).toBe('repeat(var(--fk-n, 2), minmax(0, 1fr))');
    expect(find(null, '.fk-tg-input').decls).toMatchObject({ position: 'absolute', inset: '0', opacity: '0' });
  });

  it('the thumb rule has two classes, so the later index.css .dashboard-shell * colour transition (one class) cannot replace it', () => {
    const shell = read('styles/index.css');
    expect(shell).toContain('.dashboard-shell * {\n  transition-property: background-color');
    expect(rules.filter(r => r.selectors.includes('.fk-tg-thumb'))).toEqual([]);
    expect(find(null, '.fk-tg .fk-tg-thumb').decls.transition).toMatch(/^transform /);
  });

  it('the thumb edge is the accent, with the classic banner accent as fallback (3:1 in classic dark)', () => {
    expect(find(null, '.fk-tg .fk-tg-thumb').decls.border).toBe('1px solid var(--cl-ac, var(--banner-accent))');
  });
});
