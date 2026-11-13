// L1: aboutContent.js holds real data only. The filled fields are copied
// from text the site already shows; the rest stay empty until the school
// provides them.
import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import aboutContent from './aboutContent';

const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`].find(existsSync), 'utf8');
const homeText = read('pages/public/Home.jsx');
const footerText = read('components/PublicFooter.jsx');

describe('aboutContent', () => {
  it('the filled fields match text the site already shows', () => {
    expect(aboutContent.schoolName).toBe('Dela Paz National High School');
    expect(footerText).toContain(aboutContent.tagline);
    for (const p of aboutContent.vision) expect(homeText).toContain(p);
    expect(aboutContent.portalSummary).toBe('An AI-assisted, web-based lesson planning and learning resources management system for Dela Paz National High School.');
    expect(footerText).toContain(`'${aboutContent.email}'`);
    expect(footerText).toContain(`'${aboutContent.mapUrl}'`);
    expect(footerText).toContain(`'${aboutContent.facebookUrl}'`);
  });

  it('every field still waiting for the school is empty', () => {
    for (const key of ['mission', 'phone', 'address', 'officeHours']) expect(aboutContent[key], key).toBe('');
    for (const key of ['story', 'timeline', 'values', 'stats']) expect(aboutContent[key], key).toEqual([]);
  });

  it('no placeholder copy', () => {
    expect(JSON.stringify(aboutContent)).not.toMatch(/lorem|ipsum|placeholder|TODO|example\.com/i);
  });
});
