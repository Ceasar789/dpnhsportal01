// One scheduled tick handles one discovery hint. The batch and assembly
// services, not this coordinator, own the authoritative job transitions.
const BATCH_STATUSES = new Set(['no_claim', 'canceled', 'stale', 'not_dispatched',
  'unconfirmed', 'timeout', 'failed', 'checkpointed', 'retry_queued']);
const ASSEMBLY_STATUSES = new Set(['completed', 'not_completed']);
const ACTIONS = new Set(['claim', 'recover', 'assemble']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createWeeklyDraftWorkerCoordinator({ jobAdapter, batchService,
  assemblyService } = {}) {
  if (typeof jobAdapter?.discoverWork !== 'function'
    || typeof batchService?.processOneBatch !== 'function'
    || typeof assemblyService?.assemble !== 'function') {
    throw new TypeError('Discovery, batch, and assembly operations are required.');
  }

  return Object.freeze({
    async runOnce(invocationStartedAt) {
      let now;
      try { now = globalThis.performance?.now?.(); }
      catch { return { status: 'error' }; }
      if (!Number.isFinite(now) || !Number.isFinite(invocationStartedAt)
        || invocationStartedAt < 0 || invocationStartedAt > now)
        return { status: 'error' };
      try {
        const work = await jobAdapter.discoverWork();
        if (work === null) return { status: 'idle' };
        if (!work || typeof work !== 'object' || Array.isArray(work)
          || Object.keys(work).sort().join('|') !== 'action|jobId'
          || typeof work.jobId !== 'string' || !UUID.test(work.jobId)
          || !ACTIONS.has(work.action)) return { status: 'error' };

        const assembling = work.action === 'assemble';
        const outcome = assembling
          ? await assemblyService.assemble(work.jobId)
          : await batchService.processOneBatch(work.jobId, invocationStartedAt);
        const allowed = assembling ? ASSEMBLY_STATUSES : BATCH_STATUSES;
        return allowed.has(outcome?.status) ? { status: outcome.status } : { status: 'error' };
      } catch {
        // Never return raw RPC/provider errors or private batch/checkpoint data.
        return { status: 'error' };
      }
    },
  });
}
