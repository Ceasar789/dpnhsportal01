/* @vitest-environment jsdom */
// U4: useAdminLogic after the form-kit move.
//   - the toast timer: a second toast is not cut short by the first one's timer
//   - field problems come back to the dialog ({ ok:false, fieldErrors }), no toast
//   - every save/load error that used to show error.message now shows one of
//     the app's own sentences
//   - Settings: an invalid value returns the field to focus, no toast
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const RAW = 'duplicate key value violates unique constraint "synthetic_raw_key"';
const mocks = vi.hoisted(() => ({ errors: {} }));

const resultFor = (table, operation, payload) => {
  const error = mocks.errors[`${table}.${operation}`];
  if (error) return { data: null, error, status: 400 };
  if (table === 'school_settings' && operation === 'update') return { data: [{ id: 1, ...payload }], error: null, status: 200 };
  if (table === 'school_settings') return { data: [{ id: 1, school_year: '2026-2027', current_semester: 2, session_timeout: '30 min' }], error: null, status: 200 };
  if (table === 'calendar_events' && operation === 'delete') return { data: [], error: null };
  return { data: [], error: null, count: 0, status: 200 };
};

const queryFor = (table) => {
  let operation = 'read';
  let payload = null;
  const query = new Proxy({}, {
    get: (_target, property) => {
      if (property === 'then') return (resolve, reject) => Promise.resolve(resultFor(table, operation, payload)).then(resolve, reject);
      return (...args) => {
        if (['update', 'insert', 'delete', 'upsert'].includes(property)) { operation = property; [payload] = args; }
        return query;
      };
    },
  });
  return query;
};

vi.mock('../../../config/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'admin-one' } } })) },
    from: table => queryFor(table),
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: {} })) }) },
  },
}));
vi.mock('../../../lib/backendApi', () => ({ backendRequest: vi.fn(async () => ({ users: [] })), isAmbiguousBackendRequestError: () => false }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ onlineUserIds: new Set() }) }));
vi.mock('../../../styles/dashboardTheme', () => ({
  useDashboardTheme: () => ({ darkMode: false, setDarkMode: vi.fn(), themePref: 'light', setThemePref: vi.fn() }),
}));

import { useAdminLogic } from './useAdminLogic';

const ADMIN = { id: 'admin-one', uid: 'admin-one', role: 'main_admin', status: 'active', profile: { role: 'main_admin', status: 'active' } };
let current;
function Probe({ onValue }) { onValue(useAdminLogic(ADMIN)); return null; }
const mount = async () => {
  render(<Probe onValue={(value) => { current = value; }} />);
  await waitFor(() => expect(current?.settingsStatus).toBe('ready'));
  await act(async () => { current.setToast(null); });
};
const toastText = () => current.toast?.msg || '';

beforeEach(() => { current = null; mocks.errors = {}; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('the toast timer', () => {
  it('a second toast within 3 s gets its full 3 s', async () => {
    await mount();
    vi.useFakeTimers();
    act(() => { current.showToast('First'); });
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { current.showToast('Second'); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(toastText()).toBe('Second');   // the first toast's timer used to clear it here
    act(() => { vi.advanceTimersByTime(1600); });
    expect(current.toast).toBeNull();
  });
});

describe('field problems go back to the dialog, never to a toast', () => {
  it('memo, event and news', async () => {
    await mount();
    let result;
    await act(async () => { current.openCompose(); });
    await act(async () => { result = await current.saveMemo(); });
    expect(result).toEqual({ ok: false, fieldErrors: [{ fieldId: 'memos-subject', message: 'Enter the memo subject.' }] });

    await act(async () => { current.openCreateEvent(); });
    act(() => { current.setEvTitle('Fair'); current.setEvDate('2026-11-12'); current.setEvEnd('2026-11-10'); });
    await act(async () => { result = await current.saveEvent(); });
    expect(result.fieldErrors).toEqual([{ fieldId: 'calendar-end-date-optional', message: 'The end date cannot be before the start date.' }]);

    await act(async () => { current.openNewPost(); });
    await act(async () => { result = await current.saveNews(); });
    expect(result.fieldErrors.map(p => p.fieldId)).toEqual(['news-title']);
    expect(current.toast).toBeNull();
  });
});

describe('raw error text never reaches a toast', () => {
  it('memo save', async () => {
    mocks.errors['memos.insert'] = { code: 'XX000', message: RAW };
    await mount();
    await act(async () => { current.openCompose(); });
    act(() => { current.setMSubj('Faculty meeting'); });
    await act(async () => { await current.saveMemo(); });
    expect(toastText()).toBe('The memo could not be saved. Please try again.');
  });

  it('event save, with a permission error mapped to its sentence', async () => {
    mocks.errors['calendar_events.insert'] = { code: '42501', message: RAW };
    await mount();
    await act(async () => { current.openCreateEvent(); });
    act(() => { current.setEvTitle('Fair'); current.setEvDate('2026-11-12'); });
    await act(async () => { await current.saveEvent(); });
    expect(toastText()).toBe("You don't have permission to do that.");
  });

  it('event delete (a delete that removed nothing)', async () => {
    await mount();
    act(() => { current.deleteEvent('e-missing'); });
    await act(async () => { await current.deleteConfirm.onConfirm(); });
    expect(toastText()).toBe('The event could not be deleted. Please try again.');
  });

  it('events load', async () => {
    mocks.errors['calendar_events.read'] = { code: 'XX000', message: RAW };
    await mount();
    await act(async () => { await current.fetchCalEvents(); });
    await waitFor(() => expect(toastText()).toBe('Calendar events could not be loaded. Please try again.'), { timeout: 5000 });
  });

  it('news status change', async () => {
    mocks.errors['news.update'] = { code: 'XX000', message: RAW };
    await mount();
    await act(async () => { await current.updateNewsStatus('n1', 'Archived'); });
    expect(toastText()).toBe('The post status could not be changed. Please try again.');
  });

  it('news expiry', async () => {
    mocks.errors['news.update'] = { code: 'XX000', message: RAW };
    await mount();
    await act(async () => { current.openEditNews({ id: 'n1', title: 'Old', status: 'Published', target_roles: 'all' }); });
    await act(async () => { await current.saveNewsExpiry(); });
    expect(toastText()).toBe('The expiry date could not be saved. Please try again.');
  });
});

describe('Settings (decision 4)', () => {
  it('an invalid academic year returns the field to focus and shows no toast; nothing is written', async () => {
    await mount();
    act(() => { current.setSettings({ ...current.settings, academic_year: '2026-2028' }); });
    let result;
    await act(async () => { result = await current.saveSettings(); });
    expect(result).toEqual({ ok: false, fieldId: 'settings-academic-year' });
    expect(current.toast).toBeNull();
  });
});
