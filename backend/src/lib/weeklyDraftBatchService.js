import { buildWeeklyWorksheetPrompt, parseDailyBatch, RESPONSE_SCHEMA,
  validateSameDayBatchQuestions, validateWeeklySources } from './weeklyWorksheetGenerator.js';

const BATCH_SIZE = 10;
const DEFAULT_DEADLINE_MS = 85_000;
const DEFAULT_POLL_MS = 2_000;
const LEASE_MS = 110_000;
const FUNCTION_MS = 120_000;
const CHECKPOINT_MARGIN_MS = 15_000;

const failureCategory = error => error?.code === 'AI_RESPONSE_INVALID' ? 'validation'
  : error?.code === 'PROVIDER_TIMEOUT' ? 'timeout'
    : ['PROVIDER_RATE_LIMIT', 'PROVIDER_OVERLOADED'].includes(error?.code) ? 'capacity'
      : 'provider';

export function createWeeklyDraftBatchService({ jobAdapter, providerBatch,
  deadlineMs = DEFAULT_DEADLINE_MS, statusPollMs = DEFAULT_POLL_MS, clock = globalThis } = {}) {
  if (typeof jobAdapter?.claim !== 'function' || typeof jobAdapter?.workerStatus !== 'function'
    || typeof jobAdapter?.reserveDispatch !== 'function' || typeof jobAdapter?.finishBatch !== 'function'
    || typeof providerBatch !== 'function' || !Number.isSafeInteger(deadlineMs)
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
          maxOutputTokens: 8192, responseSchema: RESPONSE_SCHEMA,
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
      if (outcome.kind === 'timeout') category = 'timeout';
      else if (outcome.kind === 'provider_error') category = failureCategory(outcome.error);
      else {
        try {
          checkpoint = parseDailyBatch(outcome.raw, claim.plan, source, BATCH_SIZE, batch);
          validateSameDayBatchQuestions(checkpoint.questions, priorQuestions, source.day);
        } catch (error) {
          if (error?.code !== 'AI_RESPONSE_INVALID') throw error;
          checkpoint = null;
          category = 'validation';
        }
      }

      const current = await jobAdapter.workerStatus(jobId);
      if (current.status !== 'RUNNING' || current.cancelRequested !== false)
        return { status: current.status === 'CANCELED' ? 'canceled' : 'stale' };
      const finished = await jobAdapter.finishBatch(jobId, claim.leaseToken, checkpoint, category);
      if (finished !== true) return { status: 'stale' };
      return category ? { status: 'failed', failureCategory: category }
        : { status: 'checkpointed', batchIndex: claim.batchIndex };
    },
  });
}
