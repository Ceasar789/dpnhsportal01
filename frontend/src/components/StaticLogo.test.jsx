// @vitest-environment jsdom
// N1: the EduScribe logo is static everywhere. One image (the EduScribe mark,
// never the school seal), the EduScribe accessible name, no animation or
// transition class, no timers, the same box sizes as before.
import { existsSync, readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FlippingLogo from './FlippingLogo';

const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`].find(existsSync), 'utf8').replace(/\r\n/g, '\n');

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('static EduScribe logo', () => {
  it('renders exactly one image: the EduScribe mark, named "EduScribe"', () => {
    const { container } = render(<FlippingLogo size={60} />);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'EduScribe' }).getAttribute('src')).toBe('/EduScribeLogoIcon.png');
    expect(container.innerHTML).not.toContain('capstonelogo');
  });

  it('keeps the box: a fixed size, or Tailwind sizing classes passed through', () => {
    const box = render(<FlippingLogo size={360} className="mb-6" />).container.firstElementChild;
    expect([box.style.width, box.style.height]).toEqual(['360px', '360px']);
    expect(box.className).toBe('eduscribe-logo mb-6');
    const fluid = render(<FlippingLogo className="w-12 h-12 sm:w-16 sm:h-16" />).container.firstElementChild;
    expect(fluid.className).toBe('eduscribe-logo w-12 h-12 sm:w-16 sm:h-16');
    expect(fluid.getAttribute('style')).toBeNull();
  });

  it('no flip, animation or transition class anywhere in it, and no timers', () => {
    vi.useFakeTimers();
    const { container } = render(<FlippingLogo size={60} />);
    for (const el of container.querySelectorAll('*')) expect(String(el.className), el.tagName).not.toMatch(/flip|animate|transition|spin|rotate/);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a custom accessible name still works', () => {
    render(<FlippingLogo alt="EduScribe home" />);
    expect(screen.getByRole('img', { name: 'EduScribe home' })).toBeTruthy();
  });
});

describe('the stylesheet', () => {
  const css = read('styles/index.css');

  it('has no flip rules or keyframes left', () => {
    expect(css).not.toMatch(/eduscribe-flip|coin-flip|rotateY|backface-visibility|preserve-3d/);
  });

  it('the static rules hold the box with no motion', () => {
    const rule = sel => css.match(new RegExp(`\\n${sel.replace(/[.-]/g, m => `\\${m}`)} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('.eduscribe-logo')).toMatch(/position: relative;\s*flex-shrink: 0;/);
    expect(rule('.eduscribe-logo-img')).toMatch(/position: absolute;\s*inset: 0;\s*width: 100%;\s*height: 100%;\s*object-fit: contain;\s*border-radius: 50%;/);
    for (const sel of ['.eduscribe-logo', '.eduscribe-logo-img']) expect(rule(sel), sel).not.toMatch(/animation|transition|transform/);
  });

  it('every page that showed the flipping logo still uses this component', () => {
    for (const file of ['pages/public/Login.jsx', 'pages/auth/StudentLogin.jsx', 'pages/auth/FacultyLogin.jsx', 'pages/auth/ForgotPassword.jsx',
      'pages/auth/ResetPassword.jsx', 'pages/auth/ChangePassword.jsx', 'pages/auth/VerifyEmail.jsx', 'pages/dashboards/student/StudentDashboard.jsx']) {
      expect(read(file), file).toMatch(/<FlippingLogo /);
    }
  });
});
