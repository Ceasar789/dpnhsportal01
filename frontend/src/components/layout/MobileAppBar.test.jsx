// @vitest-environment jsdom
// V2a: the account menu lists "Profile & password" above Change Password.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import MobileAppBar from './MobileAppBar';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn(), userData: { name: 'Sample User', email: 'user@example.test' } }),
}));

const Where = () => <output data-testid="where">{useLocation().pathname}</output>;
const show = (props) => render(
  <MemoryRouter initialEntries={['/start']}>
    <Routes><Route path="*" element={<><MobileAppBar {...props} /><Where /></>} /></Routes>
  </MemoryRouter>,
);
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
const items = () => [...document.querySelectorAll('.absolute button')].map(b => b.textContent.trim());

afterEach(cleanup);

describe('MobileAppBar account menu', () => {
  it.each([['student', '/student-dashboard/profile'], ['teacher', '/teacher-dashboard/profile']])(
    '%s: Profile & password comes first and opens %s', (role, path) => {
      show({ role });
      openMenu();
      expect(items()).toEqual(['Profile & password', 'Change Password', 'Logout']);
      fireEvent.click(screen.getByRole('button', { name: 'Profile & password' }));
      expect(screen.getByTestId('where').textContent).toBe(path);
      expect(screen.queryByRole('button', { name: 'Profile & password' })).toBeNull();
    });

  it('admin: the shell opens its Profile page through onProfileClick', () => {
    const onProfileClick = vi.fn();
    show({ role: 'main_admin', onProfileClick });
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Profile & password' }));
    expect(onProfileClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('where').textContent).toBe('/start');
  });

  it('admin without a way to open Profile: no dead item', () => {
    show({ role: 'main_admin' });
    openMenu();
    expect(items()).toEqual(['Change Password', 'Logout']);
  });
});
