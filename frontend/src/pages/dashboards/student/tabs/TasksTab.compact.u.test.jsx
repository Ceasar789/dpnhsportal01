// U-PDF-S4: on wide screens (>= 1024 px wide, >= 560 px high) the header zone of
// the open task is compact so the worksheet gets the height: less page padding,
// 8 px gaps, a 24 px Back link, the meta line beside the title when it fits, and
// a one-row progress bar (28 px circles, label beside, waiting line under it).
// Phones and narrow screens keep the stacked layout and the 36 px circles.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
const css = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n');
const T = `html.${['theme', 'clarity'].join('-')} .x-stk `;
const block = (head) => {
  const at = css.indexOf(head);
  expect(at, head).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('\n}', at));
};
const WIDE = '@media (min-width: 1024px) and (min-height: 560px) {';

describe('U-PDF-S4 compact header zone (wide screens)', () => {
  const wide = block(WIDE);

  it('less page padding and 8 px gaps; the grid still fills the window exactly', () => {
    expect(wide).toContain(`html.${['theme', 'clarity'].join('-')} .x-content:has(.x-std-grid) { padding-top: 12px; padding-bottom: 16px; }`);
    expect(wide).toContain(`${T}.x-std-grid { height: calc(100vh - 92px); height: calc(100dvh - 92px); grid-template-rows: auto auto auto minmax(240px, 1fr); row-gap: 8px; }`);
    // 64 px top bar + 12 + 16 padding = 92.
    expect(64 + 12 + 16).toBe(92);
    expect(wide).toContain(`${T}.x-std-back { min-height: 24px; }`);
  });

  it('the meta line sits beside the title when it fits; the title keeps its size', () => {
    expect(wide).toContain(`${T}.x-std-head { display: flex; flex-wrap: wrap; align-items: baseline;`);
    expect(wide).not.toMatch(/\.x-h1[^{]*\{[^}]*font-(size|weight)/);
  });

  it('a one-row bar: 28 px circles, label beside, the waiting line under the label', () => {
    expect(wide).toContain(`${T}.x-std-steps { padding: 13px 20px;`);
    expect(wide).toContain(`${T}.x-std-steps li { display: grid; grid-template-columns: auto auto; justify-content: center;`);
    expect(wide).toContain(`${T}.x-std-steps .x-std-dot { grid-row: 1 / span 2; width: 28px; height: 28px; }`);
    expect(wide).toContain(`${T}.x-std-steps .x-std-wait { grid-column: 2; grid-row: 2; align-self: start; }`);
    // Same colours and tokens as U-PDF-S3: the compact bar rules set no colour at all.
    expect(wide.slice(wide.indexOf('.x-std-steps {'))).not.toMatch(/color:|background:|border-color:/);
  });
});

describe('U-PDF-S4 phones and narrow screens unchanged', () => {
  it('the 28 px circle and the beside-label grid exist only in the wide block', () => {
    const outside = css.replace(block(WIDE), '');
    expect(outside.split('\n').filter(line => line.includes('.x-std-')).join('\n')).not.toContain('28px');
    expect(outside).not.toContain('.x-std-steps li { display: grid');
    expect(outside).not.toContain('.x-content:has(.x-std-grid)');
  });

  it('narrow layout: one column, Details first, 36 px circles, the phone bar padding', () => {
    expect(block(`@media (max-width: 1023px) {\n  ${T}.x-std-grid`)).toContain('"back" "head" "steps" "details" "scroll" "work"');
    expect(css).toContain(`${T}.x-std-dot { display: inline-flex; flex: none; align-items: center; justify-content: center; box-sizing: border-box; width: 36px; height: 36px;`);
    expect(block(`@media (max-width: 767px) {\n  ${T}.x-std-steps`)).toContain(`${T}.x-std-steps { padding: 14px 12px; }`);
    expect(css).toContain(`${T}.x-std-steps li { display: flex; flex-direction: column; align-items: center; gap: 6px;`);
  });
});
