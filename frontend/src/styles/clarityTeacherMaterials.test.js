// Learning Materials (M2): the x-tlm- CSS, pinned on the stylesheet text
// (jsdom computes no layout). Appended at the very end, scoped, tokens only,
// no motion of its own, 40px controls (44px on phones and landscape phones),
// 16px inputs on phones, a grid that never overflows.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const raw = readFileSync(join(here, 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n');
const P = `html.${['theme', 'clarity'].join('-')} `;
const start = raw.indexOf('/* M2: Teacher Learning Materials');
const block = raw.slice(start);
const noComments = block.replace(/\/\*[\s\S]*?\*\//g, '');
const groups = [...noComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => [sel.replace(/^[\s\S]*\{/, '').trim(), body]);
const media = prelude => {
  const at = block.indexOf(`${prelude} {`);
  if (at === -1) return '';
  let i = block.indexOf('{', at) + 1; let depth = 1; const s = i;
  while (depth) { if (block[i] === '{') depth += 1; else if (block[i] === '}') depth -= 1; i += 1; }
  return block.slice(s, i - 1);
};
const PHONE = media('@media (max-width: 767px)');
const LANDSCAPE = media('@media (max-width: 1023.98px) and (max-height: 500px)');

describe('placement and scope', () => {
  it('is appended at the very end, after the reduced-motion block and the G10 blocks', () => {
    expect(start).toBeGreaterThan(raw.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(start).toBeGreaterThan(raw.indexOf('/* G10: phones in landscape'));
    expect(raw.indexOf('x-tlm-')).toBeGreaterThanOrEqual(start);
  });

  it('every selector is scoped to an x-tlm- class; no !important, nowrap, transitions, animations or raw colours', () => {
    expect(groups.length).toBeGreaterThan(25);
    for (const [selectors, body] of groups) {
      for (const sel of selectors.split(',').map(s => s.trim()).filter(Boolean)) {
        expect(sel.startsWith(`${P}.x-tlm-`), sel).toBe(true);
      }
      expect(body, selectors).not.toMatch(/!important|nowrap|transition|animation/);
      expect(body.replace(/var\(--cl-[a-z0-9-]+\)/g, ''), selectors).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    }
  });
});

describe('layout', () => {
  it('the card grid fits any width: auto-fill with minmax(min(280px, 100%), 1fr)', () => {
    expect(block).toContain(`${P}.x-tlm-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 16px; }`);
  });

  it('cards use the 12px radius token and keep long text inside', () => {
    expect(block).toContain(`${P}.x-tlm-card { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 20px; border-radius: var(--cl-r); }`);
    for (const cls of ['.x-tlm-title', '.x-tlm-sg', '.x-tlm-desc', '.x-tlm-meta']) {
      expect(groups.find(([s]) => s === `${P}${cls}`)?.[1], cls).toMatch(/overflow-wrap: anywhere/);
    }
  });

  it('40px controls on desktop', () => {
    expect(block).toContain(`${P}.x-tlm-chips .x-chip { min-height: 40px;`);
    expect(block).toContain(`${P}.x-tlm-act .x-btn { flex: 1 1 110px; min-height: 40px;`);
    expect(block).toContain(`${P}.x-tlm-kind button { min-height: 40px;`);
  });
});

describe('phones', () => {
  it('44px targets on phones and landscape phones', () => {
    const rule = `${P}.x-tlm-chips .x-chip, ${P}.x-tlm-act .x-btn, ${P}.x-tlm-kind button, ${P}.x-tlm-retry { min-height: 44px; }`;
    expect(PHONE).toContain(rule);
    expect(LANDSCAPE).toContain(rule);
    // The shared file picker's "Choose / Replace file" label and Remove button, inside this dialog only.
    const picker = `${P}.x-tlm-file label[for], ${P}.x-tlm-file button { display: inline-flex; align-items: center; min-height: 44px; }`;
    expect(PHONE).toContain(picker);
    expect(LANDSCAPE).toContain(picker);
  });

  it('search full width, one form column, 16px description input', () => {
    expect(PHONE).toContain(`${P}.x-tlm-tools .x-search { flex-basis: 100%; max-width: none; }`);
    expect(PHONE).toContain(`${P}.x-tlm-row { grid-template-columns: minmax(0, 1fr); }`);
    expect(PHONE).toContain(`${P}.x-tlm-desc-input { height: auto; font-size: 16px; }`);
  });
});
