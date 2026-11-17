// SHELL: the phone shell stylesheet (phone-shell.css), pinned on its text.
// jsdom computes no layout; the browser run measures the real bar.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = rel => readFileSync(join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');
const css = read('styles/phone-shell.css');
const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
const PHONE = '@media (max-width: 767.98px), (max-width: 1023.98px) and (max-height: 500px) {';
const LANDSCAPE = '@media (max-width: 1023.98px) and (max-height: 500px) {';
const blockAt = (at) => {
  let i = body.indexOf('{', at) + 1; let depth = 1; const start = i;
  while (depth) { if (body[i] === '{') depth += 1; else if (body[i] === '}') depth -= 1; i += 1; }
  return body.slice(start, i - 1);
};
const phone = blockAt(body.indexOf(PHONE));
const landscape = blockAt(body.indexOf(LANDSCAPE));

describe('phone-shell.css rules (CLAUDE.md)', () => {
  it('no theme literal, no !important, no nowrap, no @import/url()/font files, no motion', () => {
    expect(css).not.toContain(['theme', 'clarity'].join('-'));
    expect(body).not.toMatch(/!important|white-space:\s*nowrap|@import|url\(|@font-face|animation|transition|@keyframes/);
  });
  it('only Clarity tokens, each with a plain fallback; every env() inset has a 0px fallback', () => {
    for (const m of body.matchAll(/var\((--[a-z0-9-]+)([^)]*)\)/g)) {
      expect(m[1], m[0]).toMatch(/^--cl-/);
      expect(m[2], m[0]).toMatch(/^, /);
    }
    for (const m of body.matchAll(/env\(([^)]*)\)/g)) expect(m[1]).toMatch(/, 0px$/);
  });
  it('the phone query is the same one PhoneNav.jsx uses', () => {
    expect(read('components/clarity/phone/PhoneNav.jsx')).toContain("export const PHONE_QUERY = '(max-width: 767.98px), (max-width: 1023.98px) and (max-height: 500px)';");
    expect(body).toContain(PHONE);
  });
});

describe('the bottom tab bar', () => {
  it('fixed at the bottom, 5 equal columns, 56px plus the safe area, below every overlay (z 30)', () => {
    expect(body).toMatch(/\.x-pnav \{[^}]*position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);[^}]*height: calc\(56px \+ env\(safe-area-inset-bottom, 0px\)\);/);
  });
  it('items are 44px targets with a 12px label; active item in the accent with a top indicator', () => {
    expect(body).toMatch(/\.x-pnav-i \{[^}]*min-height: 44px;[^}]*font-size: 12px;/);
    expect(body).toContain('.x-pnav-i.on { color: var(--cl-ac, #3d34e0); }');
    expect(body).toMatch(/\.x-pnav-i\.on::before \{[^}]*height: 3px;[^}]*background: var\(--cl-ac, #3d34e0\);/);
  });
  it('steps aside while typing; hidden in the teacher quick draft', () => {
    expect(body).toContain('.x-pnav.typing { display: none; }');
    expect(phone).toContain('.x-tch:has(.teacher-quick-draft-active) .x-pnav { display: none; }');
  });
  it('content and pinned bars stay above it; the toast too', () => {
    expect(phone).toContain('.x-app .x-main > .x-content { padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 24px); }');
    expect(phone).toContain('.x-app .x-content .x-savebar { bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 8px); }');
    expect(phone).toContain('.x-app .x-content .settings-savebar, .x-app .x-content [aria-label="Attendance save bar"] { bottom: calc(56px + env(safe-area-inset-bottom, 0px)); }');
    expect(phone).toContain('.x-app.x-app > .x-toast { bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 12px); }');
  });
  it('focus and scroll-into-view keep the target clear of the top bar and the tab bar', () => {
    expect(phone).toContain('html:has(.x-pnav) { scroll-padding-top: calc(56px + env(safe-area-inset-top, 0px)); scroll-padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px)); }');
    expect(landscape).toContain('html:has(.x-pnav) { scroll-padding-top: calc(48px + env(safe-area-inset-top, 0px)); scroll-padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px)); }');
  });
  it('under 360px the five columns use the full width so "Attendance" is not cut', () => {
    const narrow = blockAt(body.indexOf('@media (max-width: 359.98px) {'));
    expect(narrow).toContain('.x-pnav { padding-left: 0; padding-right: 0; }');
    expect(narrow).toContain('.x-pnav-i { padding-left: 0; padding-right: 0; letter-spacing: -.02em; }');
  });
  it('compact in landscape (48px), icon beside the label', () => {
    expect(landscape).toContain('.x-pnav { height: calc(48px + env(safe-area-inset-bottom, 0px)); }');
    expect(landscape).toContain('.x-pnav-i { flex-direction: row; gap: 6px; }');
    expect(landscape).toContain('.x-app .x-main > .x-top { height: calc(48px + env(safe-area-inset-top, 0px)); }');
  });
});

describe('the top bar and the Menu sheet on phones', () => {
  it('top bar: 56px plus the safe area, 16px gutters, solid page background, hairline border; brand shown', () => {
    expect(phone).toMatch(/\.x-app \.x-main > \.x-top \{[^}]*height: calc\(56px \+ env\(safe-area-inset-top, 0px\)\);[^}]*padding: env\(safe-area-inset-top, 0px\) 16px 0;[^}]*background: var\(--cl-bg, #f6f7fb\);[^}]*border-bottom: 1px solid var\(--cl-bd, #e7e9f1\);/);
    expect(phone).toContain('.x-app .x-main > .x-top > .x-pbrand { display: inline-flex; }');
    expect(body).toMatch(/\.x-pbrand \{ display: none;[^}]*min-height: 44px;/);
  });
  it('sheet above the bar (45) and below dialogs (50); backdrop 0.4 light, 0.55 dark; 48px rows', () => {
    expect(body).toContain('.x-psheet-wrap { position: fixed; inset: 0; z-index: 45; }');
    expect(body).toContain('.x-psheet-back { position: absolute; inset: 0; background: rgba(10, 16, 32, 0.4); }');
    expect(body).toContain('.dark .x-psheet-back { background: rgba(0, 0, 0, 0.55); }');
    expect(body).toMatch(/\.x-psheet-row \{[^}]*min-height: 48px;[^}]*font-size: 16px;/);
    expect(read('styles/clarity-components.css')).toMatch(/\.x-back \{ position: fixed; inset: 0; z-index: 50;/);
  });
  it('page header: one 12px gap and the action row on its own line, the same for every page', () => {
    expect(phone).toContain('.x-app .x-content .x-head { gap: 12px; }');
    expect(phone).toContain('.x-app .x-content .x-head > .x-act { flex-basis: 100%; }');
  });
});
