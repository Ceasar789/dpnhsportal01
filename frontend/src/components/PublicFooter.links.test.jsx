// @vitest-environment jsdom
// B1: the public footer's contact lines and its icon row are real links; the
// decorative BookOpen, Globe and Users icons are gone. Resources are unchanged.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PublicFooter from './PublicFooter';

const FACEBOOK = 'https://www.facebook.com/DelaPazNationalHS';
const renderFooter = () => render(<MemoryRouter><PublicFooter /></MemoryRouter>);

afterEach(cleanup);

describe('public footer links', () => {
  it('the location line links to the map in a new tab, with a hidden new-tab hint', () => {
    renderFooter();
    const link = screen.getByRole('link', { name: 'Dela Paz National High School (opens in a new tab)' });
    expect(link.getAttribute('href')).toBe('https://share.google/sRx85lq4zhIe5o27t');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.querySelector('.sr-only').textContent).toBe('(opens in a new tab)');
    expect(link.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  });

  it('the email line is a mailto link to the school address; the phone stays text', () => {
    renderFooter();
    const mail = screen.getByRole('link', { name: '307915@deped.gov.ph' });
    expect(mail.getAttribute('href')).toBe('mailto:307915@deped.gov.ph');
    expect(mail.hasAttribute('target')).toBe(false);
    const phone = screen.getByText('(02) 8642-1234');
    expect(phone.closest('a')).toBeNull();
  });

  it('the old placeholder address and email are gone', () => {
    const { container } = renderFooter();
    expect(container.textContent).not.toContain('Brgy. Dela Paz, Binan City');
    expect(container.textContent).not.toContain('admissions@delapaznhs.edu.ph');
  });

  it('the bottom row holds only the Facebook link; BookOpen, Globe and Users are removed', () => {
    const { container } = renderFooter();
    const facebook = screen.getByRole('link', { name: 'Dela Paz NHS on Facebook (opens in a new tab)' });
    expect(facebook.getAttribute('href')).toBe(FACEBOOK);
    expect(facebook.getAttribute('target')).toBe('_blank');
    expect(facebook.getAttribute('rel')).toBe('noopener noreferrer');
    const row = facebook.parentElement;
    expect(row.hasAttribute('aria-hidden')).toBe(false);
    expect(row.children).toHaveLength(1);
    for (const icon of ['lucide-book-open', 'lucide-globe', 'lucide-users']) {
      expect(container.querySelector(`.${icon}`)).toBeNull();
    }
  });

  it('Resources are unchanged: Faculty Portal links to /faculty-login; Alumni, Privacy Policy, Terms of Service stay text', () => {
    renderFooter();
    expect(screen.getByRole('link', { name: 'Faculty Portal' }).getAttribute('href')).toBe('/faculty-login');
    for (const label of ['Alumni', 'Privacy Policy', 'Terms of Service']) {
      expect(screen.getByText(label).closest('a')).toBeNull();
    }
  });

  it('every footer link is named and has the shared focus ring', () => {
    const { container } = renderFooter();
    const links = within(container.querySelector('footer')).getAllByRole('link');
    expect(links).toHaveLength(4);
    for (const link of links) {
      expect(link.className).toContain('focus-visible:ring-2');
    }
  });
});
