// @vitest-environment jsdom
// F2: an admin can give only Admin, Teacher or Student. An account that still
// holds a removed role (faculty, registrar) displays without crashing.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { roleBadge, roleLabel, TARGET_ROLES } from '../shared/helpers';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../../lib/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('../../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => null }));
const UsersTab = (await import('./UsersTab')).default;

const legacy = { id: 'u-fac', name: 'Legacy Faculty', email: 'faculty@example.test', role: 'faculty', status: 'active' };
const teacher = { id: 'u-t', name: 'A Teacher', email: 't@example.test', role: 'teacher', status: 'active' };

beforeEach(() => {
  h.ctx = {
    closeModal: vi.fn(), deleteUser: vi.fn(), restoreUser: vi.fn(), editUser: null,
    fetchUsers: vi.fn(), filteredUsers: [legacy, teacher], modal: null, openCreateUser: vi.fn(),
    openEditUser: vi.fn(), roleFilter: '', saveUser: vi.fn(), setRoleFilter: vi.fn(),
    resendInvitation: vi.fn(), setStatusFilter: vi.fn(), setShowArchived: vi.fn(), setUEmail: vi.fn(),
    setUName: vi.fn(), setUPass: vi.fn(), setURole: vi.fn(), setUStatus: vi.fn(),
    setUserSearch: vi.fn(), showArchived: false, statusFilter: '', uDept: '',
    setUDept: vi.fn(), uEmail: '', uName: '', uPass: '', uRole: 'student',
    uSaving: false, uStatus: 'active', userSearch: '', users: [legacy, teacher],
    usersLoading: false, usersError: null, onlineUsers: new Set(),
  };
});
afterEach(cleanup);

const optionsOf = select => [...select.querySelectorAll('option')].map(o => ({ value: o.value, label: o.textContent, disabled: o.disabled }));

describe('Users tab roles', () => {
  it('the role filter offers only Admin, Teacher and Student', () => {
    render(<UsersTab />);
    const filter = screen.getByRole('combobox', { name: 'Filter users by role' });
    expect(optionsOf(filter).map(o => o.value)).toEqual(['', 'student', 'teacher', 'main_admin']);
  });

  it('a legacy faculty account is listed with its raw role text and a neutral badge', () => {
    render(<UsersTab />);
    const row = screen.getAllByText('Legacy Faculty')[0].closest('tr');
    expect(within(row).getAllByText('faculty').length).toBeGreaterThan(0);
    expect(row.querySelector('.badge-grey')).toBeTruthy();
  });

  it('creating a user offers exactly Student, Teacher and Admin', () => {
    h.ctx.modal = 'user';
    render(<UsersTab />);
    expect(optionsOf(document.getElementById('users-role'))).toEqual([
      { value: 'student', label: 'Student', disabled: false },
      { value: 'teacher', label: 'Teacher', disabled: false },
      { value: 'main_admin', label: 'Admin', disabled: false },
    ]);
  });

  it.each(['faculty', 'registrar'])('editing a legacy %s account shows that role, disabled, instead of Student', (role) => {
    h.ctx.modal = 'user';
    h.ctx.editUser = { ...legacy, role };
    h.ctx.uRole = role;
    render(<UsersTab />);
    const select = document.getElementById('users-role');
    expect(select.value).toBe(role);
    expect(optionsOf(select)).toContainEqual({ value: role, label: `${role} (no longer used)`, disabled: true });
    expect(optionsOf(select).filter(o => !o.disabled).map(o => o.value)).toEqual(['student', 'teacher', 'main_admin']);
  });
});

describe('admin role helpers', () => {
  it('label and badge for the three roles are unchanged; anything else falls back gracefully', () => {
    expect([roleLabel('student'), roleLabel('teacher'), roleLabel('main_admin')]).toEqual(['Student', 'Teacher', 'Admin']);
    expect([roleBadge('student'), roleBadge('teacher'), roleBadge('main_admin')]).toEqual(['badge-blue', 'badge-green', 'badge-red']);
    for (const role of ['faculty', 'registrar', 'guest']) {
      expect(roleLabel(role)).toBe(role);
      expect(roleBadge(role)).toBe('badge-grey');
    }
    expect(roleLabel(undefined)).toBeUndefined();
  });

  it('news audiences no longer offer Faculty, Registrar or the old staff set', () => {
    expect(TARGET_ROLES.map(t => t.value)).toEqual(['all', 'student', 'teacher', 'custom']);
  });
});
