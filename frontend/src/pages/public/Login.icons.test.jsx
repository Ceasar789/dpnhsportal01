// @vitest-environment jsdom
// B1: the /login panel's icons are links (Facebook, feedback email); the
// Camera icon is removed; the row is no longer hidden from assistive tech.
import { existsSync, readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';

const source = () => readFileSync(['src/pages/public/Login.jsx', 'frontend/src/pages/public/Login.jsx'].find(existsSync), 'utf8');

afterEach(cleanup);

describe('/login panel icons', () => {
  it('Facebook opens the school page in a new tab', () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    const links = screen.getAllByRole('link', { name: 'Dela Paz NHS on Facebook (opens in a new tab)' });
    // One in the panel, one in the shared footer.
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe('https://www.facebook.com/DelaPazNationalHS');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('the message icon sends feedback by email, with the subject Feedback', () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'Send feedback by email' });
    expect(link.getAttribute('href')).toBe('mailto:307915@deped.gov.ph?subject=Feedback');
    expect(link.hasAttribute('target')).toBe(false);
  });

  it('the panel row has exactly the two links, 40x40 tiles, a focus ring, and is not aria-hidden', () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    const feedback = screen.getByRole('link', { name: 'Send feedback by email' });
    const row = feedback.parentElement;
    expect(row.hasAttribute('aria-hidden')).toBe(false);
    expect([...row.children].map(a => a.getAttribute('aria-label'))).toEqual([
      'Dela Paz NHS on Facebook (opens in a new tab)', 'Send feedback by email',
    ]);
    for (const tile of row.children) {
      expect(tile.className).toMatch(/\bh-10\b/);
      expect(tile.className).toMatch(/\bw-10\b/);
      expect(tile.className).toContain('focus-visible:ring-2');
      expect(tile.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('the Camera icon and its import are removed', () => {
    const { container } = render(<MemoryRouter><Login /></MemoryRouter>);
    expect(container.querySelector('.lucide-camera')).toBeNull();
    expect(source()).not.toMatch(/\bCamera\b/);
  });
});
