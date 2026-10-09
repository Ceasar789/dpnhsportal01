// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../../lib/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('../../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => null }));

const UsersTab = (await import('./UsersTab')).default;

let view;

beforeEach(() => {
  h.ctx = {
    closeModal: vi.fn(),
    deleteUser: vi.fn(),
    editUser: null,
    filteredUsers: [],
    modal: 'user',
    openCreateUser: vi.fn(),
    openEditUser: vi.fn(),
    roleFilter: '',
    saveUser: vi.fn(),
    setRoleFilter: vi.fn(),
    setStatusFilter: vi.fn(),
    setShowArchived: vi.fn(),
    setUEmail: vi.fn(),
    setUName: vi.fn(),
    setUPass: (value) => {
      h.ctx = { ...h.ctx, uPass: value };
      view.rerender(<UsersTab />);
    },
    setURole: vi.fn(),
    setUStatus: vi.fn(),
    setUserSearch: vi.fn(),
    showArchived: false,
    statusFilter: '',
    uDept: '',
    setUDept: vi.fn(),
    uEmail: '',
    uName: '',
    uPass: '',
    uRole: 'student',
    uSaving: false,
    uStatus: 'active',
    userSearch: '',
    users: [],
    usersLoading: false,
    onlineUsers: new Set(),
  };
});

afterEach(() => {
  cleanup();
  view = undefined;
});

describe('Users password controls', () => {
  it('reveals the two fields independently and reports deterministic strength', () => {
    view = render(<UsersTab />);
    const password = screen.getByLabelText(/^Password/);
    const confirmation = screen.getByLabelText(/^Confirm Password/);

    expect(password.type).toBe('password');
    expect(confirmation.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.type).toBe('text');
    expect(confirmation.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show confirm password' }));
    expect(confirmation.type).toBe('text');

    fireEvent.change(password, { target: { value: 'abc' } });
    expect(screen.getByRole('status').textContent).toContain('Weak');
    expect(document.querySelectorAll('.password-strength-meter .active')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'Sup3rSecret!Pass' } });
    expect(screen.getByRole('status').textContent).toContain('Strong');
    expect(document.querySelectorAll('.password-strength-meter .active')).toHaveLength(5);
    expect(h.ctx.saveUser).not.toHaveBeenCalled();
  });
});
