// One explicitly invoked unit. No timer, queue, or detached Promise is started.
export function createWeeklyJobWorker({ service, verifyWorker, workerId } = {}) {
  if (typeof service?.runStep !== 'function' || typeof verifyWorker !== 'function' || !workerId)
    throw new Error('integration_blocked');
  return Object.freeze({
    async run(jobId, credential) {
      if (await verifyWorker(credential) !== true) return { ok: false, code: 'worker_denied' };
      try {
        const result = await service.runStep(jobId, workerId);
        return result === false ? { ok: true, claimed: false } : { ok: true, claimed: true, job: result };
      } catch (error) {
        return { ok: false, code: ['revision_conflict', 'source_changed', 'invalid_state'].includes(error?.code)
          ? error.code : 'worker_step_failed' };
      }
    },
  });
}

export function createProductionWeeklyJobWorker() {
  return Object.freeze({ enabled: false, run: async () => ({ ok: false, code: 'integration_blocked' }) });
}
