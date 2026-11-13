// @vitest-environment jsdom
// L1: the home hero offers one Sign In chooser instead of "Student Portal",
// and About us is a link to the About page. The vision card stays.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const show = () => render(<MemoryRouter><Home /></MemoryRouter>);

describe('Home hero', () => {
  it('has a Sign In button and no Student Portal button', () => {
    show();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Student Portal' })).toBeNull();
  });

  it('About us is a link to /about inside main; the footer sits outside main', () => {
    show();
    const main = document.querySelector('main');
    expect(within(main).getByRole('link', { name: /About us/ }).getAttribute('href')).toBe('/about');
    expect(main.querySelector('footer')).toBeNull();
    expect(document.querySelector('footer')).toBeTruthy();
  });

  it('keeps the vision card', () => {
    show();
    expect(document.getElementById('vision')).toBeTruthy();
  });

  it('the chooser stays open while the slideshow advances (the hero is not remounted)', () => {
    vi.useFakeTimers();
    show();
    const button = screen.getByRole('button', { name: 'Sign In' });
    fireEvent.click(button);
    act(() => { vi.advanceTimersByTime(4100); });
    expect(screen.getByRole('button', { name: 'Sign In' })).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: /^Student/ }).getAttribute('href')).toBe('/student-login');
  });

  it('raises the hero content above the slideshow controls only while the chooser is open', () => {
    show();
    const content = screen.getByRole('button', { name: 'Sign In' }).closest('.h-full');
    expect(content.className).toContain('z-10');
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(content.className).toContain('z-30');
  });
});
