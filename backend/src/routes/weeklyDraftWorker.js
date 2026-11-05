import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';

const SUCCESS_STATUSES = new Set(['idle', 'no_claim', 'canceled', 'stale',
  'not_dispatched', 'failed', 'checkpointed', 'retry_queued',
  'completed', 'not_completed']);

export function createWeeklyDraftWorkerRouter({ coordinator, workerSecret,
  clock = globalThis.performance } = {}) {
  if (typeof coordinator?.runOnce !== 'function'
    || typeof workerSecret !== 'string' || !workerSecret
    || /\s/.test(workerSecret) || Buffer.byteLength(workerSecret, 'utf8') > 1024) {
    throw new TypeError('A worker coordinator and nonempty bearer secret are required.');
  }

  const expected = createHash('sha256').update(workerSecret, 'utf8').digest();
  const router = Router();
  router.get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let invocationStartedAt;
    try { invocationStartedAt = clock?.now?.(); }
    catch { /* Authenticate first, then fail closed without revealing clock details. */ }
    const header = req.get('authorization');
    const match = typeof header === 'string' ? /^Bearer ([^\s]+)$/.exec(header) : null;
    const supplied = match ? createHash('sha256').update(match[1], 'utf8').digest() : null;
    if (!supplied || !timingSafeEqual(supplied, expected)) {
      return res.status(401).json({ status: 'unauthorized' });
    }

    if (!Number.isFinite(invocationStartedAt) || invocationStartedAt < 0)
      return res.status(503).json({ status: 'error' });
    try {
      const outcome = await coordinator.runOnce(invocationStartedAt);
      if (!SUCCESS_STATUSES.has(outcome?.status)) {
        return res.status(503).json({ status: 'error' });
      }
      return res.status(200).json({ status: outcome.status });
    } catch {
      return res.status(503).json({ status: 'error' });
    }
  });
  return router;
}
