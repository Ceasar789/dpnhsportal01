// @vitest-environment jsdom
// Clarity G7: the student Profile Settings always shows the LRN box, and an
// Emergency contact card joins the same form (same Save Changes, Discard,
// dirty state and leave guard). The admin Users panel shows the contact for
// students when stored.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({ userData: null, updateProfile: null, data: null, guard: null, ctx: {} }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: h.userData, updateProfile: h.updateProfile }) }));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ registerProfileGuard: (guard) => { h.guard = guard; return () => {}; } }),
}));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({ useStudentData: () => h.data }));
vi.mock('../../../config/supabase', () => ({ supabase: { storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) } } }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));

import ClarityStudentProfileTab from './ClarityStudentProfileTab';
import ClarityAdminUsersTab from '../admin/ClarityAdminUsersTab';

const STUDENT = {
  uid: 'stu-1', email: 'lia@school.test', role: 'student', status: 'active',
  profile: { name: 'Lia Ramos', phone: '0917', date_of_birth: '2011-05-14', address: 'Dapitan', bio: 'Hi', photo_url: '',
    emergency_contact_name: 'Rosa Ramos', emergency_contact_relationship: 'Mother', emergency_contact_phone: '0918 111 2222' },
};
const show = () => render(
  <MemoryRouter initialEntries={['/student-dashboard/profile']}>
    <Routes><Route path="/student-dashboard/profile" element={<ClarityStudentProfileTab />} /></Routes>
  </MemoryRouter>,
);
const lrnBox = () => document.querySelector('.x-sprof-lrn');
const emergency = () => screen.getByRole('region', { name: 'Emergency contact' });
const field = label => within(emergency()).getByLabelText(label);
const save = async () => { await act(async () => { fireEvent.submit(document.querySelector('form.x-sprof-form')); }); };

beforeEach(() => {
  h.userData = structuredClone(STUDENT);
  h.updateProfile = vi.fn().mockResolvedValue(undefined);
  h.data = { graph: { studentRecord: { lrn: '108123456789' } }, loading: false };
  h.guard = null;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('the LRN box is always shown', () => {
  it('with an LRN: the large read-only value', () => {
    show();
    expect(lrnBox().querySelector('b').textContent).toBe('108123456789');
    expect(lrnBox().querySelector('.x-sprof-lrn-none')).toBeNull();
  });

  it.each([[{ lrn: null }], [{ lrn: '  ' }], [null]])('no LRN on record (%j): the label stays with the request to ask the administrator', (record) => {
    h.data = { graph: { studentRecord: record }, loading: false };
    show();
    expect(lrnBox().querySelector('span').textContent).toBe('LRN');
    expect(lrnBox().querySelector('b')).toBeNull();
    expect(lrnBox().querySelector('.x-sprof-lrn-none').textContent).toBe('Not set yet. Please ask the administrator to add it.');
    expect(lrnBox().textContent).not.toMatch(/—|-|\b0\b/);
  });

  it('while the student data loads, and when it failed: the box says so instead of "not set"', () => {
    h.data = { graph: null, loading: true };
    show();
    expect(lrnBox().textContent).toBe('LRNLoading…');
    cleanup();
    h.data = { graph: { fatalError: new Error('x'), studentRecord: null }, loading: false };
    show();
    expect(lrnBox().textContent).toBe('LRNCould not load your LRN right now.');
  });
});

describe('Emergency contact card', () => {
  it('under Personal information, inside the same form, with the stored values and the field limits', () => {
    show();
    const form = document.querySelector('form.x-sprof-form');
    const info = screen.getByRole('region', { name: 'Personal information' });
    expect(form.contains(info)).toBe(true);
    expect(form.contains(emergency())).toBe(true);
    expect(info.compareDocumentPosition(emergency()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(emergency().textContent).toContain('Who we should call in case of an emergency. Visible only to you and the administrator.');
    expect(field("Contact person's name").value).toBe('Rosa Ramos');
    expect(field("Contact person's name").maxLength).toBe(80);
    expect(field('Relationship').value).toBe('Mother');
    expect(field('Relationship').maxLength).toBe(40);
    expect(field('Relationship').placeholder).toBe('e.g. Mother');
    // The same input type and placeholder as the Phone field.
    const phone = screen.getByLabelText('Phone');
    expect([field('Contact number').type, field('Contact number').placeholder]).toEqual([phone.type, phone.placeholder]);
    expect(screen.getAllByRole('button', { name: 'Save Changes' })).toHaveLength(1);
  });

  it('all optional; once one is filled, the name and the number are required, with inline errors and no save', async () => {
    h.userData.profile = { ...h.userData.profile, emergency_contact_name: null, emergency_contact_relationship: null, emergency_contact_phone: null };
    show();
    await save();
    expect(h.updateProfile).toHaveBeenCalledTimes(1);
    h.updateProfile.mockClear();
    fireEvent.change(field('Relationship'), { target: { value: 'Uncle' } });
    await save();
    expect(h.updateProfile).not.toHaveBeenCalled();
    expect(screen.getByText("Enter the contact person's name.")).toBeTruthy();
    expect(screen.getByText('Enter a contact number.')).toBeTruthy();
    expect(field("Contact person's name").getAttribute('aria-invalid')).toBe('true');
    expect(field("Contact person's name").getAttribute('aria-describedby')).toBe('profile-emergency-name-error');
    fireEvent.change(field("Contact person's name"), { target: { value: 'Ben' } });
    fireEvent.change(field('Contact number'), { target: { value: '0917' } });
    await save();
    expect(h.updateProfile).toHaveBeenCalledTimes(1);
  });

  it('a normal save sends exactly the classic payload (no emergency keys) when the contact did not change', async () => {
    show();
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'Purok 3' } });
    await save();
    expect(Object.keys(h.updateProfile.mock.calls[0][0]).sort()).toEqual(['address', 'bio', 'date_of_birth', 'name', 'phone', 'photo_url']);
  });

  it('a changed contact is added to the same save, trimmed, and an emptied field saves as null', async () => {
    show();
    fireEvent.change(field("Contact person's name"), { target: { value: '  Rosa R. Ramos ' } });
    fireEvent.change(field('Relationship'), { target: { value: '   ' } });
    await save();
    expect(h.updateProfile.mock.calls[0][0]).toMatchObject({
      name: 'Lia Ramos', emergency_contact_name: 'Rosa R. Ramos', emergency_contact_relationship: null, emergency_contact_phone: '0918 111 2222',
    });
  });

  it('never sent for another role', async () => {
    h.userData.role = 'teacher';
    show();
    fireEvent.change(field("Contact person's name"), { target: { value: 'Someone' } });
    await save();
    expect('emergency_contact_name' in h.updateProfile.mock.calls[0][0]).toBe(false);
  });

  it('the dirty banner, Discard and the leave guard include the contact', () => {
    show();
    expect(h.guard.shouldBlock()).toBe(false);
    fireEvent.change(field('Contact number'), { target: { value: '0999' } });
    expect(screen.getByText('You have unsaved Profile changes.')).toBeTruthy();
    expect(h.guard.shouldBlock()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(field('Contact number').value).toBe('0918 111 2222');
    expect(screen.queryByText('You have unsaved Profile changes.')).toBeNull();
    expect(h.guard.shouldBlock()).toBe(false);
  });
});

describe('admin Users panel', () => {
  const USERS = [
    { id: 's1', name: 'Lia Ramos', email: 'lia@school.test', role: 'student', status: 'active',
      emergency_contact_name: 'Rosa Ramos', emergency_contact_relationship: ' ', emergency_contact_phone: '0918' },
    { id: 's2', name: 'No Contact', email: 'nc@school.test', role: 'student', status: 'active' },
    { id: 't1', name: 'Tess', email: 't@school.test', role: 'teacher', status: 'active', emergency_contact_name: 'Ignored' },
  ];
  const ctx = () => ({
    closeModal: vi.fn(), deleteUser: vi.fn(), restoreUser: vi.fn(), editUser: null, fetchUsers: vi.fn(), filteredUsers: USERS, modal: null,
    openCreateUser: vi.fn(), openEditUser: vi.fn(), resendInvitation: vi.fn(), roleFilter: '', saveUser: vi.fn(), setRoleFilter: vi.fn(),
    setStatusFilter: vi.fn(), setShowArchived: vi.fn(), setUEmail: vi.fn(), setULrn: vi.fn(), setUName: vi.fn(), setURole: vi.fn(), setUStatus: vi.fn(), setUserSearch: vi.fn(),
    showArchived: false, statusFilter: '', uDept: '', setUDept: vi.fn(), uEmail: '', uLrn: '', uName: '', uRole: 'student', uSaving: false, uStatus: 'active',
    userSearch: '', users: USERS, usersLoading: false, usersError: null,
  });
  const facts = () => [...screen.getByRole('region', { name: 'Selected user' }).querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextSibling.textContent]);
  const pick = name => fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));

  it('a student with a stored contact: the stored fields only (a blank one is left out)', () => {
    h.ctx = ctx();
    render(<ClarityAdminUsersTab />);
    pick('Lia Ramos');
    expect(facts().filter(([k]) => ['Emergency contact', 'Relationship', 'Contact number'].includes(k)))
      .toEqual([['Emergency contact', 'Rosa Ramos'], ['Contact number', '0918']]);
  });

  it('a student without one, and a non-student: nothing', () => {
    h.ctx = ctx();
    render(<ClarityAdminUsersTab />);
    pick('No Contact');
    expect(facts().map(([k]) => k)).not.toContain('Emergency contact');
    pick('Tess');
    expect(facts().map(([k]) => k)).not.toContain('Emergency contact');
  });
});

describe('layout rules', () => {
  const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
  const css = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n');
  const P = `html.${['theme', 'clarity'].join('-')} `;
  it('one form across both cards; the muted LRN note; the error style; phones keep 16px inputs and one column', () => {
    expect(css).toContain(`${P}.x-sprof-form { display: grid; gap: 20px; min-width: 0; }`);
    expect(css).toContain(`${P}.x-sprof-lrn-none { margin: 4px 0 0; font-size: 13px; color: var(--cl-mu);`);
    expect(css).toContain(`${P}.x-sprof-err { margin: 4px 0 0; font-size: 13px; font-weight: 500; color: var(--cl-er); }`);
    expect(css).toContain(`  ${P}.x-sprof-grid { grid-template-columns: minmax(0, 1fr); }`);
    expect(css).toContain(`  ${P}.x-input, ${P}.x-select, ${P}.x-search input { font-size: 16px; }`);
  });
});
