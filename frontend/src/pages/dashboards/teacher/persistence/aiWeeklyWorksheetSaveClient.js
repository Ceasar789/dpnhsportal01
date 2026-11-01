import { supabase } from '../../../../config/supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const KNOWN_CODES = new Set(['not_authenticated', 'inactive_teacher', 'source_plan_denied',
  'invalid_document', 'mcq_options_not_distinct', 'unsafe_markup', 'payload_too_large',
  'idempotency_conflict', 'invalid_state', 'integration_blocked', 'persistence_failed']);
const UNKNOWN_MESSAGE = 'Could not confirm the save. Retry will not create duplicates.';

export const weeklyWorksheetSaveFlagEnabled = () => import.meta.env.DEV
  && import.meta.env.VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED === '1'
  && typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

const unknown = (code = null) => ({ status: 'unknown', code, message: UNKNOWN_MESSAGE, receipt: null });

function validReceipt(result, collection) {
  if (result?.ok !== true || result.durable !== true || !UUID.test(result.collectionId)
    || !Array.isArray(result.worksheets) || result.worksheets.length !== collection.worksheets.length) return false;
  const expected = new Map(collection.worksheets.map(day => [DAYS.indexOf(day.day) + 1, day.questions.length]));
  return expected.size === collection.worksheets.length
    && new Set(result.worksheets.map(item => item?.day)).size === result.worksheets.length
    && new Set(result.worksheets.map(item => item?.id)).size === result.worksheets.length
    && result.worksheets.every(item => expected.has(item?.day) && UUID.test(item.id)
      && Number.isInteger(item.items) && item.items === expected.get(item.day));
}

export async function saveAiWeeklyWorksheets(apiBase, command) {
  if (!weeklyWorksheetSaveFlagEnabled()) return { status: 'failed', code: 'integration_blocked',
    message: 'Permanent worksheet save is unavailable. Your drafts remain open.', receipt: null };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { status: 'failed', code: 'not_authenticated',
      message: 'Sign in again before saving.', receipt: null };
    const response = await fetch(`${apiBase}/api/weekly-worksheets/ai-save`, {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json' },
      body: JSON.stringify(command), signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json().catch(() => null);
    if (response.ok) return validReceipt(result, command.collection)
      ? { status: 'saved', code: null, message: '',
        receipt: { collectionId: result.collectionId, worksheets: result.worksheets } }
      : unknown();
    if (result?.ok === false && result.durable === false && KNOWN_CODES.has(result.code)) {
      return { status: 'failed', code: result.code,
        message: typeof result.error === 'string' && result.error ? result.error : UNKNOWN_MESSAGE,
        receipt: null };
    }
    return unknown();
  } catch {
    return unknown();
  }
}
