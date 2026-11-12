// @vitest-environment jsdom
// G2: a student's LRN in the admin user dialog (classic and Clarity) and in
// useAdminLogic's saveUser. Supabase and the backend are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ ctx: {}, calls: [], upsertError: null, invite: null }));

vi.mock('./AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => null }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ onlineUserIds: new Set() }) }));
vi.mock('../../../styles/dashboardTheme', () => ({ useDashboardTheme: () => ({ darkMode: false, setDarkMode: vi.fn(), themePref: 'light', setThemePref: vi.fn() }) }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../lib/backendApi', () => ({
  isAmbiguousBackendRequestError: () => false,
  backendRequest: vi.fn(async (path, options) => {
    h.calls.push(['backend', path, options?.body ? JSON.parse(options.body) : undefined]);
    if (path === '/api/admin/users/invite') return { user: { id: 'new', ...JSON.parse(options.body) } };
    return { users: [] };
  }),
}));
vi.mock('../../../config/supabase', () => {
  const query = (table) => {
    const q = new Proxy({}, {
      get: (_, prop) => {
        if (prop === 'then') return (ok, bad) => Promise.resolve({ data: [], count: 0, error: null }).then(ok, bad);
        if (prop === 'upsert') return (row, opts) => { h.calls.push(['upsert', table, row, opts]); return Promise.resolve({ error: h.upsertError }); };
        if (prop === 'update') return (row) => { h.calls.push(['update', table, row]); return q; };
        if (prop === 'single') return () => Promise.resolve({ data: { id: 'u1', name: 'Kid', role: 'student' }, error: null });
        return () => q;
      },
    });
    return q;
  };
  return { supabase: { from: query, channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: () => {}, storage: { from: () => ({}) } } };
});

import UsersTab from './tabs/UsersTab';
import ClarityAdminUsersTab from '../../../components/clarity/admin/ClarityAdminUsersTab';
import { useAdminLogic } from './useAdminLogic';
import { lrnInput } from './shared/lrn';

const ctx = (extra = {}) => ({
  closeModal: vi.fn(), deleteUser: vi.fn(), restoreUser: vi.fn(), editUser: null, fetchUsers: vi.fn(), filteredUsers: [], modal: 'user',
  openCreateUser: vi.fn(), openEditUser: vi.fn(), resendInvitation: vi.fn(), roleFilter: '', saveUser: vi.fn(), setRoleFilter: vi.fn(),
  setStatusFilter: vi.fn(), setShowArchived: vi.fn(), setUEmail: vi.fn(), setULrn: vi.fn(), setUName: vi.fn(), setURole: vi.fn(), setUStatus: vi.fn(), setUserSearch: vi.fn(),
  showArchived: false, statusFilter: '', uDept: '', setUDept: vi.fn(), uEmail: '', uLrn: '', uName: '', uRole: 'student', uSaving: false, uStatus: 'active',
  userSearch: '', users: [], usersLoading: false, usersError: null, onlineUsers: new Set(),
  ...extra,
});

beforeEach(() => { h.calls = []; h.upsertError = null; h.ctx = ctx(); });
afterEach(() => { cleanup(); vi.clearAllTimers(); });

describe.each([['classic', UsersTab], ['Clarity', ClarityAdminUsersTab]])('the %s user dialog', (_, Tab) => {
  it('shows the LRN field only when the role is Student, as a 12-digit numeric input', () => {
    const { unmount } = render(<Tab />);
    const input = screen.getByLabelText(/^LRN/);
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('maxlength')).toBe('12');
    expect(input.getAttribute('aria-required')).toBe('true');
    unmount();
    for (const uRole of ['teacher', 'main_admin']) {
      h.ctx = ctx({ uRole });
      const view = render(<Tab />);
      expect(screen.queryByLabelText(/^LRN/)).toBeNull();
      view.unmount();
    }
  });

  it('keeps digits only, at most twelve', () => {
    render(<Tab />);
    fireEvent.change(screen.getByLabelText(/^LRN/), { target: { value: '10-81 2345a67890123' } });
    expect(h.ctx.setULrn).toHaveBeenLastCalledWith('108123456789');
  });

  it('create: an empty or invalid LRN is marked invalid after Send Invitation', () => {
    render(<Tab />);
    fireEvent.click(screen.getByRole('button', { name: 'Send Invitation' }));
    const input = screen.getByLabelText(/^LRN/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('A 12-digit LRN is required for a student.')).toBeTruthy();
  });

  it('edit: a blank LRN on a legacy student is not an error and is not required', () => {
    h.ctx = ctx({ editUser: { id: 'u1', role: 'student' }, uName: 'Kid', uEmail: 'kid@school.test' });
    render(<Tab />);
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    const input = screen.getByLabelText(/^LRN/);
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-required')).toBeNull();
  });
});

describe('lrnInput', () => {
  it('strips non-digits and caps at twelve', () => {
    expect(lrnInput(' 1081-2345-6789 99')).toBe('108123456789');
    expect(lrnInput('abc')).toBe('');
  });
});

describe('useAdminLogic saveUser', () => {
  const setup = async () => {
    const hook = renderHook(() => useAdminLogic({ uid: 'admin-1' }));
    await act(async () => {});
    return hook;
  };
  const fill = async (hook, { name = 'Kid', email = 'kid@school.test', role = 'student', lrn } = {}) => {
    await act(async () => {
      hook.result.current.setUName(name);
      hook.result.current.setUEmail(email);
      hook.result.current.setURole(role);
      if (lrn !== undefined) hook.result.current.setULrn(lrn);
    });
  };
  const save = async (hook) => { await act(async () => { await hook.result.current.saveUser(); }); };
  const invites = () => h.calls.filter(c => c[1] === '/api/admin/users/invite');

  it('create a student: blocked with no LRN or a bad one, nothing sent', async () => {
    const hook = await setup();
    act(() => hook.result.current.openCreateUser());
    for (const lrn of ['', '12345', '1081234567ab']) {
      await fill(hook, { lrn });
      await save(hook);
      expect(invites()).toEqual([]);
      expect(hook.result.current.toast).toEqual({ msg: 'A 12-digit LRN is required for a student.', type: 'error' });
    }
  });

  it('create a student: the invite carries the trimmed LRN', async () => {
    const hook = await setup();
    act(() => hook.result.current.openCreateUser());
    await fill(hook, { lrn: ' 108123456789 ' });
    await save(hook);
    expect(invites()[0][2]).toEqual({ name: 'Kid', email: 'kid@school.test', role: 'student', department: null, lrn: '108123456789' });
  });

  it('create a teacher or admin: the payload is exactly as before (no lrn key), even if an LRN was typed', async () => {
    for (const role of ['teacher', 'main_admin']) {
      h.calls = [];
      const hook = await setup();
      act(() => hook.result.current.openCreateUser());
      await fill(hook, { role, lrn: '108123456789' });
      await save(hook);
      expect(invites()[0][2]).toEqual({ name: 'Kid', email: 'kid@school.test', role, department: null });
      hook.unmount();
    }
  });

  it('opening Create clears the LRN; opening Edit loads it from the row', async () => {
    const hook = await setup();
    act(() => hook.result.current.openEditUser({ id: 'u1', name: 'Kid', email: 'kid@school.test', role: 'student', lrn: '108123456789' }));
    expect(hook.result.current.uLrn).toBe('108123456789');
    act(() => hook.result.current.openCreateUser());
    expect(hook.result.current.uLrn).toBe('');
  });

  it('edit a student: the LRN is upserted on students before the profile update', async () => {
    const hook = await setup();
    act(() => hook.result.current.openEditUser({ id: 'u1', name: 'Kid', email: 'kid@school.test', role: 'student', status: 'active', lrn: '108123456789' }));
    await save(hook);
    const writes = h.calls.filter(c => c[0] === 'upsert' || (c[0] === 'update' && c[1] === 'profiles'));
    expect(writes[0]).toEqual(['upsert', 'students', { id: 'u1', lrn: '108123456789' }, { onConflict: 'id' }]);
    expect(writes[1][1]).toBe('profiles');
  });

  it('edit a student: a duplicate LRN shows the message and the profile is not updated', async () => {
    h.upsertError = { code: '23505', message: 'duplicate key value' };
    const hook = await setup();
    act(() => hook.result.current.openEditUser({ id: 'u1', name: 'Kid', email: 'kid@school.test', role: 'student', status: 'active', lrn: '108123456789' }));
    await save(hook);
    expect(hook.result.current.toast).toEqual({ msg: 'This LRN is already used by another student.', type: 'error' });
    expect(h.calls.some(c => c[0] === 'update' && c[1] === 'profiles')).toBe(false);
  });

  it('edit a legacy student with a blank LRN: saved without touching students', async () => {
    const hook = await setup();
    act(() => hook.result.current.openEditUser({ id: 'u1', name: 'Kid', email: 'kid@school.test', role: 'student', status: 'active', lrn: null }));
    await save(hook);
    expect(h.calls.some(c => c[0] === 'upsert')).toBe(false);
    expect(h.calls.some(c => c[0] === 'update' && c[1] === 'profiles')).toBe(true);
  });

  it('edit a student with an invalid LRN: blocked, nothing written', async () => {
    const hook = await setup();
    act(() => hook.result.current.openEditUser({ id: 'u1', name: 'Kid', email: 'kid@school.test', role: 'student', status: 'active' }));
    await act(async () => hook.result.current.setULrn('123'));
    await save(hook);
    expect(h.calls.some(c => c[0] === 'upsert' || c[0] === 'update')).toBe(false);
  });

  it('edit a teacher: no students write, the profile update has the same fields as before', async () => {
    const hook = await setup();
    act(() => hook.result.current.openEditUser({ id: 'u1', name: 'T', email: 't@school.test', role: 'teacher', status: 'active', department: 'Math', lrn: null }));
    await save(hook);
    expect(h.calls.some(c => c[0] === 'upsert')).toBe(false);
    const update = h.calls.find(c => c[0] === 'update' && c[1] === 'profiles')[2];
    expect(Object.keys(update)).toEqual(['name', 'department', 'role', 'status', 'updated_at']);
  });
});
