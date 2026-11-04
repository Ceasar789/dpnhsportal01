import { supabase } from '../../../../config/supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KNOWN = new Set(['not_authenticated', 'inactive_teacher', 'invalid_document',
  'payload_too_large', 'source_plan_denied', 'source_changed', 'assignment_denied',
  'settings_unavailable', 'job_unavailable', 'idempotency_conflict', 'integration_blocked']);
const unknown = () => ({ status: 'unknown', code: 'save_unconfirmed', receipt: null,
  message: 'Could not confirm the save. Retry the same attempt before editing further.' });

export const weeklyProductionSaveFlagEnabled = () => import.meta.env.PROD
  && import.meta.env.VITE_WEEKLY_WORKSHEET_PRODUCTION_SAVE_ENABLED === 'true';

export async function saveWeeklyJobCollection(apiBase, { jobId, requestId, collection }) {
  if (!weeklyProductionSaveFlagEnabled()) return { status: 'failed', code: 'integration_blocked',
    receipt: null, message: 'Permanent worksheet Save is unavailable.' };
  if (!UUID.test(jobId) || !UUID.test(requestId) || collection?.collectionId !== jobId)
    return { status: 'failed', code: 'invalid_document', receipt: null,
      message: 'Review the five worksheets before saving.' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { status: 'failed', code: 'not_authenticated',
      receipt: null, message: 'Sign in again before saving.' };
    const response = await fetch(`${apiBase}/api/weekly-worksheets/production-save`, {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, requestId, collection }), signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) return result?.ok === false && result.durable === false && KNOWN.has(result.code)
      ? { status: 'failed', code: result.code, receipt: null,
        message: 'The worksheets were not saved. Review the draft and try again.' }
      : unknown();
    const expected = new Map(collection.worksheets.map(day =>
      [['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].indexOf(day.day) + 1,
        day.questions.length]));
    if (result?.ok !== true || result.durable !== true || !UUID.test(result.collectionId)
      || !Array.isArray(result.worksheets) || result.worksheets.length !== 5
      || new Set(result.worksheets.map(day => day?.day)).size !== 5
      || new Set(result.worksheets.map(day => day?.id)).size !== 5
      || !result.worksheets.every(day => UUID.test(day?.id) && expected.has(day.day)
        && day.items === expected.get(day.day))) return unknown();
    return { status: 'saved', code: null, message: '', receipt: result };
  } catch { return unknown(); }
}
