// 4n (backlog): the Clarity search box is 42 px tall on wider screens; phones keep their 44 px minimum.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/clarity-components.css', 'utf8');
const P = ['html', ['theme', 'clarity'].join('-')].join('.');

describe('search box height (4n)', () => {
  it('the base rule is 42 px tall', () => {
    const rule = css.split('\n').find(line => line.startsWith(`${P} .x-search {`));
    expect(rule).toBeTruthy();
    expect(rule).toContain('height: 42px;');
    expect(rule).not.toContain('height: 40px;');
  });
  it('the phone rules still give at least 44 px', () => {
    expect(css.split(`${P} .x-search { min-height: 44px; }`).length - 1).toBeGreaterThanOrEqual(2);
  });
});
