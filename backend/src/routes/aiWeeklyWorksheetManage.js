import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createUserScopedRpcTransport } from '../persistence/postgresAdapter.js';
import { createAiWeeklyWorksheetManage } from '../persistence/aiWeeklyWorksheetManage.js';
import { weeklySaveLocallyEnabled } from './aiWeeklyWorksheetSave.js';

const statuses = { not_authenticated: 401, inactive_teacher: 403, source_plan_denied: 403,
  not_found: 404, invalid_document: 422, mcq_options_not_distinct: 422,
  unsafe_markup: 422, payload_too_large: 413, revision_conflict: 409,
  student_work_exists: 409, collection_archived: 409, idempotency_conflict: 409,
  invalid_state: 409, integration_blocked: 503, persistence_failed: 503 };
const messages = { invalid_document: 'Review the weekly worksheets before saving.',
  mcq_options_not_distinct: 'Each multiple-choice option must be different.',
  unsafe_markup: 'Remove < symbols or HTML tags from the worksheet text, for example write x < y with spaces.',
  payload_too_large: 'The weekly worksheets are too large to save.',
  source_plan_denied: 'The saved AI lesson plan is unavailable to this teacher.',
  idempotency_conflict: 'This collection changed after a save attempt. Review it before retrying.',
  inactive_teacher: 'This account cannot save worksheets.',
  not_authenticated: 'Sign in again before saving.',
  student_work_exists: 'This collection already has student work and cannot be changed.',
  revision_conflict: 'This collection changed in the meantime. Reload it before saving.',
  not_found: 'This collection was not found.',
  collection_archived: 'Restore this collection before editing it.' };
const fallback = 'Permanent worksheet save is unavailable. Your drafts remain open.';
const sendFailure = (res, rawCode) => {
  const code = Object.hasOwn(statuses, rawCode) ? rawCode : 'persistence_failed';
  return res.status(statuses[code]).json({ ok: false, code, durable: false,
    error: messages[code] || fallback });
};
const credential = req => (req.get('authorization') || '').startsWith('Bearer ')
  ? req.get('authorization').slice(7).trim() : '';

export async function weeklyManagePostHandler(req, res, getService, action) {
  if (req.user?.role !== 'teacher') return sendFailure(res, 'inactive_teacher');
  const token = credential(req);
  if (!token) return sendFailure(res, 'not_authenticated');
  let service;
  try { service = getService(); } catch { return sendFailure(res, 'integration_blocked'); }
  try {
    const result = await service[action](token, req.body);
    if (!result?.ok) return sendFailure(res, result?.code);
    return res.json(result);
  } catch {
    return sendFailure(res, 'persistence_failed');
  }
}

export function createAiWeeklyWorksheetManageRouter({ env = process.env,
  auth = requireAuth(['teacher']), invokeRpc } = {}) {
  const router = Router();
  let transport;
  const service = () => {
    transport ??= invokeRpc || createUserScopedRpcTransport({ url: env.SUPABASE_URL,
      anonKey: env.SUPABASE_ANON_KEY,
      allowTestDataProject: env.AI_SAVE_ALLOW_TEST_DATA_PROJECT === '1' });
    return createAiWeeklyWorksheetManage({ invokeRpc: transport });
  };
  const gate = (req, res, next) => weeklySaveLocallyEnabled(req, env) ? next()
    : sendFailure(res, 'integration_blocked');
  router.post('/update', gate, auth,
    (req, res) => weeklyManagePostHandler(req, res, service, 'update'));
  router.post('/archive', gate, auth,
    (req, res) => weeklyManagePostHandler(req, res, service, 'archive'));
  router.post('/delete', gate, auth,
    (req, res) => weeklyManagePostHandler(req, res, service, 'remove'));
  return router;
}
