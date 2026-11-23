// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createManualLessonPlanInvoke, createManualLessonPlanPersistence, manualLessonPlanSaveFlagEnabled } from './manualLessonPlanSaveClient';
import { createBlankIlawDocument } from '../ilaw/ilawTemplateModel';

vi.mock('../../../../config/supabase', () => ({ supabase: { auth: {
  getSession: async () => ({ data: { session: globalThis.__session === undefined ? { access_token: 'jwt' } : globalThis.__session } }),
} } }));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); delete globalThis.__session; });

it('is off unless the exact flag for the build is set', () => {
  expect(manualLessonPlanSaveFlagEnabled()).toBe(false);
  vi.stubEnv('VITE_MANUAL_LESSON_PLAN_SAVE_ENABLED', 'true');
  expect(manualLessonPlanSaveFlagEnabled()).toBe(false);
  vi.stubEnv('VITE_MANUAL_LESSON_PLAN_SAVE_ENABLED', '1');
  expect(manualLessonPlanSaveFlagEnabled()).toBe(true);
  vi.stubEnv('VITE_MANUAL_LESSON_PLAN_SAVE_PRODUCTION_ENABLED', '1');
  vi.stubEnv('DEV', false); vi.stubEnv('PROD', true);
  expect(manualLessonPlanSaveFlagEnabled()).toBe(true);
  vi.stubEnv('VITE_MANUAL_LESSON_PLAN_SAVE_PRODUCTION_ENABLED', '');
  expect(manualLessonPlanSaveFlagEnabled()).toBe(false);
});

it('posts to the operation path with the bearer token; 404 means the route is switched off', async () => {
  const fetchMock = vi.fn(async () => ({ status: 404, json: async () => { throw new Error('html'); } }));
  vi.stubGlobal('fetch', fetchMock);
  const result = await createManualLessonPlanInvoke('https://api.invalid')('CreateIncompleteDraft', { requestId: 'r' });
  expect(result).toEqual({ ok: false, code: 'integration_blocked', durable: false });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://api.invalid/api/lesson-plans/manual/CreateIncompleteDraft');
  expect(init.headers.Authorization).toBe('Bearer jwt');
  globalThis.__session = null;
  expect((await createManualLessonPlanInvoke('')('CreateIncompleteDraft', {})).code).toBe('not_authenticated');
});

it('a network failure or unreadable reply becomes outcome_unknown, never a success', async () => {
  const draft = { document: createBlankIlawDocument(), sourceDetails: { classDuration: '', teachingStrategy: '', learningObjectives: '' } };
  const selection = { subjectId: 's', gradeLevel: 'Grade 7', schoolYear: '2026-2027' };
  for (const reply of [() => { throw new TypeError('Failed to fetch'); }, async () => ({ status: 200, json: async () => ({}) })]) {
    vi.stubGlobal('fetch', vi.fn(reply));
    const result = await createManualLessonPlanPersistence('').saveManual({ draft, selection, requestId: 'r1' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('outcome_unknown');
  }
  vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, json: async () => ({ ok: true, durable: false, record: {} }) })));
  expect((await createManualLessonPlanPersistence('').saveManual({ draft, selection, requestId: 'r2' })).durable).toBe(false);
});
