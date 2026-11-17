// @vitest-environment jsdom
// SHELL: the shared phone tab bar and Menu sheet (used by all three roles).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { LayoutDashboard, Users, BookMarked, Settings } from 'lucide-react';
import { PHONE_QUERY, PhoneBottomNav, PhoneBrand, PhoneMenuSheet } from './PhoneNav';

const onSelect = { a: vi.fn(), b: vi.fn(), s: vi.fn(), p: vi.fn() };
const BAR = [
  { key: 'a', label: 'Overview', icon: LayoutDashboard, current: true, onSelect: () => onSelect.a() },
  { key: 'b', label: 'Users', icon: Users, current: false, href: '/x/users', badge: 3, badgeText: 'pending', onSelect: () => onSelect.b() },
];
const GROUPS = [{ heading: 'Academics', items: [{ key: 's', label: 'Subjects', icon: BookMarked, current: false, onSelect: () => onSelect.s() }] },
  { heading: 'System', items: [{ key: 't', label: 'Settings', icon: Settings, current: true, onSelect: vi.fn() }] }];

const Harness = ({ signOut = vi.fn(), page = 'a' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  return (
    <>
      <main><input aria-label="Name" /></main>
      <PhoneBottomNav items={BAR} menuOpen={open} menuCurrent={false} onMenu={() => setOpen(true)} menuButtonRef={ref} sheetId="sheet" />
      <PhoneMenuSheet id="sheet" open={open} onClose={() => setOpen(false)} groups={GROUPS} returnFocusRef={ref} closeKey={page}
        profile={{ key: 'p', label: 'Profile & password', current: false, onSelect: () => onSelect.p() }} onSignOut={signOut} />
    </>
  );
};
const menuTab = () => screen.getByRole('button', { name: /^Menu/ });

afterEach(() => { cleanup(); Object.values(onSelect).forEach(f => f.mockReset()); vi.useRealTimers(); document.body.style.overflow = ''; });

describe('PhoneBottomNav', () => {
  it('the phone query covers portrait and landscape phones', () => {
    expect(PHONE_QUERY).toBe('(max-width: 767.98px), (max-width: 1023.98px) and (max-height: 500px)');
  });
  it('a labelled navigation landmark: the items, then Menu; the current item marked', () => {
    render(<Harness />);
    const bar = screen.getByRole('navigation', { name: 'Main' });
    expect([...bar.querySelectorAll('a, button')].map(e => e.querySelector('.x-pnav-l').textContent)).toEqual(['Overview', 'Users', 'Menu']);
    expect(within(bar).getByRole('button', { name: 'Overview' }).getAttribute('aria-current')).toBe('page');
    expect(within(bar).getByRole('button', { name: 'Overview' }).className).toContain('on');
    const link = within(bar).getByRole('link', { name: /Users/ });
    expect(link.getAttribute('href')).toBe('/x/users');
    expect(link.textContent).toBe('Users3 pending');
  });
  it('a link goes through onSelect (no full page load)', () => {
    render(<Harness />);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByRole('link', { name: /Users/ }).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onSelect.b).toHaveBeenCalledTimes(1);
  });
  it('steps aside while a text field has focus (the on-screen keyboard)', () => {
    render(<Harness />);
    const bar = screen.getByRole('navigation', { name: 'Main' });
    fireEvent.focusIn(screen.getByRole('textbox', { name: 'Name' }));
    expect(bar.className).toContain('typing');
    fireEvent.focusOut(screen.getByRole('textbox', { name: 'Name' }));
    expect(bar.className).not.toContain('typing');
  });
  it('the brand mark is the logo and the wordmark', () => {
    render(<PhoneBrand />);
    expect(document.querySelector('.x-pbrand img').getAttribute('src')).toBe('/EduScribeLogoIcon.png');
    expect(document.querySelector('.x-pbrand').textContent).toBe('EduScribe');
  });
});

describe('PhoneMenuSheet', () => {
  it('Menu opens a dialog: aria-expanded/controls, focus inside, page scroll locked', () => {
    render(<Harness />);
    expect(menuTab().getAttribute('aria-expanded')).toBe('false');
    expect(menuTab().getAttribute('aria-controls')).toBe('sheet');
    expect(menuTab().getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(menuTab());
    const sheet = screen.getByRole('dialog', { name: 'Menu' });
    expect(sheet.id).toBe('sheet');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(menuTab().getAttribute('aria-expanded')).toBe('true');
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
  });
  it('groups like the sidebar, then Profile & password and Sign out', () => {
    render(<Harness />);
    fireEvent.click(menuTab());
    const sheet = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(sheet).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Academics', 'System']);
    expect([...sheet.querySelectorAll('.x-psheet-row')].map(r => r.textContent)).toEqual(['Subjects', 'Settings', 'Profile & password', 'Sign out']);
    expect(within(sheet).getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
  });
  it('Escape closes and focus returns to the Menu tab; the scroll lock is released', () => {
    render(<Harness />);
    fireEvent.click(menuTab());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(menuTab());
    expect(document.body.style.overflow).not.toBe('hidden');
  });
  it('the backdrop and the close button close it', () => {
    render(<Harness />);
    fireEvent.click(menuTab());
    fireEvent.click(document.querySelector('.x-psheet-back'));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(menuTab());
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('choosing a page closes the sheet and opens the page', () => {
    render(<Harness />);
    fireEvent.click(menuTab());
    fireEvent.click(screen.getByRole('button', { name: 'Subjects' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onSelect.s).toHaveBeenCalledTimes(1);
    fireEvent.click(menuTab());
    fireEvent.click(screen.getByRole('button', { name: 'Profile & password' }));
    expect(onSelect.p).toHaveBeenCalledTimes(1);
  });
  it('Sign out closes the sheet first, then asks', () => {
    vi.useFakeTimers();
    const signOut = vi.fn();
    render(<Harness signOut={signOut} />);
    fireEvent.click(menuTab());
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
  it('a page change from anywhere closes it', () => {
    const { rerender } = render(<Harness page="a" />);
    fireEvent.click(menuTab());
    rerender(<Harness page="b" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('Tab stays inside the open sheet', () => {
    render(<Harness />);
    fireEvent.click(menuTab());
    const sheet = screen.getByRole('dialog', { name: 'Menu' });
    expect(document.querySelector('main').inert).toBe(true);
    sheet.querySelectorAll('button').forEach(b => { expect(sheet.contains(b)).toBe(true); });
  });
});
