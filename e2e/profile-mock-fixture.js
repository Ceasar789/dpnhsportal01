import { expect } from '@playwright/test';

export const PROFILE_E2E_ORIGIN = 'https://profile-e2e.supabase.invalid';
export const PROFILE_E2E_BASE_URL = 'http://127.0.0.1:4174';

const SESSION_TAB_ID = 'profile-e2e-tab';
const SESSION_KEY = `smartedu-auth-${SESSION_TAB_ID}`;
const NOW_ISO = '2026-10-09T08:00:00.000Z';

const ROLE_PATHS = {
  main_admin: '/admin-dashboard',
  teacher: '/teacher-dashboard/profile',
  student: '/student-dashboard/profile',
  registrar: '/registrar-dashboard/profile',
  faculty: '/faculty-dashboard/profile',
};

const svgPhotoMarkup = `
  <svg xmlns="http://www.w3.org/2000/svg" width="112" height="112">
    <rect width="112" height="112" fill="#1908df"/>
    <circle cx="56" cy="43" r="22" fill="#ffffff"/>
    <path d="M20 106c3-25 19-37 36-37s33 12 36 37" fill="#ffffff"/>
  </svg>
`;

export const MOCK_SIGNED_PHOTO = `${PROFILE_E2E_ORIGIN}/storage/v1/object/sign/profile-photos/synthetic?token=profile-e2e`;

const encodeJwtPart = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const syntheticToken = (user) => [
  encodeJwtPart({ alg: 'none', typ: 'JWT' }),
  encodeJwtPart({
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    role: 'authenticated',
    sub: user.id,
    email: user.email,
  }),
  'profile-e2e-signature',
].join('.');

export const syntheticProfile = (role = 'teacher', overrides = {}) => {
  const slug = role.replace('_', '-');
  const id = `00000000-0000-4000-8000-${String(Object.keys(ROLE_PATHS).indexOf(role) + 1).padStart(12, '0')}`;
  return {
    id,
    role,
    name: `Synthetic ${role === 'main_admin' ? 'Administrator' : role[0].toUpperCase() + role.slice(1)}`,
    email: `${slug}.profile@example.test`,
    phone: '09170000000',
    date_of_birth: '1990-01-15',
    address: '123 Test Harness Street',
    bio: 'Synthetic Profile data used only by isolated browser tests.',
    photo_url: `${id}/1700000000000-profile.png`,
    photo_change_count: 1,
    photo_change_window_start: '2026-10-06T08:00:00.000Z',
    status: 'active',
    department: role === 'student' ? null : 'Test Department',
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    ...overrides,
  };
};

const syntheticSession = (profile) => {
  const user = {
    id: profile.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: profile.email,
    email_confirmed_at: NOW_ISO,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: profile.name },
    identities: [],
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
  };
  return {
    access_token: syntheticToken(user),
    refresh_token: 'synthetic-profile-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };
};

const json = (route, data, status = 200, headers = {}) => route.fulfill({
  status,
  contentType: 'application/json',
  headers,
  body: JSON.stringify(data),
});

const isObjectResponse = (request) => (
  request.headers().accept || ''
).includes('application/vnd.pgrst.object+json');

export const assertLocalProfileBaseURL = (value) => {
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:') {
    throw new Error(`Profile browser QA refuses non-local base URL: ${url.origin}`);
  }
  return true;
};

export async function installProfileMocks(page, options = {}) {
  assertLocalProfileBaseURL(PROFILE_E2E_BASE_URL);
  const profile = syntheticProfile(options.role || 'teacher', options.profile);
  const state = {
    profile,
    profileReads: 0,
    profileWrites: 0,
    storageSigns: 0,
    storageUploads: 0,
    storageDeletes: 0,
    authLogouts: 0,
    backendWrites: 0,
    blockedRequests: [],
    missingMocks: [],
    remoteRequests: [],
    websocketRequests: [],
    profileWriteMode: options.profileWriteMode || 'success',
    uploadMode: options.uploadMode || 'success',
    deleteMode: options.deleteMode || 'success',
    profileReadMode: options.profileReadMode || 'success',
    releaseProfileRead: null,
    releaseSlowWrite: null,
  };

  await page.addInitScript(({ tabId, key, session, theme }) => {
    sessionStorage.setItem('smartedu-auth-tab-id', tabId);
    sessionStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem('smartedu-theme', theme);
  }, {
    tabId: SESSION_TAB_ID,
    key: SESSION_KEY,
    session: syntheticSession(profile),
    theme: options.theme || 'light',
  });

  await page.routeWebSocket('wss://profile-e2e.supabase.invalid/**', (socket) => {
    state.websocketRequests.push(socket.url());
    socket.close();
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.origin === PROFILE_E2E_BASE_URL) {
      if (/^\/(?:api|auth|rest|storage|functions)(?:\/|$)/.test(url.pathname)) {
        if (method !== 'GET' && method !== 'HEAD') state.backendWrites += 1;
        state.blockedRequests.push(`${method} ${url.pathname}`);
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
      return;
    }

    if (url.origin === 'https://fonts.googleapis.com') {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return;
    }

    if (url.origin === PROFILE_E2E_ORIGIN) {
      state.remoteRequests.push(`${method} ${url.pathname}`);

      if (url.pathname.startsWith('/rest/v1/') && method === 'HEAD') {
        await route.fulfill({ status: 200, headers: { 'content-range': '*/0' }, body: '' });
        return;
      }

      if (url.pathname === '/rest/v1/profiles') {
        if (method === 'GET') {
          state.profileReads += 1;
          if (options.omitProfileMock) {
            state.missingMocks.push('profiles GET');
            await json(route, { message: 'Profile mock intentionally missing' }, 503);
            return;
          }
          if (state.profileReadMode === 'slow') {
            await new Promise((resolve) => { state.releaseProfileRead = resolve; });
          }
          if (state.profileReadMode === 'failure') {
            await json(route, { code: 'PROFILE_E2E_READ_FAILED', message: 'Synthetic Profile read failure' }, 503);
            return;
          }
          await json(route, isObjectResponse(request) ? state.profile : [state.profile], 200, { 'content-range': '0-0/1' });
          return;
        }
        if (method === 'PATCH') {
          state.profileWrites += 1;
          let updates = {};
          try { updates = request.postDataJSON(); } catch { /* malformed input is handled as an empty patch */ }
          if (state.profileWriteMode === 'slow') {
            await new Promise((resolve) => { state.releaseSlowWrite = resolve; });
          }
          if (state.profileWriteMode === 'failure') {
            await json(route, { message: 'Synthetic Profile update failure' }, 500);
            return;
          }
          if (state.profileWriteMode === 'expired') {
            await json(route, { message: 'JWT expired' }, 401);
            return;
          }
          if (state.profileWriteMode === 'photo-limit') {
            await json(route, { message: 'Photo change limit exceeded' }, 400);
            return;
          }
          state.profile = { ...state.profile, ...updates, updated_at: NOW_ISO };
          await json(route, state.profile);
          return;
        }
      }

      if (url.pathname === '/rest/v1/school_settings' && method === 'GET') {
        await json(route, { id: 1, session_timeout: '30 minutes' });
        return;
      }

      if (url.pathname.startsWith('/rest/v1/') && method === 'GET') {
        await json(route, isObjectResponse(request) ? {} : [], 200, { 'content-range': '*/0' });
        return;
      }

      if (url.pathname.startsWith('/storage/v1/object/sign/profile-photos/') && method === 'POST') {
        state.storageSigns += 1;
        if (options.omitStorageMock) {
          state.missingMocks.push('profile photo signed URL');
          await json(route, { message: 'Storage mock intentionally missing' }, 503);
          return;
        }
        await json(route, { signedURL: '/object/sign/profile-photos/synthetic?token=profile-e2e' });
        return;
      }

      if (url.pathname.startsWith('/storage/v1/object/sign/profile-photos/') && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svgPhotoMarkup });
        return;
      }

      if (url.pathname.startsWith('/storage/v1/object/profile-photos/') && method === 'POST') {
        state.storageUploads += 1;
        if (state.uploadMode === 'failure') {
          await json(route, { message: 'Synthetic upload failure' }, 500);
          return;
        }
        await json(route, { Key: url.pathname.replace('/storage/v1/object/', '') });
        return;
      }

      if (url.pathname === '/storage/v1/object/profile-photos' && method === 'DELETE') {
        state.storageDeletes += 1;
        if (state.deleteMode === 'failure') {
          await json(route, { message: 'Synthetic cleanup failure' }, 500);
          return;
        }
        await json(route, { message: 'Synthetic object deleted' });
        return;
      }

      if (url.pathname === '/auth/v1/logout' && method === 'POST') {
        state.authLogouts += 1;
        await route.fulfill({ status: 204, body: '' });
        return;
      }

      state.missingMocks.push(`${method} ${url.pathname}`);
      await json(route, { message: 'No isolated mock registered' }, 503);
      return;
    }

    state.blockedRequests.push(`${method} ${url.origin}${url.pathname}`);
    await route.abort('blockedbyclient');
  });

  const assertHealthy = () => {
    expect(state.missingMocks, 'every Supabase operation must have an explicit isolated mock').toEqual([]);
    expect(
      state.remoteRequests.every((entry) => !entry.includes('.supabase.co')),
      'no request may reach a real Supabase host',
    ).toBe(true);
  };

  return {
    profile,
    state,
    assertHealthy,
    releaseSlowWrite() {
      state.releaseSlowWrite?.();
      state.releaseSlowWrite = null;
    },
  };
}

export async function openSyntheticProfile(page, role = 'teacher') {
  const route = ROLE_PATHS[role];
  if (!route) throw new Error(`Unsupported synthetic Profile role: ${role}`);
  await page.goto(route);

  if (role === 'main_admin') {
    await page.getByRole('button', { name: 'Toggle profile menu' }).click();
    await page.getByRole('button', { name: 'Profile Settings' }).click();
  }

  await expect(page.getByText('Profile Settings', { exact: true })).toBeVisible();
  await expect(page.getByLabel('FULL NAME')).toBeVisible();
}

export async function openDashboardNavigation(page, role = 'teacher') {
  const opener = page.getByRole('button', { name: /Open navigation/ });
  if (await opener.isVisible()) await opener.click();
  if (role === 'main_admin') return page.locator('.sidebar-item', { hasText: 'Overview' }).first();
  return page.getByRole('link', { name: 'Overview', exact: true });
}
