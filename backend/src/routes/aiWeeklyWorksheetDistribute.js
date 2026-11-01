import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createUserScopedRpcTransport } from '../persistence/postgresAdapter.js';
import { createAiWeeklyWorksheetDistribute } from '../persistence/aiWeeklyWorksheetDistribute.js';
import { weeklySaveLocallyEnabled } from './aiWeeklyWorksheetSave.js';

const statuses = { not_authenticated: 401, inactive_teacher: 403,
  section_not_allowed: 403, student_not_in_section: 422, invalid_document: 422,
  invalid_due_date: 422, not_found: 404, revision_conflict: 409,
  collection_archived: 409, integration_blocked: 503, persistence_failed: 503 };
const messages = { not_authenticated: 'Sign in again before saving.',
  inactive_teacher: 'This account cannot save worksheets.',
  not_found: 'This collection was not found.',
  revision_conflict: 'This collection changed in the meantime. Reload it before saving.',
  collection_archived: 'Restore this collection before editing it.',
  invalid_document: 'Review the weekly worksheets before saving.',
  section_not_allowed: 'You cannot distribute to this section.',
  student_not_in_section: 'One or more students are not active members of this section.',
  invalid_due_date: 'Choose a valid future due date.' };
const fallback = 'Permanent worksheet save is unavailable. Your drafts remain open.';
const sendFailure = (res, rawCode) => {
  const code = Object.hasOwn(statuses, rawCode) ? rawCode : 'persistence_failed';
  return res.status(statuses[code]).json({ ok: false, code, durable: false,
    error: messages[code] || fallback });
};
const credential = req => (req.get('authorization') || '').startsWith('Bearer ')
  ? req.get('authorization').slice(7).trim() : '';

export async function weeklyDistributePostHandler(req, res, getService) {
  if (req.user?.role !== 'teacher') return sendFailure(res, 'inactive_teacher');
  const token = credential(req);
  if (!token) return sendFailure(res, 'not_authenticated');
  let service;
  try { service = getService(); } catch { return sendFailure(res, 'integration_blocked'); }
  try {
    const result = await service.distribute(token, req.body);
    if (!result?.ok) return sendFailure(res, result?.code);
    return res.json(result);
  } catch {
    return sendFailure(res, 'persistence_failed');
  }
}

export function createAiWeeklyWorksheetDistributeRouter({ env = process.env,
  auth = requireAuth(['teacher']), invokeRpc } = {}) {
  const router = Router();
  let transport;
  const service = () => {
    transport ??= invokeRpc || createUserScopedRpcTransport({ url: env.SUPABASE_URL,
      anonKey: env.SUPABASE_ANON_KEY,
      allowTestDataProject: env.AI_SAVE_ALLOW_TEST_DATA_PROJECT === '1' });
    return createAiWeeklyWorksheetDistribute({ invokeRpc: transport });
  };
  const gate = (req, res, next) => weeklySaveLocallyEnabled(req, env) ? next()
    : sendFailure(res, 'integration_blocked');
  router.post('/', gate, auth,
    (req, res) => weeklyDistributePostHandler(req, res, service));
  return router;
}
