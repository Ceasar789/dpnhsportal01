import { expect } from '@playwright/test';

export const SETTINGS_BASE_URL = 'http://127.0.0.1:4177';
export const SETTINGS_SUPABASE_ORIGIN = 'https://settings-e2e.supabase.invalid';
const ADMIN_ID = '51000000-0000-4000-8000-000000000001';

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = [encode({ alg: 'none', typ: 'JWT' }), encode({ aud: 'authenticated', role: 'authenticated', sub: ADMIN_ID, exp: Math.floor(Date.now() / 1000) + 3600 }), 'settings-e2e'].join('.');

const profileFor = (options = {}) => ({
  id: ADMIN_ID,
  email: 'admin.settings@example.test',
  name: 'Synthetic Settings Administrator',
  role: options.role || 'main_admin',
  status: options.status || 'active',
  photo_url: null,
  department: 'Synthetic',
  created_at: '2026-10-10T00:00:00.000Z',
});

const sessionFor = profile => ({
  access_token: token,
  refresh_token: 'synthetic-settings-refresh',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: { id: ADMIN_ID, aud: 'authenticated', role: 'authenticated', email: profile.email, app_metadata: {}, user_metadata: {}, identities: [] },
});

export const syntheticSettings = (overrides = {}) => ({
  id: 1,
  school_year: '2026-2027',
  current_semester: 2,
  session_timeout: '30 min',
  ...overrides,
});

const syntheticBackups = [
  { id: 'backup-one', status: 'completed', started_at: '2026-10-09T16:30:00.000Z' },
  { id: 'backup-two', status: 'failed', started_at: '2026-10-08T16:30:00.000Z' },
];

const syntheticActivity = [{
  id: 'activity-one', action: 'Updated settings', description: 'Synthetic activity',
  created_at: '2026-10-10T00:00:00.000Z', user_id: ADMIN_ID,
  profiles: { name: 'Synthetic Settings Administrator', status: 'active' },
}];

const json = (route, data, status = 200, headers = {}) => route.fulfill({
  status,
  contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...headers },
  body: JSON.stringify(data),
});

const delay = ms => ms ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
const nextOutcome = outcomes => outcomes.length > 1 ? outcomes.shift() : outcomes[0];

export const assertLocalSettingsBaseURL = value => {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`Settings browser QA refuses non-local base URL: ${url.origin}`);
  }
  return true;
};

export async function installSettingsMocks(page, options = {}) {
  assertLocalSettingsBaseURL(SETTINGS_BASE_URL);
  const profile = profileFor(options);
  const state = {
    settings: syntheticSettings(options.settings),
    settingsReadOutcomes: [...(options.settingsReadOutcomes || ['success'])],
    backupReadOutcomes: [...(options.backupReadOutcomes || ['success'])],
    updateOutcomes: [...(options.updateOutcomes || ['success'])],
    settingsReadDelay: options.settingsReadDelay || 0,
    updateDelay: options.updateDelay || 0,
    backupHistory: options.backupHistory ?? syntheticBackups,
    settingsReads: 0,
    backupReads: 0,
    updateRequests: [],
    activityWrites: [],
    missingMocks: [],
    blockedRequests: [],
    remoteRequests: [],
  };

  await page.addInitScript(({ key, value, theme }) => {
    sessionStorage.setItem('smartedu-auth-tab-id', 'settings-e2e-tab');
    sessionStorage.setItem(key, JSON.stringify(value));
    if (!localStorage.getItem('smartedu-theme')) localStorage.setItem('smartedu-theme', theme);
  }, { key: 'smartedu-auth-settings-e2e-tab', value: sessionFor(profile), theme: options.theme || 'light' });

  await page.routeWebSocket('wss://settings-e2e.supabase.invalid/**', socket => socket.close());
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.origin === SETTINGS_BASE_URL) {
      if (/^\/(?:api|auth|rest|storage|functions)(?:\/|$)/.test(url.pathname)) {
        state.blockedRequests.push(`${method} ${url.pathname}`);
        await route.abort('blockedbyclient');
      } else await route.continue();
      return;
    }
    if (url.origin === 'https://fonts.googleapis.com') {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return;
    }
    if (url.origin !== SETTINGS_SUPABASE_ORIGIN) {
      state.blockedRequests.push(`${method} ${url.origin}${url.pathname}`);
      await route.abort('blockedbyclient');
      return;
    }

    state.remoteRequests.push(`${method} ${url.pathname}${url.search}`);
    const table = url.pathname.replace('/rest/v1/', '');

    if (url.pathname === '/rest/v1/profiles' && method === 'GET') {
      if (url.searchParams.has('id') && request.headers().accept?.includes('object')) return json(route, profile);
      return json(route, []);
    }

    if (url.pathname === '/rest/v1/school_settings' && method === 'GET') {
      if (url.searchParams.get('select') === 'session_timeout') return json(route, { session_timeout: state.settings.session_timeout });
      state.settingsReads += 1;
      if (options.omitSettingsReadMock) {
        state.missingMocks.push('GET school_settings');
        return json(route, { message: 'No isolated Settings read mock registered' }, 503);
      }
      await delay(state.settingsReadDelay);
      const outcome = nextOutcome(state.settingsReadOutcomes) || 'success';
      if (outcome === 'missing') return json(route, []);
      if (outcome === 'authorization') return json(route, { code: '42501', message: 'synthetic private authorization detail' }, 403);
      if (outcome === 'authentication') return json(route, { code: 'PGRST301', message: 'synthetic private authentication detail' }, 401);
      if (outcome === 'schema') return json(route, { code: 'PGRST204', message: 'synthetic private schema detail' }, 400);
      if (outcome === 'server') return json(route, {
        code: 'XX000', details: null, hint: null, message: 'synthetic private server detail',
      }, 400);
      if (outcome === 'malformed') return json(route, { unexpected: true });
      return json(route, [state.settings]);
    }

    if (url.pathname === '/rest/v1/school_settings' && method === 'PATCH') {
      const payload = request.postDataJSON();
      state.updateRequests.push(payload);
      if (options.omitSettingsWriteMock) {
        state.missingMocks.push('PATCH school_settings');
        return json(route, { message: 'No isolated Settings write mock registered' }, 503);
      }
      await delay(state.updateDelay);
      const outcome = state.updateOutcomes.shift() || 'success';
      if (outcome === 'error') return json(route, { message: 'synthetic private update detail' }, 409);
      if (outcome === 'zero') return json(route, []);
      const updated = { ...state.settings, ...payload };
      if (outcome === 'wrong') return json(route, [{ ...updated, id: 2 }]);
      if (outcome === 'multiple') return json(route, [updated, { ...updated, id: 2 }]);
      state.settings = updated;
      return json(route, [updated]);
    }

    if (url.pathname === '/rest/v1/backup_history' && method === 'GET') {
      state.backupReads += 1;
      if (options.omitBackupReadMock) {
        state.missingMocks.push('GET backup_history');
        return json(route, { message: 'No isolated backup read mock registered' }, 503);
      }
      const outcome = nextOutcome(state.backupReadOutcomes) || 'success';
      if (outcome === 'error') return json(route, {
        code: 'XX000', details: null, hint: null, message: 'synthetic private backup detail',
      }, 400);
      return json(route, state.backupHistory);
    }

    if (url.pathname === '/rest/v1/activity_logs' && method === 'GET') return json(route, syntheticActivity);
    if (url.pathname === '/rest/v1/activity_logs' && method === 'POST') {
      state.activityWrites.push(request.postDataJSON());
      return json(route, null, 201);
    }
    if (url.pathname.startsWith('/rest/v1/') && ['GET', 'HEAD'].includes(method)) {
      return json(route, method === 'HEAD' ? null : [], 200, { 'content-range': '*/0' });
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/profile-photos/') && method === 'POST') return json(route, { signedURL: '' });

    state.missingMocks.push(`${method} ${table || url.pathname}`);
    return json(route, { message: 'No isolated Settings mock registered' }, 503);
  });

  return {
    state,
    assertHealthy() {
      expect(state.missingMocks, 'every Settings operation must have an explicit isolated mock').toEqual([]);
      expect(state.remoteRequests.every(entry => !entry.includes('.supabase.co')), 'no request may reach a real Supabase host').toBe(true);
    },
  };
}

export async function openSettings(page) {
  await page.goto('/admin-dashboard');
  await expect(page.getByText('Admin Portal', { exact: true })).toBeVisible();
  const drawer = page.getByRole('button', { name: /Open navigation/ });
  if (await drawer.isVisible()) await drawer.click();
  await page.getByRole('button', { name: 'System Settings', exact: true }).click();
  await expect(page.getByText('System Settings', { exact: true }).first()).toBeVisible();
}
