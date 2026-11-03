// Draft-only weekly job RPCs. The caller supplies a trusted service-role client
// and a factory that binds a separately verified Teacher JWT to a user client.
// This adapter neither constructs credentials nor activates a route or worker.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['QUEUED', 'RUNNING', 'COMPLETED', 'CANCELED', 'FAILED',
  'INTERRUPTED_UNKNOWN_OUTCOME']);
const FAILURE_CATEGORIES = new Set(['provider', 'validation', 'timeout', 'capacity', 'source_changed']);
const FINALIZATION_FAILURE_CATEGORIES = new Set(['validation', 'source_changed']);
const DATABASE_ERRORS = new Set(['invalid_request', 'not_authenticated', 'source_denied',
  'idempotency_conflict', 'not_found', 'not_ready', 'invalid_state',
  'invalid_result', 'source_changed']);
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const SNAPSHOT_KEYS = ['title', 'objectives', 'subject', 'grade_level',
  'subject_id', 'academic_year', 'ai_generated'].sort().join('|');

export class WeeklyDraftJobRpcError extends Error {
  constructor(code) { super(code); this.name = 'WeeklyDraftJobRpcError'; this.code = code; }
}

const fail = code => { throw new WeeklyDraftJobRpcError(code); };
const uuid = value => typeof value === 'string' && UUID.test(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeError = error => DATABASE_ERRORS.has(error?.message) ? error.message : 'persistence_failed';
const jsonBytes = value => {
  try { return Buffer.byteLength(JSON.stringify(value), 'utf8'); }
  catch { return Infinity; }
};
const boundedText = (value, max) => typeof value === 'string'
  && Array.from(value).length <= max;
const validSnapshot = value => object(value)
  && Object.keys(value).sort().join('|') === SNAPSHOT_KEYS
  && boundedText(value.title, 255) && !!value.title.trim()
  && typeof value.objectives === 'string' && !!value.objectives.trim()
  && Buffer.byteLength(value.objectives, 'utf8') <= 262144
  && (value.subject === null || boundedText(value.subject, 100))
  && (value.grade_level === null || boundedText(value.grade_level, 50))
  && (value.subject_id === null || uuid(value.subject_id))
  && (value.academic_year === null || boundedText(value.academic_year, 20))
  && typeof value.ai_generated === 'boolean' && jsonBytes(value) <= 1048576;
const validPlan = (plan, sourceLessonPlanId) => object(plan)
  && plan.id === sourceLessonPlanId && typeof plan.title === 'string'
  && !!plan.title.trim() && plan.title.length <= 255
  && (plan.subject === null || (typeof plan.subject === 'string' && plan.subject.length <= 100))
  && (plan.grade_level === null || (typeof plan.grade_level === 'string' && plan.grade_level.length <= 50))
  && (plan.subject_id === null || uuid(plan.subject_id))
  && (plan.academic_year === null || (typeof plan.academic_year === 'string'
    && plan.academic_year.length <= 20)) && jsonBytes(plan) <= 4096;

function summary(data, id) {
  if (!object(data) || !uuid(data.id) || (id && data.id !== id)
    || !STATUSES.has(data.status) || ![10, 15, 20].includes(data.plannedCalls)
    || !integer(data.attemptedCalls, 0, data.plannedCalls)
    || !integer(data.completedBatches, 0, data.attemptedCalls)
    || (Object.hasOwn(data, 'failureCategory') && data.failureCategory !== null
      && !FAILURE_CATEGORIES.has(data.failureCategory))) fail('malformed_receipt');
  return { id: data.id, status: data.status, plannedCalls: data.plannedCalls,
    attemptedCalls: data.attemptedCalls, completedBatches: data.completedBatches,
    failureCategory: data.failureCategory ?? null };
}

function result(data) {
  if (!object(data) || data.kind !== 'weekly-worksheet-collection'
    || data.status !== 'local-draft' || data.saved !== false || !uuid(data.teacherId)
    || !uuid(data.sourceLessonPlan?.id) || !Array.isArray(data.worksheets)
    || data.worksheets.length !== DAYS.length
    || data.worksheets.some((day, index) => day?.day !== DAYS[index])) {
    fail('malformed_receipt');
  }
  return data;
}

export function createWeeklyDraftJobRpcAdapter({ serviceRoleClient, teacherClientForJwt } = {}) {
  if (typeof serviceRoleClient?.rpc !== 'function' || typeof teacherClientForJwt !== 'function')
    fail('integration_blocked');

  const call = async (client, name, args) => {
    let response;
    try { response = await client.rpc(name, args); }
    catch { fail('persistence_failed'); }
    if (!object(response)) fail('persistence_failed');
    if (response.error) fail(safeError(response.error));
    return response.data;
  };
  const teacherClient = async credential => {
    if (typeof credential !== 'string' || !credential.trim()) fail('not_authenticated');
    let client;
    try { client = await teacherClientForJwt(credential); }
    catch { fail('integration_blocked'); }
    if (typeof client?.rpc !== 'function' || client === serviceRoleClient)
      fail('integration_blocked');
    return client;
  };

  return Object.freeze({
    async submit({ teacherId, requestId, sourceLessonPlanId, questionCount, sourceDays,
      expectedSource } = {}) {
      if (!uuid(teacherId) || !uuid(sourceLessonPlanId)
        || typeof requestId !== 'string' || !requestId.trim() || requestId.length > 128
        || ![20, 30, 40].includes(questionCount)
        || !Array.isArray(sourceDays) || sourceDays.length !== DAYS.length
        || sourceDays.some(day => !object(day)) || !validSnapshot(expectedSource))
        fail('invalid_request');
      const data = await call(serviceRoleClient, 'weekly_draft_job_submit_v1', {
        p_teacher_id: teacherId, p_request_id: requestId,
        p_source_lesson_plan_id: sourceLessonPlanId,
        p_question_count: questionCount, p_source_days: sourceDays,
        p_expected_source: expectedSource,
      });
      return summary(data);
    },
    async status(credential, jobId) {
      if (!uuid(jobId)) fail('invalid_request');
      const client = await teacherClient(credential);
      return summary(await call(client, 'weekly_draft_job_status_v1', { p_job_id: jobId }), jobId);
    },
    async workerStatus(jobId) {
      if (!uuid(jobId)) fail('invalid_request');
      const data = await call(serviceRoleClient, 'weekly_draft_job_worker_status_v1',
        { p_job_id: jobId });
      if (!object(data) || Object.keys(data).sort().join('|') !== 'cancelRequested|id|status'
        || data.id !== jobId || !STATUSES.has(data.status)
        || typeof data.cancelRequested !== 'boolean'
        || (data.status === 'CANCELED') !== data.cancelRequested) fail('malformed_receipt');
      return { id: data.id, status: data.status, cancelRequested: data.cancelRequested };
    },
    async cancel(credential, jobId) {
      if (!uuid(jobId)) fail('invalid_request');
      const client = await teacherClient(credential);
      const data = await call(client, 'weekly_draft_job_cancel_v1', { p_job_id: jobId });
      if (!object(data) || Object.keys(data).sort().join('|') !== 'id|status'
        || data.id !== jobId || !['CANCELED', 'COMPLETED', 'FAILED', 'INTERRUPTED_UNKNOWN_OUTCOME'].includes(data.status))
        fail('malformed_receipt');
      return { id: data.id, status: data.status };
    },
    async result(credential, jobId) {
      if (!uuid(jobId)) fail('invalid_request');
      const client = await teacherClient(credential);
      return result(await call(client, 'weekly_draft_job_result_v1', { p_job_id: jobId }));
    },
    async discoverWork() {
      const data = await call(serviceRoleClient, 'weekly_draft_job_discover_work_v1', {});
      if (data === null) return null;
      if (!object(data) || Object.keys(data).sort().join('|') !== 'action|jobId'
        || !uuid(data.jobId) || !['claim', 'recover', 'assemble'].includes(data.action))
        fail('malformed_receipt');
      return { jobId: data.jobId, action: data.action };
    },
    async claim(jobId) {
      if (!uuid(jobId)) fail('invalid_request');
      const data = await call(serviceRoleClient, 'weekly_draft_job_claim_v1', { p_job_id: jobId });
      if (data === null) return null;
      if (!object(data) || data.id !== jobId || !uuid(data.leaseToken)
        || ![20, 30, 40].includes(data.questionCount)
        || !integer(data.batchIndex, 0, data.questionCount / 2 - 1)
        || !uuid(data.sourceLessonPlanId) || !Array.isArray(data.sourceDays)
        || data.sourceDays.length !== DAYS.length || data.sourceDays.some(day => !object(day))
        || jsonBytes(data.sourceDays) > 65536
        || !validPlan(data.plan, data.sourceLessonPlanId)
        || !Array.isArray(data.priorQuestions)
        || data.priorQuestions.length !== (data.batchIndex % (data.questionCount / 10)) * 10
        || jsonBytes(data.priorQuestions) > 262144
        || data.priorQuestions.some(question => typeof question !== 'string'
          || !question.trim() || question.length > 2000
          || Buffer.byteLength(question, 'utf8') > 8192))
        fail('malformed_receipt');
      return { id: data.id, leaseToken: data.leaseToken, batchIndex: data.batchIndex,
        questionCount: data.questionCount, sourceLessonPlanId: data.sourceLessonPlanId,
        sourceDays: data.sourceDays, plan: data.plan,
        priorQuestions: data.priorQuestions };
    },
    async reserveDispatch(jobId, leaseToken) {
      if (!uuid(jobId) || !uuid(leaseToken)) fail('invalid_request');
      const data = await call(serviceRoleClient, 'weekly_draft_job_reserve_dispatch_v1',
        { p_job_id: jobId, p_lease_token: leaseToken });
      if (data === false || data === null) return false;
      if (data !== true) fail('malformed_receipt');
      return true;
    },
    async finishBatch(jobId, leaseToken, checkpoint = null, failureCategory = null) {
      if (!uuid(jobId) || !uuid(leaseToken)
        || (checkpoint === null) === (failureCategory === null)
        || (checkpoint !== null && !object(checkpoint))
        || (failureCategory !== null && !FAILURE_CATEGORIES.has(failureCategory)))
        fail('invalid_request');
      const data = await call(serviceRoleClient, 'weekly_draft_job_finish_batch_v1', {
        p_job_id: jobId, p_lease_token: leaseToken,
        p_checkpoint: checkpoint, p_failure_category: failureCategory,
      });
      if (typeof data !== 'boolean') fail('malformed_receipt');
      return data;
    },
    async readCheckpoints(jobId) {
      if (!uuid(jobId)) fail('invalid_request');
      const data = await call(serviceRoleClient, 'weekly_draft_job_read_checkpoints_v1',
        { p_job_id: jobId });
      if (!object(data) || data.id !== jobId || !uuid(data.teacherId)
        || !uuid(data.sourceLessonPlanId) || ![20, 30, 40].includes(data.questionCount)
        || data.plannedCalls !== data.questionCount / 2
        || !Array.isArray(data.sourceDays) || data.sourceDays.length !== DAYS.length
        || data.sourceDays.some(day => !object(day)) || jsonBytes(data.sourceDays) > 65536
        || !validPlan(data.plan, data.sourceLessonPlanId)
        || !Array.isArray(data.checkpoints) || data.checkpoints.length !== data.plannedCalls)
        fail('malformed_receipt');
      let totalBytes = 0;
      for (const [index, entry] of data.checkpoints.entries()) {
        if (!object(entry) || entry.batchIndex !== index || !object(entry.validatedResponse))
          fail('malformed_receipt');
        const bytes = jsonBytes(entry.validatedResponse);
        totalBytes += bytes;
        if (bytes > 1048576 || totalBytes > 20971520) fail('malformed_receipt');
      }
      return { id: data.id, teacherId: data.teacherId,
        sourceLessonPlanId: data.sourceLessonPlanId, sourceDays: data.sourceDays, plan: data.plan,
        questionCount: data.questionCount, plannedCalls: data.plannedCalls,
        checkpoints: data.checkpoints.map(entry => ({ batchIndex: entry.batchIndex,
          validatedResponse: entry.validatedResponse })) };
    },
    async failFinalization(jobId, failureCategory) {
      if (!uuid(jobId) || !FINALIZATION_FAILURE_CATEGORIES.has(failureCategory))
        fail('invalid_request');
      const data = await call(serviceRoleClient, 'weekly_draft_job_fail_finalization_v1',
        { p_job_id: jobId, p_failure_category: failureCategory });
      if (typeof data !== 'boolean') fail('malformed_receipt');
      return data;
    },
    async complete(jobId, draft) {
      if (!uuid(jobId) || !object(draft)) fail('invalid_request');
      const data = await call(serviceRoleClient, 'weekly_draft_job_complete_v1',
        { p_job_id: jobId, p_draft: draft });
      if (typeof data !== 'boolean') fail('malformed_receipt');
      return data;
    },
    async purge() {
      const data = await call(serviceRoleClient, 'weekly_draft_job_purge_v1', {});
      if (!integer(data, 0, 100)) fail('malformed_receipt');
      return data;
    },
  });
}
