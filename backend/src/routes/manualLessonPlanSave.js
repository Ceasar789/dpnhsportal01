import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createManualLessonPlanPersistence, createUserScopedRpcTransport } from '../persistence/postgresAdapter.js';
import { createPersistenceHandler } from '../persistence/productionBoundary.js';

// P4b Manual ILAW save. The database RPC is the authority (auth.uid() owner,
// teaching load, revision); this route only refuses to run unless every
// production condition holds, and never forwards raw database text.
const PRODUCTION_REF = 'jllstakxiamxiycnwrbd';

export function manualSaveProductionEnabled(env = process.env) {
  return env?.NODE_ENV === 'production' && env.VERCEL === '1' && env.VERCEL_ENV === 'production'
    && env.MANUAL_LESSON_PLAN_SAVE_PRODUCTION_ENABLED === '1'
    && env.SUPABASE_URL === `https://${PRODUCTION_REF}.supabase.co`
    && typeof env.SUPABASE_ANON_KEY === 'string' && env.SUPABASE_ANON_KEY.length > 0;
}

const unavailable = { ok: false, code: 'integration_blocked', durable: false };

// A success must describe a plan owned by the verified caller.
const ownedBy = (service, userId) => ({
  async execute(operation, credential, body) {
    const result = await service.execute(operation, credential, body);
    if (result?.ok !== true) return result;
    const record = result.record;
    return record?.teacher_id === userId && record.ownerId === userId && record.type === 'manual'
      ? result : { ok: false, code: 'persistence_failed', durable: false };
  },
});

export function createManualLessonPlanSaveRouter({ env = process.env, auth = requireAuth(['teacher']), invokeRpc } = {}) {
  const router = Router();
  const enabled = manualSaveProductionEnabled(env);
  let transport;
  const service = createManualLessonPlanPersistence({ enabled, invokeRpc: async (...args) => {
    transport ??= invokeRpc || createUserScopedRpcTransport({ url: env.SUPABASE_URL,
      anonKey: env.SUPABASE_ANON_KEY, approvedProductionProjectRef: PRODUCTION_REF });
    return transport(...args);
  } });
  const gate = (_req, res, next) => (enabled ? next() : res.status(503).json(unavailable));
  router.post('/:operation', gate, auth, (req, res) => {
    if (req.user?.role !== 'teacher' || !req.user.id) return res.status(403).json({ ok: false, code: 'inactive_teacher', durable: false });
    return createPersistenceHandler(ownedBy(service, req.user.id))(req, res);
  });
  return router;
}
