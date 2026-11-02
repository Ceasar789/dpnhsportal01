import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createUserScopedRpcTransport } from '../persistence/postgresAdapter.js';
import { createAiLessonPlanSave } from '../persistence/aiLessonPlanSave.js';

const PRODUCTION_REF = 'jllstakxiamxiycnwrbd';
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const diagnosticStages = new Set(['route_gate', 'auth_guard', 'role_guard', 'transport_config',
  'input_validation', 'title_validation', 'html_sanitization', 'html_input_limit', 'jsdom_import',
  'purifier_init', 'sanitize_call', 'html_output_validation', 'rpc_request', 'rpc_rejection', 'receipt_validation']);
const diagnosticCategories = new Set(['blocked', 'unauthenticated', 'forbidden',
  'verification_unavailable', 'exception', 'attempted', 'invalid', 'unexpected',
  'not_authenticated', 'inactive_teacher', 'idempotency_conflict',
  'invalid_document', 'payload_too_large', 'persistence_failed']);
const importErrorCodes = new Set(['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ENOENT', 'EACCES',
  'ERR_PACKAGE_PATH_NOT_EXPORTED', 'ERR_INVALID_PACKAGE_CONFIG', 'ERR_REQUIRE_ESM']);
const importErrorNames = new Set(['Error', 'TypeError', 'SyntaxError', 'ReferenceError', 'AggregateError']);
const packageProbeResults = new Set(['found', 'missing']);
const stylesheetProbeResults = new Set(['readable', 'missing']);
const fixed = (source, key, allowed) => {
  try { const value = source?.[key]; return allowed.has(value) ? value : 'other'; }
  catch { return 'other'; }
};

export function logAiLessonSaveDiagnostic(stage, category, code, importInfo) {
  try {
    const postgrestCode = stage !== 'jsdom_import' && typeof code === 'string' &&
      /^(?:[A-Z0-9]{5}|PGRST[0-9]{3})$/.test(code)
      ? code : null;
    const importFailure = stage === 'jsdom_import' && category === 'unexpected';
    console.warn('[ai-lesson-plan-save]', { stage: diagnosticStages.has(stage) ? stage : 'unknown',
      category: diagnosticCategories.has(category) ? category : 'unexpected',
      ...(postgrestCode ? { postgrestCode } : {}),
      ...(importFailure ? {
        importErrorCode: fixed(importInfo, 'errorCode', importErrorCodes),
        importErrorName: fixed(importInfo, 'errorName', importErrorNames),
        packageResolution: fixed(importInfo, 'packageResolution', packageProbeResults),
        stylesheetAccess: fixed(importInfo, 'stylesheetAccess', stylesheetProbeResults),
      } : {}) });
  } catch { /* Diagnostic output must never change a save result. */ }
}

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

export async function aiSavePostHandler(req, res, service, diagnose = logAiLessonSaveDiagnostic) {
  if (req.user?.role !== 'teacher') {
    diagnose('role_guard', 'forbidden');
    return res.status(403).json({ ok: false, code: 'inactive_teacher' });
  }
  const result = await service.save(credential(req), req.body, req.user.id);
  if (!result.ok) return res.status(statusFor(result.code)).json({ ...result, error: messageFor(result.code) });
  return res.json(result);
}

export function createAiLessonPlanSaveRouter({ env = process.env, auth = requireAuth(['teacher']),
  invokeRpc } = {}) {
  const router = Router();
  let transport;
  const service = createAiLessonPlanSave({ diagnose: logAiLessonSaveDiagnostic,
    invokeRpc: async (...args) => {
      if (!transport) {
        try {
          transport = invokeRpc || createUserScopedRpcTransport({ url: env.SUPABASE_URL,
            anonKey: env.SUPABASE_ANON_KEY,
            allowTestDataProject: env.AI_SAVE_ALLOW_TEST_DATA_PROJECT === '1',
            approvedProductionProjectRef: aiSaveProductionEnabled(env)
              ? env.AI_LESSON_PLAN_SAVE_PRODUCTION_PROJECT_REF : undefined });
        } catch (error) {
          if (args[0] === 'eduscribe_ai_html_save_v1') logAiLessonSaveDiagnostic('transport_config', 'blocked');
          throw error;
        }
      }
      return transport(...args);
    } });
  const gate = (req, res, next) => {
    if (aiSaveLocallyEnabled(req, env) || aiSaveProductionEnabled(env)) return next();
    if (req.method === 'POST') logAiLessonSaveDiagnostic('route_gate', 'blocked');
    return res.status(503).json({ ok: false, code: 'integration_blocked', durable: false,
      error: 'Permanent Save is unavailable. Your draft remains open.' });
  };
  const postAuth = (req, res, next) => {
    let passed = false;
    res.once('finish', () => {
      if (!passed) logAiLessonSaveDiagnostic('auth_guard', res.statusCode === 401 ? 'unauthenticated'
        : res.statusCode === 403 ? 'forbidden' : 'verification_unavailable');
    });
    return auth(req, res, error => {
      passed = !error;
      if (error) logAiLessonSaveDiagnostic('auth_guard', 'exception');
      next(error);
    });
  };

  router.get('/', gate, auth, async (req, res) => {
    if (req.user?.role !== 'teacher') return res.status(403).json({ ok: false, code: 'inactive_teacher' });
    const result = await service.availability(credential(req));
    if (!result.ok) return res.status(statusFor(result.code)).json({ ...result, error: messageFor(result.code) });
    return res.json({ enabled: true });
  });
  router.post('/', gate, postAuth, (req, res) => aiSavePostHandler(req, res, service));
  return router;
}
