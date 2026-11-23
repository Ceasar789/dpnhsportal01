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
import { LEGAL_LAST_UPDATED, PRIVACY, TERMS } from './legalContent';

const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`].find(existsSync), 'utf8');
const show = (el) => render(<MemoryRouter>{el}</MemoryRouter>);
const headings = (level) => screen.getAllByRole('heading', { level }).map(h => h.textContent);

afterEach(cleanup);

describe('Privacy Policy page', () => {
  it('one h1, the date line, and the content file headings in order', () => {
    show(<Privacy />);
    expect(headings(1)).toEqual([PRIVACY.title]);
    expect(screen.getByText(`Last updated: ${LEGAL_LAST_UPDATED}`)).toBeTruthy();
    const main = within(document.querySelector('main'));
    expect(main.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(PRIVACY.sections.map(s => s.heading));
    expect(screen.getByText(/Data Privacy Act of 2012 \(RA 10173\)/, { selector: 'p > strong' })).toBeTruthy();
    expect(main.getByRole('link', { name: '307915@deped.gov.ph' }).getAttribute('href')).toBe('mailto:307915@deped.gov.ph');
  });

  it('uses the public header and footer, with 16px body text', () => {
    const { container } = show(<Privacy />);
    expect(container.querySelector('header, nav')).toBeTruthy();
    expect(container.querySelector('footer')).toBeTruthy();
    expect(container.querySelector('article').className).toMatch(/\btext-base\b/);
  });
});

describe('Terms & Conditions page', () => {
  it('one h1, the date line, and the eleven numbered sections in order', () => {
    show(<Terms />);
    expect(headings(1)).toEqual([TERMS.title]);
    expect(screen.getByText(`Last updated: ${LEGAL_LAST_UPDATED}`)).toBeTruthy();
    const main = within(document.querySelector('main'));
    expect(main.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(TERMS.sections.map(s => s.heading));
    expect(main.getByRole('link', { name: '307915@deped.gov.ph' }).getAttribute('href')).toBe('mailto:307915@deped.gov.ph');
  });
});

describe('routes and links', () => {
  it('/terms and /privacy are public routes (not inside ProtectedRoute)', () => {
    const routes = read('routes/AppRoutes.jsx');
    expect(routes).toContain('<Route path="/terms"    element={<PageTransition><Terms /></PageTransition>} />');
    expect(routes).toContain('<Route path="/privacy"  element={<PageTransition><Privacy /></PageTransition>} />');
  });

  it('the footer links Privacy Policy and Terms of Service; no Alumni item (P3a); Faculty Portal unchanged', () => {
    show(<PublicFooter />);
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy');
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe('/terms');
    expect(screen.queryByText('Alumni')).toBeNull();
    expect(screen.getByRole('link', { name: 'Faculty Portal' }).getAttribute('href')).toBe('/faculty-login');
  });

  it('the /login notice links Terms of Use and Privacy Statement', () => {
    show(<Login />);
    expect(screen.getByRole('link', { name: 'Terms of Use' }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('link', { name: 'Privacy Statement' }).getAttribute('href')).toBe('/privacy');
  });
});
