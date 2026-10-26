import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createUserScopedRpcTransport } from '../persistence/postgresAdapter.js';
import { createAiWeeklyWorksheetSave } from '../persistence/aiWeeklyWorksheetSave.js';

const PRODUCTION_REF = 'jllstakxiamxiycnwrbd';
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function weeklySaveLocallyEnabled(req, env = process.env) {
  if (env.NODE_ENV !== 'development' || env.VERCEL || env.VERCEL_ENV
    || env.AI_WEEKLY_WORKSHEET_SAVE_ENABLED !== '1'
    || !loopback.has(req.socket?.remoteAddress)) return false;
  if (env.SUPABASE_URL === 'http://127.0.0.1:54321') return true;
  const ref = env.AI_SAVE_DEV_PROJECT_REF;
  return typeof ref === 'string' && /^[a-z0-9]{20}$/.test(ref)
    && (ref !== PRODUCTION_REF || env.AI_SAVE_ALLOW_TEST_DATA_PROJECT === '1')
    && env.SUPABASE_URL === `https://${ref}.supabase.co`;
}

const statusFor = code => ({ not_authenticated: 401, inactive_teacher: 403,
  source_plan_denied: 403, invalid_document: 422, mcq_options_not_distinct: 422,
  unsafe_markup: 422,
  payload_too_large: 413, idempotency_conflict: 409,
  invalid_state: 503, integration_blocked: 503 })[code] || 503;
const safeCodes = new Set(['not_authenticated', 'inactive_teacher', 'source_plan_denied',
  'invalid_document', 'mcq_options_not_distinct', 'unsafe_markup', 'payload_too_large',
  'idempotency_conflict', 'invalid_state', 'integration_blocked', 'persistence_failed']);
const messageFor = code => ({ invalid_document: 'Review the weekly worksheets before saving.',
  mcq_options_not_distinct: 'Each multiple-choice option must be different.',
  unsafe_markup: 'Remove < symbols or HTML tags from the worksheet text, for example write x < y with spaces.',
  payload_too_large: 'The weekly worksheets are too large to save.',
  source_plan_denied: 'The saved AI lesson plan is unavailable to this teacher.',
  idempotency_conflict: 'This collection changed after a save attempt. Review it before retrying.',
  inactive_teacher: 'This account cannot save worksheets.',
  not_authenticated: 'Sign in again before saving.' })[code]
  || 'Permanent worksheet save is unavailable. Your drafts remain open.';
const credential = req => (req.get('authorization') || '').startsWith('Bearer ')
  ? req.get('authorization').slice(7).trim() : '';

export async function weeklySavePostHandler(req, res, service) {
  if (req.user?.role !== 'teacher') {
    return res.status(403).json({ ok: false, code: 'inactive_teacher', durable: false,
      error: messageFor('inactive_teacher') });
  }
  const result = await service.save(credential(req), req.body);
  if (!result.ok) {
    const code = safeCodes.has(result.code) ? result.code : 'persistence_failed';
    return res.status(statusFor(code)).json({ ok: false, code, durable: false, error: messageFor(code) });
  }
  return res.json(result);
}

export function createAiWeeklyWorksheetSaveRouter({ env = process.env,
  auth = requireAuth(['teacher']), invokeRpc } = {}) {
  const router = Router();
  let transport;
  const service = createAiWeeklyWorksheetSave({ invokeRpc: async (...args) => {
    transport ??= invokeRpc || createUserScopedRpcTransport({ url: env.SUPABASE_URL,
      anonKey: env.SUPABASE_ANON_KEY,
      allowTestDataProject: env.AI_SAVE_ALLOW_TEST_DATA_PROJECT === '1' });
    return transport(...args);
  } });
  const gate = (req, res, next) => weeklySaveLocallyEnabled(req, env) ? next()
    : res.status(503).json({ ok: false, code: 'integration_blocked', durable: false,
      error: messageFor('integration_blocked') });
  router.post('/', gate, auth, (req, res) => weeklySavePostHandler(req, res, service));
  return router;
}
