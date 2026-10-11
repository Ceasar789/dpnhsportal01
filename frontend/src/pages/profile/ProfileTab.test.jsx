// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Link, MemoryRouter, RouterProvider } from 'react-router-dom';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  userData: null,
  updateProfile: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  signedUrl: '',
  profileGuard: null,
  registerProfileGuard: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ userData: h.userData, updateProfile: h.updateProfile }),
}));

vi.mock('../../config/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({ upload: h.upload, remove: h.remove })),
    },
  },
}));

vi.mock('../../hooks/useSignedPhotoUrl', () => ({
  useSignedPhotoUrl: () => h.signedUrl,
}));

vi.mock('../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ registerProfileGuard: h.registerProfileGuard }),
}));

vi.mock('../../components/Avatar', () => ({
  default: ({ src, name }) => <img alt={`${name} avatar`} src={src || undefined} />,
}));

const { default: ProfileTab } = await import('./ProfileTab');
const NativeURL = globalThis.URL;

const USER_ID = 'user-123';
const NOW = 1_760_000_000_000;
const NEW_PATH = `${USER_ID}/${NOW}-new-photo.png`;

const baseUser = (overrides = {}) => ({
  uid: USER_ID,
  id: USER_ID,
  email: 'person@example.test',
  name: 'Profile User',
  role: 'student',
  status: 'active',
  profile: {
    name: 'Profile User',
    phone: '09123456789',
    date_of_birth: '2000-01-02',
    address: 'School Road',
    bio: 'Profile biography',
    photo_url: `${USER_ID}/1700000000000-old.png`,
    photo_change_count: 0,
    photo_change_window_start: null,
    ...overrides,
  },
});

const renderProfile = () => render(
  <MemoryRouter>
    <ProfileTab />
  </MemoryRouter>
);

const renderStrictProfile = () => render(
  <StrictMode>
    <MemoryRouter>
      <ProfileTab />
    </MemoryRouter>
  </StrictMode>
);

const renderRoutedProfile = () => {
  const router = createMemoryRouter([
    {
      path: '/profile',
      element: (
        <>
          <ProfileTab />
          <Link to="/elsewhere">Leave Profile</Link>
        </>
      ),
    },
    { path: '/elsewhere', element: <div>Elsewhere</div> },
  ], { initialEntries: ['/profile'] });
  return { router, view: render(<RouterProvider router={router} />) };
};

const imageFile = (name = 'new photo.png') => new File(['image'], name, { type: 'image/png' });

const selectPhoto = (file = imageFile()) => {
  const input = screen.getByLabelText('Choose profile photo');
  fireEvent.change(input, { target: { files: [file] } });
  return input;
};

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

beforeEach(() => {
  h.userData = baseUser();
  h.signedUrl = 'https://signed.example.test/old-photo';
  h.updateProfile.mockReset().mockResolvedValue(undefined);
  h.upload.mockReset().mockResolvedValue({ error: null });
  h.remove.mockReset().mockResolvedValue({ error: null });
  h.profileGuard = null;
  h.registerProfileGuard.mockReset().mockImplementation((guard) => {
    h.profileGuard = guard;
    return () => { if (h.profileGuard === guard) h.profileGuard = null; };
  });
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  class MockURL extends NativeURL {}
  MockURL.createObjectURL = vi.fn()
    .mockReturnValueOnce('blob:profile-preview-1')
    .mockReturnValueOnce('blob:profile-preview-2')
    .mockReturnValue('blob:profile-preview-next');
  MockURL.revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', MockURL);
  class MockRequest {
    constructor(input, init = {}) {
      this.url = typeof input === 'string' ? input : input.url;
      this.method = init.method || 'GET';
      this.signal = init.signal;
      this.headers = new Headers(init.headers);
    }
  }
  vi.stubGlobal('Request', MockRequest);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Profile photo preview lifetime', () => {
  it('shows the signed photo until a local preview is selected', () => {
    renderProfile();
    expect(screen.getByAltText('Profile User avatar').getAttribute('src')).toBe(h.signedUrl);

    selectPhoto();
    expect(screen.getByAltText('Profile User avatar').getAttribute('src')).toBe('blob:profile-preview-1');
  });

  it('revokes a replaced preview only after the replacement is displayed', async () => {
    renderProfile();
    selectPhoto(imageFile('first.png'));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    selectPhoto(imageFile('second.png'));
    expect(screen.getByAltText('Profile User avatar').getAttribute('src')).toBe('blob:profile-preview-2');
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:profile-preview-1'));
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(h.signedUrl);
  });

  it('revokes the current preview on unmount', () => {
    const view = renderProfile();
    selectPhoto();
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:profile-preview-1');
  });

  it('clears the file input so selecting the same file can trigger again', () => {
    renderProfile();
    const input = selectPhoto(imageFile('same.png'));
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { files: [imageFile('same.png')] } });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
  });

  it('rejects a non-image selection without creating a preview', async () => {
    renderProfile();
    selectPhoto(new File(['text'], 'notes.txt', { type: 'text/plain' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Please choose an image file.');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.getByAltText('Profile User avatar').getAttribute('src')).toBe(h.signedUrl);
  });
});

describe('Profile photo persistence lifecycle', () => {
  it('uploads the exact new object, updates shared profile state, then removes a verified old object', async () => {
    renderProfile();
    const file = imageFile();
    selectPhoto(file);
    submit();

    await waitFor(() => expect(h.updateProfile).toHaveBeenCalledOnce());
    expect(h.upload).toHaveBeenCalledWith(NEW_PATH, file, { cacheControl: '3600', upsert: false });
    expect(h.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ photo_url: NEW_PATH }));
    expect(h.remove).toHaveBeenCalledWith([`${USER_ID}/1700000000000-old.png`]);
    expect(await screen.findByText('Profile updated successfully!')).toBeTruthy();
  });

  it('rolls back only the exact new object when the profile update fails', async () => {
    h.updateProfile.mockRejectedValueOnce(new Error('database unavailable'));
    renderProfile();
    selectPhoto();
    submit();

    expect((await screen.findByRole('alert')).textContent).toContain('Your profile could not be updated.');
    expect(h.remove).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledWith([NEW_PATH]);
    expect(h.remove).not.toHaveBeenCalledWith([`${USER_ID}/1700000000000-old.png`]);
  });

  it('rolls back a new object when the database rejects the fourth photo change', async () => {
    h.updateProfile.mockRejectedValueOnce(new Error('Photo change limit exceeded'));
    renderProfile();
    selectPhoto();
    submit();

    expect((await screen.findByRole('alert')).textContent).toContain('Photo change limit reached');
    expect(h.remove).toHaveBeenCalledWith([NEW_PATH]);
  });

  it('preserves the update failure and reports a failed compensating cleanup', async () => {
    h.updateProfile.mockRejectedValueOnce(new Error('database unavailable'));
    h.remove.mockResolvedValueOnce({ error: new Error('storage unavailable') });
    renderProfile();
    selectPhoto();
    submit();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Your profile could not be updated.');
    expect(alert.textContent).toContain('could not be removed automatically');
  });

  it('does not update the profile or remove anything when upload fails', async () => {
    h.upload.mockResolvedValueOnce({ error: new Error('upload rejected') });
    renderProfile();
    selectPhoto();
    submit();

    expect((await screen.findByRole('alert')).textContent).toContain('could not be uploaded');
    expect(h.updateProfile).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('shows a safe session message and rolls back the new object after auth expiry', async () => {
    h.updateProfile.mockRejectedValueOnce(new Error('JWT expired'));
    renderProfile();
    selectPhoto();
    submit();

    expect((await screen.findByRole('alert')).textContent).toContain('Your session expired');
    expect(h.remove).toHaveBeenCalledWith([NEW_PATH]);
  });

  it('does not upload under a fallback owner when the current user id is missing', async () => {
    h.userData = { ...baseUser(), uid: undefined, id: undefined };
    renderProfile();
    selectPhoto();
    submit();

    expect((await screen.findByRole('alert')).textContent).toContain('Your session expired');
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.updateProfile).not.toHaveBeenCalled();
  });

  it.each([
    ['external URL', 'https://cdn.example.test/old.png'],
    ['legacy path', `${USER_ID}/legacy/old.png`],
    ['different-user path', `other-user/1700000000000-old.png`],
  ])('skips automatic cleanup for an unsafe %s', async (_label, oldPath) => {
    h.userData = baseUser({ photo_url: oldPath });
    renderProfile();
    selectPhoto();
    submit();

    expect(await screen.findByText('Profile updated successfully!')).toBeTruthy();
    expect(h.remove).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith('Skipped automatic cleanup for an unverified previous profile-photo reference.');
  });

  it('keeps a successful save authoritative when verified old-photo cleanup fails', async () => {
    h.remove.mockResolvedValueOnce({ error: new Error('remove denied') });
    renderProfile();
    selectPhoto();
    submit();

    const statusMessage = await screen.findByText(/Profile updated successfully.*previous photo could not be removed/);
    expect(statusMessage.textContent).toContain('Profile updated successfully.');
    expect(statusMessage.textContent).toContain('previous photo could not be removed');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('prevents duplicate submissions while the first save is pending', async () => {
    let releaseUpload;
    h.upload.mockReturnValueOnce(new Promise((resolve) => { releaseUpload = resolve; }));
    const view = renderProfile();
    selectPhoto();
    const form = view.container.querySelector('form');
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(form.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: 'Saving profile' }).disabled).toBe(true);

    releaseUpload({ error: null });
    await screen.findByRole('status');
    expect(h.updateProfile).toHaveBeenCalledTimes(1);
  });
});

describe('Profile StrictMode save lifecycle', () => {
  it('settles a successful save after effect replay without duplicate persistence', async () => {
    let finishSave;
    h.updateProfile.mockReturnValueOnce(new Promise((resolve) => { finishSave = resolve; }));
    renderStrictProfile();
    fireEvent.change(screen.getByLabelText('FULL NAME'), { target: { value: 'Strict Saved Name' } });
    submit();

    expect(screen.getByRole('button', { name: 'Saving profile' }).disabled).toBe(true);
    expect(h.updateProfile).toHaveBeenCalledTimes(1);
    finishSave();

    expect(await screen.findByText('Profile updated successfully!')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Changes' }).disabled).toBe(false);
    expect(screen.queryByText('You have unsaved Profile changes.')).toBeNull();
    expect(h.updateProfile).toHaveBeenCalledTimes(1);
  });

  it('settles a failed save after effect replay and preserves the dirty edit', async () => {
    let failSave;
    h.updateProfile.mockReturnValueOnce(new Promise((_resolve, reject) => { failSave = reject; }));
    renderStrictProfile();
    fireEvent.change(screen.getByLabelText('FULL NAME'), { target: { value: 'Strict Unsaved Name' } });
    submit();
    expect(screen.getByRole('button', { name: 'Saving profile' }).disabled).toBe(true);

    failSave(new Error('database unavailable'));

    expect((await screen.findByRole('alert')).textContent).toContain('Your profile could not be updated');
    expect(screen.getByRole('button', { name: 'Save Changes' }).disabled).toBe(false);
    expect(screen.getByLabelText('FULL NAME').value).toBe('Strict Unsaved Name');
    expect(screen.getByText('You have unsaved Profile changes.')).toBeTruthy();
    expect(h.updateProfile).toHaveBeenCalledTimes(1);
  });

  it('preserves photo success and upload-failure behavior after effect replay', async () => {
    const successView = renderStrictProfile();
    selectPhoto();
    submit();

    expect(await screen.findByText('Profile updated successfully!')).toBeTruthy();
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.updateProfile).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledWith([`${USER_ID}/1700000000000-old.png`]);
    successView.unmount();

    h.upload.mockReset().mockResolvedValueOnce({ error: new Error('upload rejected') });
    h.updateProfile.mockClear();
    h.remove.mockClear();
    renderStrictProfile();
    selectPhoto();
    submit();

    expect((await screen.findByRole('alert')).textContent).toContain('could not be uploaded');
    expect(screen.getByRole('button', { name: 'Save Changes' }).disabled).toBe(false);
    expect(screen.getByText('You have unsaved Profile changes.')).toBeTruthy();
    expect(h.updateProfile).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('does not duplicate persistence when an in-flight save resolves after actual unmount', async () => {
    let finishSave;
    h.updateProfile.mockReturnValueOnce(new Promise((resolve) => { finishSave = resolve; }));
    const view = renderStrictProfile();
    fireEvent.change(screen.getByLabelText('FULL NAME'), { target: { value: 'Unmounted Save' } });
    submit();
    await waitFor(() => expect(h.updateProfile).toHaveBeenCalledTimes(1));

    view.unmount();
    finishSave();
    await Promise.resolve();

    expect(h.updateProfile).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Profile updated successfully!')).toBeNull();
  });
});

describe('Profile accessibility and shared role compatibility', () => {
  it('associates every editable control with its visible or screen-reader label', () => {
    renderProfile();
    expect(screen.getByLabelText('FULL NAME').required).toBe(true);
    expect(screen.getByLabelText('PHONE NUMBER').getAttribute('type')).toBe('tel');
    expect(screen.getByLabelText('DATE OF BIRTH').getAttribute('type')).toBe('date');
    expect(screen.getByLabelText('ADDRESS')).toBeTruthy();
    expect(screen.getByLabelText('ABOUT ME')).toBeTruthy();
    expect(screen.getByLabelText('Choose profile photo').getAttribute('accept')).toBe('image/*');
  });

  it('preserves the three-change rolling-window lockout in the UI', () => {
    h.userData = baseUser({
      photo_change_count: 3,
      photo_change_window_start: new Date(NOW - 60_000).toISOString(),
    });
    renderProfile();

    expect(screen.getByRole('button', { name: 'Change profile photo' }).disabled).toBe(true);
    expect(screen.getByLabelText('Choose profile photo').disabled).toBe(true);
    expect(screen.getByText(/Photo change limit reached/)).toBeTruthy();
  });

  it.each(['main_admin', 'admin', 'teacher', 'student', 'registrar', 'faculty'])('renders through the shared component for %s', (role) => {
    h.userData = { ...baseUser(), role };
    expect(() => renderProfile()).not.toThrow();
    expect(screen.getByText('Profile Settings')).toBeTruthy();
  });
});

describe('Profile unsaved changes protection', () => {
  it('starts clean, detects text changes, and becomes clean when text is restored', async () => {
    renderProfile();
    await waitFor(() => expect(h.profileGuard).toBeTruthy());
    expect(h.profileGuard.shouldBlock()).toBe(false);

    const name = screen.getByLabelText('FULL NAME');
    fireEvent.change(name, { target: { value: 'Changed Name' } });
    expect(screen.getByText('You have unsaved Profile changes.')).toBeTruthy();
    await waitFor(() => expect(h.profileGuard.shouldBlock()).toBe(true));

    fireEvent.change(name, { target: { value: 'Profile User' } });
    expect(screen.queryByText('You have unsaved Profile changes.')).toBeNull();
    await waitFor(() => expect(h.profileGuard.shouldBlock()).toBe(false));
  });

  it('treats staged photos and combined text/photo edits as unsaved', async () => {
    renderProfile();
    selectPhoto();
    await waitFor(() => expect(h.profileGuard.shouldBlock()).toBe(true));

    fireEvent.change(screen.getByLabelText('ABOUT ME'), { target: { value: 'Changed biography' } });
    expect(screen.getByText('You have unsaved Profile changes.')).toBeTruthy();
    expect(screen.getByAltText('Profile User avatar').getAttribute('src')).toBe('blob:profile-preview-1');
  });

  it('does not become dirty when only the signed photo URL refreshes', async () => {
    const view = renderProfile();
    await waitFor(() => expect(h.profileGuard.shouldBlock()).toBe(false));

    h.signedUrl = 'https://signed.example.test/refreshed-photo';
    view.rerender(<MemoryRouter><ProfileTab /></MemoryRouter>);

    expect(screen.getByAltText('Profile User avatar').getAttribute('src')).toBe(h.signedUrl);
    expect(h.profileGuard.shouldBlock()).toBe(false);
  });

  it('preserves local edits during a same-user profile refresh', async () => {
    const view = renderProfile();
    fireEvent.change(screen.getByLabelText('FULL NAME'), { target: { value: 'Local Unsaved Name' } });

    h.userData = baseUser({ name: 'Server Refresh Name', phone: '09000000000' });
    view.rerender(<MemoryRouter><ProfileTab /></MemoryRouter>);

    expect(screen.getByLabelText('FULL NAME').value).toBe('Local Unsaved Name');
    expect(screen.getByLabelText('PHONE NUMBER').value).toBe('09123456789');
    await waitFor(() => expect(h.profileGuard.shouldBlock()).toBe(true));
  });

  it('clears local edits and staged previews when the authenticated account changes', async () => {
    const view = renderProfile();
    fireEvent.change(screen.getByLabelText('FULL NAME'), { target: { value: 'Previous User Edit' } });
    selectPhoto();

    h.userData = {
      ...baseUser({ name: 'Second User', photo_url: '' }),
      uid: 'user-456',
      id: 'user-456',
      email: 'second@example.test',
    };
    h.signedUrl = '';
    view.rerender(<MemoryRouter><ProfileTab /></MemoryRouter>);

    await waitFor(() => expect(screen.getByLabelText('FULL NAME').value).toBe('Second User'));
    expect(screen.getByText('second@example.test')).toBeTruthy();
    expect(screen.queryByText('You have unsaved Profile changes.')).toBeNull();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:profile-preview-1'));
  });

  it('discards local values and the staged preview without deleting Storage objects', async () => {
    renderProfile();
    fireEvent.change(screen.getByLabelText('FULL NAME'), { target: { value: 'Changed Name' } });
    selectPhoto();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.getByLabelText('FULL NAME').value).toBe('Profile User');
    expect(screen.getByAltText('Profile User avatar').getAttribute('src')).toBe(h.signedUrl);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:profile-preview-1'));
    expect(h.remove).not.toHaveBeenCalled();
    expect((await screen.findByRole('status')).textContent).toContain('Unsaved changes discarded.');
  });

  it('clears dirty state after success and preserves it after failure', async () => {
    const view = renderProfile();
    fireEvent.change(screen.getByLabelText('FULL NAME'), { target: { value: 'Saved Name' } });
    submit();
    await waitFor(() => expect(h.profileGuard.shouldBlock()).toBe(false));
    expect((await screen.findByRole('status')).textContent).toContain('Profile updated successfully');

    view.unmount();
    h.userData = baseUser();
    h.updateProfile.mockRejectedValueOnce(new Error('database unavailable'));
    renderProfile();
    fireEvent.change(screen.getByLabelText('FULL NAME'), { target: { value: 'Still Unsaved' } });
    submit();
    await screen.findByRole('alert');
    expect(screen.getByLabelText('FULL NAME').value).toBe('Still Unsaved');
    await waitFor(() => expect(h.profileGuard.shouldBlock()).toBe(true));
  });

  it('allows clean route navigation without a confirmation', async () => {
    const { router } = renderRoutedProfile();
    fireEvent.click(screen.getByRole('link', { name: 'Leave Profile' }));
    expect(await screen.findByText('Elsewhere')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/elsewhere');
  });

  it('cancels a blocked route change, preserves edits, and restores focus', async () => {
    renderRoutedProfile();
    fireEvent.change(screen.getByLabelText('FULL NAME'), { target: { value: 'Unsaved Name' } });
    const opener = screen.getByRole('link', { name: 'Leave Profile' });
    opener.focus();
    fireEvent.click(opener);

    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeTruthy();
    const keepEditing = screen.getByRole('button', { name: 'Keep Editing' });
    expect(document.activeElement).toBe(keepEditing);
    fireEvent.click(keepEditing);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('FULL NAME').value).toBe('Unsaved Name');
    expect(document.activeElement).toBe(opener);
  });

  it('confirms a blocked route change and safely discards a staged photo', async () => {
    const { router } = renderRoutedProfile();
    selectPhoto();
    fireEvent.click(screen.getByRole('link', { name: 'Leave Profile' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Discard and Leave' }));

    expect(await screen.findByText('Elsewhere')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/elsewhere');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:profile-preview-1');
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('closes the confirmation with Escape and retains the edit', async () => {
    renderRoutedProfile();
    fireEvent.change(screen.getByLabelText('ADDRESS'), { target: { value: 'Unsaved address' } });
    fireEvent.click(screen.getByRole('link', { name: 'Leave Profile' }));
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('ADDRESS').value).toBe('Unsaved address');
  });

  it('blocks browser-history navigation until the user confirms', async () => {
    const router = createMemoryRouter([
      { path: '/profile', element: <ProfileTab /> },
      { path: '/elsewhere', element: <div>Elsewhere</div> },
    ], { initialEntries: ['/elsewhere', '/profile'], initialIndex: 1 });
    render(<RouterProvider router={router} />);
    fireEvent.change(screen.getByLabelText('PHONE NUMBER'), { target: { value: '09999999999' } });

    const cancelledNavigation = router.navigate(-1);
    await screen.findByRole('dialog', { name: 'Discard unsaved changes?' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep Editing' }));
    await cancelledNavigation;
    expect(router.state.location.pathname).toBe('/profile');

    const confirmedNavigation = router.navigate(-1);
    await screen.findByRole('dialog', { name: 'Discard unsaved changes?' });
    fireEvent.click(screen.getByRole('button', { name: 'Discard and Leave' }));
    await confirmedNavigation;
    expect(await screen.findByText('Elsewhere')).toBeTruthy();
  });

  it('prevents leaving during an active save and cancels that navigation attempt when saving settles', async () => {
    let finishSave;
    h.updateProfile.mockReturnValueOnce(new Promise((resolve) => { finishSave = resolve; }));
    renderProfile();
    fireEvent.change(screen.getByLabelText('FULL NAME'), { target: { value: 'Saving Name' } });
    submit();

    const leave = vi.fn();
    await waitFor(() => expect(h.profileGuard.shouldBlock()).toBe(true));
    h.profileGuard.requestLeave(leave);
    expect(await screen.findByRole('dialog', { name: 'Profile save in progress' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Discard and Leave' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Stay on Profile' })).toBeTruthy();

    finishSave();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(leave).not.toHaveBeenCalled();
    expect(h.profileGuard.shouldBlock()).toBe(false);
  });

  it('registers beforeunload only while changes are unsaved and removes it when clean', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    renderProfile();
    expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(false);

    const bio = screen.getByLabelText('ABOUT ME');
    fireEvent.change(bio, { target: { value: 'Unsaved biography' } });
    await waitFor(() => expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(true));
    fireEvent.change(bio, { target: { value: 'Profile biography' } });
    await waitFor(() => expect(remove.mock.calls.some(([type]) => type === 'beforeunload')).toBe(true));
  });

  it('removes the active beforeunload listener when an unsaved Profile unmounts', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = renderProfile();
    fireEvent.change(screen.getByLabelText('ABOUT ME'), { target: { value: 'Unsaved before unmount' } });
    await waitFor(() => expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(true));
    const listener = add.mock.calls.find(([type]) => type === 'beforeunload')[1];

    view.unmount();

    expect(remove).toHaveBeenCalledWith('beforeunload', listener);
  });
});

