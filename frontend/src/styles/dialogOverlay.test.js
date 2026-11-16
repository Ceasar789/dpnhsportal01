// V1: dialogs and their overlays cover the viewport, wherever they render.
//
// A `position: fixed` overlay is sized by the viewport only while no ancestor
// has a transform (or filter, perspective, contain, will-change). An entry
// animation that animates `transform` with fill mode `both` or `forwards`
// keeps its last frame applied for ever (a computed `matrix(1, 0, 0, 1, 0, 0)`
// is still a transform), so the animated element stays the containing block
// of every fixed dialog inside it. That is how the Clarity admin tab wrapper
// (.x-pagein) shrank every admin dialog to the tab box. `backwards` shows the
// same first frame and lets go at the end.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = rel => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const strip = text => text.replace(/\/\*[\s\S]*?\*\//g, '');
const THEME = ['theme', 'clarity'].join('-');

// [{ media, selectors, decls }] for every rule, and { name: body } for every
// @keyframes, inside or outside @media.
const parse = (text) => {
  const rules = [];
  const keyframes = {};
  const walk = (chunk, media) => {
    let i = 0;
    while (i < chunk.length) {
      const open = chunk.indexOf('{', i);
      if (open === -1) break;
      const prelude = chunk.slice(i, open).trim();
      let depth = 1; let j = open + 1;
      while (depth && j < chunk.length) { if (chunk[j] === '{') depth += 1; else if (chunk[j] === '}') depth -= 1; j += 1; }
      const inner = chunk.slice(open + 1, j - 1);
      if (prelude.startsWith('@keyframes')) keyframes[prelude.split(/\s+/)[1]] = inner;
      else if (prelude.startsWith('@')) walk(inner, prelude);
      else {
        const decls = {};
        for (const d of inner.split(';')) { const k = d.indexOf(':'); if (k > 0) decls[d.slice(0, k).trim()] = d.slice(k + 1).trim(); }
        rules.push({ media, selectors: prelude.split(',').map(s => s.trim().replace(/\s+/g, ' ')), decls });
      }
      i = j;
    }
  };
  walk(strip(text), null);
  return { rules, keyframes };
};

const walkFiles = dir => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walkFiles(p) : [p]; });
const sheets = walkFiles(SRC).filter(p => p.endsWith('.css')).map(p => relative(SRC, p).split(sep).join('/'));
const parsed = Object.fromEntries(sheets.map(f => [f, parse(read(f))]));
const allKeyframes = Object.assign({}, ...Object.values(parsed).map(p => p.keyframes));
const MOVING = Object.keys(allKeyframes).filter(name => /(^|[;{\s])transform\s*:/.test(allKeyframes[name]));

const clarity = parsed['styles/clarity-components.css'];
const formKit = parsed['styles/form-kit.css'];
const find = ({ rules }, media, selector) => rules.find(r => r.media === media && r.selectors.includes(selector));
// The value that wins, cascade-style: the last rule for the selector that declares the property.
const decl = ({ rules }, media, selector, prop) => rules.filter(r => r.media === media && r.selectors.includes(selector) && prop in r.decls).at(-1)?.decls[prop];
const LANDSCAPE = '@media (max-width: 1023.98px) and (max-height: 500px)';
const PHONE = '@media (max-width: 767.98px), (max-width: 1023.98px) and (max-height: 500px)';

describe('entry animations never leave a transform behind', () => {
  it('finds the stylesheets and the transform keyframes it guards', () => {
    expect(sheets).toContain('styles/clarity-components.css');
    expect(sheets).toContain('styles/index.css');
    for (const name of ['cl-rise', 'cl-pop', 'cl-sheet', 'cl-toast', 'cl-grow', 'cl-wide', 'page-fade-in']) expect(MOVING, name).toContain(name);
    expect(MOVING).not.toContain('cl-fade');
  });

  it('no animation of a transform keyframe uses fill mode both or forwards (exit animations under .out excepted)', () => {
    const offenders = [];
    let checked = 0;
    for (const [file, { rules }] of Object.entries(parsed)) {
      for (const { selectors, decls } of rules) {
        const anim = [decls.animation, decls['animation-name']].filter(Boolean).join(' ');
        const names = MOVING.filter(name => new RegExp(`(^|[\\s,])${name}([\\s,]|$)`).test(anim));
        if (!names.length) continue;
        const exitOnly = selectors.every(s => /\.out\b/.test(s));
        if (exitOnly) continue;
        checked += 1;
        const fill = `${decls.animation || ''} ${decls['animation-fill-mode'] || ''}`;
        if (/\b(both|forwards)\b/.test(fill)) offenders.push(`${file}: ${selectors.join(', ')} -> ${fill.trim()}`);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(11);
    expect(offenders).toEqual([]);
  });

  it('the Clarity admin tab wrapper keeps its rise, with fill mode backwards', () => {
    expect(find(clarity, null, `html.${THEME} .x-pagein`).decls.animation).toBe('cl-rise .5s var(--cl-ease) backwards');
  });
});

describe('the overlays do not depend on an ancestor transform', () => {
  // Every element a dialog can render inside, from the shell down to the tab.
  const SHELL = ['.x-app', '.x-main', '.x-content', '.x-pagein', '.page-transition'];
  const TRAPS = ['transform', 'filter', 'backdrop-filter', 'perspective', 'contain', 'will-change', 'container-type'];

  it('no shell wrapper gets a transform, filter, perspective, contain or will-change from any stylesheet', () => {
    const offenders = [];
    for (const [file, { rules }] of Object.entries(parsed)) {
      for (const { selectors, decls } of rules) {
        const hits = selectors.filter(s => SHELL.some(c => new RegExp(`${c.replace('.', '\\.')}(?![\\w-])[^ >+~]*$`).test(s)));
        if (!hits.length) continue;
        for (const prop of TRAPS) if (prop in decls && decls[prop] !== 'none') offenders.push(`${file}: ${hits.join(', ')} { ${prop}: ${decls[prop]} }`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every overlay is fixed to the whole viewport and centres its dialog (desktop)', () => {
    const back = find(clarity, null, `html.${THEME} .x-back`).decls;
    expect(back).toMatchObject({ position: 'fixed', inset: '0', display: 'flex', 'align-items': 'center', 'justify-content': 'center' });
    const confirm = Object.fromEntries(['position', 'inset', 'display', 'align-items', 'justify-content'].map(p => [p, decl(formKit, null, '.fk-confirm-back', p)]));
    expect(confirm).toEqual({ position: 'fixed', inset: '0', display: 'flex', 'align-items': 'center', 'justify-content': 'center' });
    for (const file of ['pages/dashboards/admin/AdminDashboard.jsx', 'components/clarity/admin/ClassicAdminStyles.jsx']) {
      const text = read(file);
      expect(text, file).toContain('.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: none; align-items: center; justify-content: center; z-index: 1000; }');
      expect(text, file).toContain('.modal-overlay.open { display: flex; }');
    }
  });

  it('the Clarity backdrop pads by the safe-area insets, with a 0px fallback', () => {
    const padding = find(clarity, null, `html.${THEME} .x-back`).decls.padding;
    for (const side of ['top', 'right', 'bottom', 'left']) expect(padding).toContain(`max(16px, env(safe-area-inset-${side}, 0px))`);
  });
});

describe('backdrops: lighter in light mode, stronger in dark mode', () => {
  it('Clarity .x-back: .4 light, .55 dark', () => {
    expect(find(clarity, null, `html.${THEME} .x-back`).decls.background).toBe('rgba(10,16,32,.4)');
    expect(find(clarity, null, `html.${THEME}.dark .x-back`).decls.background).toBe('rgba(10,16,32,.55)');
  });

  it('form kit confirm: .4 light, .55 dark', () => {
    expect(decl(formKit, null, '.fk-confirm-back', 'background')).toBe('rgba(10, 12, 24, 0.4)');
    expect(decl(formKit, null, '.dark .fk-confirm-back', 'background')).toBe('rgba(10, 12, 24, 0.55)');
  });

  it('admin .modal-overlay: .55 under dark, in both admin style blocks', () => {
    for (const file of ['pages/dashboards/admin/AdminDashboard.jsx', 'components/clarity/admin/ClassicAdminStyles.jsx']) {
      expect(read(file), file).toContain(':root.dark .modal-overlay { background: rgba(0,0,0,.55); }');
    }
  });

  it('the Clarity dialog shadow is the lighter one', () => {
    expect(find(clarity, null, `html.${THEME} .x-modal`).decls['box-shadow']).toBe('0 12px 40px rgba(10,16,32,.18)');
  });
});

describe('landscape phones: the dialog footer is one row', () => {
  it('a landscape-only rule lays the footer out as one full-width row (a grid that never wraps), buttons in markup order', () => {
    expect(find(formKit, LANDSCAPE, '.fk-footer').decls).toEqual({ display: 'grid', 'grid-auto-flow': 'column', width: '100%', 'align-items': 'stretch' });
    expect(find(formKit, LANDSCAPE, '.fk-footer .fk-btn').decls).toEqual({ width: 'auto' });
  });

  it('it comes after the phone rule (so it wins on a landscape phone), and portrait phones still stack primary on top', () => {
    const order = formKit.rules.map(r => `${r.media}|${r.selectors.join(',')}`);
    expect(order.indexOf(`${LANDSCAPE}|.fk-footer`)).toBeGreaterThan(order.indexOf(`${PHONE}|.fk-footer`));
    expect(find(formKit, PHONE, '.fk-footer').decls['flex-direction']).toBe('column-reverse');
  });

  it('keeps the 44px targets and 16px text of the phone rule (nothing in the landscape rule lowers them)', () => {
    expect(find(formKit, PHONE, '.fk-btn').decls).toMatchObject({ 'min-height': '44px', 'font-size': '16px' });
    for (const { media, decls } of formKit.rules) {
      if (media !== LANDSCAPE) continue;
      expect(decls['min-height']).toBeUndefined();
      expect(decls['font-size']).toBeUndefined();
    }
  });
});
