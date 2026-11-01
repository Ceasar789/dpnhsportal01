import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createUserScopedRpcTransport } from '../persistence/postgresAdapter.js';
import { createAiLessonPlanSave } from '../persistence/aiLessonPlanSave.js';

const PRODUCTION_REF = 'jllstakxiamxiycnwrbd';
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function aiSaveLocallyEnabled(req, env = process.env) {
  if (env.NODE_ENV !== 'development' || env.VERCEL || env.VERCEL_ENV ||
      env.AI_LESSON_PLAN_SAVE_ENABLED !== '1' || !loopback.has(req.socket?.remoteAddress)) return false;
  const url = env.SUPABASE_URL;
  if (url === 'http://127.0.0.1:54321') return true;
  const ref = env.AI_SAVE_DEV_PROJECT_REF;
  return typeof ref === 'string' && /^[a-z0-9]{20}$/.test(ref) &&
    (ref !== PRODUCTION_REF || env.AI_SAVE_ALLOW_TEST_DATA_PROJECT === '1') &&
    url === `https://${ref}.supabase.co`;
}

export function aiSaveProductionEnabled(env = process.env) {
  return env.NODE_ENV === 'production' && env.VERCEL === '1' && env.VERCEL_ENV === 'production'
    && env.AI_LESSON_PLAN_SAVE_PRODUCTION_ENABLED === '1'
    && env.AI_LESSON_PLAN_SAVE_PRODUCTION_PROJECT_REF === PRODUCTION_REF
    && env.SUPABASE_URL === `https://${PRODUCTION_REF}.supabase.co`;
}

const statusFor = code => ({ not_authenticated: 401, inactive_teacher: 403,
  invalid_document: 422, payload_too_large: 413,
  idempotency_conflict: 409, integration_blocked: 503 })[code] || 503;
const messageFor = code => ({ invalid_document: 'Review the lesson plan title and content before saving.',
  payload_too_large: 'The lesson plan is too large to save.',
  idempotency_conflict: 'The draft changed after a save attempt. Review it before retrying.',
  inactive_teacher: 'This account cannot save lesson plans.' })[code]
  || 'Permanent Save is unavailable. Your draft remains open.';
const credential = req => (req.get('authorization') || '').slice('Bearer '.length).trim();

export async function aiSavePostHandler(req, res, service) {
  if (req.user?.role !== 'teacher') return res.status(403).json({ ok: false, code: 'inactive_teacher' });
  const result = await service.save(credential(req), req.body, req.user.id);
  if (!result.ok) return res.status(statusFor(result.code)).json({ ...result, error: messageFor(result.code) });
  return res.json(result);
}

export function createAiLessonPlanSaveRouter({ env = process.env, auth = requireAuth(['teacher']),
  invokeRpc } = {}) {
  const router = Router();
  let transport;
  const service = createAiLessonPlanSave({ invokeRpc: async (...args) => {
    transport ??= invokeRpc || createUserScopedRpcTransport({ url: env.SUPABASE_URL,
      anonKey: env.SUPABASE_ANON_KEY,
      allowTestDataProject: env.AI_SAVE_ALLOW_TEST_DATA_PROJECT === '1',
      approvedProductionProjectRef: aiSaveProductionEnabled(env)
        ? env.AI_LESSON_PLAN_SAVE_PRODUCTION_PROJECT_REF : undefined });
    return transport(...args);
  } });
  const gate = (req, res, next) => aiSaveLocallyEnabled(req, env) || aiSaveProductionEnabled(env) ? next()
    : res.status(503).json({ ok: false, code: 'integration_blocked', durable: false,
      error: 'Permanent Save is unavailable. Your draft remains open.' });

  router.get('/', gate, auth, async (req, res) => {
    if (req.user?.role !== 'teacher') return res.status(403).json({ ok: false, code: 'inactive_teacher' });
    const result = await service.availability(credential(req));
    if (!result.ok) return res.status(statusFor(result.code)).json({ ...result, error: messageFor(result.code) });
    return res.json({ enabled: true });
  });
  router.post('/', gate, auth, (req, res) => aiSavePostHandler(req, res, service));
  return router;
}
