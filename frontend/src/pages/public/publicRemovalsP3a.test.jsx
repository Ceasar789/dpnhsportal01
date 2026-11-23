// @vitest-environment jsdom
// P3a: the footer has no "DELA PAZ NHS" heading, no tagline and no Alumni
// item; the sign-in and forgot-password emails use a neutral placeholder.
import { readFileSync, existsSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PublicFooter from '../../components/PublicFooter';

const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`].find(existsSync), 'utf8');
const TAGLINE = /Inspiring excellence|shaping futures|nurturing environment/i;

afterEach(cleanup);

describe('P3a public footer', () => {
  it('has no school heading, tagline or Alumni, and keeps two columns', () => {
    const { container } = render(<MemoryRouter><PublicFooter /></MemoryRouter>);
    const footer = container.querySelector('footer');
    expect(footer.textContent).not.toMatch(TAGLINE);
    expect(footer.textContent).not.toMatch(/alumni/i);
    expect(screen.queryByText('DELA PAZ NHS')).toBeNull();
    expect(footer.querySelector('h4')).toBeNull();
    const grid = footer.firstElementChild;
    expect(grid.children).toHaveLength(2);
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).not.toContain('grid-cols-3');
  });

  it('the tagline is not in any public page source', () => {
    for (const f of ['components/PublicFooter.jsx', 'pages/about/About.jsx', 'pages/about/aboutContent.js', 'pages/public/Home.jsx']) {
      expect(read(f), f).not.toMatch(TAGLINE);
    }
    expect(read('pages/about/About.jsx')).not.toContain('c.tagline');
  });
});

describe('P3a email placeholders', () => {
  for (const f of ['pages/auth/StudentLogin.jsx', 'pages/auth/FacultyLogin.jsx', 'pages/auth/ForgotPassword.jsx']) {
    it(`${f} shows JuanDelacruz@gmail.com and no dpnhs.edu.ph`, () => {
      const src = read(f);
      expect(src).toContain('placeholder="JuanDelacruz@gmail.com"');
      expect(src).not.toContain('dpnhs.edu.ph');
    });
  }
});
