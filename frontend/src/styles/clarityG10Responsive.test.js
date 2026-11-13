// Clarity G10: the phones-first responsive pass, pinned on the CSS text
// (jsdom computes no layout). Every G10 rule lives in a phone (767px) or a
// landscape-phone (max-height 500px) query, so desktop is unchanged.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const raw = readFileSync(join(here, 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const P = `html.${['theme', 'clarity'].join('-')} `;
const PHONE = '@media (max-width: 767px) {';
const LANDSCAPE = '@media (max-width: 1023.98px) and (max-height: 500px) {';

// The body of the block that opens at index `at` (the "{" after it).
const bodyAt = (text, at) => {
  let i = text.indexOf('{', at) + 1; let depth = 1; const start = i;
  while (depth) { if (text[i] === '{') depth += 1; else if (text[i] === '}') depth -= 1; i += 1; }
  return { body: text.slice(start, i - 1), end: i };
};
// Every phone (767px) block, joined; the G10 phone block; the landscape block.
const phoneBlocks = () => {
  const out = []; let at = css.indexOf(PHONE);
  while (at !== -1) { out.push(bodyAt(css, at).body); at = css.indexOf(PHONE, at + 1); }
  return out.join('\n');
};
const g10Start = raw.indexOf('/* G10: phones first');
const g10Phone = bodyAt(raw, raw.indexOf(PHONE, g10Start)).body;
const landscapeAt = raw.indexOf(LANDSCAPE);
const landscape = bodyAt(raw, landscapeAt).body;

describe('G10 sits only in phone and landscape-phone queries (desktop unchanged)', () => {
  it('the G10 section holds exactly the phone block and the landscape block, nothing at the top level', () => {
    expect(g10Start).toBeGreaterThan(-1);
    const phoneAt = raw.indexOf(PHONE, g10Start);
    const phoneEnd = bodyAt(raw, phoneAt).end;
    const landEnd = bodyAt(raw, landscapeAt).end;
    expect(landscapeAt).toBeGreaterThan(phoneEnd);
    const between = (raw.slice(g10Start, phoneAt) + raw.slice(phoneEnd, landscapeAt)).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    expect(between).toBe('');
    // The next thing after the landscape block is the older 520px block.
    expect(raw.slice(landEnd).trimStart().startsWith('@media (max-width: 520px)')).toBe(true);
  });
});

describe('phones (767px)', () => {
  const phone = phoneBlocks();

  it('search boxes show, full width on their own row (no longer hidden)', () => {
    expect(phone).toContain(`${P}.x-search { display: flex; flex: 1 1 100%; width: 100%; max-width: none; }`);
    expect(css).not.toMatch(/\.x-search \{ display: none; \}/);
  });

  it('the toast sits at the bottom above the safe area and lets taps through', () => {
    expect(phone).toContain(`${P}.x-toast { top: auto; bottom: calc(env(safe-area-inset-bottom, 0px) + 16px); left: 16px; right: 16px; max-width: none; pointer-events: none; }`);
  });

  it('top bar: the theme toggle first, then the bell', () => {
    expect(g10Phone).toContain(`${P}.x-top > .x-iconbtn:not(.x-menubtn) { order: 1; }`);
    expect(g10Phone).toContain(`${P}.x-top > .x-bell { order: 2; }`);
  });

  it('Student Overview: refresh beside the title, tidy values, a readable ring percentage', () => {
    expect(g10Phone).toContain(`${P}.x-sov > .x-head > :first-child { flex: 1 1 0%; }`);
    expect(g10Phone).toContain(`${P}.x-sov .x-kv { font-size: 24px; }`);
    expect(g10Phone).toContain(`${P}.x-sov-ring { width: 76px; }`);
    // The ring text is 7 of a 42-unit viewBox: at 76px that is at least 12px.
    const base = css.slice(css.indexOf(`\n${P}.x-ringval {`));
    const ringVal = base.match(/font-size: (\d+)px/);
    expect(Number(ringVal[1])).toBe(7);
    expect(7 * 76 / 42).toBeGreaterThanOrEqual(12);
  });

  it('tap targets are 44px: chips, segments, tabs, links, the bell, filters and pickers', () => {
    for (const rule of [
      `${P}.x-chip { min-height: 44px; }`,
      `${P}.x-seg button { min-height: 44px; min-width: 44px; }`,
      `${P}.r-tabs button { min-height: 44px; }`,
      `${P}.x-pst button { min-height: 44px; }`,
      `${P}.x-subnav a { min-height: 44px; display: flex; align-items: center; }`,
      `${P}.r-mini button { min-height: 44px; }`,
      `${P}.x-ov .x-link { min-height: 44px; }`,
      `${P}.x-bell .notification-bell-button { width: 44px; height: 44px; }`,
      `${P}.x-usr-tabs button { min-height: 44px; }`,
      `${P}.x-link { min-height: 44px; }`,
      `${P}.x-select { min-height: 44px; }`,
      `${P}.x-content [aria-label="Change profile photo"] { min-width: 44px; min-height: 44px; }`,
    ]) expect(phone, rule).toContain(rule);
  });

  it('screen-reader text inside a table scroll box cannot widen the page', () => {
    expect(phone).toContain(`${P}.x-tw { overflow-x: auto; max-width: 100%; position: relative; }`);
  });
});

describe('phones in landscape (844x390)', () => {
  it('inputs are 16px (no iOS zoom), including classic inputs inside the Clarity shell and its dialogs', () => {
    const fonts = landscape.slice(0, landscape.indexOf('{ font-size: 16px; }'));
    for (const sel of ['.x-input', '.x-select', '.x-search input', '.x-app select', '.x-app textarea', '.ux-modal select', '.ux-modal textarea',
      '.x-app input:not([type="checkbox"]):not([type="radio"]):not([type="file"])', '.ux-modal input:not([type="checkbox"]):not([type="radio"]):not([type="file"])']) {
      expect(fonts, sel).toContain(`${P}${sel}`);
    }
  });

  it('the same 44px targets, top-bar order and ring as portrait phones', () => {
    for (const rule of [
      `${P}.x-btn, ${P}.x-select { min-height: 44px; }`,
      `${P}.x-iconbtn, ${P}.x-bell .notification-bell-button { width: 44px; height: 44px; }`,
      `${P}.x-seg button { min-height: 44px; min-width: 44px; }`,
      `${P}.x-top > .x-iconbtn:not(.x-menubtn) { order: 1; }`,
      `${P}.x-top > .x-bell { order: 2; }`,
      `${P}.x-sov-ring { width: 76px; }`,
      `${P}.x-link { min-height: 44px; }`,
    ]) expect(landscape, rule).toContain(rule);
    expect(landscape).toContain(`${P}.x-set-nav button,`);
  });
});

describe('Admin drawer: focus returns to the menu button', () => {
  it('the inert cleanup repeats the focus after the header is live again', () => {
    const src = readFileSync(join(here, '..', 'components', 'clarity', 'admin', 'ClarityAdminLayout.jsx'), 'utf8').replace(/\r\n/g, '\n');
    const effect = src.slice(src.indexOf('    const opener = menuButtonRef.current;'), src.indexOf('}, [sidebarOpen, menuButtonRef]);'));
    expect(effect).toContain('targets.forEach((el, i) => { el.inert = Boolean(before[i]); });');
    expect(effect.indexOf('el.inert = Boolean(before[i])')).toBeLessThan(effect.indexOf('opener.focus()'));
    expect(effect).toContain('if (opener && document.contains(opener) && opener.offsetParent !== null) opener.focus();');
  });
});
