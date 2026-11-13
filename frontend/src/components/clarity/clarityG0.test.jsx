// @vitest-environment jsdom
// Clarity G0: Clarity is ON everywhere. A stale localStorage
// smartedu-clarity='0' (the removed "Classic view" button wrote it) no longer
// turns it off and is removed on load; ?clarity=0 is a rollback for this tab
// session only (sessionStorage), never written to localStorage; ?clarity=1
// clears it; blocked storage falls back to on.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { CLARITY_STORAGE_KEY, readStoredFlag, resolveClarityFlag, useClarityFlag } from './useClarityFlag';

const Probe = () => {
  const { enabled, turnOff } = useClarityFlag();
  const location = useLocation();
  return (
    <div>
      <p data-testid="state">{enabled ? 'on' : 'off'}</p>
      <p data-testid="url">{location.pathname + location.search}</p>
      <button type="button" onClick={turnOff}>Roll back</button>
    </div>
  );
};
const probeAt = path => render(<MemoryRouter initialEntries={[path]}><Probe /></MemoryRouter>);
const state = () => screen.getByTestId('state').textContent;
const local = () => window.localStorage.getItem(CLARITY_STORAGE_KEY);
const session = () => window.sessionStorage.getItem(CLARITY_STORAGE_KEY);

beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); window.sessionStorage.clear(); });

describe('a stale stored off is harmless', () => {
  it('localStorage "0" (old Classic view): Clarity is on, and the stale value is removed', () => {
    window.localStorage.setItem(CLARITY_STORAGE_KEY, '0');
    probeAt('/student-dashboard');
    expect(state()).toBe('on');
    expect(local()).toBeNull();
  });

  it('any other stored value is left alone and does not turn it off', () => {
    for (const value of ['1', 'true', 'off']) {
      window.localStorage.setItem(CLARITY_STORAGE_KEY, value);
      probeAt('/teacher-dashboard');
      expect(state(), value).toBe('on');
      expect(local(), value).toBe(value);
      cleanup();
    }
  });

  it('readStoredFlag reads only this tab session: localStorage "0" is null (on), session "0" is false', () => {
    window.localStorage.setItem(CLARITY_STORAGE_KEY, '0');
    expect(readStoredFlag()).toBeNull();
    window.sessionStorage.setItem(CLARITY_STORAGE_KEY, '0');
    expect(readStoredFlag()).toBe(false);
    expect(resolveClarityFlag('', readStoredFlag())).toBe(false);
    expect(resolveClarityFlag('?clarity=1', readStoredFlag())).toBe(true);
  });
});

describe('?clarity=0: a rollback for this tab session only', () => {
  it('turns it off, keeps it off for the session, and never writes localStorage', () => {
    probeAt('/admin-dashboard?clarity=0');
    expect(state()).toBe('off');
    expect(session()).toBe('0');
    expect(local()).toBeNull();
    cleanup();
    probeAt('/admin-dashboard');
    expect(state()).toBe('off');
  });

  it('a new tab session (empty sessionStorage) is back on', () => {
    probeAt('/admin-dashboard?clarity=0');
    cleanup();
    window.sessionStorage.clear();
    probeAt('/admin-dashboard');
    expect(state()).toBe('on');
  });

  it('?clarity=1 clears the rollback', () => {
    window.sessionStorage.setItem(CLARITY_STORAGE_KEY, '0');
    probeAt('/student-dashboard?clarity=1');
    expect(state()).toBe('on');
    expect(session()).toBeNull();
    cleanup();
    probeAt('/student-dashboard');
    expect(state()).toBe('on');
  });

  it('the hidden turnOff sets the session rollback and ?clarity=0, keeping other parameters; localStorage untouched', () => {
    probeAt('/student-dashboard/tasks?view=done');
    fireEvent.click(screen.getByRole('button', { name: 'Roll back' }));
    expect(state()).toBe('off');
    expect(session()).toBe('0');
    expect(local()).toBeNull();
    expect(screen.getByTestId('url').textContent).toBe('/student-dashboard/tasks?view=done&clarity=0');
  });
});

describe('blocked storage', () => {
  it('both stores throwing: on by default; ?clarity=0 still works for that load; nothing crashes', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    probeAt('/teacher-dashboard');
    expect(state()).toBe('on');
    cleanup();
    probeAt('/teacher-dashboard?clarity=0');
    expect(state()).toBe('off');
    cleanup();
    probeAt('/teacher-dashboard');
    expect(state()).toBe('on');
  });

  it('storage methods that throw: on, without crashing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    probeAt('/admin-dashboard');
    expect(state()).toBe('on');
  });
});
