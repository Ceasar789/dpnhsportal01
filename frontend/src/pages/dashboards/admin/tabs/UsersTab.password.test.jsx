// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../../lib/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('../../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => null }));

const UsersTab = (await import('./UsersTab')).default;

beforeEach(() => {
  h.ctx = {
    closeModal: vi.fn(), deleteUser: vi.fn(), restoreUser: vi.fn(), editUser: null,
    fetchUsers: vi.fn(), filteredUsers: [], modal: 'user', openCreateUser: vi.fn(),
    openEditUser: vi.fn(), resendInvitation: vi.fn(), roleFilter: '', saveUser: vi.fn(),
    setRoleFilter: vi.fn(), setStatusFilter: vi.fn(), setShowArchived: vi.fn(),
    setUEmail: vi.fn(), setUName: vi.fn(), setURole: vi.fn(), setUStatus: vi.fn(),
    setUserSearch: vi.fn(), showArchived: false, statusFilter: '', uDept: '',
    setUDept: vi.fn(), uEmail: '', uName: '', uRole: 'student', uSaving: false,
    uStatus: 'active', userSearch: '', users: [], usersLoading: false,
    usersError: null, onlineUsers: new Set(),
  };
});

afterEach(cleanup);

describe('invitation-based user creation', () => {
  it('never asks an administrator to create another user password', () => {
    render(<UsersTab />);

    expect(screen.queryByLabelText(/^Password/)).toBeNull();
    expect(screen.getByRole('note').textContent).toContain('creates their own password');
    fireEvent.click(screen.getByRole('button', { name: 'Send Invitation' }));
    expect(h.ctx.saveUser).toHaveBeenCalledOnce();
  });
});