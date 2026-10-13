import { expect } from '@playwright/test';

export const SCHEDULES_BASE_URL = 'http://127.0.0.1:4176';
export const SCHEDULES_SUPABASE_ORIGIN = 'https://schedules-e2e.supabase.invalid';
const ADMIN_ID = '41000000-0000-4000-8000-000000000001';
const TEACHER_ID = '41000000-0000-4000-8000-000000000002';
const SECOND_TEACHER_ID = '41000000-0000-4000-8000-000000000003';
export const SECTION_ID = '42000000-0000-4000-8000-000000000001';
export const ACTIVE_SUBJECT_ID = '43000000-0000-4000-8000-000000000001';
export const INACTIVE_SUBJECT_ID = '43000000-0000-4000-8000-000000000002';
export const ACTIVE_SCHEDULE_ID = '44000000-0000-4000-8000-000000000001';
export const INACTIVE_SCHEDULE_ID = '44000000-0000-4000-8000-000000000002';

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = [encode({ alg: 'none', typ: 'JWT' }), encode({ aud: 'authenticated', role: 'authenticated', sub: ADMIN_ID, exp: Math.floor(Date.now() / 1000) + 3600 }), 'schedules-e2e'].join('.');

const admin = {
  id: ADMIN_ID, email: 'admin.schedules@example.test', name: 'Synthetic Administrator',
  role: 'main_admin', status: 'active', photo_url: null, department: 'Synthetic',
  created_at: '2026-10-10T00:00:00.000Z',
};

const session = {
  access_token: token, refresh_token: 'synthetic-schedules-refresh', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer',
  user: { id: ADMIN_ID, aud: 'authenticated', role: 'authenticated', email: admin.email, app_metadata: {}, user_metadata: {}, identities: [] },
};

export const scheduleFixtures = {
  teachers: [
    { id: TEACHER_ID, name: 'Synthetic Math Teacher', email: 'math.teacher@example.test', department: 'Mathematics', role: 'teacher', status: 'active' },
    { id: SECOND_TEACHER_ID, name: 'Synthetic Other Teacher', email: 'other.teacher@example.test', department: 'English', role: 'teacher', status: 'active' },
  ],
  subjects: [
    { id: ACTIVE_SUBJECT_ID, name: 'Mathematics', code: 'MATH', is_active: true },
    { id: INACTIVE_SUBJECT_ID, name: 'Legacy Arts', code: 'ARTS', is_active: false },
  ],
  sections: [{ id: SECTION_ID, name: '7-Synthetic', grade_level: 'Grade 7', school_year: '2026-2027', capacity: 40 }],
  teachingLoad: [{ id: 'load-one', teacher_id: TEACHER_ID, subject_id: ACTIVE_SUBJECT_ID, grade_level: 'Grade 7', school_year: '2026-2027' }],
  schedules: [
    { id: ACTIVE_SCHEDULE_ID, section_id: SECTION_ID, teacher_id: TEACHER_ID, subject_id: ACTIVE_SUBJECT_ID, day_of_week: 'Monday', start_time: '08:00:00', end_time: '09:00:00', room_number: 'Room 201', school_year: '2026-2027' },
    { id: INACTIVE_SCHEDULE_ID, section_id: SECTION_ID, teacher_id: TEACHER_ID, subject_id: INACTIVE_SUBJECT_ID, day_of_week: 'Tuesday', start_time: '10:00:00', end_time: '11:00:00', room_number: 'Legacy Room', school_year: '2026-2027' },
  ],
};

const json = (route, data, status = 200, headers = {}) => route.fulfill({
  status, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...headers },
  body: JSON.stringify(data),
});

export const assertLocalSchedulesBaseURL = (value) => {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error(`Schedules browser QA refuses non-local base URL: ${url.origin}`);
  }
  return true;
};

export async function installSchedulesMocks(page, options = {}) {
  assertLocalSchedulesBaseURL(SCHEDULES_BASE_URL);
  const state = {
    teachers: options.teachers ?? scheduleFixtures.teachers,
    subjects: options.subjects ?? scheduleFixtures.subjects,
    sections: options.sections ?? scheduleFixtures.sections,
    teachingLoad: options.teachingLoad ?? scheduleFixtures.teachingLoad,
    schedules: structuredClone(options.schedules ?? scheduleFixtures.schedules),
    subjectsFailure: Boolean(options.subjectsFailure),
    teachersFailure: Boolean(options.teachersFailure),
    teachingLoadFailure: Boolean(options.teachingLoadFailure),
    createFailure: Boolean(options.createFailure),
    createDelay: options.createDelay || 0,
    deleteDelay: options.deleteDelay || 0,
    deleteOutcomes: [...(options.deleteOutcomes || ['success'])],
    scheduleWrites: [], deleteRequests: [], missingMocks: [], blockedRequests: [], remoteRequests: [],
  };

  await page.addInitScript(({ key, value, theme }) => {
    sessionStorage.setItem('smartedu-auth-tab-id', 'schedules-e2e-tab');
    sessionStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('smartedu-theme', theme);
  }, { key: 'smartedu-auth-schedules-e2e-tab', value: session, theme: options.theme || 'light' });

  await page.routeWebSocket('wss://schedules-e2e.supabase.invalid/**', socket => socket.close());
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.origin === SCHEDULES_BASE_URL) {
      if (/^\/(?:api|auth|rest|storage|functions)(?:\/|$)/.test(url.pathname)) {
        state.blockedRequests.push(`${method} ${url.pathname}`);
        await route.abort('blockedbyclient');
      } else await route.continue();
      return;
    }
    if (url.origin === 'https://fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (url.origin !== SCHEDULES_SUPABASE_ORIGIN) {
      state.blockedRequests.push(`${method} ${url.origin}${url.pathname}`);
      await route.abort('blockedbyclient'); return;
    }

    state.remoteRequests.push(`${method} ${url.pathname}${url.search}`);
    const table = url.pathname.replace('/rest/v1/', '');
    if (url.pathname === '/rest/v1/profiles' && method === 'GET') {
      if (url.searchParams.get('role') === 'eq.teacher') {
        if (state.teachersFailure) return json(route, { message: 'synthetic private teacher failure' }, 400);
        return json(route, state.teachers);
      }
      if (url.searchParams.has('id') && request.headers().accept?.includes('object')) return json(route, admin);
      return json(route, []);
    }
    if (url.pathname === '/rest/v1/subjects' && method === 'GET') {
      if (state.subjectsFailure) return json(route, { message: 'synthetic private subject failure' }, 400);
      return json(route, state.subjects);
    }
    if (url.pathname === '/rest/v1/teacher_subjects' && method === 'GET') {
      if (state.teachingLoadFailure) return json(route, { message: 'synthetic private load failure' }, 400);
      return json(route, state.teachingLoad);
    }
    if (url.pathname === '/rest/v1/sections' && method === 'GET') return json(route, state.sections);
    if (url.pathname === '/rest/v1/schedules' && method === 'GET') return json(route, state.schedules);
    if (url.pathname === '/rest/v1/schedules' && method === 'POST') {
      const payload = request.postDataJSON(); state.scheduleWrites.push(payload);
      if (state.createDelay) await new Promise(resolve => setTimeout(resolve, state.createDelay));
      if (state.createFailure) return json(route, { message: 'synthetic private create failure' }, 409);
      const created = { id: `created-${state.scheduleWrites.length}`, ...payload[0] };
      state.schedules.push(created);
      return json(route, [created], 201);
    }
    if (url.pathname === '/rest/v1/schedules' && method === 'DELETE') {
      state.deleteRequests.push(url.search);
      if (state.deleteDelay) await new Promise(resolve => setTimeout(resolve, state.deleteDelay));
      const target = url.searchParams.get('id')?.replace('eq.', '');
      const outcome = state.deleteOutcomes.shift() || 'success';
      if (outcome === 'error') return json(route, { message: 'synthetic private delete failure' }, 409);
      if (outcome === 'zero') return json(route, []);
      const deleted = state.schedules.find(item => item.id === target);
      state.schedules = state.schedules.filter(item => item.id !== target);
      return json(route, deleted ? [{ id: deleted.id }] : []);
    }
    if (url.pathname === '/rest/v1/school_settings' && method === 'GET') return json(route, { id: 1, session_timeout: '30 minutes' });
    if (url.pathname.startsWith('/rest/v1/') && ['GET', 'HEAD'].includes(method)) {
      return json(route, method === 'HEAD' ? null : [], 200, { 'content-range': '*/0' });
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/profile-photos/') && method === 'POST') return json(route, { signedURL: '' });
    state.missingMocks.push(`${method} ${table || url.pathname}`);
    return json(route, { message: 'No isolated Schedules mock registered' }, 503);
  });

  return {
    state,
    assertHealthy() {
      expect(state.missingMocks, 'every write and auth operation must have an explicit mock').toEqual([]);
      expect(state.remoteRequests.every(entry => !entry.includes('.supabase.co'))).toBe(true);
    },
  };
}

export async function openSchedules(page) {
  await page.goto('/admin-dashboard');
  await expect(page.getByText('Admin Portal', { exact: true })).toBeVisible();
  const drawer = page.getByRole('button', { name: /Open navigation/ });
  if (await drawer.isVisible()) await drawer.click();
  await page.getByRole('button', { name: 'Schedules', exact: true }).click();
  await expect(page.getByText('Schedules', { exact: true }).first()).toBeVisible();
}
