// @vitest-environment jsdom
// Q4: the About gallery tiles all share one 3:2 crop, every photo keeps its
// alt text and caption, and about.css stays scoped, light only, with the
// hover lift behind reduced motion.
import { existsSync, readFileSync } from 'node:fs';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import About from './About';
import aboutContent from './aboutContent';

const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`].find(existsSync), 'utf8').replace(/\r\n/g, '\n');
const css = read('pages/about/about.css');
const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
const figures = () => [...document.getElementById('about-campus').closest('section').querySelectorAll('figure')];

afterEach(cleanup);

describe('About gallery tiles', () => {
  it('every tile has the same 3:2 frame, and each photo covers it', () => {
    render(<MemoryRouter><About /></MemoryRouter>);
    const figs = figures();
    expect(figs).toHaveLength(aboutContent.campus.photos.length);
    const frames = figs.map(f => f.querySelector('img').parentElement);
    for (const frame of frames) {
      expect(frame.tagName).toBe('DIV');
      expect(frame.className.split(/\s+/)).toContain('aspect-[3/2]');
      expect(frame.getAttribute('style')).toBeNull();
    }
    expect(new Set(frames.map(f => f.className)).size).toBe(1);
    expect(new Set(figs.map(f => f.className)).size).toBe(1);
    for (const img of figs.map(f => f.querySelector('img'))) {
      expect(img.className.split(/\s+/)).toEqual(expect.arrayContaining(['h-full', 'w-full', 'object-cover']));
      expect(img.style.aspectRatio).toBe('');
    }
  });

  it('every photo has its alt text and a caption', () => {
    render(<MemoryRouter><About /></MemoryRouter>);
    figures().forEach((fig, i) => {
      const { caption } = aboutContent.campus.photos[i];
      expect(caption.trim().length).toBeGreaterThan(10);
      expect(fig.querySelector('img').getAttribute('alt')).toBe(caption);
      expect(fig.querySelector('figcaption .about-caption')?.textContent).toBe(caption);
    });
  });
});

describe('about.css', () => {
  it('is imported by About.jsx only, and nothing goes into the shared stylesheets', () => {
    expect(read('pages/about/About.jsx')).toContain("import './about.css';");
    for (const shared of ['styles/index.css', 'styles/clarity-components.css']) expect(read(shared), shared).not.toMatch(/about-(card|photo|lift|caption)/);
  });

  it('no theme class, no !important, no nowrap, no dark rules, every rule under .about-page', () => {
    expect(css).not.toContain(['theme', 'clarity'].join('-'));
    expect(body).not.toMatch(/!important|nowrap|\.dark\b|prefers-color-scheme/);
    const selectors = [...body.replace(/@media[^{]*\{/g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(m => m[1].split(','))
      .map(s => s.trim()).filter(Boolean);
    expect(selectors.length).toBeGreaterThan(6);
    for (const s of selectors) expect(s, s).toMatch(/^\.about-page\b/);
  });

  it('one shadow scale, and the lift only with motion allowed; reduced motion comes first and turns it off', () => {
    for (const step of ['sm', 'md', 'lg']) expect(body).toContain(`--about-shadow-${step}:`);
    expect(body.indexOf('@media (prefers-reduced-motion: reduce)')).toBe(body.search(/@media/));
    expect(body).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.about-page \.about-lift \{ transition: none; \}\s*\.about-page \.about-lift:hover \{ transform: none; \}\s*\}/);
    const lifts = [...body.matchAll(/translateY\(-2px\)/g)].map(m => m.index);
    const motionOk = body.indexOf('@media (hover: hover) and (prefers-reduced-motion: no-preference)');
    expect(lifts.length).toBe(2);
    expect(motionOk).toBeGreaterThan(-1);
    for (const at of lifts) expect(at).toBeGreaterThan(motionOk);
    expect(body).not.toMatch(/animation|@keyframes/);
  });
});
