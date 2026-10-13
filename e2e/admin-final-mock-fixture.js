import { expect } from '@playwright/test';

export const ADMIN_FINAL_BASE_URL = 'http://127.0.0.1:4178';
export const ADMIN_FINAL_SUPABASE_ORIGIN = 'https://admin-final-e2e.supabase.invalid';
const ADMIN_ID = 'af000000-0000-4000-8000-000000000001';
const TEACHER_ID = 'af000000-0000-4000-8000-000000000002';

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = [encode({ alg: 'none', typ: 'JWT' }), encode({ aud: 'authenticated', role: 'authenticated', sub: ADMIN_ID, exp: Math.floor(Date.now() / 1000) + 3600 }), 'admin-final-e2e'].join('.');

const profileFor = ({ status = 'active', role = 'main_admin' } = {}) => ({
  id: ADMIN_ID, email: 'admin.final@example.test', name: 'Synthetic Admin', role, status,
  department: 'Synthetic', photo_url: null, created_at: '2026-10-11T00:00:00.000Z',
});
const sessionFor = profile => ({
  access_token: token, refresh_token: 'synthetic-admin-final-refresh', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer',
  user: { id: ADMIN_ID, aud: 'authenticated', role: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {}, identities: [] },
});

const json = (route, data, status = 200, headers = {}) => route.fulfill({
  status, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...headers },
  body: JSON.stringify(data),
});

export const assertLocalAdminFinalBaseURL = value => {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`Admin-final browser QA refuses non-local base URL: ${url.origin}`);
  }
  return true;
};

export async function installAdminFinalMocks(page, options = {}) {
  assertLocalAdminFinalBaseURL(ADMIN_FINAL_BASE_URL);
  const profile = profileFor(options);
  const state = {
    readOutcomes: { news: 'success', memos: 'success', activity_logs: 'success', profiles: 'success', ...options.readOutcomes },
    deleteOutcomes: { news: 'success', memos: 'success', subjects: 'success', sections: 'success', section_students: 'success', teacher_subjects: 'success', ...options.deleteOutcomes },
    writeOutcomes: { news: 'success', teacher_subjects: 'success', ...options.writeOutcomes },
    storageOutcomes: { upload: 'success', remove: 'success', ...options.storageOutcomes },
    news: [
      { id: 'news-1', title: 'Synthetic Notice One', content: 'Existing content', status: 'Draft', category: 'Academics', target_roles: 'all', featured_image_url: `${ADMIN_FINAL_SUPABASE_ORIGIN}/storage/v1/object/public/news-images/${ADMIN_ID}/existing.png`, created_at: '2026-10-10T00:00:00.000Z' },
      { id: 'news-2', title: 'Synthetic Notice Two', status: 'Draft', category: 'Events', target_roles: 'all', created_at: '2026-10-09T00:00:00.000Z' },
    ],
    memos: [
      { id: 'memo-1', subject: 'Synthetic Memo One', content: 'First synthetic memo.', recipient: 'All Faculty', created_at: '2026-10-10T00:00:00.000Z' },
      { id: 'memo-2', subject: 'Synthetic Memo Two', content: 'Second synthetic memo.', recipient: 'All Students', created_at: '2026-10-09T00:00:00.000Z' },
    ],
    teachingLoad: [],
    newsWrites: [], teachingWrites: [], storageUploads: [], storageRemovals: [],
    deleteRequests: [], activityWrites: [], missingMocks: [], blockedRequests: [], remoteRequests: [],
  };

  await page.addInitScript(({ session, theme }) => {
    sessionStorage.setItem('smartedu-auth-tab-id', 'admin-final-e2e-tab');
    sessionStorage.setItem('smartedu-auth-admin-final-e2e-tab', JSON.stringify(session));
    localStorage.setItem('smartedu-theme', theme);
  }, { session: sessionFor(profile), theme: options.theme || 'light' });

  await page.routeWebSocket('wss://admin-final-e2e.supabase.invalid/**', socket => socket.close());
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.origin === ADMIN_FINAL_BASE_URL) {
      if (/^\/(?:api|auth|rest|storage|functions)(?:\/|$)/.test(url.pathname)) {
        state.blockedRequests.push(`${method} ${url.pathname}`);
        return route.abort('blockedbyclient');
      }
      return route.continue();
    }
    if (url.origin === 'https://fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (url.origin !== ADMIN_FINAL_SUPABASE_ORIGIN) {
      state.blockedRequests.push(`${method} ${url.origin}${url.pathname}`);
      return route.abort('blockedbyclient');
    }

    state.remoteRequests.push(`${method} ${url.pathname}${url.search}`);
    const table = url.pathname.replace('/rest/v1/', '');
    if (url.pathname === '/auth/v1/logout' && method === 'POST') return route.fulfill({ status: 204, body: '' });
    if (url.pathname === '/rest/v1/profiles' && method === 'GET' && url.searchParams.has('id') && request.headers().accept?.includes('object')) return json(route, profile);
    if (url.pathname === '/rest/v1/school_settings' && method === 'GET') {
      if (url.searchParams.get('select') === 'session_timeout') return json(route, { session_timeout: '30 min' });
      return json(route, [{ id: 1, school_year: '2026-2027', current_semester: 1, session_timeout: '30 min' }]);
    }
    if (url.pathname === '/rest/v1/activity_logs' && method === 'POST') {
      state.activityWrites.push(request.postDataJSON());
      return json(route, null, 201);
    }
    if (url.pathname === '/rest/v1/teacher_subjects' && method === 'POST') {
      const rows = request.postDataJSON();
      state.teachingWrites.push(rows);
      if (state.writeOutcomes.teacher_subjects === 'error') return json(route, { message: 'synthetic teaching write rejection' }, 409);
      const written = (Array.isArray(rows) ? rows : [rows]).map((row, index) => ({
        ...row,
        id: `teaching-${state.teachingLoad.length + index + 1}`,
      }));
      state.teachingLoad.push(...written);
      return json(route, written, 201);
    }
    if (url.pathname === '/rest/v1/news' && ['POST', 'PATCH'].includes(method)) {
      const body = request.postDataJSON();
      state.newsWrites.push({ method, body, query: url.search });
      if (state.writeOutcomes.news === 'error') return json(route, { message: 'synthetic news persistence rejection' }, 409);
      if (method === 'POST') {
        const row = { ...(Array.isArray(body) ? body[0] : body), id: `news-${state.news.length + 1}`, created_at: new Date().toISOString() };
        state.news.unshift(row);
      } else {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '');
        state.news = state.news.map(row => row.id === id ? { ...row, ...body } : row);
      }
      return json(route, null, method === 'POST' ? 201 : 204);
    }
    if (url.pathname.startsWith('/rest/v1/') && method === 'DELETE') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      state.deleteRequests.push({ table, id });
      const outcome = state.deleteOutcomes[table] || 'error';
      if (outcome === 'error') return json(route, { message: 'synthetic private delete detail' }, 409);
      if (outcome === 'zero') return json(route, []);
      if (outcome === 'wrong') return json(route, [{ id: 'wrong-id' }]);
      if (table === 'news') state.news = state.news.filter(row => row.id !== id);
      if (table === 'memos') state.memos = state.memos.filter(row => row.id !== id);
      const rows = table === 'teacher_subjects'
        ? (url.searchParams.get('id')?.replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(value => ({ id: value })))
        : [{ id }];
      return json(route, rows);
    }
    if (url.pathname.startsWith('/rest/v1/') && ['GET', 'HEAD'].includes(method)) {
      const outcome = state.readOutcomes[table] || 'success';
      if (outcome === 'error') return json(route, { message: 'synthetic private read detail' }, 503);
      const data = table === 'news' ? state.news
        : table === 'memos' ? state.memos
        : table === 'activity_logs' ? []
        : table === 'profiles' && url.searchParams.get('select') === 'role' ? [{ role: 'main_admin' }, { role: 'teacher' }]
        : table === 'profiles' && url.searchParams.get('role') === 'eq.teacher' ? [{ id: TEACHER_ID, name: 'Synthetic Teacher', email: 'teacher@example.test', department: 'Mathematics', role: 'teacher', status: 'active' }]
        : table === 'subjects' ? [{ id: 'subject-1', code: 'MATH', name: 'Mathematics', is_active: true }]
        : table === 'sections' ? [{ id: 'section-1', name: '7-Rizal', grade_level: 'Grade 7', capacity: 40, school_year: '2026-2027' }]
        : table === 'teacher_subjects' ? state.teachingLoad
        : [];
      return json(route, method === 'HEAD' ? null : data, 200, { 'content-range': `0-${Math.max(0, data.length - 1)}/${data.length}` });
    }
    if (url.pathname.startsWith('/storage/v1/object/news-images/') && method === 'POST') {
      const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/news-images/'.length));
      state.storageUploads.push(path);
      if (state.storageOutcomes.upload === 'error') return json(route, { message: 'synthetic upload rejection' }, 409);
      return json(route, { Key: `news-images/${path}` }, 200);
    }
    if (url.pathname.startsWith('/storage/v1/object/public/news-images/') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('synthetic-image') });
    }
    if (url.pathname === '/storage/v1/object/news-images' && method === 'DELETE') {
      const paths = request.postDataJSON()?.prefixes || [];
      state.storageRemovals.push(...paths);
      if (state.storageOutcomes.remove === 'error') return json(route, { message: 'synthetic cleanup rejection' }, 409);
      return json(route, paths.map(name => ({ name })), 200);
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/profile-photos/') && method === 'POST') return json(route, { signedURL: '' });

    state.missingMocks.push(`${method} ${table || url.pathname}`);
    return json(route, { message: 'No isolated Admin-final mock registered' }, 503);
  });

  return {
    state,
    assertHealthy() {
      expect(state.missingMocks, 'every Admin-final operation must have an explicit isolated mock').toEqual([]);
      expect(state.remoteRequests.every(entry => !entry.includes('.supabase.co')), 'no request may reach real Supabase').toBe(true);
    },
  };
}

export async function openAdminPage(page, navigationName, heading) {
  await page.goto('/admin-dashboard');
  await expect(page.getByText('Admin Portal', { exact: true })).toBeVisible();
  const drawer = page.getByRole('button', { name: /Open navigation/ });
  if (await drawer.isVisible()) await drawer.click();
  if (navigationName !== 'Overview') await page.getByRole('button', { name: navigationName, exact: true }).click();
  await expect(page.locator('.page-title').filter({ hasText: heading })).toBeVisible();
}
