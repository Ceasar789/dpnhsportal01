// @vitest-environment jsdom
// L1: About is reachable from the public header and footer, /about is a
// public route, and the header's phone links get a 44px tap area from a
// ::before without changing the bar's height.
import { existsSync, readFileSync } from 'node:fs';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PublicHeader, { PUBLIC_HEADER_HEIGHT } from './PublicHeader';
import PublicFooter from './PublicFooter';

const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`].find(existsSync), 'utf8');
const HIT = "relative before:absolute before:top-[calc(50%-22px)] before:h-11 before:content-['']";

afterEach(cleanup);

describe('header', () => {
  it.each([true, false])('isMobile=%s: About links to /about after Calendar, current on the About page', (isMobile) => {
    render(<MemoryRouter initialEntries={['/about']}><PublicHeader isMobile={isMobile} active="About" /></MemoryRouter>);
    const nav = within(screen.getByRole('navigation'));
    const about = nav.getByRole('link', { name: 'About' });
    expect(about.getAttribute('href')).toBe('/about');
    expect(about.getAttribute('aria-current')).toBe('page');
    const names = nav.getAllByRole('link').map(a => a.textContent);
    expect(names.slice(1)).toEqual(['Home', 'News', 'Calendar', 'About', 'Login']);
  });

  it('the bar heights are unchanged', () => {
    expect(PUBLIC_HEADER_HEIGHT).toEqual({ mobile: 118, desktop: 90 });
  });

  it('phone links and the phone Login get the 44px ::before hit area; desktop links do not', () => {
    const { unmount } = render(<MemoryRouter><PublicHeader isMobile /></MemoryRouter>);
    const nav = within(screen.getByRole('navigation'));
    for (const name of ['Home', 'News', 'Calendar', 'About', 'Login']) {
      expect(nav.getByRole('link', { name }).className, name).toContain(HIT);
    }
    unmount();
    render(<MemoryRouter><PublicHeader isMobile={false} /></MemoryRouter>);
    for (const name of ['Home', 'News', 'Calendar', 'About', 'Login']) {
      expect(within(screen.getByRole('navigation')).getByRole('link', { name }).className, name).not.toContain('before:h-11');
    }
  });
});

describe('footer', () => {
  it('RESOURCES starts with About us, linking to /about with the shared focus ring', () => {
    render(<MemoryRouter><PublicFooter /></MemoryRouter>);
    const about = screen.getByRole('link', { name: 'About us' });
    expect(about.getAttribute('href')).toBe('/about');
    expect(about.className).toContain('focus-visible:ring-2');
    expect(about.previousElementSibling.textContent.trim()).toBe('RESOURCES');
    // A 44px tap area from an invisible ::before; the other links are unchanged.
    expect(about.className).toContain("relative before:absolute before:inset-x-0 before:top-[calc(50%-22px)] before:h-11 before:content-['']");
    expect(screen.getByRole('link', { name: 'Faculty Portal' }).className).not.toContain('before:h-11');
  });
});

describe('route', () => {
  it('/about is a public route (not inside ProtectedRoute)', () => {
    expect(read('routes/AppRoutes.jsx')).toContain('<Route path="/about"    element={<PageTransition><About /></PageTransition>} />');
  });
});
