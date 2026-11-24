// @vitest-environment jsdom
// 4j: the public News page asks only for posts its reader may see, and a
// failed read shows the app's own sentence, never the database text.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ role: null, calls: [], reply: { data: [], error: null } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ userData: h.role ? { role: h.role } : null }) }));
vi.mock('../../config/supabase', () => {
  const query = () => {
    const calls = [];
    h.calls.push(calls);
    const q = new Proxy({}, { get: (_, prop) => (prop === 'then'
      ? (ok, bad) => Promise.resolve(h.reply).then(ok, bad)
      : (...args) => { calls.push([prop, ...args]); return q; }) });
    return q;
  };
  return { supabase: { from: query } };
});

import News from './News';

afterEach(() => { cleanup(); h.role = null; h.calls = []; h.reply = { data: [], error: null }; });
const show = () => render(<MemoryRouter><News /></MemoryRouter>);
const orFilters = () => h.calls[0].filter(c => c[0] === 'or').map(c => c[1]);

describe('News data (4j)', () => {
  it('a guest asks only for posts addressed to all', async () => {
    show();
    await screen.findByText('No published news yet.');
    expect(orFilters()).toContain('target_roles.is.null,target_roles.ilike.*all*');
  });

  it('a signed-in student also asks for student posts', async () => {
    h.role = 'student';
    show();
    await screen.findByText('No published news yet.');
    expect(orFilters()).toContain('target_roles.is.null,target_roles.ilike.*all*,target_roles.ilike.*student*');
  });

  it('a teacher-only post that slips through is still not shown to a guest', async () => {
    h.reply = { data: [
      { id: 1, title: 'For everyone', target_roles: 'all', status: 'Published', content: 'a' },
      { id: 2, title: 'Faculty only memo', target_roles: 'teacher', status: 'Published', content: 'b' },
    ], error: null };
    show();
    expect(await screen.findAllByText('For everyone')).not.toHaveLength(0);
    expect(screen.queryByText('Faculty only memo')).toBeNull();
  });

  it('a failed read shows a friendly sentence, never the raw database message', async () => {
    h.reply = { data: null, error: { message: 'permission denied for table news', code: '42501' } };
    show();
    await screen.findAllByText(/could not|permission|try again/i);
    expect(document.body.textContent).not.toContain('permission denied for table news');
  });
});
