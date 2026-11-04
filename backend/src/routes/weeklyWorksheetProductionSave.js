import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createUserScopedRpcTransport } from '../persistence/postgresAdapter.js';
import { buildWeeklySavePayload } from '../persistence/aiWeeklyWorksheetSave.js';

const PRODUCTION_REF = 'jllstakxiamxiycnwrbd';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DB_ERRORS = new Map([
  ['not_authenticated', 401], ['inactive_teacher', 403], ['invalid_document', 422],
  ['source_plan_denied', 403], ['source_changed', 409], ['assignment_denied', 403],
  ['settings_unavailable', 503], ['job_unavailable', 409], ['idempotency_conflict', 409],
]);
const BUILD_ERRORS = new Set(['invalid_document', 'unsafe_markup', 'mcq_options_not_distinct']);
const unconfirmed = res => res.status(503).json({ ok: false, code: 'save_unconfirmed' });

export const weeklyProductionSaveEnabled = (env = process.env) =>
  env.NODE_ENV === 'production' && env.VERCEL === '1' && env.VERCEL_ENV === 'production'
  && env.WEEKLY_WORKSHEET_PRODUCTION_SAVE_ENABLED === 'true'
  && env.WEEKLY_WORKSHEET_PRODUCTION_SAVE_PROJECT_REF === PRODUCTION_REF
  && env.SUPABASE_URL === `https://${PRODUCTION_REF}.supabase.co`;

const validReceipt = (data, payload) => {
  if (data?.ok !== true || data.durable !== true || !UUID.test(data.collectionId)
    || !Array.isArray(data.worksheets) || data.worksheets.length !== 5) return false;
  const expected = new Map(payload.worksheets.map(day => [day.day, day.questions.length]));
  const days = new Set();
  const ids = new Set();
  return data.worksheets.every(day => {
    if (!day || !expected.has(day.day) || days.has(day.day) || !UUID.test(day.id)
      || ids.has(day.id) || day.items !== expected.get(day.day)) return false;
    days.add(day.day); ids.add(day.id); return true;
  });
};

export function createWeeklyWorksheetProductionSaveRouter({ env = process.env,
  auth = requireAuth(['teacher']), invokeRpc } = {}) {
  const router = Router();
  let transport;
  router.post('/', (req, res, next) => weeklyProductionSaveEnabled(env) ? next()
    : res.status(503).json({ ok: false, code: 'integration_blocked', durable: false }),
  auth, async (req, res) => {
    if (req.user?.role !== 'teacher') return res.status(403).json({ ok: false,
      code: 'inactive_teacher', durable: false });
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).sort().join('|') !== 'collection|jobId|requestId'
      || !UUID.test(body.jobId) || !UUID.test(body.requestId)
      || body.collection?.collectionId !== body.jobId
      || body.collection?.teacherId !== req.user.id
      || !Array.isArray(body.collection?.worksheets)
      || body.collection.worksheets.length !== 5
      || body.collection.worksheets.some((day, index) => day?.day !== DAYS[index])) {
      return res.status(422).json({ ok: false, code: 'invalid_document', durable: false });
    }
    const credential = (req.get('authorization') || '').slice(7).trim();
    if (!credential) return res.status(401).json({ ok: false,
      code: 'not_authenticated', durable: false });
    let payload;
    try { payload = await buildWeeklySavePayload(body.collection); }
    catch (error) {
      const code = error?.code === 'payload_too_large' ? 'payload_too_large'
        : BUILD_ERRORS.has(error?.code) ? 'invalid_document' : 'integration_blocked';
      return res.status(code === 'payload_too_large' ? 413
        : code === 'integration_blocked' ? 503 : 422).json({ ok: false,
        code, durable: false });
    }
    try {
      transport ??= invokeRpc || createUserScopedRpcTransport({ url: env.SUPABASE_URL,
        anonKey: env.SUPABASE_ANON_KEY,
        approvedProductionProjectRef: env.WEEKLY_WORKSHEET_PRODUCTION_SAVE_PROJECT_REF });
    } catch {
      return res.status(503).json({ ok: false, code: 'integration_blocked', durable: false });
    }
    try {
      const { data, error } = await transport('eduscribe_weekly_job_save_v1',
        { p_job_id: body.jobId, p_request_id: body.requestId, p_payload: payload }, credential);
      if (error) {
        const status = DB_ERRORS.get(error.message);
        return status ? res.status(status).json({ ok: false, code: error.message, durable: false })
          : unconfirmed(res);
      }
      if (!validReceipt(data, payload)) return unconfirmed(res);
      return res.json({ ok: true, durable: true, collectionId: data.collectionId,
        worksheets: data.worksheets });
    } catch { return unconfirmed(res); }
  });
  return router;
}
