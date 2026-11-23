// @vitest-environment jsdom
// P3b-lite: one logo on the public and auth pages, the EduScribe mark
// (/EduScribeLogoIcon.png, named "EduScribe"). The school seal stays in the
// signed-in app shells only. The favicon uses the small /email-logo.png copy.
import { existsSync, readFileSync } from 'node:fs';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PublicHeader from '../../components/PublicHeader';
import Home from './Home';
import Login from './Login';

const LOGO = '/EduScribeLogoIcon.png';
const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`, rel, `frontend/${rel}`].find(existsSync), 'utf8');

afterEach(cleanup);

const expectOnlyEduScribe = container => {
  const imgs = [...container.querySelectorAll('img')];
  expect(imgs.length).toBeGreaterThan(0);
  for (const img of imgs) {
    expect(img.getAttribute('src')).toBe(LOGO);
    expect(img.getAttribute('alt')).toBe('EduScribe');
  }
};

describe('public pages render only the EduScribe logo', () => {
  it('the header, on a phone and on a desktop', () => {
    expectOnlyEduScribe(render(<MemoryRouter><PublicHeader isMobile /></MemoryRouter>).container);
    cleanup();
    expectOnlyEduScribe(render(<MemoryRouter><PublicHeader isMobile={false} /></MemoryRouter>).container);
  });

  it('Home and /login (header plus the /login hero)', () => {
    expectOnlyEduScribe(render(<MemoryRouter><Home /></MemoryRouter>).container);
    cleanup();
    expectOnlyEduScribe(render(<MemoryRouter><Login /></MemoryRouter>).container);
  });
});

describe('no other logo in the public and auth sources', () => {
  const files = ['components/PublicHeader.jsx', 'components/PublicFooter.jsx', 'components/SignInChooser.jsx',
    'pages/public/Home.jsx', 'pages/public/Login.jsx', 'pages/public/News.jsx', 'pages/public/Calendar.jsx',
    'pages/public/Terms.jsx', 'pages/public/Privacy.jsx', 'pages/about/About.jsx',
    'pages/auth/StudentLogin.jsx', 'pages/auth/FacultyLogin.jsx', 'pages/auth/ForgotPassword.jsx', 'pages/auth/ResetPassword.jsx',
    'pages/auth/ChangePassword.jsx', 'pages/auth/ConfirmLink.jsx', 'pages/auth/LinkProblem.jsx', 'pages/auth/RequestLink.jsx',
    'pages/auth/VerifyEmail.jsx', 'routes/AppRoutes.jsx'];

  it.each(files)('%s names no image file but the EduScribe mark', file => {
    const src = read(file);
    const images = src.match(/[\w./-]+\.(png|svg|webp|gif|ico)\b/gi) ?? [];
    expect(images.filter(i => !i.endsWith('EduScribeLogoIcon.png'))).toEqual([]);
    expect(src).not.toMatch(/IMAGES\.logo|capstonelogo/);
  });
});

describe('index.html icons', () => {
  const html = read('index.html');
  it('favicon and apple-touch-icon both use /email-logo.png; the seal is gone', () => {
    expect(html).toMatch(/<link rel="icon" type="image\/png" href="\/email-logo\.png" \/>/);
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/email-logo\.png" \/>/);
    expect(html).not.toContain('capstonelogo');
  });
});
