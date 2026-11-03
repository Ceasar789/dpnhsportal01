import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { adminClient, requireAuth } from '../middleware/requireAuth.js';
import { resolveWeeklyDraftSourceDays } from '../lib/weeklyDraftSourceResolver.js';
import { createWeeklyDraftJobRpcAdapter } from '../persistence/weeklyDraftJobRpcAdapter.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_COLUMNS = 'id,teacher_id,status,title,objectives,subject,grade_level,subject_id,academic_year,ai_generated';
const SNAPSHOT_FIELDS = ['title', 'objectives', 'subject', 'grade_level',
  'subject_id', 'academic_year', 'ai_generated'];
const SAFE_ERRORS = Object.freeze({
  invalid_request: [400, 'Check the selected lesson plan and request.'],
  invalid_weekly_source: [422, 'The saved lesson plan has no complete weekly source.'],
  not_authenticated: [401, 'Sign in again before generating worksheets.'],
  inactive_teacher: [403, 'This account cannot generate worksheets.'],
  source_denied: [404, 'This saved lesson plan is unavailable.'],
  not_found: [404, 'This weekly job is unavailable.'],
  source_changed: [409, 'The saved lesson plan changed. Reopen it before generating worksheets.'],
  idempotency_conflict: [409, 'This request ID was already used for different worksheet inputs.'],
  not_ready: [409, 'The weekly draft is not ready yet.'],
  invalid_state: [409, 'This weekly job cannot be changed now.'],
});

const validId = value => typeof value === 'string' && UUID.test(value);
const bearer = req => {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};
const safeFailure = (res, code) => {
  const known = typeof code === 'string' && Object.hasOwn(SAFE_ERRORS, code);
  const [status, error] = known ? SAFE_ERRORS[code]
    : [503, 'Weekly generation is unavailable. Try again later.'];
  return res.status(status).json({ code: known ? code : 'job_unavailable', error });
};
const defaultLoadPlan = async (id, teacherId) => {
  const { data, error } = await adminClient().from('lesson_plans').select(SOURCE_COLUMNS)
    .eq('id', id).eq('teacher_id', teacherId).maybeSingle();
  if (error) throw error;
  return data;
};
const defaultAdapter = () => createWeeklyDraftJobRpcAdapter({
  serviceRoleClient: adminClient(),
  teacherClientForJwt: credential => createClient(process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY, { accessToken: async () => credential,
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }),
});

// This module is intentionally unmounted. A later composition patch must
// explicitly wire it after the draft-job migration and worker are ready.
export function createWeeklyDraftJobsRouter({ auth = requireAuth(['teacher']),
  loadPlan = defaultLoadPlan, jobAdapter } = {}) {
  const router = Router();
  const adapter = () => { jobAdapter ??= defaultAdapter(); return jobAdapter; };
  router.use(auth);
  router.use((req, res, next) => {
    if (req.user?.role !== 'teacher') return safeFailure(res, 'inactive_teacher');
    if (!validId(req.user.id) || !bearer(req)) return safeFailure(res, 'not_authenticated');
    return next();
  });
  const action = (fn, successStatus = 200) => async (req, res) => {
    try { return res.status(successStatus).json(await fn(req)); }
    catch (error) { return safeFailure(res, error?.code); }
  };

  router.post('/', action(async req => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).sort().join('|') !== 'lessonPlanId|questionCount|requestId'
      || !validId(body.lessonPlanId) || ![20, 30, 40].includes(body.questionCount)
      || typeof body.requestId !== 'string' || !body.requestId.trim()
      || body.requestId.length > 128) {
      throw Object.assign(new Error(), { code: 'invalid_request' });
    }
    const plan = await loadPlan(body.lessonPlanId, req.user.id);
    if (!plan || plan.id !== body.lessonPlanId || plan.teacher_id !== req.user.id
      || !['draft', 'published'].includes(plan.status)) {
      throw Object.assign(new Error(), { code: 'source_denied' });
    }
    const sourceDays = resolveWeeklyDraftSourceDays(plan);
    const expectedSource = Object.fromEntries(SNAPSHOT_FIELDS.map(field => [field, plan[field]]));
    return adapter().submit({ teacherId: req.user.id, requestId: body.requestId,
      sourceLessonPlanId: plan.id, questionCount: body.questionCount,
      sourceDays, expectedSource });
  }, 202));

  const jobId = req => {
    if (!validId(req.params.jobId)) throw Object.assign(new Error(), { code: 'invalid_request' });
    return req.params.jobId;
  };
  router.get('/:jobId', action(req => {
    const id = jobId(req);
    return adapter().status(bearer(req), id);
  }));
  router.post('/:jobId/cancel', action(req => {
    const id = jobId(req);
    return adapter().cancel(bearer(req), id);
  }));
  router.get('/:jobId/result', action(async req => {
    const id = jobId(req);
    const draft = await adapter().result(bearer(req), id);
    if (Buffer.byteLength(JSON.stringify(draft), 'utf8') > 5242880) {
      throw Object.assign(new Error(), { code: 'malformed_receipt' });
    }
    return draft;
  }));
  return router;
}
