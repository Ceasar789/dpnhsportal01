// @vitest-environment jsdom
// Q2: the About page says what about-content.md says (copied into
// aboutContent.js) and shows the six turnover photos, each with its caption
// as alt text and figcaption, a "Source: " line, and the credit line after
// the gallery. Space is held while they load and they load lazily.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import About from './About';
import aboutContent from './aboutContent';

const show = () => render(<MemoryRouter><About /></MemoryRouter>);
const plain = s => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
const squash = s => s.replace(/\s+/g, ' ').trim();
const FILES = ['turnover-01-crowd.jpg', 'turnover-02-school-entrance.jpg', 'turnover-03-ribbon-cutting.jpg',
  'turnover-04-handover.jpg', 'turnover-05-gazebo.jpg', 'turnover-06-streamers-parade.jpg'];
const gallery = () => document.getElementById('about-campus').closest('section');

afterEach(cleanup);

describe('About gallery', () => {
  it('six photos in order, each with alt = its caption, fixed size and lazy loading', () => {
    show();
    const imgs = [...gallery().querySelectorAll('img')];
    expect(imgs.map(i => i.getAttribute('src'))).toEqual(FILES.map(f => `/about/${f}`));
    imgs.forEach((img, i) => {
      const photo = aboutContent.campus.photos[i];
      expect(img.getAttribute('alt')).toBe(photo.caption);
      expect(photo.caption.trim().length).toBeGreaterThan(10);
      expect(Number(img.getAttribute('width'))).toBe(photo.width);
      expect(Number(img.getAttribute('height'))).toBe(photo.height);
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.className).toMatch(/\bobject-cover\b/);
      expect(img.className).toMatch(/\bh-full\b/);
    });
  });

  it('every photo sits in a figure with its caption and a "Source: " line', () => {
    show();
    const figures = [...gallery().querySelectorAll('figure')];
    expect(figures).toHaveLength(6);
    figures.forEach((fig, i) => {
      const photo = aboutContent.campus.photos[i];
      const caption = fig.querySelector('figcaption');
      expect(caption.textContent).toContain(photo.caption);
      expect(within(caption).getByText(`Source: ${photo.source}`)).toBeTruthy();
    });
  });

  it('the credit line comes once, after the gallery', () => {
    show();
    const credit = screen.getByText('Photos and details from the Facebook posts of Barangay Dela Paz and Mayor Gel Alonte.');
    const grid = gallery().querySelector('ul');
    expect(grid.compareDocumentPosition(credit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('one column by default, more only from a breakpoint up', () => {
    show();
    const cls = gallery().querySelector('ul').className.split(/\s+/);
    expect(cls).toContain('grid-cols-1');
    expect(cls.filter(c => /^grid-cols-/.test(c))).toEqual(['grid-cols-1']);
    expect(cls).toEqual(expect.arrayContaining(['min-[460px]:grid-cols-2', 'min-[940px]:grid-cols-3']));
  });
});

describe('About text', () => {
  it('every paragraph and list item of the content is on the page', () => {
    show();
    const text = squash(document.querySelector('main').textContent);
    const c = aboutContent;
    const all = [c.portalSummary, ...c.features.flatMap(g => [g.who, ...g.items]), c.whoCanUse,
      c.campus.title, ...c.campus.paragraphs, c.contactLine];
    for (const t of all) expect(text).toContain(squash(plain(t)));
  });

  it('Who can use it links its own words to the Terms and Privacy pages', () => {
    show();
    const who = within(document.getElementById('about-who').closest('section'));
    expect(who.getByRole('link', { name: 'Terms of Use' }).getAttribute('href')).toBe('/terms');
    expect(who.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy');
  });

  it('the contact sentence links the email; the map and Facebook stay', () => {
    show();
    const contact = within(document.getElementById('about-contact').closest('section'));
    expect(contact.getAllByRole('link', { name: aboutContent.email })).toHaveLength(1);
    expect(contact.getByRole('link', { name: aboutContent.email }).getAttribute('href')).toBe(`mailto:${aboutContent.email}`);
    expect(contact.getByRole('link', { name: /on the map/ })).toBeTruthy();
    expect(contact.getByRole('link', { name: /on Facebook/ })).toBeTruthy();
  });

  it('no tagline, no vision statement, no "Inspiring excellence"', () => {
    show();
    const text = document.querySelector('main').textContent;
    expect(text).not.toMatch(/Inspiring excellence|We dream of Filipinos|OUR VISION/i);
  });
});
