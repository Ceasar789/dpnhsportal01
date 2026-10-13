/* @vitest-environment jsdom */
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settingsRows: [{ id: 1, school_year: '2026-2027', current_semester: 2, session_timeout: '30 min' }],
  updateRows: null,
  updates: [],
  settingsReadResults: [],
}));

const resultFor = (table, operation, payload) => {
  if (table === 'school_settings' && operation === 'update') {
    mocks.updates.push(payload);
    return {
      data: mocks.updateRows ?? [{ id: 1, ...payload }],
      error: null,
      status: 200,
    };
  }
  if (table === 'school_settings') {
    return mocks.settingsReadResults.length
      ? mocks.settingsReadResults.shift()
      : { data: mocks.settingsRows, error: null, status: 200 };
  }
  return { data: [], error: null, count: 0, status: 200 };
};

const queryFor = table => {
  let operation = 'read';
  let payload = null;
  let query;
  query = new Proxy({}, {
    get: (_target, property) => {
      if (property === 'then') {
        return (resolve, reject) => Promise.resolve(resultFor(table, operation, payload)).then(resolve, reject);
      }
      return (...args) => {
        if (property === 'update') {
          operation = 'update';
          [payload] = args;
        } else if (property === 'insert') {
          operation = 'insert';
          [payload] = args;
        }
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
  },
}));

vi.mock('../../../lib/backendApi', () => ({
  backendRequest: vi.fn(async () => ({ users: [] })),
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ onlineUserIds: new Set() }),
}));

vi.mock('../../../styles/dashboardTheme', () => ({
  useDashboardTheme: () => ({
    darkMode: false,
    setDarkMode: vi.fn(),
    themePref: 'light',
    setThemePref: vi.fn(),
  }),
}));

import { useAdminLogic } from './useAdminLogic';

const activeMainAdmin = {
  id: 'admin-one',
  role: 'main_admin',
  status: 'active',
  profile: { role: 'main_admin', status: 'active' },
};

function Probe({ userData, onValue }) {
  const value = useAdminLogic(userData);
  onValue(value);
  return null;
}

describe('useAdminLogic Settings boundary', () => {
  let current;

  beforeEach(() => {
    current = null;
    mocks.settingsRows = [{ id: 1, school_year: '2026-2027', current_semester: 2, session_timeout: '30 min' }];
    mocks.updateRows = null;
    mocks.updates = [];
    mocks.settingsReadResults = [];
  });

  afterEach(() => cleanup());

  const mount = (userData = activeMainAdmin) => {
    render(<Probe userData={userData} onValue={value => { current = value; }} />);
    return waitFor(() => expect(current?.settingsStatus).toBe('ready'));
  };

  it('writes only the supported columns and accepts one matching id=1 row', async () => {
    await mount();
    act(() => current.setSettings(value => ({ ...value, academic_year: '2027-2028', semester: '3rd Quarter' })));
    act(() => current.setSessionTimeout('1 hour'));
    await waitFor(() => expect(current.settingsCanSave).toBe(true));

    await act(async () => current.saveSettings());

    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]).toMatchObject({
      school_year: '2027-2028',
      current_semester: 3,
      session_timeout: '1 hour',
    });
    expect(Object.keys(mocks.updates[0]).sort()).toEqual([
      'current_semester', 'school_year', 'session_timeout', 'updated_at',
    ]);
    await waitFor(() => expect(current.settingsDirty).toBe(false));
  });

  it('fails closed when the singleton row is missing', async () => {
    mocks.settingsRows = [];
    render(<Probe userData={activeMainAdmin} onValue={value => { current = value; }} />);

    await waitFor(() => expect(current?.settingsStatus).toBe('missing'));
    expect(current.settingsCanEdit).toBe(false);
    expect(current.settingsCanSave).toBe(false);
    expect(mocks.updates).toEqual([]);
  });

  it('ignores an older read that finishes after a newer read and active edit', async () => {
    await mount();
    let resolveOlder;
    let resolveNewer;
    mocks.settingsReadResults = [
      new Promise(resolve => { resolveOlder = resolve; }),
      new Promise(resolve => { resolveNewer = resolve; }),
    ];

    let olderRead;
    let newerRead;
    act(() => { olderRead = current.fetchSettings(); });
    act(() => { newerRead = current.fetchSettings(); });
    await act(async () => resolveNewer({
      data: [{ id: 1, school_year: '2028-2029', current_semester: 3, session_timeout: '1 hour' }],
      error: null,
      status: 200,
    }));
    await newerRead;
    act(() => current.setSettings(value => ({ ...value, academic_year: '2029-2030' })));

    await act(async () => resolveOlder({
      data: [{ id: 1, school_year: '2020-2021', current_semester: 1, session_timeout: '15 min' }],
      error: null,
      status: 200,
    }));
    await olderRead;

    expect(current.settings.academic_year).toBe('2029-2030');
    expect(current.settingsDirty).toBe(true);
  });

  it('keeps dirty edits when the update result does not verify', async () => {
    mocks.updateRows = [];
    await mount();
    act(() => current.setSettings(value => ({ ...value, academic_year: '2027-2028' })));
    await waitFor(() => expect(current.settingsDirty).toBe(true));

    await act(async () => current.saveSettings());

    expect(mocks.updates).toHaveLength(1);
    expect(current.settings.academic_year).toBe('2027-2028');
    expect(current.settingsDirty).toBe(true);
  });

  it('rejects a direct write call from a non-main-admin profile', async () => {
    await mount({
      ...activeMainAdmin,
      role: 'main_admin',
      profile: { role: 'admin', status: 'active' },
    });

    await act(async () => current.saveSettings());

    expect(current.settingsAuthorized).toBe(false);
    expect(mocks.updates).toEqual([]);
  });
});
