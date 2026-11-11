// @vitest-environment jsdom
// F2: the staff login page (/faculty-login, "Faculty Portal") stays; its role
// choice offers only Admin and Teacher.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ login: vi.fn(), userData: null }) }));
const FacultyLogin = (await import('./FacultyLogin')).default;

afterEach(cleanup);

describe('FacultyLogin role choice', () => {
  it('offers exactly Admin and Teacher', () => {
    render(<MemoryRouter><FacultyLogin /></MemoryRouter>);
    fireEvent.click(document.getElementById('role-trigger'));
    const options = screen.getAllByRole('option').map(o => o.textContent.trim());
    expect(options).toEqual(['Admin', 'Teacher']);
  });

  it('keeps the page heading and field ids', () => {
    render(<MemoryRouter><FacultyLogin /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Faculty Portal');
    expect(document.getElementById('faculty-email')).toBeTruthy();
    expect(document.getElementById('faculty-password')).toBeTruthy();
  });
});
