// @vitest-environment jsdom
// Q2: /terms and /privacy show the school's document word for word from
// legalContent.js, with one "Last updated" date, a mailto contact, a link to
// each other, and the footer, /login and consent links still on the right page.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Terms from './Terms';
import Privacy from './Privacy';
import Login from './Login';
import PublicFooter from '../../components/PublicFooter';
import ConsentCheckbox from '../../components/auth/ConsentCheckbox';
import { LEGAL_LAST_UPDATED, PRIVACY, TERMS } from './legalContent';

const EMAIL = '307915@deped.gov.ph';
const show = el => render(<MemoryRouter>{el}</MemoryRouter>);
const main = () => within(document.querySelector('main'));
const plain = s => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
const blocks = doc => [...doc.intro, ...doc.sections.flatMap(s => s.blocks)].flatMap(b => (typeof b === 'string' ? [b] : b.list));
const squash = s => s.replace(/\s+/g, ' ').trim();

afterEach(cleanup);

describe('the content file', () => {
  it('has one date constant, November 23, 2026', () => {
    expect(LEGAL_LAST_UPDATED).toBe('November 23, 2026');
  });

  it('holds the document titles and numbered headings exactly', () => {
    expect(TERMS.title).toBe('Terms & Conditions');
    expect(TERMS.sections.map(s => s.heading)).toEqual([
      '1. Acceptance of Terms', '2. User Accounts & Access', '3. Acceptable Use', '4. Academic Work, Grades & Records',
      '5. Uploaded Learning Materials', '6. AI-Assisted Lesson Planning & Tools', '7. Data Privacy & Security',
      '8. Service Availability & Limitation of Liability', '9. Account Suspension & Archiving', '10. Changes to These Terms', '11. Contact',
    ]);
    expect(PRIVACY.title).toBe('Privacy Policy');
    expect(PRIVACY.sections.map(s => s.heading)).toEqual([
      '1. Information We Collect', '2. How We Use Your Information', '3. Data Sharing & Disclosure', '4. Data Security',
      '5. Your Data Privacy Rights', '6. Changes to This Privacy Policy', '7. Contact Us',
    ]);
  });
});

describe.each([['Terms', Terms, TERMS, PRIVACY, '/privacy'], ['Privacy', Privacy, PRIVACY, TERMS, '/terms']])(
  '%s page', (_name, Page, doc, other, otherPath) => {
    it('h1, the date once, and the rendered h2 headings match the content file', () => {
      show(<Page />);
      expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual([doc.title]);
      expect(screen.getAllByText(`Last updated: ${LEGAL_LAST_UPDATED}`)).toHaveLength(1);
      expect(main().getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(doc.sections.map(s => s.heading));
    });

    it('every paragraph and list item of the content file is on the page, and bold stays bold', () => {
      show(<Page />);
      const text = squash(document.querySelector('article').textContent);
      for (const b of blocks(doc)) expect(text).toContain(squash(plain(b)));
      const bold = blocks(doc).flatMap(b => [...b.matchAll(/\*\*([^*]+)\*\*/g)].map(m => m[1]));
      const strong = [...document.querySelectorAll('article strong')].map(s => s.textContent);
      expect(strong).toEqual(bold);
      const items = doc.sections.flatMap(s => s.blocks).filter(b => typeof b !== 'string').flatMap(b => b.list);
      expect([...document.querySelectorAll('article ul > li')].map(li => li.textContent)).toEqual(items.map(plain));
    });

    it('the contact email is a mailto link', () => {
      show(<Page />);
      const link = main().getByRole('link', { name: EMAIL });
      expect(link.getAttribute('href')).toBe(`mailto:${EMAIL}`);
    });

    it('links to the other document right under the date', () => {
      show(<Page />);
      const date = screen.getByText(`Last updated: ${LEGAL_LAST_UPDATED}`);
      const line = date.nextElementSibling;
      expect(line.textContent).toBe(other.title); // the line holds only the link
      const link = line.querySelector('a');
      expect(link.textContent).toBe(other.title);
      expect(link.getAttribute('href')).toBe(otherPath);
    });
  });

describe('wording held back until decided', () => {
  it('no AI-provider paragraph on /privacy', () => {
    show(<Privacy />);
    expect(document.querySelector('main').textContent).not.toMatch(/Groq|AI features/);
  });
});

describe('links to the two pages', () => {
  it('the Terms intro links its own words "Privacy Policy" to /privacy', () => {
    show(<Terms />);
    const intro = document.querySelector('article h1').parentElement.querySelector('p.mt-6');
    expect(within(intro).getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy');
  });

  it('footer: Privacy Policy -> /privacy, Terms of Service -> /terms', () => {
    show(<PublicFooter />);
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy');
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe('/terms');
  });

  it('/login consent line: Terms of Use -> /terms, Privacy Statement -> /privacy', () => {
    show(<Login />);
    const line = within(document.querySelector('main'));
    expect(line.getByRole('link', { name: 'Terms of Use' }).getAttribute('href')).toBe('/terms');
    expect(line.getByRole('link', { name: 'Privacy Statement' }).getAttribute('href')).toBe('/privacy');
  });

  it('student and faculty consent box: Terms of Use -> /terms, Privacy Statement -> /privacy', () => {
    show(<ConsentCheckbox id="q2" checked={false} onChange={() => {}} />);
    expect(screen.getByRole('link', { name: 'Terms of Use' }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('link', { name: 'Privacy Statement' }).getAttribute('href')).toBe('/privacy');
  });
});
