// U-PDF-T-FIX-B: the Learning Materials table and Reuse and repost styles,
// pinned on the stylesheet text (jsdom computes no layout). Inside the M2 block
// at the very end, scoped to x-tlm- classes, tokens only, no motion; a stacked
// card per row and 44px / 16px controls on phones and landscape phones; the
// student list scrolls on its own.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const raw = readFileSync(join(here, 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n');
const P = `html.${['theme', 'clarity'].join('-')} `;
const start = raw.indexOf('/* U-PDF-T-FIX-B');
const block = raw.slice(start);
const PHONES = '@media (max-width: 767px), (max-width: 1023.98px) and (max-height: 500px) {';
const phones = block.slice(block.indexOf(PHONES));

describe('U-PDF-T-FIX-B materials table and repost styles', () => {
  it('sit after the M2 block start, at the very end, scoped and motion-free', () => {
    expect(start).toBeGreaterThan(raw.indexOf('/* M2: Teacher Learning Materials'));
    const rules = [...block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(30);
    for (const [, sel, body] of rules) {
      for (const one of sel.replace(/^[\s\S]*\{/, '').split(',').map(s => s.trim()).filter(Boolean)) expect(one.startsWith(`${P}.x-tlm-`), one).toBe(true);
      expect(body).not.toMatch(/!important|nowrap|transition|animation|color-mix|url\(/);
      expect(body.replace(/var\(--cl-[a-z0-9-]+\)/g, '')).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    }
  });

  it('desktop: short words keep their width (break-word, not anywhere); the actions stay one row from 1280px', () => {
    expect(block).toContain(`${P}.x-tlm-table th, ${P}.x-tlm-table td { padding: 12px 16px; text-align: left; vertical-align: middle; border-bottom: 1px solid var(--cl-bd); overflow-wrap: break-word; }`);
    expect(block).toContain(`${P}.x-tlm-acts { display: flex; justify-content: flex-end; gap: 6px; }`);
    // Buttons never shrink below their label (no "Ope n").
    expect(block).toContain(`${P}.x-tlm-acts .x-btn { flex: none; min-height: 40px;`);
    expect(block).toContain(`@media (max-width: 1279.98px) {
  ${P}.x-tlm-acts { flex-wrap: wrap; }
}`);
  });

  it('the student list scrolls inside the dialog', () => {
    expect(block).toContain(`${P}.x-tlm-roster { list-style: none; margin: 0; padding: 0; max-height: 280px; overflow-y: auto;`);
  });

  it('phones: a stacked card per row, labelled cells, 44px actions and 44px / 16px selects', () => {
    expect(phones).toContain(`${P}.x-tlm-table tbody tr { display: grid;`);
    expect(phones).toContain(`${P}.x-tlm-table td[data-label]::before { content: attr(data-label) ": ";`);
    expect(phones).toContain(`${P}.x-tlm-acts .x-btn { flex: 1 0 auto; min-height: 44px; }`);
    expect(phones).toContain(`${P}.x-tlm-filter .x-select, ${P}.x-tlm-wide { min-height: 44px; font-size: 16px; }`);
  });

  it('44px rows in the student list and on Select all, everywhere', () => {
    expect(block).toMatch(new RegExp(`\\.x-tlm-student \\{[^}]*min-height: 44px`));
    expect(block).toMatch(new RegExp(`\\.x-tlm-all \\{[^}]*min-height: 44px`));
  });
});
