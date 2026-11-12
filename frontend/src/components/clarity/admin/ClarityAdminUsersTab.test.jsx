// @vitest-environment jsdom
// Clarity A5: the Admin User Management tab (final design, real data only).
// Rows and pills come from stored fields; Online/Offline appears only as the
// classic status filter's options, and there is no "Last active" (the
// directory has no such field); every classic action is
// reachable through the same handlers with the same arguments; the user
// dialog is a word-for-word copy (parity checked here against the classic tab).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => null }));

import UsersTab from '../../../pages/dashboards/admin/tabs/UsersTab';
import ClarityAdminUsersTab from './ClarityAdminUsersTab';
import { filterAndRankUsers } from '../../../pages/dashboards/admin/shared/userSearch';

const USERS = [
  { id: 'u1', name: 'Ana Santos', email: 'ana@school.test', role: 'teacher', status: 'active', department: 'Science', created_at: '2026-08-04T02:00:00Z' },
  { id: 'u2', name: 'Ben Cruz', email: 'ben@school.test', role: 'student', status: 'inactive', onboarding_status: 'invitation_pending', can_resend_invitation: true, created_at: '2026-09-01T02:00:00Z' },
  { id: 'u3', name: 'Cora Lim', email: 'cora@school.test', role: 'main_admin', status: 'active' },
  { id: 'u4', name: 'Dan Uy', email: 'dan@school.test', role: 'registrar', status: 'inactive' },
  { id: 'u5', name: '', email: 'old@school.test', role: 'faculty', status: 'archived' },
];
const ACTIVE = USERS.filter(u => u.status !== 'archived');
const baseCtx = (extra = {}) => ({
  closeModal: vi.fn(), deleteUser: vi.fn(), restoreUser: vi.fn(), editUser: null, fetchUsers: vi.fn(), filteredUsers: ACTIVE, modal: null,
  openCreateUser: vi.fn(), openEditUser: vi.fn(), resendInvitation: vi.fn().mockResolvedValue(undefined), roleFilter: '', saveUser: vi.fn(), setRoleFilter: vi.fn(),
  setStatusFilter: vi.fn(), setShowArchived: vi.fn(), setUEmail: vi.fn(), setUName: vi.fn(), setURole: vi.fn(), setUStatus: vi.fn(), setUserSearch: vi.fn(),
  showArchived: false, statusFilter: '', uDept: '', setUDept: vi.fn(), uEmail: '', uName: '', uRole: 'student', uSaving: false, uStatus: 'active',
  userSearch: '', users: USERS, usersLoading: false, usersError: null, onlineUsers: new Set(['u1']),
  ...extra,
});
const show = (Tab = ClarityAdminUsersTab) => render(<Tab />);
const table = () => screen.getByRole('table');
const rows = () => within(table()).getAllByRole('row').slice(1);
const detail = () => screen.getByRole('region', { name: 'Selected user' });
const norm = html => html.replace(/:r[0-9a-z]+:/g, ':id:');

beforeEach(() => { h.ctx = baseCtx(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('layout from real data', () => {
  it('header, Create user, and a table with Name | Role | Email | Status column headers', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'User Management' })).toBeTruthy();
    expect(screen.getByText('Create accounts and assign roles across the portal')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create user' })).toBeTruthy();
    const ths = within(table()).getAllByRole('columnheader');
    expect(ths.map(th => th.textContent)).toEqual(['Name', 'Role', 'Email', 'Status']);
    ths.forEach(th => expect(th.getAttribute('scope')).toBe('col'));
  });

  it('rows from real fields, in the order given; legacy roles listed as stored', () => {
    show();
    expect(rows().map(r => [...r.cells].map(c => c.textContent))).toEqual([
      ['ASAna Santos', 'Teacher', 'ana@school.test', 'Active'],
      ['BCBen Cruz', 'Student', 'ben@school.test', 'Invitation pending'],
      ['CLCora Lim', 'Admin', 'cora@school.test', 'Active'],
      ['DUDan Uy', 'registrar', 'dan@school.test', 'Inactive'],
    ]);
  });

  it('role pills: Teacher green, Student indigo, Admin amber, other roles plain', () => {
    show();
    const pill = i => rows()[i].cells[1].querySelector('.x-badge').className.trim();
    expect([pill(0), pill(1), pill(2), pill(3)]).toEqual(['x-badge ok', 'x-badge in', 'x-badge wa', 'x-badge']);
  });

  it('Online/Offline only as options of the status filter: never in rows, pills or the detail card; no Last active', () => {
    const { container } = show();
    const outsideSelect = [...container.childNodes].map(n => {
      const copy = n.cloneNode(true);
      copy.querySelectorAll?.('select[aria-label="Filter users by status"]').forEach(s => s.remove());
      return copy.textContent;
    }).join(' ');
    expect(outsideSelect).not.toMatch(/online|offline|last active/i);
    expect(table().textContent).not.toMatch(/online|offline/i);
    expect(detail().textContent).not.toMatch(/online|offline|last active/i);
    container.querySelectorAll('.x-badge').forEach(b => expect(b.textContent).not.toMatch(/online|offline/i));
    const statusSelect = screen.getByRole('combobox', { name: 'Filter users by status' });
    expect([...container.querySelectorAll('option')].filter(o => /online|offline/i.test(o.textContent)).every(o => statusSelect.contains(o))).toBe(true);
  });

  it('the archive view marks every row Archived', () => {
    h.ctx = baseCtx({ showArchived: true, filteredUsers: [USERS[4]] });
    show();
    expect(rows()[0].cells[3].textContent).toBe('Archived');
    expect(rows()[0].cells[1].textContent).toBe('faculty');
    expect(rows()[0].cells[0].textContent).toContain('—');
  });

  it('footer: the same "Showing N of M users" as classic', () => {
    show();
    expect(screen.getByText('Showing 4 of 5 users')).toBeTruthy();
    cleanup();
    show(UsersTab);
    expect(screen.getByText('Showing 4 of 5 users')).toBeTruthy();
  });

  it('no "preview" anywhere', () => {
    const { container } = show();
    const attrs = [...container.querySelectorAll('[aria-label],[title],[alt]')].flatMap(el => ['aria-label', 'title', 'alt'].map(a => el.getAttribute(a) || ''));
    expect(`${container.textContent} ${attrs.join(' ')}`).not.toMatch(/preview/i);
  });
});

describe('selection', () => {
  it('nothing is selected at first; picking a row only selects it', () => {
    show();
    const handlers = Object.entries(h.ctx).filter(([, v]) => typeof v === 'function' && v.mock);
    const picks = within(table()).getAllByRole('button');
    expect(picks[0].getAttribute('aria-pressed')).toBe('false');
    expect(detail().textContent).toBe('Select a user to see their profile.');
    fireEvent.click(picks[1]);
    expect(picks[1].getAttribute('aria-pressed')).toBe('true');
    expect(picks[0].getAttribute('aria-pressed')).toBe('false');
    expect(rows()[1].className).toBe('o-sel');
    expect(within(detail()).getByRole('heading', { level: 2 }).textContent).toBe('Ben Cruz');
    for (const [name, fn] of handlers) expect(fn, name).not.toHaveBeenCalled();
  });

  it('detail card: email, role and status pills, Department and Created only when stored', () => {
    show();
    fireEvent.click(within(table()).getAllByRole('button')[0]);
    expect(detail().textContent).toContain('ana@school.test');
    expect(within(detail()).getByText('Department').nextSibling.textContent).toBe('Science');
    expect(within(detail()).getByText('Created').nextSibling.textContent).toBe('Aug 4, 2026');
    fireEvent.click(within(table()).getAllByRole('button')[2]);
    expect(within(detail()).queryByText('Created')).toBeNull();
    expect(within(detail()).queryByText('Department')).toBeNull();
    expect(detail().textContent).not.toMatch(/last active/i);
  });
});

describe('every classic action, same handlers and arguments', () => {
  it('Create user, the role tabs (the classic role options), search and the archive toggle', () => {
    show(UsersTab);
    const classicRoles = [...screen.getByLabelText('Filter users by role').options].map(o => o.value);
    cleanup();
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
    expect(h.ctx.openCreateUser).toHaveBeenCalledTimes(1);
    const tabs = within(screen.getByRole('group', { name: 'Filter users by role' })).getAllByRole('button');
    expect(tabs.map(t => t.textContent)).toEqual(['All', 'Students', 'Teachers', 'Admins']);
    expect(tabs[0].getAttribute('aria-pressed')).toBe('true');
    tabs.forEach(t => fireEvent.click(t));
    expect(h.ctx.setRoleFilter.mock.calls.map(c => c[0])).toEqual(classicRoles);
    fireEvent.change(screen.getByPlaceholderText('Search users...'), { target: { value: 'cruz' } });
    expect(h.ctx.setUserSearch).toHaveBeenCalledWith('cruz');
    fireEvent.click(screen.getByRole('button', { name: 'View archive history' }));
    expect(h.ctx.setShowArchived).toHaveBeenCalledWith(true);
  });

  it('the status filter: the same options as classic, and the same setStatusFilter calls', () => {
    const run = (Tab) => {
      h.ctx = baseCtx();
      show(Tab);
      const select = screen.getByRole('combobox', { name: 'Filter users by status' });
      const options = [...select.options].map(o => [o.value, o.textContent]);
      for (const value of ['online', 'offline', '']) fireEvent.change(select, { target: { value } });
      const calls = h.ctx.setStatusFilter.mock.calls;
      cleanup();
      return { options, calls };
    };
    const clarity = run(ClarityAdminUsersTab);
    expect(clarity).toEqual(run(UsersTab));
    expect(clarity.options).toEqual([['', 'Status: All'], ['online', 'Online'], ['offline', 'Offline']]);
    expect(clarity.calls).toEqual([['online'], ['offline'], ['']]);
  });

  it('the status filter shows the context value, and the table lists exactly the context filteredUsers with the real counts', () => {
    const onlineUserIds = new Set(['u1', 'u3']);
    const filtered = filterAndRankUsers({ users: USERS, query: '', roleFilter: '', statusFilter: 'online', showArchived: false, onlineUserIds });
    h.ctx = baseCtx({ statusFilter: 'online', filteredUsers: filtered, onlineUsers: onlineUserIds });
    show();
    expect(screen.getByRole('combobox', { name: 'Filter users by status' }).value).toBe('online');
    expect(rows().map(r => r.cells[2].textContent)).toEqual(filtered.map(u => u.email));
    expect(rows().map(r => r.cells[3].textContent)).toEqual(['Active', 'Active']);
    expect(screen.getByText(`Showing ${filtered.length} of ${USERS.length} users`)).toBeTruthy();
    cleanup();
    show(UsersTab);
    expect(screen.getByText(`Showing ${filtered.length} of ${USERS.length} users`)).toBeTruthy();
  });

  it('the selected tab follows roleFilter', () => {
    h.ctx = baseCtx({ roleFilter: 'main_admin' });
    show();
    expect(screen.getByRole('button', { name: 'Admins' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('search results are listed in the order the shared userSearch logic gives', () => {
    const ranked = filterAndRankUsers({ users: USERS, query: 'cruz', roleFilter: '', statusFilter: '', showArchived: false, onlineUserIds: new Set() });
    h.ctx = baseCtx({ filteredUsers: ranked, userSearch: 'cruz' });
    show();
    expect(rows().map(r => r.cells[2].textContent)).toEqual(ranked.map(u => u.email));
  });

  it('Edit, Resend invitation and Archive: the same calls as the classic row buttons', async () => {
    const run = async (Tab) => {
      h.ctx = baseCtx();
      show(Tab);
      if (Tab === ClarityAdminUsersTab) fireEvent.click(within(table()).getAllByRole('button')[1]);
      fireEvent.click(screen.getByRole('button', { name: 'Edit Ben Cruz' }));
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resend invitation to Ben Cruz' })); });
      fireEvent.click(screen.getByRole('button', { name: 'Archive Ben Cruz' }));
      const calls = {
        edit: h.ctx.openEditUser.mock.calls, resend: h.ctx.resendInvitation.mock.calls,
        archive: h.ctx.deleteUser.mock.calls.map(([id, settle]) => [id, typeof settle]), restore: h.ctx.restoreUser.mock.calls,
      };
      cleanup();
      return calls;
    };
    const clarity = await run(ClarityAdminUsersTab);
    expect(clarity).toEqual(await run(UsersTab));
    expect(clarity.archive).toEqual([['u2', 'function']]);
  });

  it('Resend invitation only for an account that can be re-invited, and not in the archive', () => {
    show();
    expect(screen.queryByRole('button', { name: /Resend invitation/ })).toBeNull();
    fireEvent.click(within(table()).getAllByRole('button')[1]);
    expect(screen.getByRole('button', { name: 'Resend invitation to Ben Cruz' })).toBeTruthy();
    cleanup();
    h.ctx = baseCtx({ showArchived: true, filteredUsers: [{ ...USERS[1], status: 'archived' }] });
    show();
    expect(screen.queryByRole('button', { name: /Resend invitation/ })).toBeNull();
  });

  it('an archived account shows Restore, calling restoreUser like the classic row (accessible name falls back to the email)', () => {
    const run = (Tab) => {
      h.ctx = baseCtx({ showArchived: true, filteredUsers: [USERS[4]] });
      show(Tab);
      if (Tab === ClarityAdminUsersTab) fireEvent.click(within(table()).getAllByRole('button')[0]);
      expect(screen.queryByRole('button', { name: /^Archive old/ })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Restore old@school.test' }));
      fireEvent.click(screen.getByRole('button', { name: 'Edit old@school.test' }));
      const calls = [h.ctx.restoreUser.mock.calls.map(([id, s]) => [id, typeof s]), h.ctx.openEditUser.mock.calls, h.ctx.deleteUser.mock.calls];
      cleanup();
      return calls;
    };
    expect(run(ClarityAdminUsersTab)).toEqual(run(UsersTab));
    h.ctx = baseCtx({ showArchived: true, filteredUsers: [USERS[4]] });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Show active users' }));
    expect(h.ctx.setShowArchived).toHaveBeenCalledWith(false);
  });

  it('after an archive, focus moves to the row that took its place, else the page heading', async () => {
    vi.useFakeTimers();
    show();
    fireEvent.click(within(table()).getAllByRole('button')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Archive Ben Cruz' }));
    const settle = h.ctx.deleteUser.mock.calls[0][1];
    rows()[1].remove();
    settle();
    expect(document.activeElement.textContent).toContain('Cora Lim');
    cleanup();
    h.ctx = baseCtx({ filteredUsers: [USERS[0]] });
    show();
    fireEvent.click(within(table()).getAllByRole('button')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Archive Ana Santos' }));
    const last = h.ctx.deleteUser.mock.calls[0][1];
    rows()[0].remove();
    last();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
  });
});

describe('states', () => {
  it('loading, error with Retry (fetchUsers), and empty', () => {
    h.ctx = baseCtx({ usersLoading: true });
    show();
    expect(screen.getByRole('status').textContent).toBe('Loading users…');
    cleanup();
    h.ctx = baseCtx({ usersError: 'Unable to load users.' });
    show();
    expect(screen.getByRole('alert').textContent).toContain('Unable to load users.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.ctx.fetchUsers).toHaveBeenCalled();
    cleanup();
    h.ctx = baseCtx({ filteredUsers: [] });
    show();
    expect(screen.getByText('No users found')).toBeTruthy();
    expect(screen.getByText('Select a user to see their profile.')).toBeTruthy();
    expect(screen.getByText('Showing 0 of 5 users')).toBeTruthy();
  });
});

describe('the user dialog is the classic one', () => {
  it.each([
    ['create', { modal: 'user' }],
    ['edit an active teacher', { modal: 'user', editUser: USERS[0], uName: 'Ana Santos', uEmail: 'ana@school.test', uRole: 'teacher', uDept: 'Science' }],
    ['edit a pending invitation', { modal: 'user', editUser: USERS[1], uName: 'Ben Cruz', uEmail: 'ben@school.test', uStatus: 'inactive' }],
    ['edit a legacy role', { modal: 'user', editUser: USERS[3], uName: 'Dan Uy', uEmail: 'dan@school.test', uRole: 'registrar', uStatus: 'inactive' }],
    ['edit a legacy faculty account', { modal: 'user', editUser: USERS[4], uEmail: 'old@school.test', uRole: 'faculty' }],
    ['saving', { modal: 'user', uSaving: true, uName: 'X', uEmail: 'x@school.test' }],
  ])('%s: identical markup', (_, extra) => {
    h.ctx = baseCtx(extra);
    show(UsersTab); const classic = norm(screen.getByRole('dialog').outerHTML); cleanup();
    h.ctx = baseCtx(extra);
    show();
    expect(norm(screen.getByRole('dialog').outerHTML)).toBe(classic);
  });

  it('validation: Send Invitation with empty fields shows the same errors and calls saveUser', () => {
    const run = (Tab) => {
      h.ctx = baseCtx({ modal: 'user' });
      show(Tab);
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send Invitation' }));
      const out = [norm(screen.getByRole('dialog').outerHTML), h.ctx.saveUser.mock.calls.length];
      cleanup();
      return out;
    };
    const clarity = run(ClarityAdminUsersTab);
    expect(clarity).toEqual(run(UsersTab));
    expect(clarity[0]).toContain('Full name is required.');
    expect(clarity[0]).toContain('Email is required.');
    expect(clarity[1]).toBe(1);
  });

  it('the discard guard is kept', () => {
    h.ctx = baseCtx({ modal: 'user' });
    show();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    screen.getByLabelText(/Full Name/).value = 'Changed';
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledWith('Discard changes?');
    expect(h.ctx.closeModal).not.toHaveBeenCalled();
  });
});
