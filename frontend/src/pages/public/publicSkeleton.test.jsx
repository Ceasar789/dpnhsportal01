// @vitest-environment jsdom
// L2: the public News and Calendar pages show the shared skeleton (no
// spinner) while they load, with a new visually hidden status line, and the
// skeleton is gone once the read settles. Supabase is a fake that either
// never answers (loading) or answers with nothing (settled).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ pending: true }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ userData: null }) }));
vi.mock('../../config/supabase', () => {
  const query = () => {
    const q = new Proxy({}, { get: (_, prop) => (prop === 'then'
      ? (ok, bad) => (h.pending ? new Promise(() => {}) : Promise.resolve({ data: [], error: null })).then(ok, bad)
      : () => q) });
    return q;
  };
  return { supabase: { from: query, rpc: query } };
});

import News from './News';
import Calendar from './Calendar';

const groups = () => [...document.querySelectorAll('[data-skeleton]')];
const show = Page => render(<MemoryRouter><Page /></MemoryRouter>);

afterEach(() => { cleanup(); h.pending = true; });

describe.each([
  ['News (#42)', News, 'Loading news…'],
  ['Calendar (#43)', Calendar, 'Loading events…'],
])('%s', (_, Page, text) => {
  it('loading: a hidden status line, an aria-hidden skeleton with no text, no spinner', () => {
    show(Page);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe(text);
    expect(status.className).toBe('sr-only');
    expect(groups().length).toBe(1);
    expect(groups()[0].getAttribute('aria-hidden')).toBe('true');
    expect(groups()[0].textContent.trim()).toBe('');
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('settled: the status line and the skeleton are gone', async () => {
    h.pending = false;
    show(Page);
    await waitFor(() => expect(screen.queryByText(text)).toBeNull());
    expect(groups()).toEqual([]);
  });
});

it('Calendar: the skeleton month has the same leading blanks and day count as the real grid', () => {
  show(Calendar);
  const grid = document.querySelector('[data-skeleton] .grid-cols-7.gap-1:not(.mb-2)');
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  expect(grid.children.length).toBe(firstDay + days);
});
