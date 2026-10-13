// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  backendCalls: [],
  directory: [],
  readQueue: [],
  patchQueue: [],
  databaseCalls: [],
}));

const queryFor = (table) => {
  const state = { table, operation: 'read', payload: null };
  const query = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve, reject) => {
          h.databaseCalls.push({ ...state });
          const data = table === 'school_settings'
            ? [{ id: 1, school_year: '2026-2027', current_semester: 1 }]
            : [];
          return Promise.resolve({ data, count: data.length, error: null, status: 200 }).then(resolve, reject);
        };
      }
      return (...args) => {
        if (property === 'insert' || property === 'update' || property === 'delete') {
          state.operation = property;
          [state.payload] = args;
        }
        return query;
      };
    },
  });
  return query;
};

const resolveQueued = async (queue, fallback) => {
  const queued = queue.length ? queue.shift() : fallback;
  if (queued instanceof Error) throw queued;
  if (typeof queued === 'function') return queued();
  return queued;
};

vi.mock('../../../lib/backendApi', () => ({
  backendRequest: vi.fn(async (path, options = {}) => {
    h.backendCalls.push({ path, options });
    if (path === '/api/admin/users') {
      return resolveQueued(h.readQueue, { users: h.directory.map(user => ({ ...user })) });
    }
    if (path.endsWith('/archive-state')) {
      return resolveQueued(h.patchQueue, { user: null });
    }
    return {};
  }),
  isAmbiguousBackendRequestError: error => error?.requestMayHaveReachedServer === true,
}));
vi.mock('../../../config/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'admin-one' } } })) },
    from: vi.fn(table => queryFor(table)),
    storage: { from: vi.fn(() => ({ getPublicUrl: () => ({ data: {} }) })) },
  },
}));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ onlineUserIds: new Set() }) }));
vi.mock('../../../styles/dashboardTheme', () => ({
  useDashboardTheme: () => ({ darkMode: false, setDarkMode: vi.fn(), themePref: 'light', setThemePref: vi.fn() }),
}));

const { useAdminLogic } = await import('./useAdminLogic');
const admin = { uid: 'admin-one', role: 'main_admin', status: 'active', profile: { role: 'main_admin', status: 'active' } };
const activeUser = { id: 'user-one', name: 'Synthetic User', email: 'user@example.test', role: 'teacher', status: 'active' };
const ambiguousError = () => Object.assign(new Error('Failed to fetch'), { requestMayHaveReachedServer: true });

const setup = async (user = activeUser) => {
  h.directory = [{ ...user }];
  const view = renderHook(() => useAdminLogic(admin));
  await waitFor(() => expect(view.result.current.users).toHaveLength(1));
  return view;
};

const confirmArchive = async (result, restoring = false) => {
  act(() => {
    if (restoring) result.current.restoreUser('user-one');
    else result.current.deleteUser('user-one');
  });
  let completed;
  await act(async () => { completed = await result.current.deleteConfirm.onConfirm(); });
  return completed;
};

beforeEach(() => {
  h.backendCalls = [];
  h.directory = [];
  h.readQueue = [];
  h.patchQueue = [];
  h.databaseCalls = [];
});
afterEach(cleanup);

describe('Admin user archive outcome reconciliation', () => {
  it('AR-01 accepts a verified direct archive response and records one client activity', async () => {
    h.patchQueue = [{ user: { ...activeUser, status: 'archived' } }];
    const { result } = await setup();
    expect(await confirmArchive(result)).toBe(true);
    expect(result.current.users[0].status).toBe('archived');
    expect(h.backendCalls.filter(call => call.options.method === 'PATCH')).toHaveLength(1);
    expect(h.databaseCalls.filter(call => call.table === 'activity_logs' && call.operation === 'insert')).toHaveLength(1);
  });

  it('AR-02 reconciles a lost archive response as success after one fresh read', async () => {
    h.patchQueue = [() => {
      h.directory = [{ ...activeUser, status: 'archived' }];
      throw ambiguousError();
    }];
    const { result } = await setup();
    expect(await confirmArchive(result)).toBe(true);
    expect(result.current.users[0].status).toBe('archived');
    expect(h.backendCalls.filter(call => call.path === '/api/admin/users')).toHaveLength(2);
    expect(h.backendCalls.filter(call => call.options.method === 'PATCH')).toHaveLength(1);
    expect(h.databaseCalls.filter(call => call.table === 'activity_logs' && call.operation === 'insert')).toHaveLength(0);
  });

  it('AR-03 keeps the dialog outcome open when reconciliation confirms no change', async () => {
    h.patchQueue = [ambiguousError()];
    const { result } = await setup();
    expect(await confirmArchive(result)).toBe(false);
    expect(result.current.users[0].status).toBe('active');
    expect(result.current.toast.msg).toMatch(/was not archived/i);
    expect(result.current.toast.msg).not.toMatch(/failed to fetch/i);
  });

  it('AR-04 reports an unknown outcome when the reconciliation read fails', async () => {
    h.patchQueue = [ambiguousError()];
    h.readQueue = [{ users: [{ ...activeUser }] }, new Error('private read failure')];
    const { result } = await setup();
    expect(await confirmArchive(result)).toBe(false);
    expect(result.current.toast.msg).toMatch(/could not be confirmed/i);
    expect(result.current.toast.msg).not.toMatch(/private read failure|failed to fetch/i);
  });

  it('AR-05 reports an unknown outcome when the target is missing from the fresh read', async () => {
    h.patchQueue = [ambiguousError()];
    h.readQueue = [{ users: [{ ...activeUser }] }, { users: [] }];
    const { result } = await setup();
    expect(await confirmArchive(result)).toBe(false);
    expect(result.current.toast.msg).toMatch(/could not be confirmed/i);
  });

  it('AR-06 reports an unknown outcome for an unexpected reconciled state', async () => {
    h.patchQueue = [() => {
      h.directory = [{ ...activeUser, status: 'suspended' }];
      throw ambiguousError();
    }];
    const { result } = await setup();
    expect(await confirmArchive(result)).toBe(false);
    expect(result.current.toast.msg).toMatch(/could not be confirmed/i);
  });

  it('AR-07 does not reconcile controlled HTTP-style failures', async () => {
    h.patchQueue = [new Error('policy rejected')];
    const { result } = await setup();
    expect(await confirmArchive(result)).toBe(false);
    expect(h.backendCalls.filter(call => call.path === '/api/admin/users')).toHaveLength(1);
    expect(result.current.toast.msg).toBe('The user could not be archived. Please try again.');
  });

  it('AR-08 reconciles restore symmetrically and does not duplicate activity', async () => {
    const archivedUser = { ...activeUser, status: 'archived' };
    h.patchQueue = [() => {
      h.directory = [{ ...archivedUser, status: 'active' }];
      throw ambiguousError();
    }];
    const { result } = await setup(archivedUser);
    expect(await confirmArchive(result, true)).toBe(true);
    expect(result.current.users[0].status).toBe('active');
    expect(h.backendCalls.filter(call => call.options.method === 'PATCH')).toHaveLength(1);
    expect(h.databaseCalls.filter(call => call.table === 'activity_logs' && call.operation === 'insert')).toHaveLength(0);
  });

  it('AR-09 expects inactive when restoring an invitation-pending account', async () => {
    const pending = { ...activeUser, status: 'archived', can_resend_invitation: true };
    h.patchQueue = [{ user: { ...pending, status: 'inactive' } }];
    const { result } = await setup(pending);
    expect(await confirmArchive(result, true)).toBe(true);
    expect(result.current.users[0].status).toBe('inactive');
  });

  it('AR-10 reconciles a malformed successful response instead of trusting it', async () => {
    h.patchQueue = [{ user: { id: 'another-user', status: 'archived' } }];
    const { result } = await setup();
    expect(await confirmArchive(result)).toBe(false);
    expect(h.backendCalls.filter(call => call.path === '/api/admin/users')).toHaveLength(2);
    expect(result.current.users[0].id).toBe('user-one');
  });

  it('AR-14 keeps Restore recoverable when the fresh record is still archived', async () => {
    const archivedUser = { ...activeUser, status: 'archived' };
    h.patchQueue = [ambiguousError()];
    const { result } = await setup(archivedUser);
    expect(await confirmArchive(result, true)).toBe(false);
    expect(result.current.users[0].status).toBe('archived');
    expect(result.current.toast.msg).toMatch(/was not restored/i);
    expect(h.backendCalls.filter(call => call.options.method === 'PATCH')).toHaveLength(1);
  });

  it('AR-15 keeps Restore unknown when its reconciliation read fails', async () => {
    const archivedUser = { ...activeUser, status: 'archived' };
    h.patchQueue = [ambiguousError()];
    h.readQueue = [{ users: [archivedUser] }, new Error('private restore read failure')];
    const { result } = await setup(archivedUser);
    expect(await confirmArchive(result, true)).toBe(false);
    expect(result.current.toast.msg).toMatch(/could not be confirmed/i);
    expect(result.current.toast.msg).not.toMatch(/private|failed to fetch/i);
  });

  it('AR-16 preserves the existing self-archive protection without sending a mutation', async () => {
    const { result } = await setup({ ...activeUser, id: 'admin-one' });
    act(() => result.current.deleteUser('admin-one'));
    expect(h.backendCalls.filter(call => call.options.method === 'PATCH')).toHaveLength(0);
    expect(result.current.toast.msg).toMatch(/cannot archive your own/i);
  });
});
