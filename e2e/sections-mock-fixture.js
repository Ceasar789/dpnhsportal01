import { expect } from '@playwright/test';

export const SECTIONS_BASE_URL = 'http://127.0.0.1:4175';
export const SECTIONS_SUPABASE_ORIGIN = 'https://sections-e2e.supabase.invalid';
const ADMIN_ID = '20000000-0000-4000-8000-000000000001';
const ACTIVE_ID = '20000000-0000-4000-8000-000000000002';
const INACTIVE_ID = '20000000-0000-4000-8000-000000000003';
const STUDENT_ID = '20000000-0000-4000-8000-000000000004';
const SECOND_STUDENT_ID = '20000000-0000-4000-8000-000000000005';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = [encode({ alg: 'none', typ: 'JWT' }), encode({ aud: 'authenticated', role: 'authenticated', sub: ADMIN_ID, exp: Math.floor(Date.now() / 1000) + 3600 }), 'sections-e2e'].join('.');

export const syntheticTeachers = [
  { id: ACTIVE_ID, name: 'Synthetic Active Teacher', email: 'active.teacher@example.test', department: 'Synthetic', role: 'teacher', status: 'active' },
  { id: INACTIVE_ID, name: 'Synthetic Inactive Teacher', email: 'inactive.teacher@example.test', department: 'Synthetic', role: 'teacher', status: 'inactive' },
];

export const syntheticSection = (overrides = {}) => ({
  id: '30000000-0000-4000-8000-000000000001', name: '7-Synthetic', grade_level: 'Grade 7',
  adviser_id: INACTIVE_ID, school_year: '2026-2027', capacity: 40, ...overrides,
});

const admin = {
  id: ADMIN_ID, email: 'admin.sections@example.test', name: 'Synthetic Administrator', role: 'main_admin',
  status: 'active', photo_url: null, department: 'Synthetic', created_at: '2026-10-10T00:00:00.000Z',
};
const student = { id: STUDENT_ID, email: 'student.sections@example.test', name: 'Synthetic Student', role: 'student', status: 'active' };
const secondStudent = { id: SECOND_STUDENT_ID, email: 'student-two.sections@example.test', name: 'Synthetic Student Two', role: 'student', status: 'active' };

const session = {
  access_token: token, refresh_token: 'synthetic-sections-refresh', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer',
  user: { id: ADMIN_ID, aud: 'authenticated', role: 'authenticated', email: admin.email, app_metadata: {}, user_metadata: {}, identities: [] },
};

const json = (route, data, status = 200, headers = {}) => route.fulfill({
  status,
  contentType: 'application/json',
  headers: {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'content-range',
    ...headers,
  },
  body: JSON.stringify(data),
});

export const assertLocalSectionsBaseURL = (value) => {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`Sections browser QA refuses non-local base URL: ${url.origin}`);
  }
  return true;
};

export async function installSectionsMocks(page, options = {}) {
  assertLocalSectionsBaseURL(SECTIONS_BASE_URL);
  const state = {
    sections: options.sections || [syntheticSection()],
    teachers: options.teachers || syntheticTeachers,
    memberships: options.memberships || [],
    enrollmentCount: options.enrollmentCount ?? (options.memberships?.length || 0),
    countFailure: Boolean(options.countFailure),
    sectionWriteError: options.sectionWriteError || null,
    sectionWrites: [], studentUpserts: [], membershipWrites: [], membershipDeletes: [],
    missingMocks: [], blockedRequests: [], remoteRequests: [],
  };

  await page.addInitScript(({ key, value }) => {
    sessionStorage.setItem('smartedu-auth-tab-id', 'sections-e2e-tab');
    sessionStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('smartedu-theme', 'light');
  }, { key: 'smartedu-auth-sections-e2e-tab', value: session });

  await page.routeWebSocket('wss://sections-e2e.supabase.invalid/**', (socket) => socket.close());
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.origin === SECTIONS_BASE_URL) {
      if (/^\/(?:api|auth|rest|storage|functions)(?:\/|$)/.test(url.pathname)) {
        state.blockedRequests.push(`${method} ${url.pathname}`);
        await route.abort('blockedbyclient');
      } else await route.continue();
      return;
    }
    if (url.origin === 'https://fonts.googleapis.com') {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' }); return;
    }
    if (url.origin !== SECTIONS_SUPABASE_ORIGIN) {
      state.blockedRequests.push(`${method} ${url.origin}${url.pathname}`);
      await route.abort('blockedbyclient'); return;
    }

    state.remoteRequests.push(`${method} ${url.pathname}${url.search}`);
    const table = url.pathname.replace('/rest/v1/', '');
    if (url.pathname === '/rest/v1/profiles' && method === 'GET') {
      const role = url.searchParams.get('role');
      if (role === 'eq.teacher') return json(route, state.teachers);
      if (role === 'eq.student') return json(route, [student, secondStudent]);
      if (url.searchParams.has('id') && request.headers().accept?.includes('object')) return json(route, admin);
      return json(route, [student, secondStudent]);
    }
    if (url.pathname === '/rest/v1/sections' && method === 'GET') return json(route, state.sections);
    if (url.pathname === '/rest/v1/section_students' && request.headers().prefer?.includes('count=exact')) {
      if (state.countFailure) return json(route, { message: 'Synthetic count failure' }, 503);
      const range = state.enrollmentCount === 0 ? '*/0' : `0-${Math.max(0, state.memberships.length - 1)}/${state.enrollmentCount}`;
      return json(route, state.memberships, 200, { 'content-range': range });
    }
    if (url.pathname === '/rest/v1/section_students' && method === 'GET') return json(route, state.memberships);
    if (url.pathname === '/rest/v1/sections' && ['POST', 'PATCH'].includes(method)) {
      const payload = request.postDataJSON(); state.sectionWrites.push({ method, payload });
      if (state.sectionWriteError) return json(route, state.sectionWriteError, 409);
      return json(route, method === 'POST' ? [payload] : payload);
    }
    if (url.pathname === '/rest/v1/students' && method === 'POST') {
      state.studentUpserts.push(request.postDataJSON()); return json(route, []);
    }
    if (url.pathname === '/rest/v1/section_students' && method === 'POST') {
      state.membershipWrites.push(request.postDataJSON()); return json(route, []);
    }
    if (url.pathname === '/rest/v1/section_students' && method === 'DELETE') {
      state.membershipDeletes.push(url.search); return json(route, []);
    }
    if (url.pathname === '/rest/v1/sections' && method === 'DELETE') return json(route, []);
    if (url.pathname === '/rest/v1/school_settings' && method === 'GET') return json(route, { id: 1, session_timeout: '30 minutes' });
    if (url.pathname.startsWith('/rest/v1/') && ['GET', 'HEAD'].includes(method)) {
      return json(route, method === 'HEAD' ? null : [], 200, { 'content-range': '*/0' });
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/profile-photos/') && method === 'POST') return json(route, { signedURL: '' });
    state.missingMocks.push(`${method} ${table || url.pathname}`);
    return json(route, { message: 'No isolated Sections mock registered' }, 503);
  });

  return {
    state,
    assertHealthy() {
      expect(state.missingMocks, 'every write and auth operation must have an explicit mock').toEqual([]);
      expect(state.remoteRequests.every((entry) => !entry.includes('.supabase.co'))).toBe(true);
    },
  };
}

export async function openSections(page) {
  await page.goto('/admin-dashboard');
  await expect(page.getByText('Admin Portal', { exact: true })).toBeVisible();
  const drawer = page.getByRole('button', { name: /Open navigation/ });
  if (await drawer.isVisible()) await drawer.click();
  await page.getByRole('button', { name: 'Sections', exact: true }).click();
  await expect(page.getByText('Sections', { exact: true }).first()).toBeVisible();
}
