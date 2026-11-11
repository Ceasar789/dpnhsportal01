// @vitest-environment jsdom
// B2: /terms and /privacy are public pages with the agreed headings, and the
// footer and /login link to them.
import { existsSync, readFileSync } from 'node:fs';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Terms from './Terms';
import Privacy from './Privacy';
import Login from './Login';
import PublicFooter from '../../components/PublicFooter';

const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`].find(existsSync), 'utf8');
const show = (el) => render(<MemoryRouter>{el}</MemoryRouter>);
const headings = (level) => screen.getAllByRole('heading', { level }).map(h => h.textContent);

afterEach(cleanup);

describe('Privacy Statement page', () => {
  it('one h1, the date line, and the agreed section headings in order', () => {
    show(<Privacy />);
    expect(headings(1)).toEqual(['Privacy Statement']);
    expect(screen.getByText('Last updated: November 11, 2026')).toBeTruthy();
    const main = within(document.querySelector('main'));
    expect(main.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      'What we collect', 'Why we use it', 'Who can see it', 'AI features', 'Cookies and storage',
      'How long we keep records', 'Your rights and how to contact us',
    ]);
    expect(screen.getByText(/Data Privacy Act of 2012 \(Republic Act No\. 10173\)/)).toBeTruthy();
    expect(screen.getByText(/We do not send student names, answers or scores to these services\./)).toBeTruthy();
    expect(main.getByRole('link', { name: '307915@deped.gov.ph' }).getAttribute('href')).toBe('mailto:307915@deped.gov.ph');
    expect(screen.getByText('This statement may be updated; the date above shows the latest version.')).toBeTruthy();
  });

  it('uses the public header and footer, with 16px body text', () => {
    const { container } = show(<Privacy />);
    expect(container.querySelector('header, nav')).toBeTruthy();
    expect(container.querySelector('footer')).toBeTruthy();
    expect(container.querySelector('article').className).toMatch(/\btext-base\b/);
  });
});

describe('Terms of Use page', () => {
  it('one h1, the date line, and the nine numbered sections in order', () => {
    show(<Terms />);
    expect(headings(1)).toEqual(['Terms of Use']);
    expect(screen.getByText('Last updated: November 11, 2026')).toBeTruthy();
    const main = within(document.querySelector('main'));
    expect(main.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      '1. Who may use the portal', '2. Your account', '3. Acceptable use', '4. Schoolwork and results',
      '5. Content you add', "6. The school's rights", '7. Availability', '8. Changes', '9. Contact',
    ]);
    expect(screen.getByText('These terms apply to everyone who uses the Dela Paz National High School student portal.')).toBeTruthy();
    expect(main.getByRole('link', { name: '307915@deped.gov.ph' }).getAttribute('href')).toBe('mailto:307915@deped.gov.ph');
  });
});

describe('routes and links', () => {
  it('/terms and /privacy are public routes (not inside ProtectedRoute)', () => {
    const routes = read('routes/AppRoutes.jsx');
    expect(routes).toContain('<Route path="/terms"    element={<PageTransition><Terms /></PageTransition>} />');
    expect(routes).toContain('<Route path="/privacy"  element={<PageTransition><Privacy /></PageTransition>} />');
  });

  it('the footer links Privacy Policy and Terms of Service; Alumni stays text; Faculty Portal unchanged', () => {
    show(<PublicFooter />);
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy');
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe('/terms');
    expect(screen.getByText('Alumni').closest('a')).toBeNull();
    expect(screen.getByRole('link', { name: 'Faculty Portal' }).getAttribute('href')).toBe('/faculty-login');
  });

  it('the /login notice links Terms of Use and Privacy Statement', () => {
    show(<Login />);
    expect(screen.getByRole('link', { name: 'Terms of Use' }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('link', { name: 'Privacy Statement' }).getAttribute('href')).toBe('/privacy');
  });
});
