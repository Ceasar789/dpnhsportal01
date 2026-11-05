import { buildWeeklyWorksheetPrompt, parseDailyBatch, RESPONSE_SCHEMA,
  validateSameDayBatchQuestions, validateWeeklySources } from './weeklyWorksheetGenerator.js';

const BATCH_SIZE = 10;
const DEFAULT_DEADLINE_MS = 85_000;
const DEFAULT_POLL_MS = 2_000;
const LEASE_MS = 110_000;
const FUNCTION_MS = 120_000;
const CHECKPOINT_MARGIN_MS = 15_000;
const MAX_TIMING_MS = 120_000;
const roundedElapsedMs = (start, end) => Number.isFinite(start) && Number.isFinite(end) && end >= start
  ? Math.min(MAX_TIMING_MS, Math.round((end - start) / 100) * 100) : null;
const SAFE_PROVIDERS = new Set(['cloudflare', 'groq', 'nvidia', 'mistral', 'gemini']);
const PROVIDER_FAILURE_CODES = new Set(['PROVIDER_REJECTED', 'PROVIDER_AUTH_FAILED',
  'PROVIDER_ACCESS_DENIED', 'PROVIDER_UNAVAILABLE', 'PROVIDER_TRUNCATED',
  'PROVIDER_INVALID_RESPONSE', 'PROVIDER_INTERRUPTED', 'PROVIDER_NOT_CONFIGURED',
  'GENERATION_CANCELLED']);
const HTTP_FAILURE_CODES = new Set(['PROVIDER_REJECTED', 'PROVIDER_AUTH_FAILED',
  'PROVIDER_ACCESS_DENIED', 'PROVIDER_UNAVAILABLE']);

const validationSubreason = error => {
  switch (error?.validation?.category) {
    case 'syntax': return 'malformed_json';
    case 'question_count':
    case 'content_coverage': return 'wrong_question_count';
    case 'invalid_answer_key': return 'invalid_answer_key';
    case 'duplicate_question': return 'duplicate_question';
    case 'missing_required':
    case 'unsupported_question_type':
    case 'invalid_field':
    case 'invalid_essay': return 'invalid_question_structure';
    default: return error?.validation ? 'other_validation' : 'unexpected_parser_exception';
  }
};
const invalidStructureField = error => {
  const path = error?.validation?.path;
  if (path === 'questions') return 'batch_fields';
  const match = typeof path === 'string'
    ? /^questions\[\d{1,2}\]\.(question|item_type|points|options|enumeration|essay)$/.exec(path) : null;
  return match?.[1] || 'unknown';
};
// Bounded, content-free description of a raw provider output. Only numbers and
// fixed labels are returned; the raw text itself is never logged.
const rawShape = raw => {
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  const opens = (text.match(/{/g) || []).length;
  const closes = (text.match(/}/g) || []).length;
  return {
    rawLength: Math.min(raw.length, 99999),
    firstChar: text.startsWith('```') ? 'fence' : text[0] === '{' ? 'brace' : 'other',
    lastChar: text.endsWith('```') ? 'fence' : text.endsWith('}') ? 'brace' : 'other',
    braceBalance: Math.max(-9, Math.min(9, opens - closes)),
    hasFenceInside: text.includes('```'),
  };
};

const failureCategory = error => error?.code === 'AI_RESPONSE_INVALID' ? 'validation'
  : error?.code === 'PROVIDER_TIMEOUT' ? 'timeout'
    : ['PROVIDER_RATE_LIMIT', 'PROVIDER_OVERLOADED'].includes(error?.code) ? 'capacity'
      : 'provider';

export function createWeeklyDraftBatchService({ jobAdapter, providerBatch,
  providerNameForBatch = () => 'unknown', parseBatch = parseDailyBatch, log = console,
  deadlineMs = DEFAULT_DEADLINE_MS, statusPollMs = DEFAULT_POLL_MS, clock = globalThis,
  confirmedRetryEnabled = false } = {}) {
  if (typeof jobAdapter?.claim !== 'function' || typeof jobAdapter?.workerStatus !== 'function'
    || typeof jobAdapter?.reserveDispatch !== 'function' || typeof jobAdapter?.finishBatch !== 'function'
    || typeof providerBatch !== 'function' || typeof providerNameForBatch !== 'function'
    || typeof parseBatch !== 'function' || typeof confirmedRetryEnabled !== 'boolean'
    || (confirmedRetryEnabled && typeof jobAdapter?.finishConfirmedFailure !== 'function')
    || !Number.isSafeInteger(deadlineMs)
    || deadlineMs < 1 || deadlineMs > 90_000 || !Number.isSafeInteger(statusPollMs)
    || statusPollMs < 1 || statusPollMs >= deadlineMs
    || typeof clock.performance?.now !== 'function'
    || typeof clock.setTimeout !== 'function' || typeof clock.clearTimeout !== 'function'
    || typeof clock.setInterval !== 'function' || typeof clock.clearInterval !== 'function') {
    throw new TypeError('A bounded batch service requires a job adapter, provider, and clock.');
  }

  return Object.freeze({
    async processOneBatch(jobId, invocationStartedAt) {
      const now = clock.performance.now();
      if (!Number.isFinite(invocationStartedAt) || invocationStartedAt < 0
        || !Number.isFinite(now) || invocationStartedAt > now) {
        throw new TypeError('A monotonic invocation start is required.');
      }
      const requiredMs = deadlineMs + CHECKPOINT_MARGIN_MS;
      if (now - invocationStartedAt > FUNCTION_MS - requiredMs)
        return { status: 'not_dispatched' };
      // Claim allocates its lease after this point. Elapsed time from here is a
      // conservative upper bound on lease age, even if the RPC response is late.
      const claimStartedAt = clock.performance.now();
      const hasDispatchBudget = () => {
        const current = clock.performance.now();
        return Number.isFinite(current) && current >= claimStartedAt
          && current >= invocationStartedAt
          && current - claimStartedAt <= LEASE_MS - requiredMs
          && current - invocationStartedAt <= FUNCTION_MS - requiredMs;
      };
      const claim = await jobAdapter.claim(jobId);
      if (claim === null) return { status: 'no_claim' };
      if (!hasDispatchBudget()) return { status: 'not_dispatched' };
      const logValidation = (stage, subreason, field, shape) => {
        // Log only values chosen by this code; diagnostics must not affect the job outcome.
        try {
          const batchIndex = Number.isSafeInteger(claim.batchIndex)
            && claim.batchIndex >= 0 && claim.batchIndex < 20 ? claim.batchIndex : null;
          const selected = batchIndex === null ? 'unknown' : providerNameForBatch(batchIndex);
          log?.warn?.(JSON.stringify({ event: 'weekly_draft_validation',
            provider: SAFE_PROVIDERS.has(selected) ? selected : 'unknown',
            batchIndex, stage, subreason,
            ...(subreason === 'invalid_question_structure' ? { field } : {}),
            ...(subreason === 'malformed_json' && shape ? { shape } : {}) }));
        } catch { /* Logging is best effort. */ }
      };
      const logTimeout = timeoutOrigin => {
        // Only fixed timeout origins are recorded after the failure checkpoint commits.
        try {
          const batchIndex = Number.isSafeInteger(claim.batchIndex)
            && claim.batchIndex >= 0 && claim.batchIndex < 20 ? claim.batchIndex : null;
          const selected = batchIndex === null ? 'unknown' : providerNameForBatch(batchIndex);
          log?.warn?.(JSON.stringify({ event: 'weekly_draft_timeout',
            provider: SAFE_PROVIDERS.has(selected) ? selected : 'unknown',
            batchIndex, failureCategory: 'timeout',
            timeoutOrigin: ['batch_deadline', 'provider_timeout'].includes(timeoutOrigin)
              ? timeoutOrigin : 'unknown' }));
        } catch { /* Logging is best effort. */ }
      };
      const logProviderFailure = error => {
        try {
          const batchIndex = Number.isSafeInteger(claim.batchIndex)
            && claim.batchIndex >= 0 && claim.batchIndex < 20 ? claim.batchIndex : null;
          const selected = batchIndex === null ? 'unknown' : providerNameForBatch(batchIndex);
          const reportedCode = error?.code;
          const code = PROVIDER_FAILURE_CODES.has(reportedCode) ? reportedCode : 'other';
          const status = error?.httpStatus;
          log?.warn?.(JSON.stringify({ event: 'weekly_draft_provider_failure',
            provider: SAFE_PROVIDERS.has(selected) ? selected : 'unknown',
            batchIndex, failureCategory: 'provider', code,
            ...(HTTP_FAILURE_CODES.has(code) && Number.isInteger(status)
              && status >= 300 && status <= 599 ? { httpStatus: status } : {}) }));
        } catch { /* Logging is best effort. */ }
      };

      const initial = await jobAdapter.workerStatus(jobId);
      if (initial.status !== 'RUNNING' || initial.cancelRequested !== false)
        return { status: initial.status === 'CANCELED' ? 'canceled' : 'stale' };

      const sources = validateWeeklySources(claim.sourceDays);
      const batchesPerDay = claim.questionCount / BATCH_SIZE;
      const source = sources[Math.floor(claim.batchIndex / batchesPerDay)];
      const batch = claim.batchIndex % batchesPerDay + 1;
      const priorQuestions = claim.priorQuestions.map(value => typeof value === 'string' ? value : value?.question);
      if (!source || priorQuestions.some(value => typeof value !== 'string'))
        throw new TypeError('The claimed batch context is invalid.');
      const prompt = buildWeeklyWorksheetPrompt(claim.plan, source, BATCH_SIZE, batch, priorQuestions);

      if (!hasDispatchBudget()) return { status: 'not_dispatched' };
      // The RPC serializes this reservation with Cancel. Only true permits dispatch.
      if (await jobAdapter.reserveDispatch(jobId, claim.leaseToken) !== true)
        return { status: 'not_dispatched' };
      // The reservation may have committed even if its response consumed the
      // remaining budget. Never dispatch or imply that it was not reserved.
      if (!hasDispatchBudget()) return { status: 'unconfirmed' };

      const providerStartedAt = clock.performance.now();
      const providerStartMs = roundedElapsedMs(invocationStartedAt, providerStartedAt);
      const phases = {};
      const controller = new AbortController();
      let pending = true;
      let polling = false;
      let resolveInterrupt;
      const interrupted = new Promise(resolve => { resolveInterrupt = resolve; });
      const interrupt = reason => {
        if (!pending) return;
        pending = false;
        resolveInterrupt({ kind: reason });
        controller.abort();
      };
      const noteTiming = phase => {
        try {
          if (!pending || !['headers_received', 'body_parsed'].includes(phase)) return;
          const field = phase === 'headers_received' ? 'headersMs' : 'bodyMs';
          const elapsed = roundedElapsedMs(providerStartedAt, clock.performance.now());
          if (elapsed !== null && phases[field] === undefined) phases[field] = elapsed;
        } catch { /* Timing callbacks cannot change the provider outcome. */ }
      };
      const logTiming = outcome => {
        try {
          const batchIndex = Number.isSafeInteger(claim.batchIndex)
            && claim.batchIndex >= 0 && claim.batchIndex < 20 ? claim.batchIndex : null;
          const selected = batchIndex === null ? 'unknown' : providerNameForBatch(batchIndex);
          const providerToFinishMs = roundedElapsedMs(providerStartedAt, clock.performance.now());
          log?.warn?.(JSON.stringify({ event: 'weekly_draft_provider_timing',
            provider: SAFE_PROVIDERS.has(selected) ? selected : 'unknown', batchIndex, outcome,
            ...(providerStartMs === null ? {} : { providerStartMs }), ...phases,
            ...(providerToFinishMs === null ? {} : { providerToFinishMs }) }));
        } catch { /* Timing diagnostics cannot change the job outcome. */ }
      };
      const deadlineTimer = clock.setTimeout(() => interrupt('timeout'), deadlineMs);
      const statusTimer = clock.setInterval(async () => {
        if (!pending || polling) return;
        polling = true;
        try {
          const current = await jobAdapter.workerStatus(jobId);
          if (current.status === 'CANCELED') interrupt('canceled');
          else if (current.status !== 'RUNNING' || current.cancelRequested !== false) interrupt('stale');
        } catch {
          // An unconfirmed status cannot authorize a checkpoint or another call.
          interrupt('unconfirmed');
        } finally {
          polling = false;
        }
      }, statusPollMs);

      let outcome;
      try {
        const call = (async () => providerBatch(prompt, {
          batchIndex: claim.batchIndex, signal: controller.signal,
          maxOutputTokens: 8192, responseSchema: RESPONSE_SCHEMA, onTiming: noteTiming,
        }))().then(raw => ({ kind: 'response', raw }), error => ({ kind: 'provider_error', error }));
        outcome = await Promise.race([call, interrupted]);
      } finally {
        pending = false;
        clock.clearTimeout(deadlineTimer);
        clock.clearInterval(statusTimer);
      }
      if (['canceled', 'stale', 'unconfirmed'].includes(outcome.kind))
        return { status: outcome.kind };

      let checkpoint = null;
      let category = null;
      let validationDiagnostic = null;
      let timeoutOrigin = null;
      if (outcome.kind === 'timeout') {
        category = 'timeout';
        timeoutOrigin = 'batch_deadline';
      }
      else if (outcome.kind === 'provider_error') {
        category = failureCategory(outcome.error);
        if (category === 'timeout') timeoutOrigin = 'provider_timeout';
        if (category === 'validation') validationDiagnostic = ['provider_request', 'provider_ai_response_invalid'];
      }
      else {
        const validationStartedAt = clock.performance.now();
        let stage = 'daily_parser';
        try {
          checkpoint = parseBatch(outcome.raw, claim.plan, source, BATCH_SIZE, batch);
          stage = 'same_day_duplicate_check';
          validateSameDayBatchQuestions(checkpoint.questions, priorQuestions, source.day);
        } catch (error) {
          if (error?.code !== 'AI_RESPONSE_INVALID') {
            logValidation(stage, stage === 'daily_parser'
              ? 'unexpected_parser_exception' : 'unexpected_duplicate_check_exception');
            throw error;
          }
          checkpoint = null;
          category = 'validation';
          const subreason = validationSubreason(error);
          validationDiagnostic = [stage, subreason, invalidStructureField(error),
            subreason === 'malformed_json' ? rawShape(outcome.raw) : undefined];
        }
        const validationMs = roundedElapsedMs(validationStartedAt, clock.performance.now());
        if (validationMs !== null) phases.validationMs = validationMs;
      }

      const current = await jobAdapter.workerStatus(jobId);
      if (current.status !== 'RUNNING' || current.cancelRequested !== false)
        return { status: current.status === 'CANCELED' ? 'canceled' : 'stale' };
      // A fresh reservation is permitted only after a confirmed rejection or
      // after our parser has inspected a returned batch. Transport uncertainty,
      // timeouts, truncation, and provider-side malformed bodies stay terminal.
      let confirmedReason = null;
      if (confirmedRetryEnabled && outcome.kind === 'response' && category === 'validation') {
        confirmedReason = 'invalid_output';
      } else if (confirmedRetryEnabled && outcome.kind === 'provider_error' && category === 'provider') {
        try {
          if (providerNameForBatch(claim.batchIndex) === 'groq'
            && outcome.error?.code === 'PROVIDER_REJECTED'
            && outcome.error?.httpStatus === 400
            && typeof outcome.error?.providerErrorCode === 'string'
            && /(?:^|\/)json_validate_failed(?:\/|$)/.test(outcome.error.providerErrorCode))
            confirmedReason = 'groq_json_validate_failed';
        } catch { /* A provider selection error cannot authorize recovery. */ }
      }
      const finishConfirmed = confirmedRetryEnabled && confirmedReason;
      const finishStartedAt = clock.performance.now();
      let finished;
      try {
        finished = finishConfirmed
          ? await jobAdapter.finishConfirmedFailure(jobId, claim.leaseToken, category, confirmedReason)
          : await jobAdapter.finishBatch(jobId, claim.leaseToken, checkpoint, category);
      }
      catch (error) {
        const elapsed = roundedElapsedMs(finishStartedAt, clock.performance.now());
        if (elapsed !== null) phases.finishRpcMs = elapsed;
        logTiming('finish_unconfirmed');
        throw error;
      }
      const finishRpcMs = roundedElapsedMs(finishStartedAt, clock.performance.now());
      if (finishRpcMs !== null) phases.finishRpcMs = finishRpcMs;
      if (finishConfirmed && finished === 'retry_queued') {
        logTiming('retry_queued');
        if (validationDiagnostic) logValidation(...validationDiagnostic);
        if (category === 'provider') logProviderFailure(outcome.error);
        return { status: 'retry_queued' };
      }
      if (finishConfirmed && finished === 'failed') {
        logTiming('failed');
        if (validationDiagnostic) logValidation(...validationDiagnostic);
        if (category === 'provider') logProviderFailure(outcome.error);
        return { status: 'failed', failureCategory: category };
      }
      if (finished !== true) {
        logTiming('finish_refused');
        return { status: 'stale' };
      }
      logTiming(category ? 'failed' : 'checkpointed');
      if (validationDiagnostic) logValidation(...validationDiagnostic);
      if (category === 'timeout') logTimeout(timeoutOrigin);
      if (category === 'provider') logProviderFailure(outcome.error);
      return category ? { status: 'failed', failureCategory: category }
        : { status: 'checkpointed', batchIndex: claim.batchIndex };
    },
  });
}