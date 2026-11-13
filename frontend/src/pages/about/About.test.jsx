// @vitest-environment jsdom
// L1: the About page. Sections render only from filled content; reveal is
// progressive enhancement (no observer or reduced motion = nothing hidden);
// the numbers keep their final value in the markup; the tab title is set
// and restored.
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import About, { ABOUT_TITLE } from './About';
import aboutContent from './aboutContent';

const EMPTY = { ...aboutContent };
const FILLED = {
  ...aboutContent,
  mission: 'Test mission sentence.',
  story: ['Test story paragraph one.', 'Test story paragraph two.'],
  timeline: [{ year: '2001', title: 'Test milestone', text: 'Test milestone text.' }],
  values: [{ title: 'Test value A', text: 'Value A text.' }, { title: 'Test value B', text: '' }],
  stats: [{ value: 1234, label: 'Test learners' }, { value: 56, label: 'Test teachers', suffix: '+' }, { value: '4.5', label: 'Test rating' }],
  phone: '(00) 0000-0000',
  address: 'Test address line',
  officeHours: 'Test hours',
};

const show = (content) => render(<MemoryRouter><About content={content} /></MemoryRouter>);
const h2s = () => within(document.querySelector('main')).getAllByRole('heading', { level: 2 }).map(h => h.textContent);
const root = () => document.querySelector('.public-shell');

afterEach(() => {
  cleanup();
  delete window.IntersectionObserver;
  delete window.matchMedia;
  vi.unstubAllGlobals();
});

describe('About page content', () => {
  it('with only the repo content: hero, the portal line, the vision, contact and sign in - nothing else', () => {
    show(EMPTY);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Dela Paz National High School');
    expect(within(document.querySelector('main')).getByText(aboutContent.tagline)).toBeTruthy();
    expect(h2s()).toEqual(['EduScribe', 'Our Vision', 'Contact and Location', 'Sign in to EduScribe']);
    expect(screen.getByText(aboutContent.portalSummary)).toBeTruthy();
    for (const p of aboutContent.vision) expect(screen.getByText(p)).toBeTruthy();
    expect(screen.queryByText(/OUR MISSION/)).toBeNull();
    expect(screen.queryByText('More information coming soon.')).toBeNull();
    // Contact shows only the filled items; no phone, address or hours.
    const contact = within(document.getElementById('about-contact').closest('section'));
    expect(contact.getByRole('link', { name: aboutContent.email }).getAttribute('href')).toBe(`mailto:${aboutContent.email}`);
    expect(contact.getByRole('link', { name: /on the map \(opens in a new tab\)/ }).getAttribute('href')).toBe(aboutContent.mapUrl);
    expect(contact.getByRole('link', { name: /on Facebook \(opens in a new tab\)/ }).getAttribute('rel')).toBe('noopener noreferrer');
    expect(contact.queryByText('PHONE')).toBeNull();
    expect(contact.queryByText('ADDRESS')).toBeNull();
    expect(contact.queryByText('OFFICE HOURS')).toBeNull();
  });

  it('has a way back and a Sign In chooser', () => {
    show(EMPTY);
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
  });

  it('with every field filled, every section renders', () => {
    show(FILLED);
    expect(h2s()).toEqual(['EduScribe', 'Mission and Vision', 'Our Story', 'Core Values', 'Key Numbers', 'Contact and Location', 'Sign in to EduScribe']);
    for (const text of ['Test mission sentence.', 'Test story paragraph two.', 'Test milestone', '2001', 'Test value B', 'Test learners', 'Test address line', 'Test hours']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.getByRole('link', { name: '(00) 0000-0000' }).getAttribute('href')).toBe('tel:0000000000');
  });

  it('"More information coming soon." shows only when there is nothing but the hero and contact', () => {
    show({ ...EMPTY, vision: [], portalSummary: '' });
    expect(screen.getByText('More information coming soon.')).toBeTruthy();
    expect(h2s()).toEqual(['Contact and Location', 'Sign in to EduScribe']);
  });

  it('the numbers carry their final value in the markup; the animated copy is aria-hidden', () => {
    show(FILLED);
    const numbers = document.getElementById('about-numbers').closest('section');
    const srOnly = [...numbers.querySelectorAll('.sr-only')].map(s => s.textContent);
    expect(srOnly).toEqual(['1,234', '56+', '4.5']);
    const visible = [...numbers.querySelectorAll('[aria-hidden="true"].tabular-nums')].map(s => s.textContent);
    expect(visible).toEqual(['1,234', '56+', '4.5']);
  });
});

describe('reveal on scroll', () => {
  it('without IntersectionObserver nothing is hidden (no reveal-on class)', () => {
    show(FILLED);
    expect(root().classList.contains('reveal-on')).toBe(false);
    expect(document.querySelectorAll('[data-reveal]').length).toBeGreaterThan(10);
  });

  describe('with an observer', () => {
    let observed; let callback;
    beforeEach(() => {
      observed = new Set();
      window.IntersectionObserver = class {
        constructor(cb, options) { callback = cb; this.options = options; }
        observe(el) { observed.add(el); }
        unobserve(el) { observed.delete(el); }
        disconnect() { observed.clear(); }
      };
    });

    it('marks the page reveal-on, reveals items as they intersect, then stops watching them', () => {
      show(FILLED);
      expect(root().classList.contains('reveal-on')).toBe(true);
      const items = [...document.querySelectorAll('[data-reveal]')];
      expect(observed.size).toBe(items.length);
      act(() => { callback([{ target: items[0], isIntersecting: true }, { target: items[1], isIntersecting: false }]); });
      expect(items[0].classList.contains('is-in')).toBe(true);
      expect(items[1].classList.contains('is-in')).toBe(false);
      expect(observed.has(items[0])).toBe(false);
    });

    it('staggers items by 80ms, capped at 320ms', () => {
      show(FILLED);
      const delays = [...document.querySelectorAll('[data-reveal]')].map(el => el.style.getPropertyValue('--reveal-delay')).filter(Boolean);
      expect(delays).toContain('80ms');
      expect(delays.every(d => parseInt(d, 10) <= 320)).toBe(true);
    });

    it('the numbers start at 0 and count up to the final value once revealed', () => {
      let now = 0; const frames = [];
      vi.stubGlobal('requestAnimationFrame', (fn) => { frames.push(fn); return frames.length; });
      vi.stubGlobal('cancelAnimationFrame', () => {});
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      show(FILLED);
      const card = document.getElementById('about-numbers').closest('section').querySelector('li[data-reveal]');
      const animated = card.querySelector('[aria-hidden="true"] > span');
      expect(animated.textContent).toBe('0');
      act(() => { callback([{ target: card, isIntersecting: true }]); });
      now = 600; act(() => { frames.shift()(now); });
      const mid = Number(animated.textContent.replace(/,/g, ''));
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(1234);
      now = 1300; act(() => { while (frames.length) frames.shift()(now); });
      expect(animated.textContent).toBe('1,234');
      expect(card.querySelector('.sr-only').textContent).toBe('1,234');
    });

    it('with reduced motion nothing is hidden and the numbers show their final value', () => {
      window.matchMedia = q => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} });
      show(FILLED);
      expect(root().classList.contains('reveal-on')).toBe(false);
      const animated = document.getElementById('about-numbers').closest('section').querySelector('[aria-hidden="true"] > span');
      expect(animated.textContent).toBe('1,234');
    });
  });
});

describe('document title', () => {
  it('sets its own title and restores the previous one on leave', () => {
    document.title = 'Previous title';
    const { unmount } = show(EMPTY);
    expect(document.title).toBe(ABOUT_TITLE);
    unmount();
    expect(document.title).toBe('Previous title');
  });
});
