// @vitest-environment jsdom
// Q2: the /login hero has no school badge (white square, school icon, "Dela Paz" /
// "National High School"). The header and footer still name the school; this
// only checks the page's own panel. "Welcome Back." is the first thing in it.
import { existsSync, readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';

const source = () => readFileSync(['src/pages/public/Login.jsx', 'frontend/src/pages/public/Login.jsx'].find(existsSync), 'utf8');
const show = () => render(<MemoryRouter initialEntries={['/login']}><Login /></MemoryRouter>);

afterEach(cleanup);

describe('/login has no school badge', () => {
  it('the panel shows neither "Dela Paz" nor "National High School", and no school icon', () => {
    show();
    const main = document.querySelector('main');
    const texts = [...main.querySelectorAll('*')].map(el => el.childNodes.length === 1 && el.firstChild.nodeType === 3 ? el.textContent.trim() : null);
    expect(texts).not.toContain('Dela Paz');
    expect(texts).not.toContain('National High School');
    expect(main.querySelector('.lucide-school')).toBeNull();
  });

  it('the welcome block is the first thing in the panel after the scrim (no badge, no leftover spacer)', () => {
    show();
    const h1 = screen.getByRole('heading', { level: 1, name: 'Welcome Back.' });
    const section = h1.closest('section');
    const [scrim, first] = section.children;
    expect(scrim.getAttribute('aria-hidden')).toBe('true');
    expect(first.contains(h1)).toBe(true);
    expect(first.className).toMatch(/\bmy-auto\b/);
  });

  it('Login.jsx no longer imports the School icon', () => {
    expect(source()).not.toMatch(/import\s*\{[^}]*\bSchool\b[^}]*\}\s*from 'lucide-react'/);
  });
});
