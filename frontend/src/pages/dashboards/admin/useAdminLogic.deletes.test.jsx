// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [], deleteResults: {}, readResults: {}, writeResults: {},
  uploadResults: [], removeResults: [],
}));

const rows = {
  news: [{ id: 'news-1', title: 'Synthetic News', status: 'Draft', created_at: '2026-01-01' }],
  memos: [{ id: 'memo-1', subject: 'Synthetic Memo', content: 'Body', recipient: 'All Faculty', created_at: '2026-01-01' }],
  activity_logs: [],
  profiles: [],
  calendar_events: [],
  school_settings: [{ id: 1, school_year: '2026-2027', current_semester: 1, session_timeout: '30 min' }],
  backup_history: [],
};

const queryFor = (table) => {
  const state = { table, operation: 'read', payload: null, filters: [] };
  const query = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve, reject) => {
          h.calls.push({ ...state, filters: [...state.filters] });
          if (state.operation === 'delete') {
            const result = h.deleteResults[table] ?? { data: [], error: null };
            if (result instanceof Error) return Promise.reject(result).then(resolve, reject);
            return Promise.resolve(result).then(resolve, reject);
          }
          if (state.operation === 'insert' || state.operation === 'update') {
            const queued = h.writeResults[table]?.shift();
            if (queued instanceof Error) return Promise.reject(queued).then(resolve, reject);
            if (queued) return Promise.resolve(queued).then(resolve, reject);
            return Promise.resolve({ data: state.payload, error: null }).then(resolve, reject);
          }
          const queued = h.readResults[table]?.shift();
          if (queued) return Promise.resolve(queued).then(resolve, reject);
          const data = rows[table] || [];
          return Promise.resolve({ data, count: data.length, error: null, status: 200 }).then(resolve, reject);
        };
      }
      return (...args) => {
        if (property === 'delete') state.operation = 'delete';
        if (property === 'insert' || property === 'update') {
          state.operation = property;
          [state.payload] = args;
        }
        if (property === 'eq' || property === 'in') state.filters.push([property, ...args]);
        return query;
      };
    },
  });
  return query;
};

vi.mock('../../../config/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'admin-one' } } })) },
    from: vi.fn(table => queryFor(table)),
    storage: {
      from: vi.fn(bucket => ({
        upload: async (path) => {
          h.calls.push({ resource: 'storage', bucket, operation: 'upload', path });
          const queued = h.uploadResults.shift();
          if (queued instanceof Error) throw queued;
          return queued || { data: { path }, error: null };
        },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://project.invalid/storage/v1/object/public/${bucket}/${path}` } }),
        remove: async (paths) => {
          h.calls.push({ resource: 'storage', bucket, operation: 'remove', paths });
          const queued = h.removeResults.shift();
          if (queued instanceof Error) throw queued;
          return queued || { data: paths, error: null };
        },
      })),
    },
  },
}));
vi.mock('../../../lib/backendApi', () => ({ backendRequest: vi.fn(async () => ({ users: [] })) }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ onlineUserIds: new Set() }) }));
vi.mock('../../../styles/dashboardTheme', () => ({
  useDashboardTheme: () => ({ darkMode: false, setDarkMode: vi.fn(), themePref: 'light', setThemePref: vi.fn() }),
}));

const { useAdminLogic } = await import('./useAdminLogic');
const user = { uid: 'admin-one', role: 'main_admin', status: 'active', profile: { role: 'main_admin', status: 'active' } };

const setup = async () => {
  const view = renderHook(() => useAdminLogic(user));
  await waitFor(() => expect(view.result.current.newsLoading).toBe(false));
  await waitFor(() => expect(view.result.current.memosLoading).toBe(false));
  return view;
};

beforeEach(() => {
  h.calls = [];
  h.deleteResults = {};
  h.readResults = {};
  h.writeResults = {};
  h.uploadResults = [];
  h.removeResults = [];
});
afterEach(cleanup);

describe('News and Memo verified deletion', () => {
  it.each([
    ['news', 'deleteNewsItem', 'news-1', { data: [{ id: 'news-1' }], error: null }, true, 'Deleted news'],
    ['news', 'deleteNewsItem', 'news-1', { data: [], error: null }, false, 'Deleted news'],
    ['news', 'deleteNewsItem', 'news-1', { data: [{ id: 'wrong' }], error: null }, false, 'Deleted news'],
    ['news', 'deleteNewsItem', 'news-1', { data: null, error: new Error('synthetic') }, false, 'Deleted news'],
    ['memos', 'deleteMemo', 'memo-1', { data: [{ id: 'memo-1' }], error: null }, true, 'Deleted memo'],
    ['memos', 'deleteMemo', 'memo-1', { data: [], error: null }, false, 'Deleted memo'],
    ['memos', 'deleteMemo', 'memo-1', { data: [{ id: 'wrong' }], error: null }, false, 'Deleted memo'],
    ['memos', 'deleteMemo', 'memo-1', new Error('synthetic network failure'), false, 'Deleted memo'],
  ])('%s returns %s only for an exact delete result', async (table, handler, id, response, expected, activity) => {
    h.deleteResults[table] = response;
    const { result } = await setup();
    act(() => result.current[handler](id));
    let completed;
    await act(async () => { completed = await result.current.deleteConfirm.onConfirm(); });
    expect(completed).toBe(expected);
    const successLog = h.calls.some(call => call.table === 'activity_logs'
      && call.operation === 'insert' && call.payload?.[0]?.action === activity);
    expect(successLog).toBe(expected);
    expect(result.current.deleteConfirm.requireConfirmedResult).toBe(true);
  });
});

describe('News and Memo stale read suppression', () => {
  it.each([
    ['news', 'fetchNews', 'newsItems'],
    ['memos', 'fetchMemos', 'memos'],
  ])('does not let an older %s read overwrite a newer result', async (table, fetcher, stateKey) => {
    const { result } = await setup();
    let resolveOlder;
    let resolveNewer;
    h.readResults[table] = [
      new Promise(resolve => { resolveOlder = resolve; }),
      new Promise(resolve => { resolveNewer = resolve; }),
    ];
    let older;
    let newer;
    act(() => { older = result.current[fetcher](); });
    act(() => { newer = result.current[fetcher](); });
    await act(async () => resolveNewer({ data: [{ id: `${table}-new` }], error: null }));
    await newer;
    await act(async () => resolveOlder({ data: [{ id: `${table}-old` }], error: null }));
    await older;
    expect(result.current[stateKey].map(row => row.id)).toEqual([`${table}-new`]);
  });
});

const stageNewsImage = (result, { edit = null } = {}) => {
  act(() => {
    if (edit) result.current.openEditNews(edit);
    else result.current.openNewPost();
    result.current.setNTitle(edit?.title || 'Rollback test');
    result.current.setNContent('Synthetic content');
    result.current.setNImageFile(new File(['image'], 'replacement image.png', { type: 'image/png' }));
  });
};

describe('News image save rollback', () => {
  it('retains the exact uploaded object after a successful create and logs success', async () => {
    const { result } = await setup();
    stageNewsImage(result);

    await act(async () => { await result.current.saveNews(); });

    const upload = h.calls.find(call => call.resource === 'storage' && call.operation === 'upload');
    expect(upload.bucket).toBe('news-images');
    expect(upload.path).toMatch(/^admin-one\/\d+-replacement-image\.png$/);
    expect(h.calls.some(call => call.resource === 'storage' && call.operation === 'remove')).toBe(false);
    expect(h.calls.some(call => call.table === 'activity_logs' && call.operation === 'insert')).toBe(true);
  });

  it('rolls back only the current upload after a confirmed create rejection', async () => {
    h.writeResults.news = [{ data: null, error: new Error('confirmed rejection') }];
    const { result } = await setup();
    stageNewsImage(result);

    await act(async () => { await result.current.saveNews(); });

    const upload = h.calls.find(call => call.resource === 'storage' && call.operation === 'upload');
    const removal = h.calls.find(call => call.resource === 'storage' && call.operation === 'remove');
    expect(removal).toEqual(expect.objectContaining({ bucket: 'news-images', paths: [upload.path] }));
    expect(h.calls.some(call => call.table === 'activity_logs' && call.operation === 'insert')).toBe(false);
    expect(result.current.toast).toEqual(expect.objectContaining({ type: 'error' }));
  });

  it('rolls back a failed replacement without touching the persisted image', async () => {
    h.writeResults.news = [{ data: null, error: new Error('confirmed update rejection') }];
    const existing = {
      id: 'news-1', title: 'Existing', content: 'Old content', status: 'Draft',
      featured_image_url: 'https://project.invalid/storage/v1/object/public/news-images/another-owner/old.png',
      target_roles: 'all',
    };
    const { result } = await setup();
    stageNewsImage(result, { edit: existing });

    await act(async () => { await result.current.saveNews(); });

    const removal = h.calls.find(call => call.resource === 'storage' && call.operation === 'remove');
    expect(removal.paths).toHaveLength(1);
    expect(removal.paths[0]).toMatch(/^admin-one\/\d+-replacement-image\.png$/);
    expect(removal.paths).not.toContain(existing.featured_image_url);
  });

  it.each([
    ['returned error', { data: null, error: new Error('policy denied') }],
    ['thrown error', new Error('remove transport failed')],
  ])('reports rollback cleanup failure safely when Storage returns a %s', async (_label, removeResult) => {
    h.writeResults.news = [{ data: null, error: new Error('confirmed rejection') }];
    h.removeResults = [removeResult];
    const { result } = await setup();
    stageNewsImage(result);

    await act(async () => { await result.current.saveNews(); });

    expect(result.current.toast.msg).toMatch(/could not be removed automatically/i);
    expect(result.current.toast.msg).not.toMatch(/policy denied|transport failed/i);
  });

  it('does not write News or attempt cleanup when the upload is rejected', async () => {
    h.uploadResults = [{ data: null, error: new Error('upload rejected') }];
    const { result } = await setup();
    stageNewsImage(result);

    await act(async () => { await result.current.saveNews(); });

    expect(h.calls.some(call => call.table === 'news' && ['insert', 'update'].includes(call.operation))).toBe(false);
    expect(h.calls.some(call => call.resource === 'storage' && call.operation === 'remove')).toBe(false);
    expect(result.current.toast).toEqual(expect.objectContaining({ type: 'error' }));
  });

  it('treats a thrown database outcome as ambiguous and neither deletes nor blindly retries', async () => {
    h.writeResults.news = [new Error('connection lost after send')];
    const { result } = await setup();
    stageNewsImage(result);

    await act(async () => { await result.current.saveNews(); });
    await act(async () => { await result.current.saveNews(); });

    expect(h.calls.filter(call => call.resource === 'storage' && call.operation === 'upload')).toHaveLength(1);
    expect(h.calls.some(call => call.resource === 'storage' && call.operation === 'remove')).toBe(false);
    expect(h.calls.filter(call => call.table === 'news' && call.operation === 'insert')).toHaveLength(1);
    expect(result.current.toast.msg).toMatch(/could not be confirmed/i);
  });

  it('admits only one active save attempt during rapid repeated submission', async () => {
    let releaseUpload;
    h.uploadResults = [new Promise(resolve => { releaseUpload = resolve; })];
    const { result } = await setup();
    stageNewsImage(result);

    let first;
    act(() => { first = result.current.saveNews(); });
    await waitFor(() => expect(h.calls.filter(call => call.resource === 'storage' && call.operation === 'upload')).toHaveLength(1));
    await act(async () => { await result.current.saveNews(); });
    releaseUpload({ data: { path: 'synthetic' }, error: null });
    await act(async () => { await first; });

    expect(h.calls.filter(call => call.resource === 'storage' && call.operation === 'upload')).toHaveLength(1);
    expect(h.calls.filter(call => call.table === 'news' && call.operation === 'insert')).toHaveLength(1);
  });
});
