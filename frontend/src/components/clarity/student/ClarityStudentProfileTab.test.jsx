// @vitest-environment jsdom
// Clarity G5: Student Profile Settings ("Option A"). The logic is a
// word-for-word copy of the shared ProfileTab (source parity below, one
// declared substitution), saves exactly what the classic tab saves, and the
// page shows only stored data: the LRN box is always shown (with a note when
// none is on record), the stored status only.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({ userData: null, updateProfile: null, graph: null, upload: null, remove: null }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: h.userData, updateProfile: h.updateProfile }) }));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ registerProfileGuard: () => () => {} }),
}));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({ useStudentData: () => ({ graph: h.graph, loading: false, refresh: null }) }));
vi.mock('../../../config/supabase', () => ({
  supabase: { storage: { from: () => ({ upload: (...a) => h.upload(...a), remove: (...a) => h.remove(...a) }) } },
}));

import ClarityStudentProfileTab from './ClarityStudentProfileTab';
import ProfileTab from '../../../pages/profile/ProfileTab';

const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
const read = rel => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');

const STUDENT = {
  uid: 'stu-1', email: 'lia@school.test', role: 'student', status: 'active',
  profile: { name: 'Lia Ramos', phone: '0917 000 0000', date_of_birth: '2011-05-14', address: 'Dapitan', bio: 'Hi', photo_url: '' },
};
const show = (Tab = ClarityStudentProfileTab) => render(
  <MemoryRouter initialEntries={['/student-dashboard/profile']}>
    <Routes>
      <Route path="/student-dashboard/profile" element={<Tab />} />
      <Route path="/change-password" element={<h1>Change password page</h1>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  h.userData = structuredClone(STUDENT);
  h.updateProfile = vi.fn().mockResolvedValue(undefined);
  h.graph = { studentRecord: { lrn: '108123456789', student_number: null } };
  h.upload = vi.fn().mockResolvedValue({ error: null });
  h.remove = vi.fn().mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('source parity with the shared ProfileTab (temporary copy)', () => {
  const classic = read('pages/profile/ProfileTab.jsx').split('\n');
  const copy = read('components/clarity/student/ClarityStudentProfileTab.jsx');
  it('the constants and helpers (:22-90) are copied word for word', () => {
    expect(copy).toContain(classic.slice(21, 90).join('\n'));
  });
  it('the state, effects and handlers (:93-377) are copied word for word, with the two declared G7 substitutions', () => {
    const expected = classic.slice(92, 377).join('\n')
      .replace('  const { userData, updateProfile } = useAuth();', '  const { userData } = useAuth();')
      .replace('  const isDirty = textDirty || Boolean(photoFile);', '  const isDirty = textDirty || Boolean(photoFile) || emergencyDirty;');
    expect(copy).toContain(expected);
  });
  it('the one declared substitution: teacherView is the constant false', () => {
    expect(classic[91]).toBe('const ProfileTab = ({ teacherView = false }) => {');
    expect(copy).toContain('const ClarityStudentProfileTab = () => {\n  // Declared substitution: the classic `teacherView` prop (students only).\n  const teacherView = false;\n');
  });
});

describe('Option A layout from stored data', () => {
  it('title, the true subtitle (the student can edit the name), and the identity card', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Profile Settings' })).toBeTruthy();
    expect(screen.getByText('Your student profile. Your LRN and email are managed by your school.')).toBeTruthy();
    const card = screen.getByRole('region', { name: 'Your profile' });
    expect(within(card).getByRole('heading', { level: 2, name: 'Lia Ramos' })).toBeTruthy();
    expect(within(card).getByText('lia@school.test')).toBeTruthy();
    expect(card.querySelector('.x-sprof-lrn').textContent).toBe('LRN108123456789');
    expect(within(card).getByText('Active').className).toBe('x-badge ok');
    expect(within(card).getByText('3 of 3 photo changes left this week')).toBeTruthy();
  });

  it.each([[null], [{ lrn: null }], [{ lrn: '   ' }]])('no LRN on record (%j): the LRN box stays, asking the student to ask the administrator', (record) => {
    h.graph = record === null ? null : { studentRecord: record };
    const { container } = show();
    expect(container.querySelector('.x-sprof-lrn .x-sprof-lrn-none').textContent).toBe('Not set yet. Please ask the administrator to add it.');
    expect(container.textContent).not.toMatch(/LRN\s*(—|-|0)/);
  });

  it('no stored status: no pill (no assumed "active"); another stored status shows as stored', () => {
    h.userData.status = '';
    const { container } = show();
    expect(container.querySelector('.x-sprof-id .x-badge')).toBeNull();
    cleanup();
    h.userData.status = 'inactive';
    show();
    expect(screen.getByText('Inactive').className).toBe('x-badge');
  });

  it('Email is read-only and labelled "managed by school"; the editable fields are the classic ones', () => {
    show();
    const email = screen.getByLabelText(/^Email/);
    expect(email.readOnly).toBe(true);
    expect(email.value).toBe('lia@school.test');
    expect(screen.getByText('managed by school')).toBeTruthy();
    expect(['Full name', 'Date of birth', 'Phone', 'Address', 'About me'].map(l => screen.getByLabelText(l).value))
      .toEqual(['Lia Ramos', '2011-05-14', '0917 000 0000', 'Dapitan', 'Hi']);
  });

  it('Password card: Change Password opens the same /change-password route', () => {
    show();
    const card = screen.getByRole('region', { name: 'Password' });
    fireEvent.click(within(card).getByRole('button', { name: 'Change Password' }));
    expect(screen.getByRole('heading', { name: 'Change password page' })).toBeTruthy();
  });
});

describe('the classic behaviour, unchanged', () => {
  const editAndSave = async (Tab) => {
    show(Tab);
    fireEvent.change(document.getElementById('profile-full-name'), { target: { value: '  Lia R. Ramos  ' } });
    fireEvent.change(document.getElementById('profile-address'), { target: { value: ' Purok 3 ' } });
    const dirty = screen.getByText('You have unsaved Profile changes.').textContent;
    await act(async () => { fireEvent.submit(document.getElementById('profile-full-name').closest('form')); });
    const out = { dirty, calls: h.updateProfile.mock.calls, message: document.getElementById('profile-status-message')?.textContent };
    h.updateProfile.mockClear();
    cleanup();
    return out;
  };

  it('Save Changes sends the same profile update and shows the same message as the classic student tab', async () => {
    const clarity = await editAndSave(ClarityStudentProfileTab);
    expect(clarity).toEqual(await editAndSave(ProfileTab));
    expect(clarity.calls[0][0]).toEqual({ name: 'Lia R. Ramos', phone: '0917 000 0000', date_of_birth: '2011-05-14', address: 'Purok 3', bio: 'Hi', photo_url: '' });
    expect(clarity.message).toBe('Profile updated successfully!');
  });

  it('Discard restores the saved values with the same notice', () => {
    show();
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText('Phone').value).toBe('0917 000 0000');
    expect(screen.getByRole('status').textContent).toBe('Unsaved changes discarded.');
  });

  it('a failed save shows the classic message', async () => {
    h.updateProfile = vi.fn().mockRejectedValue(new Error('photo change limit exceeded'));
    show();
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0999' } });
    await act(async () => { fireEvent.submit(screen.getByLabelText('Phone').closest('form')); });
    expect(screen.getByRole('alert').textContent).toBe('Photo change limit reached (3 changes per 7 days). Please wait until the current window resets.');
  });

  it('Change photo opens the file picker; a non-image is refused with the classic message', () => {
    show();
    const input = document.getElementById('profile-photo-input');
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Change profile photo' }));
    expect(click).toHaveBeenCalled();
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
    expect(screen.getByRole('alert').textContent).toBe('Please choose an image file.');
  });

  it('the 3-per-7-days rule: at the limit the button is disabled and the reset date is shown', () => {
    h.userData.profile.photo_change_window_start = new Date(Date.now() - 60_000).toISOString();
    h.userData.profile.photo_change_count = 3;
    show();
    expect(screen.getByRole('button', { name: 'Change profile photo' }).disabled).toBe(true);
    expect(screen.getByText(/Photo change limit reached \(3 per 7 days\)\./).textContent).toMatch(/Try again on /);
  });
});

describe('layout rules', () => {
  const css = read('styles/clarity-components.css');
  const P = `html.${['theme', 'clarity'].join('-')} `;
  it('300px | fluid, stacking under 1000px; 40px inputs and 12px/600 labels (48px inputs on phones)', () => {
    expect(css).toContain(`${P}.x-sprof-layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 20px; align-items: start; }`);
    expect(css).toContain(`@media (max-width: 999.98px) {\n  ${P}.x-sprof-layout { grid-template-columns: minmax(0, 1fr); }\n}`);
    expect(css).toContain(`${P}.x-sprof .x-input { height: 40px; }`);
    expect(css).toContain(`${P}.x-sprof .x-label { font-size: 12px; font-weight: 600; }`);
    expect(css).toContain(`  ${P}.x-sprof .x-input { height: 48px; }`);
  });
});
