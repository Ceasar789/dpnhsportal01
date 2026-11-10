import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VIEWPORT_HEIGHT_UNIT, viewportHeight, __test } from '../lib/viewportHeight';

const read = path => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const css = read('./index.css');

describe('phone text fields are 16px so iPhone Safari does not zoom', () => {
  const block = css.match(/@media \(max-width: 767px\) \{\s*:root :is\(([\s\S]*?)\)\s*\{\s*font-size: 16px;\s*\}\s*\}/);

  it('exists inside the phone media query, without !important', () => {
    expect(block).toBeTruthy();
    expect(block[0]).not.toContain('!important');
  });

  it('covers untyped and text-entry inputs, select and textarea', () => {
    const list = block[1];
    for (const part of ['input:not([type])', 'select', 'textarea',
      ...['text', 'email', 'password', 'search', 'number', 'tel', 'url', 'date', 'time', 'datetime-local', 'month']
        .map(type => `input[type="${type}"]`)]) {
      expect(list).toContain(part);
    }
  });

  it('leaves checkbox, radio, range, color, file and button-type inputs alone', () => {
    for (const type of ['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit', 'image']) {
      expect(block[1]).not.toContain(`"${type}"`);
    }
  });
});

describe('full-height boxes use the dynamic viewport with a vh fallback', () => {
  it.each([
    ['.h-viewport', 'height', 'calc', null],
    ['.min-h-viewport', 'min-height', null, null],
    ['.max-h-viewport-85', 'max-height', null, '85'],
  ])('%s lists vh first, then dvh', (cls, prop, _x, pct) => {
    const n = pct || '100';
    const rule = css.match(new RegExp(`${cls.replace('.', '\\.')} \\{([^}]*)\\}`));
    expect(rule).toBeTruthy();
    expect(rule[1].replace(/\s+/g, ' ').trim()).toBe(`${prop}: ${n}vh; ${prop}: ${n}dvh;`);
  });

  it('the bottom sheet caps at 92dvh after its 92vh fallback', () => {
    expect(css).toMatch(/max-height: 92vh;\s*max-height: 92dvh;/);
  });

  it.each([
    ['../pages/dashboards/teacher/TeacherDashboard.jsx', 'teacher-dashboard-shell'],
    ['../pages/dashboards/student/StudentDashboard.jsx', 'student-dashboard-shell'],
  ])('%s shell no longer relies on 100vh alone', (file, shell) => {
    const line = read(file).split('\n').find(l => l.includes(shell) && l.includes('className'));
    expect(line).toContain('h-viewport');
    expect(line).not.toMatch(/\bh-screen\b/);
    expect(line).toContain('overflow-hidden');
  });

  it('the admin shell lists a dvh value after each 100vh one', () => {
    const admin = read('../pages/dashboards/admin/AdminDashboard.jsx');
    expect(admin).toContain('min-height: 100vh; min-height: 100dvh;');
    expect(admin.match(/min-height: calc\(100vh - 76px\); min-height: calc\(100dvh - 76px\);/g)).toHaveLength(2);
    expect(admin).toContain('max-height: 90vh; max-height: 90dvh;');
  });
});

describe('viewportHeight for inline styles', () => {
  it('uses dvh when supported and vh otherwise', () => {
    expect(__test.supportsDvh(() => true)).toBe(true);
    expect(__test.supportsDvh(() => false)).toBe(false);
    expect(__test.supportsDvh(() => { throw new Error('old browser'); })).toBe(false);
    expect(__test.supportsDvh(undefined)).toBe(false);
    expect(viewportHeight(100, 'dvh')).toBe('100dvh');
    expect(viewportHeight(100, 'vh')).toBe('100vh');
    expect(['vh', 'dvh']).toContain(VIEWPORT_HEIGHT_UNIT);
  });
});
