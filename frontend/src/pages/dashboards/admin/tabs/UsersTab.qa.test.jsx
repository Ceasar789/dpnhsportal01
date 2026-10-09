// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {}, mobile: false }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../../lib/useMediaQuery', () => ({ useMediaQuery: () => h.mobile }));
vi.mock('../../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => null }));

const UsersTab = (await import('./UsersTab')).default;

const user = {
  id: 'user-1',
  name: 'Test User',
  email: 'test.user@example.com',
  role: 'teacher',
  status: 'active',
};

beforeEach(() => {
  h.mobile = false;
  h.ctx = {
    closeModal: vi.fn(), deleteUser: vi.fn(), restoreUser: vi.fn(), editUser: null,
    fetchUsers: vi.fn(), filteredUsers: [user], modal: null, openCreateUser: vi.fn(),
    openEditUser: vi.fn(), roleFilter: '', saveUser: vi.fn(), setRoleFilter: vi.fn(),
    setStatusFilter: vi.fn(), setShowArchived: vi.fn(), setUEmail: vi.fn(),
    setUName: vi.fn(), setUPass: vi.fn(), setURole: vi.fn(), setUStatus: vi.fn(),
    setUserSearch: vi.fn(), showArchived: false, statusFilter: '', uDept: '',
    setUDept: vi.fn(), uEmail: '', uName: '', uPass: '', uRole: 'student',
    uSaving: false, uStatus: 'active', userSearch: '', users: [user],
    usersLoading: false, usersError: null, onlineUsers: new Set(),
  };
});

afterEach(cleanup);

describe('Users QA Sprint 01 presentation', () => {
  it('shows a persistent load error whose Retry uses the existing fetcher', () => {
    h.ctx.usersError = 'Unable to load users.';
    render(<UsersTab />);

    expect(screen.getByText('Unable to load users.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.ctx.fetchUsers).toHaveBeenCalledOnce();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('replaces Archive with Restore while archive view is active', () => {
    h.ctx.showArchived = true;
    h.ctx.filteredUsers = [{ ...user, status: 'archived' }];
    render(<UsersTab />);

    expect(screen.queryByRole('button', { name: 'Archive Test User' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore Test User' }));
    expect(h.ctx.restoreUser).toHaveBeenCalledWith('user-1', expect.any(Function));
    expect(h.ctx.deleteUser).not.toHaveBeenCalled();
  });

  it('uses table actions without row-button behavior above the mobile breakpoint', () => {
    render(<UsersTab />);
    const row = screen.getByText('Test User').closest('tr');

    expect(row.getAttribute('role')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Test User' }));
    expect(h.ctx.openEditUser).toHaveBeenCalledOnce();
  });

  it('uses RowSheet activation at the mobile breakpoint', () => {
    h.mobile = true;
    render(<UsersTab />);
    const row = screen.getByRole('button', { name: 'Open Test User' });

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Test User' })).toBeTruthy();
  });
});
