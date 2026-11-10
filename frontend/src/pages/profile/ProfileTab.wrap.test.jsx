// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ userData: null }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ userData: h.userData, updateProfile: vi.fn() }) }));
vi.mock('../../config/supabase', () => ({ supabase: { storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn() })) } } }));
vi.mock('../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../context/ProfileUnsavedChangesContext', () => ({ useProfileUnsavedChanges: () => ({ registerProfileGuard: vi.fn() }) }));
vi.mock('../../components/Avatar', () => ({ default: ({ name }) => <img alt={`${name} avatar`} /> }));

const { default: ProfileTab } = await import('./ProfileTab');

const LONG_NAME = `Maria ${'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(2)}`;
const LONG_EMAIL = 'maria.clara.de.los.santos.reyes.dela.cruz.student2026@verylongschooldomain.example.test';
const WRAP = '[overflow-wrap:anywhere]';
const user = (role, name, email) => ({ uid: 'u1', id: 'u1', email, name, role, status: 'active',
  profile: { name, phone: '', date_of_birth: '', address: '', bio: '', photo_url: '', photo_change_count: 0, photo_change_window_start: null } });

afterEach(cleanup);

describe.each(['student', 'teacher', 'main_admin'])('Profile for %s: long name and email wrap', (role) => {
  it('the displayed name and email get the wrap classes, with the text unchanged', () => {
    h.userData = user(role, LONG_NAME, LONG_EMAIL);
    render(<MemoryRouter><ProfileTab /></MemoryRouter>);
    const name = screen.getAllByText(LONG_NAME).find(el => el.tagName === 'DIV');
    expect(name.className.split(/\s+/)).toEqual(expect.arrayContaining(['max-w-full', WRAP]));
    expect(name.style.fontSize).toBe('18px');
    const email = screen.getByText(LONG_EMAIL);
    expect(email.className.split(/\s+/)).toEqual(expect.arrayContaining(['min-w-0', WRAP]));
    expect(email.previousElementSibling.textContent).toBe('Email');
    // The editable name field is unchanged and still holds the full value.
    expect(screen.getByLabelText(/FULL NAME/i).value).toBe(LONG_NAME);
  });
});
