// @vitest-environment jsdom
// Clarity G2: Admin Users master-detail. The whole row selects (the first-cell
// button stays the keyboard control), nothing is preselected, actions in the
// profile card do not change the selection, and the card shows only fields
// the directory row holds (LRN only for a student whose row carries it).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => null }));

import ClarityAdminUsersTab from './ClarityAdminUsersTab';

const FULL = {
  id: 's1', name: 'Lia Ramos', email: 'lia@school.test', role: 'student', status: 'active', created_at: '2026-08-04T02:00:00Z',
  phone: '0917 123 4567', date_of_birth: '2011-05-14', address: 'Purok 3, Dapitan', bio: 'Likes science.', lrn: '108123456789',
};
const BARE = { id: 's2', name: 'Noel Tan', email: 'noel@school.test', role: 'student', status: 'active', phone: '  ', date_of_birth: null, address: '', bio: null };
const TEACHER = { id: 't1', name: 'Ana Santos', email: 'ana@school.test', role: 'teacher', status: 'inactive', onboarding_status: 'invitation_pending', can_resend_invitation: true, department: 'Science', lrn: '999999999999' };
const USERS = [FULL, BARE, TEACHER];

const ctx = (extra = {}) => ({
  closeModal: vi.fn(), deleteUser: vi.fn(), restoreUser: vi.fn(), editUser: null, fetchUsers: vi.fn(), filteredUsers: USERS, modal: null,
  openCreateUser: vi.fn(), openEditUser: vi.fn(), resendInvitation: vi.fn().mockResolvedValue(undefined), roleFilter: '', saveUser: vi.fn(), setRoleFilter: vi.fn(),
  setStatusFilter: vi.fn(), setShowArchived: vi.fn(), setUEmail: vi.fn(), setUName: vi.fn(), setURole: vi.fn(), setUStatus: vi.fn(), setUserSearch: vi.fn(),
  showArchived: false, statusFilter: '', uDept: '', setUDept: vi.fn(), uEmail: '', uName: '', uRole: 'student', uSaving: false, uStatus: 'active',
  userSearch: '', users: USERS, usersLoading: false, usersError: null, ...extra,
});
const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const card = () => screen.getByRole('region', { name: 'Selected user' });
const pick = i => within(rows()[i]).getByRole('button');
const facts = () => [...card().querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextSibling.textContent]);

beforeEach(() => { h.ctx = ctx(); });
afterEach(() => cleanup());

describe('selection', () => {
  it('nothing is preselected: a clean empty state', () => {
    render(<ClarityAdminUsersTab />);
    expect(card().textContent).toBe('Select a user to see their profile.');
    expect(rows().every(r => !r.className)).toBe(true);
    expect(rows().map((_, i) => pick(i).getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false']);
  });

  it('a click anywhere on the row selects it, highlights it and calls nothing', () => {
    render(<ClarityAdminUsersTab />);
    fireEvent.click(within(rows()[2]).getByText('ana@school.test'));
    expect(rows()[2].className).toBe('o-sel');
    expect(pick(2).getAttribute('aria-pressed')).toBe('true');
    expect(within(card()).getByRole('heading', { level: 2 }).textContent).toBe('Ana Santos');
    fireEvent.click(rows()[0].cells[1]);
    expect(rows()[0].className).toBe('o-sel');
    expect(rows()[2].className).toBe('');
    for (const [name, fn] of Object.entries(h.ctx)) if (fn?.mock) expect(fn, name).not.toHaveBeenCalled();
  });

  it('the first-cell control is a native button (Enter/Space) and the only control in a row', () => {
    render(<ClarityAdminUsersTab />);
    rows().forEach((r, i) => {
      expect(within(r).getAllByRole('button')).toHaveLength(1);
      expect(pick(i).tagName).toBe('BUTTON');
      expect(pick(i).type).toBe('button');
      expect(r.cells[0].contains(pick(i))).toBe(true);
    });
    fireEvent.click(pick(1));
    expect(pick(1).getAttribute('aria-pressed')).toBe('true');
  });

  it('Edit, Resend invitation and Archive act on the selected user and do not change the selection', async () => {
    render(<ClarityAdminUsersTab />);
    fireEvent.click(pick(2));
    fireEvent.click(within(card()).getByRole('button', { name: 'Edit Ana Santos' }));
    fireEvent.click(within(card()).getByRole('button', { name: 'Resend invitation to Ana Santos' }));
    fireEvent.click(within(card()).getByRole('button', { name: 'Archive Ana Santos' }));
    expect(h.ctx.openEditUser).toHaveBeenCalledWith(TEACHER);
    expect(h.ctx.resendInvitation).toHaveBeenCalledWith(TEACHER);
    expect(h.ctx.deleteUser.mock.calls[0][0]).toBe('t1');
    expect(rows()[2].className).toBe('o-sel');
    expect(within(card()).getByRole('heading', { level: 2 }).textContent).toBe('Ana Santos');
    await screen.findByRole('button', { name: 'Resend invitation to Ana Santos' });
  });
});

describe('the profile card shows only stored fields', () => {
  it('a student with every Profile Settings field and an LRN', () => {
    render(<ClarityAdminUsersTab />);
    fireEvent.click(pick(0));
    expect(card().textContent).toContain('lia@school.test');
    expect(within(card()).getByText('Student')).toBeTruthy();
    expect(within(card()).getByText('Active')).toBeTruthy();
    expect(facts()).toEqual([
      ['Created', 'Aug 4, 2026'],
      ['LRN', '108123456789'],
      ['Phone', '0917 123 4567'],
      ['Date of birth', 'May 14, 2011'],
      ['Address', 'Purok 3, Dapitan'],
      ['About me', 'Likes science.'],
    ]);
  });

  it('empty, blank and missing fields are left out: no dash, no zero, no placeholder', () => {
    render(<ClarityAdminUsersTab />);
    fireEvent.click(pick(1));
    expect(facts()).toEqual([]);
    const text = card().textContent;
    expect(text).not.toMatch(/—|LRN|Phone|Date of birth|Address|About me|Department|Created/);
    expect(text).not.toMatch(/\b0\b/);
  });

  it('LRN only for a student: a teacher row carrying lrn does not show it', () => {
    render(<ClarityAdminUsersTab />);
    fireEvent.click(pick(2));
    expect(facts()).toEqual([['Department', 'Science']]);
  });

  it('an unparseable date of birth is left out, not shown as a dash', () => {
    h.ctx = ctx({ filteredUsers: [{ ...BARE, date_of_birth: 'not a date' }] });
    render(<ClarityAdminUsersTab />);
    fireEvent.click(pick(0));
    expect(facts()).toEqual([]);
  });
});

describe('layout rules', () => {
  const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
  const css = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n');
  const P = `html.${['theme', 'clarity'].join('-')} `;
  it('rows show a pointer; the selected row keeps the o-sel highlight', () => {
    expect(css).toContain(`${P}.x-usr-table tbody tr { cursor: pointer; }`);
    expect(css).toContain(`${P}.x-table tr.o-sel td { background: var(--cl-ac-s); }`);
  });
  it('table left, card right; below 1100px the card stacks under the table', () => {
    expect(css).toContain(`${P}.x-usr-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);`);
    const media = css.slice(css.indexOf('@media (max-width: 1099.98px) {'));
    expect(media.split('}')[0]).toBe(`@media (max-width: 1099.98px) {\n  ${P}.x-usr-layout { grid-template-columns: minmax(0, 1fr); `);
  });
});
