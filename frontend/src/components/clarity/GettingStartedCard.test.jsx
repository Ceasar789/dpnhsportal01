// @vitest-environment jsdom
// V2a: the first-time "Getting started" card. Stored per role and user in
// localStorage only; blocked storage still shows the card.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import GettingStartedCard from './GettingStartedCard';
import { gettingStartedKey, readGettingStarted } from '../../lib/gettingStarted';

const go = { a: vi.fn(), b: vi.fn() };
const STEPS = [
  { id: 'a', title: 'First step', text: 'Do the first thing.', action: 'Open A', go: () => go.a() },
  { id: 'b', title: 'Second step', text: 'Then the second.', action: 'Open B', go: () => go.b() },
];
const show = (uid = 'u1') => render(<GettingStartedCard role="teacher" uid={uid} steps={STEPS} />);
const card = () => screen.queryByRole('region', { name: 'Getting started' });

beforeEach(() => { window.localStorage.clear(); go.a.mockReset(); go.b.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });

describe('GettingStartedCard', () => {
  it('shows numbered steps in order, each with its own button', () => {
    show();
    const items = within(card()).getAllByRole('listitem');
    expect(items.map(li => li.querySelector('.t').textContent)).toEqual(['First step', 'Second step']);
    expect(items[0].querySelector('.x-ico').textContent).toBe('1');
    expect(within(items[1]).getByRole('button', { name: 'Open B' })).toBeTruthy();
  });

  it('a step button opens its page and ticks the step; the choice survives a remount', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Open A' }));
    expect(go.a).toHaveBeenCalledTimes(1);
    expect(card().querySelector('li .x-ico').textContent).toBe('');
    expect(within(card()).getByText('(done)')).toBeTruthy();
    cleanup();
    show();
    expect(within(card()).getByText('(done)')).toBeTruthy();
  });

  it('is gone for good once every step is done', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Open A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open B' }));
    expect(card()).toBeNull();
    cleanup();
    show();
    expect(card()).toBeNull();
  });

  it('Hide removes it for good, for this user only', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Hide getting started' }));
    expect(card()).toBeNull();
    cleanup();
    show();
    expect(card()).toBeNull();
    cleanup();
    show('someone-else');
    expect(card()).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(gettingStartedKey('teacher', 'u1')))).toEqual({ hidden: true, done: [] });
  });

  it('blocked or broken storage: the card still shows and still works', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    show();
    expect(card()).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide getting started' }));
    expect(card()).toBeNull();
  });

  it('ignores a stored value of the wrong shape', () => {
    window.localStorage.setItem(gettingStartedKey('teacher', 'u1'), '"hidden"');
    expect(readGettingStarted(gettingStartedKey('teacher', 'u1'))).toEqual({ hidden: false, done: [] });
    window.localStorage.setItem(gettingStartedKey('teacher', 'u1'), '{"hidden":"yes","done":"a"}');
    expect(readGettingStarted(gettingStartedKey('teacher', 'u1'))).toEqual({ hidden: false, done: [] });
  });

  it('a step with two buttons ticks only when both were used', () => {
    const go2 = { x: vi.fn(), y: vi.fn() };
    const steps = [{ id: 'pair', title: 'Two pages', text: 'Open both.', actions: [{ id: 'x', label: 'Open X', go: go2.x }, { id: 'y', label: 'Open Y', go: go2.y }] }];
    render(<GettingStartedCard role="admin" uid="u1" steps={steps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open X' }));
    expect(go2.x).toHaveBeenCalledTimes(1);
    expect(card().querySelector('li .x-ico').textContent).toBe('1');
    expect(document.getElementById(screen.getByRole('button', { name: 'Open Y' }).getAttribute('aria-describedby')).textContent).toBe('Two pages');
    fireEvent.click(screen.getByRole('button', { name: 'Open Y' }));
    expect(go2.y).toHaveBeenCalledTimes(1);
    expect(card()).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(gettingStartedKey('admin', 'u1')))).toEqual({ hidden: false, done: ['x', 'y'] });
  });

  it('blocked storage: a used step still ticks for the session', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Open A' }));
    expect(go.a).toHaveBeenCalledTimes(1);
    expect(within(card()).getByText('(done)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open B' }));
    expect(card()).toBeNull();
  });

  it('the Hide button keeps its 44px square (it never shrinks beside a long heading)', () => {
    show();
    const hide = screen.getByRole('button', { name: 'Hide getting started' });
    expect(hide.classList.contains('x-iconbtn')).toBe(true);
    expect(hide.style.flexShrink).toBe('0');
  });

  it('each step button is described by its step title', () => {
    show();
    const button = screen.getByRole('button', { name: 'Open B' });
    expect(document.getElementById(button.getAttribute('aria-describedby')).textContent).toBe('Second step');
  });
});
