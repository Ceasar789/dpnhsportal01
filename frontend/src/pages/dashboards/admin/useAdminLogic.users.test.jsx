// @vitest-environment jsdom
// U3: useAdminLogic.saveUser / resendInvitation contract. Field problems come
// back as { ok:false, fieldErrors } with no toast; a toast reports only the
// final result; server errors never show raw text. Supabase and the backend
// are mocked (same shape as usersLrn.test.jsx).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const h = vi.hoisted(() => ({ calls: [], inviteError: null, resendError: null, updateError: null }));

vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ onlineUserIds: new Set() }) }));
vi.mock('../../../styles/dashboardTheme', () => ({ useDashboardTheme: () => ({ darkMode: false, setDarkMode: vi.fn(), themePref: 'light', setThemePref: vi.fn() }) }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../lib/backendApi', () => ({
  isAmbiguousBackendRequestError: () => false,
  backendRequest: vi.fn(async (path, options) => {
    h.calls.push(['backend', path, options?.body ? JSON.parse(options.body) : undefined]);
    if (path === '/api/admin/users/invite') {
      if (h.inviteError) throw h.inviteError;
      return { user: { id: `new-${h.calls.length}`, ...JSON.parse(options.body) } };
    }
    if (path.endsWith('/resend-invitation')) {
      if (h.resendError) throw h.resendError;
      return { message: 'Invitation sent again.' };
    }
    return { users: [] };
  }),
}));
vi.mock('../../../config/supabase', () => {
  const query = (table) => {
    const q = new Proxy({}, {
      get: (_, prop) => {
        if (prop === 'then') return (ok, bad) => Promise.resolve({ data: [], count: 0, error: null }).then(ok, bad);
        if (prop === 'upsert') return (row) => { h.calls.push(['upsert', table, row]); return Promise.resolve({ error: null }); };
        if (prop === 'update') return (row) => { h.calls.push(['update', table, row]); return q; };
        if (prop === 'single') return () => Promise.resolve(h.updateError ? { data: null, error: h.updateError } : { data: { id: 'u1', name: 'T', role: 'teacher' }, error: null });
        return () => q;
      },
    });
    return q;
  };
  return { supabase: { from: query, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {}, storage: { from: () => ({}) } } };
});

import { useAdminLogic } from './useAdminLogic';

const backendError = (message, kind = 'response') => Object.assign(new Error(message), { name: 'BackendRequestError', kind });
const setup = async () => {
  const hook = renderHook(() => useAdminLogic({ uid: 'admin-1' }));
  await act(async () => {});
  return hook;
};
const fill = async (hook, { name = 'Ana', email = 'ana@school.edu.ph', role = 'student', lrn = '108123456789', dept } = {}) => {
  await act(async () => {
    hook.result.current.setUName(name);
    hook.result.current.setUEmail(email);
    hook.result.current.setURole(role);
    hook.result.current.setULrn(lrn);
    if (dept !== undefined) hook.result.current.setUDept(dept);
  });
};
const save = async (hook, opts) => { let r; await act(async () => { r = await hook.result.current.saveUser(opts); }); return r; };
const invites = () => h.calls.filter(c => c[1] === '/api/admin/users/invite');

beforeEach(() => { h.calls = []; h.inviteError = null; h.resendError = null; h.updateError = null; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('saveUser: field problems', () => {
  it('returns every field problem, sends nothing, and shows no toast', async () => {
    const hook = await setup();
    act(() => hook.result.current.openCreateUser());
    await fill(hook, { name: '', email: 'ana@', lrn: '12' });
    const result = await save(hook);
    expect(result).toEqual({ ok: false, fieldErrors: [
      { fieldId: 'users-full-name', message: 'Enter the full name.' },
      { fieldId: 'users-email', message: 'Enter an email address like name@school.edu.ph.' },
      { fieldId: 'users-lrn', message: "The LRN must be 12 digits. You've entered 2." },
    ] });
    expect(invites()).toEqual([]);
    expect(hook.result.current.toast).toBeNull();
  });

  it('the self-admin guard still toasts and writes nothing', async () => {
    const hook = await setup();
    act(() => hook.result.current.openEditUser({ id: 'admin-1', name: 'Me', email: 'me@school.test', role: 'main_admin', status: 'active' }));
    await act(async () => hook.result.current.setURole('teacher'));
    const result = await save(hook);
    expect(result).toEqual({ ok: false });
    expect(hook.result.current.toast).toEqual({ msg: 'You cannot change your own administrator role or account status.', type: 'error' });
    expect(h.calls.some(c => c[0] === 'update')).toBe(false);
  });
});

describe('saveUser: success', () => {
  it('create: sends the same payload as before, toasts, closes', async () => {
    const hook = await setup();
    act(() => hook.result.current.openCreateUser());
    await fill(hook);
    const result = await save(hook);
    expect(result).toEqual({ ok: true });
    expect(invites()[0][2]).toEqual({ name: 'Ana', email: 'ana@school.edu.ph', role: 'student', department: null, lrn: '108123456789' });
    expect(hook.result.current.toast).toEqual({ msg: 'User invited. They can create their password from the email link.', type: 'success' });
    expect(hook.result.current.modal).toBeNull();
  });

  it('create with addAnother: stays open, keeps the role, clears name, email, department and LRN', async () => {
    const hook = await setup();
    act(() => hook.result.current.openCreateUser());
    await fill(hook, { role: 'teacher', dept: 'Math', lrn: '' });
    const result = await save(hook, { addAnother: true });
    expect(result).toEqual({ ok: true });
    const c = hook.result.current;
    expect(c.modal).toBe('user');
    expect([c.uName, c.uEmail, c.uDept, c.uLrn, c.uRole]).toEqual(['', '', '', '', 'teacher']);
  });

  it('a second press while saving is ignored (one invite)', async () => {
    const hook = await setup();
    act(() => hook.result.current.openCreateUser());
    await fill(hook);
    let first; let second;
    await act(async () => {
      first = hook.result.current.saveUser();
      second = hook.result.current.saveUser();
      await Promise.all([first, second]);
    });
    expect(invites()).toHaveLength(1);
    expect(await second).toEqual({ ok: false, busy: true });
  });
});

describe('saveUser: server errors are mapped, never raw', () => {
  it.each([
    ['duplicate LRN', backendError('This LRN is already used by another student.'), { ok: false, fieldErrors: [{ fieldId: 'users-lrn', message: 'This LRN is already used by another student.' }] }, null],
    ['duplicate email', backendError('An account already uses this email address.'), { ok: false, fieldErrors: [{ fieldId: 'users-email', message: 'An account with this email already exists.' }] }, null],
    ['invite failed', backendError('The invitation could not be completed. No account was added.'), { ok: false }, 'The invitation could not be completed. No account was added.'],
    ['offline / no response', backendError('The server response could not be received.', 'transport'), { ok: false }, "We couldn't confirm the invitation was sent. Check the user list before trying again."],
    ['session', backendError('Your session is unavailable. Sign in again.', 'session'), { ok: false }, 'Your session has ended. Please sign in again.'],
    ['raw server text', backendError('Internal: relation "profiles" does not exist'), { ok: false }, 'The user could not be saved. Please try again.'],
  ])('%s', async (_, error, expected, toast) => {
    h.inviteError = error;
    const hook = await setup();
    act(() => hook.result.current.openCreateUser());
    await fill(hook);
    expect(await save(hook)).toEqual(expected);
    expect(hook.result.current.toast).toEqual(toast ? { msg: toast, type: 'error' } : null);
    expect(hook.result.current.modal).toBe('user');   // the dialog stays open with the values
    expect(hook.result.current.uName).toBe('Ana');
  });

  it('edit: a permission error from Supabase becomes a friendly sentence', async () => {
    h.updateError = { code: '42501', message: 'new row violates row-level security policy for table "profiles"' };
    const hook = await setup();
    act(() => hook.result.current.openEditUser({ id: 'u1', name: 'T', email: 't@school.test', role: 'teacher', status: 'active' }));
    expect(await save(hook)).toEqual({ ok: false });
    expect(hook.result.current.toast).toEqual({ msg: "You don't have permission to do that.", type: 'error' });
  });
});

describe('resendInvitation', () => {
  it.each([
    [backendError('This account no longer has a pending invitation.'), 'This account no longer has a pending invitation.'],
    [backendError('User not found.'), "We couldn't find that user. Refresh the list and try again."],
    [backendError('stack: at x (y.js:1:1)'), 'The invitation could not be resent. Please try again.'],
  ])('%o', async (error, msg) => {
    h.resendError = error;
    const hook = await setup();
    await act(async () => { await hook.result.current.resendInvitation({ id: 'u2', email: 'b@school.test' }).catch(() => {}); });
    expect(hook.result.current.toast).toEqual({ msg, type: 'error' });
  });

  it('success is unchanged', async () => {
    const hook = await setup();
    await act(async () => { await hook.result.current.resendInvitation({ id: 'u2', email: 'b@school.test' }); });
    expect(hook.result.current.toast).toEqual({ msg: 'Invitation resent to b@school.test.', type: 'success' });
  });
});
