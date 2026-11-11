// @vitest-environment jsdom
// The Clarity preview flag and the <html> class hook.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CLARITY_STORAGE_KEY, clarityParam, resolveClarityFlag, useClarityFlag } from './useClarityFlag';
import { useHtmlClass } from './useHtmlClass';

const SCOPE = ['theme', 'clarity'].join('-');

const Probe = () => {
  const { enabled, turnOff } = useClarityFlag();
  const location = useLocation();
  return (
    <div>
      <p data-testid="state">{enabled ? 'on' : 'off'}</p>
      <p data-testid="url">{`${location.pathname}${location.search}`}</p>
      <button type="button" onClick={turnOff}>Classic view</button>
    </div>
  );
};
const renderAt = path => render(
  <MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<Probe />} /></Routes></MemoryRouter>,
);
const state = () => screen.getByTestId('state').textContent;

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });

describe('resolveClarityFlag (pure)', () => {
  it('the parameter wins; otherwise the stored value; default off', () => {
    expect(resolveClarityFlag('', false)).toBe(false);
    expect(resolveClarityFlag('', true)).toBe(true);
    expect(resolveClarityFlag('?clarity=1', false)).toBe(true);
    expect(resolveClarityFlag('?clarity=0', true)).toBe(false);
  });
  it.each(['?clarity=true', '?clarity=yes', '?clarity=', '?clarity=2', '?Clarity=1', '?view=done'])('ignores %s', (search) => {
    expect(clarityParam(search)).toBeNull();
    expect(resolveClarityFlag(search, false)).toBe(false);
  });
});

describe('useClarityFlag', () => {
  it('is off by default', () => {
    renderAt('/student-dashboard');
    expect(state()).toBe('off');
    expect(window.localStorage.getItem(CLARITY_STORAGE_KEY)).toBeNull();
  });

  it('?clarity=1 turns it on and remembers it for later visits', () => {
    renderAt('/student-dashboard?clarity=1');
    expect(state()).toBe('on');
    expect(window.localStorage.getItem(CLARITY_STORAGE_KEY)).toBe('1');
    cleanup();
    renderAt('/student-dashboard/tasks');
    expect(state()).toBe('on');
  });

  it('?clarity=0 turns it off and clears the stored value', () => {
    window.localStorage.setItem(CLARITY_STORAGE_KEY, '1');
    renderAt('/student-dashboard?clarity=0');
    expect(state()).toBe('off');
    expect(window.localStorage.getItem(CLARITY_STORAGE_KEY)).toBeNull();
  });

  it('a stored value other than "1" does not turn it on', () => {
    window.localStorage.setItem(CLARITY_STORAGE_KEY, 'true');
    renderAt('/student-dashboard');
    expect(state()).toBe('off');
  });

  it('Classic view clears the flag and keeps every other query parameter', () => {
    window.localStorage.setItem(CLARITY_STORAGE_KEY, '1');
    renderAt('/student-dashboard/tasks?view=done&subject=sub-eng');
    expect(state()).toBe('on');
    fireEvent.click(screen.getByRole('button', { name: 'Classic view' }));
    expect(state()).toBe('off');
    expect(window.localStorage.getItem(CLARITY_STORAGE_KEY)).toBeNull();
    const url = new URL(`http://x${screen.getByTestId('url').textContent}`);
    expect(url.pathname).toBe('/student-dashboard/tasks');
    expect(url.searchParams.get('view')).toBe('done');
    expect(url.searchParams.get('subject')).toBe('sub-eng');
    expect(url.searchParams.get('clarity')).toBe('0');
  });

  it('turning it on does not change other query parameters', () => {
    renderAt('/student-dashboard/tasks?view=upcoming&clarity=1');
    expect(screen.getByTestId('url').textContent).toBe('/student-dashboard/tasks?view=upcoming&clarity=1');
  });

  it('storage that throws does not crash: the parameter alone decides', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    renderAt('/student-dashboard?clarity=1');
    expect(state()).toBe('on');
    cleanup();
    renderAt('/student-dashboard');
    expect(state()).toBe('off');
    cleanup();
    renderAt('/student-dashboard?clarity=0');
    expect(state()).toBe('off');
    fireEvent.click(screen.getByRole('button', { name: 'Classic view' }));
    expect(state()).toBe('off');
  });

  it('a localStorage getter that throws does not crash', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
    try {
      renderAt('/student-dashboard?clarity=1');
      expect(state()).toBe('on');
    } finally {
      Object.defineProperty(window, 'localStorage', original);
    }
  });
});

describe('useHtmlClass', () => {
  const Holder = () => { useHtmlClass(SCOPE); return <p>held</p>; };
  it('adds the class while mounted and removes it on unmount', () => {
    expect(document.documentElement.classList.contains(SCOPE)).toBe(false);
    const view = render(<Holder />);
    expect(document.documentElement.classList.contains(SCOPE)).toBe(true);
    act(() => view.unmount());
    expect(document.documentElement.classList.contains(SCOPE)).toBe(false);
  });
});
