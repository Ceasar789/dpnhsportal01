// Clarity F2: the new shell rules (footer user card, avatar, screen-reader
// text, plain bell) exist and are all scoped under the theme class.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const css = readFileSync(join(here, 'clarity-components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const SCOPE = ['html.theme', 'clarity'].join('-');
const NEW = ['.x-user', '.x-user:hover', '.x-user:focus-visible', '.x-side-foot .x-user-txt', '.x-side-foot .x-user-txt span',
  '.x-side-foot .x-ava', '.x-sr', '.x-bell', '.x-bell .notification-bell-button', '.x-bell .notification-bell-button:hover'];
const ruleFor = sel => css.match(new RegExp(`(^|\\n)\\s*${SCOPE.replace(/\./g, '\\.')} ${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`));

describe('F2 shell rules', () => {
  it.each(NEW)('%s exists, scoped under the theme class', (sel) => {
    expect(ruleFor(sel), sel).toBeTruthy();
  });

  it('none of them uses !important, nowrap or a transition', () => {
    for (const sel of NEW) expect(ruleFor(sel)[2], sel).not.toMatch(/!important|nowrap|transition/);
  });

  it('the bell button loses the classic white-on-dark look: transparent background, muted icon', () => {
    expect(ruleFor('.x-bell .notification-bell-button')[2]).toMatch(/background: transparent; color: var\(--cl-mu\)/);
  });

  it('the avatar is the design yellow with dark initials, and outranks the footer span colour rule', () => {
    expect(ruleFor('.x-side-foot .x-ava')[2]).toMatch(/background: #fac543; color: #0f162b/);
  });

  it('the user card keeps a visible keyboard focus ring and a 44px target', () => {
    expect(ruleFor('.x-user:focus-visible')[2]).toMatch(/outline: 2px solid var\(--cl-ac\)/);
    expect(ruleFor('.x-user')[2]).toMatch(/min-height: 44px/);
  });
});
