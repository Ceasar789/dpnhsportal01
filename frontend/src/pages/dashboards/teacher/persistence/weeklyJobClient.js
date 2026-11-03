import { supabase } from '../../../../config/supabase';
import { API_BASE } from '../../../../lib/backendApi';

// Draft generation stays off unless explicitly enabled at build time.
export const WEEKLY_JOBS_ENABLED = import.meta.env.VITE_WEEKLY_DRAFT_GENERATION_ENABLED === 'true';

const BASE_PATH = '/api/ai/weekly-draft-jobs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['QUEUED', 'RUNNING', 'COMPLETED', 'CANCELED', 'FAILED',
  'INTERRUPTED_UNKNOWN_OUTCOME']);
const FAILURES = new Set(['provider', 'validation', 'timeout', 'capacity', 'source_changed']);
const ERROR_CODES = new Set(['invalid_request', 'invalid_weekly_source', 'not_authenticated',
  'inactive_teacher', 'source_denied', 'not_found', 'source_changed',
  'idempotency_conflict', 'not_ready', 'invalid_state', 'job_unavailable']);
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const MAX_RESPONSE_BYTES = 5242880;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = value => typeof value === 'string' && UUID.test(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

export class WeeklyJobClientError extends Error {
  constructor(code) {
    super(code);
    this.name = 'WeeklyJobClientError';
    this.code = code;
  }
}

const fail = code => { throw new WeeklyJobClientError(code); };
const summary = (value, id) => {
  if (!object(value) || Object.keys(value).sort().join('|')
    !== 'attemptedCalls|completedBatches|failureCategory|id|plannedCalls|status'
    || !uuid(value.id) || (id && value.id !== id) || !STATUSES.has(value.status)
    || ![10, 15, 20].includes(value.plannedCalls)
    || !integer(value.attemptedCalls, 0, value.plannedCalls)
    || !integer(value.completedBatches, 0, value.attemptedCalls)
    || (value.failureCategory !== null && !FAILURES.has(value.failureCategory))) fail('malformed_response');
  return value;
};
const cancelReceipt = (value, id) => {
  if (!object(value) || Object.keys(value).sort().join('|') !== 'id|status'
    || value.id !== id || !['CANCELED', 'COMPLETED', 'FAILED', 'INTERRUPTED_UNKNOWN_OUTCOME'].includes(value.status)) fail('cancel_unconfirmed');
  return value;
};
const validDay = (day, index, planId) => {
  if (!object(day) || day.day !== DAYS[index] || day.status !== 'generated-draft'
    || day.saved !== false || day.sourceLessonPlan?.id !== planId
    || typeof day.title !== 'string' || !day.title.trim()
    || typeof day.instructions !== 'string' || !day.instructions.trim()
    || !Array.isArray(day.questions) || ![20, 30, 40].includes(day.questions.length)
    || !Array.isArray(day.answerKey)) return false;
  const ids = new Set();
  for (const question of day.questions) {
    if (!object(question) || typeof question.localId !== 'string' || !question.localId
      || ids.has(question.localId) || typeof question.question !== 'string'
      || !question.question.trim() || !['multiple_choice', 'true_false', 'enumeration', 'essay']
        .includes(question.item_type)) return false;
    ids.add(question.localId);
  }
  const keyedIds = new Set();
  for (const key of day.answerKey) {
    if (!object(key) || !ids.has(key.localId) || keyedIds.has(key.localId)) return false;
    keyedIds.add(key.localId);
  }
  return day.questions.every(question => keyedIds.has(question.localId)
    === (question.item_type !== 'essay'));
};
const draft = value => {
  if (!object(value) || Object.keys(value).sort().join('|')
    !== 'kind|saved|sourceLessonPlan|status|teacherId|worksheets'
    || value.kind !== 'weekly-worksheet-collection'
    || value.status !== 'local-draft' || value.saved !== false
    || !uuid(value.teacherId) || !uuid(value.sourceLessonPlan?.id)
    || !Array.isArray(value.worksheets) || value.worksheets.length !== 5
    || value.worksheets.some((day, index) => !validDay(day, index, value.sourceLessonPlan.id)))
    fail('malformed_response');
  return value;
};

export function createWeeklyJobClient({ enabled = false, apiBase = API_BASE,
  getSession = () => supabase.auth.getSession(), fetchImpl = (...args) => fetch(...args) } = {}) {
  const request = async (method, path, body, uncertainCode) => {
    if (!enabled) return fail('job_unavailable');
    let session;
    try { ({ data: { session } } = await getSession()); }
    catch { return fail('not_authenticated'); }
    if (!session?.access_token) return fail('not_authenticated');
    let response;
    try {
      response = await fetchImpl(`${apiBase}${BASE_PATH}${path}`, {
        method,
        headers: { Authorization: `Bearer ${session.access_token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { return fail(uncertainCode); }
    let payload;
    try {
      const raw = await response.text();
      if (new TextEncoder().encode(raw).length > MAX_RESPONSE_BYTES) return fail(uncertainCode);
      payload = JSON.parse(raw);
    } catch { return fail(uncertainCode); }
    if (!response.ok) {
      if (uncertainCode === 'cancel_unconfirmed' && response.status >= 500)
        return fail('cancel_unconfirmed');
      return fail(ERROR_CODES.has(payload?.code) ? payload.code : uncertainCode);
    }
    return payload;
  };

  const status = async id => {
    if (!uuid(id)) return fail('invalid_request');
    return summary(await request('GET', `/${id}`, undefined, 'status_unconfirmed'), id);
  };
  return Object.freeze({ enabled,
    submit: async ({ sourceLessonPlanId, questionCount, requestId } = {}) => {
      if (!uuid(sourceLessonPlanId) || ![20, 30, 40].includes(questionCount)
        || typeof requestId !== 'string' || !requestId.trim() || requestId.length > 128)
        return fail('invalid_request');
      return summary(await request('POST', '/', { lessonPlanId: sourceLessonPlanId,
        questionCount, requestId }, 'submit_unconfirmed'));
    },
    status,
    cancel: async id => {
      if (!uuid(id)) return fail('invalid_request');
      return cancelReceipt(await request('POST', `/${id}/cancel`, undefined, 'cancel_unconfirmed'), id);
    },
    result: async id => {
      const current = await status(id);
      if (current.status !== 'COMPLETED') return fail('not_ready');
      return draft(await request('GET', `/${id}/result`, undefined, 'result_unconfirmed'));
    },
  });
}

export const weeklyJobClient = createWeeklyJobClient({ enabled: WEEKLY_JOBS_ENABLED });
