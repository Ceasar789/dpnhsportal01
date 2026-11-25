// @vitest-environment jsdom
// U-S1: the phone tab bar steps aside only while a text field has focus AND the
// on-screen keyboard is open; it can never stay hidden after the keyboard
// closes, the field disappears, the phone turns, or a select is used.
// U-S6: the Menu sheet's profile entry is a card (photo, name, line).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { PhoneBottomNav, PhoneMenuSheet } from './PhoneNav';

const ITEMS = [{ key: 'a', label: 'Overview', icon: LayoutDashboard, current: true, onSelect: () => {} }];
let vv;
const setKeyboard = (open) => { vv.height = open ? 400 : window.innerHeight; act(() => { vv.dispatchEvent(new Event('resize')); vi.runAllTimers(); }); };
const bar = () => screen.getByRole('navigation', { name: 'Main' });
const hidden = () => bar().classList.contains('typing');

const Page = ({ withField = true }) => (
  <>
    <main>
      {withField && <input aria-label="Search" />}
      <select aria-label="Type"><option>All</option><option>Quiz</option></select>
    </main>
    <PhoneBottomNav items={ITEMS} menuOpen={false} menuCurrent={false} onMenu={() => {}} menuButtonRef={{ current: null }} sheetId="s" />
  </>
);

beforeEach(() => {
  vi.useFakeTimers();
  vv = Object.assign(new EventTarget(), { height: window.innerHeight, scale: 1 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
});
afterEach(() => { cleanup(); vi.useRealTimers(); delete window.visualViewport; });

describe('U-S1 bottom bar and the keyboard', () => {
  it('a select never hides the bar (it opens a picker, not the keyboard), even where focus alone decides', () => {
    delete window.visualViewport;
    render(<Page />);
    act(() => screen.getByRole('combobox', { name: 'Type' }).focus());
    expect(hidden()).toBe(false);
    act(() => screen.getByRole('textbox', { name: 'Search' }).focus());
    expect(hidden()).toBe(true);
  });

  it('hidden while the keyboard is open for a text field; back as soon as the keyboard closes, even if the field keeps focus', () => {
    render(<Page />);
    act(() => screen.getByRole('textbox', { name: 'Search' }).focus());
    setKeyboard(true);
    expect(hidden()).toBe(true);
    setKeyboard(false);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search' }));
    expect(hidden()).toBe(false);
  });

  it('a focused field with the keyboard closed (e.g. after Android back) does not hide the bar', () => {
    render(<Page />);
    setKeyboard(false);
    act(() => screen.getByRole('textbox', { name: 'Search' }).focus());
    expect(hidden()).toBe(false);
  });

  it('the field removed with its dialog: the bar comes back', () => {
    const { rerender } = render(<Page />);
    act(() => screen.getByRole('textbox', { name: 'Search' }).focus());
    setKeyboard(true);
    expect(hidden()).toBe(true);
    rerender(<Page withField={false} />);
    setKeyboard(false);
    expect(hidden()).toBe(false);
  });

  it('turning the phone re-checks: no keyboard after rotation means the bar is shown', () => {
    render(<Page />);
    act(() => screen.getByRole('textbox', { name: 'Search' }).focus());
    setKeyboard(true);
    vv.height = window.innerHeight;
    act(() => { window.dispatchEvent(new Event('orientationchange')); vi.runAllTimers(); });
    expect(hidden()).toBe(false);
  });
});

describe('U-S6 Menu sheet profile card', () => {
  const Sheet = ({ onSelect }) => {
    const [open, setOpen] = useState(true);
    return (
      <PhoneMenuSheet id="m" open={open} onClose={() => setOpen(false)} groups={[]} returnFocusRef={{ current: null }} closeKey="a"
        profile={{ key: 'p', label: 'Juan Dela Cruz', sub: 'Grade 8 · Rizal', avatar: <span data-testid="ava">JD</span>, current: false, onSelect }}
        onSignOut={() => {}} />
    );
  };
  it('shows the photo, the name and the line; one tap opens the profile and closes the sheet', () => {
    const onSelect = vi.fn();
    render(<Sheet onSelect={onSelect} />);
    const card = screen.getAllByRole('button').find(b => b.classList.contains('x-psheet-me'));
    expect(card.textContent).toBe('JDJuan Dela CruzGrade 8 · Rizal (Profile settings)');
    expect(card.querySelector('.x-psheet-ava').getAttribute('aria-hidden')).toBe('true');
    expect(card.querySelector('.x-psheet-ava [data-testid="ava"]')).toBeTruthy();
    expect(screen.queryByText('Profile & password')).toBeNull();
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
