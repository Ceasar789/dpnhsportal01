import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';

const safeCodes = new Set(['not_authenticated', 'not_found', 'source_denied', 'source_changed',
  'invalid_request', 'invalid_state', 'invalid_document', 'idempotency_conflict',
  'revision_conflict', 'resume_unavailable', 'assessed_record_protected',
  'integration_blocked']);
const unavailable = { code: 'GENERATION_WORKER_DISABLED',
  error: 'Durable Worksheet generation is not available yet. No Worksheets were saved.' };
const statusFor = code => code === 'not_authenticated' ? 401 : code === 'not_found' ? 404
  : ['revision_conflict', 'idempotency_conflict', 'source_changed', 'invalid_state',
    'resume_unavailable', 'assessed_record_protected'].includes(code) ? 409
    : code === 'integration_blocked' ? 503 : 422;

export function createWeeklyJobRouter({ enabled = false, service, authenticate = requireAuth(['teacher']) } = {}) {
  const router = Router();
  router.use((req, res, next) => enabled && service ? next() : res.status(503).json(unavailable));
  router.use(authenticate);
  const action = fn => async (req, res) => {
    try { return res.status(200).json(await fn(req)); }
    catch (error) {
      const code = safeCodes.has(error?.code) ? error.code : 'job_unavailable';
      return res.status(statusFor(code)).json({ code, error: code === 'job_unavailable'
        ? 'The Worksheet job service is unavailable. Check backend status.' : code.replaceAll('_', ' ') });
    }
  };
  const actor = req => ({ id: req.user.id, role: 'teacher', status: 'active', verified: true });
  router.post('/', action(req => service.submit(actor(req), {
    requestId: req.body?.requestId, sourceLessonPlanId: req.body?.sourceLessonPlanId,
    questionCount: req.body?.questionCount,
  })));
  router.get('/', action(req => service.listJobs(actor(req))));
  router.get('/collections', action(req => service.listCollections(actor(req))));
  router.get('/collections/:collectionId', action(req => service.openCollection(actor(req), req.params.collectionId)));
  router.get('/collections/:collectionId/days/:worksheetId', action(async req => {
    const collection = await service.openCollection(actor(req), req.params.collectionId);
    const worksheet = collection.worksheets.find(item => item.id === req.params.worksheetId);
    if (!worksheet) throw Object.assign(new Error('not_found'), { code: 'not_found' });
    return worksheet;
  }));
  router.patch('/collections/:collectionId/days/:worksheetId', action(req => {
    if (req.body?.worksheet?.id !== req.params.worksheetId)
      throw Object.assign(new Error('invalid_document'), { code: 'invalid_document' });
    return service.updateDaily(actor(req), req.params.collectionId,
      req.body.worksheet, req.body.expectedRevision);
  }));
  router.post('/collections/:collectionId/archive', action(req => service.changeArchive(actor(req),
    req.params.collectionId, req.body || {})));
  router.delete('/collections/:collectionId', action(req => service.deleteEligibleDraft(actor(req),
    req.params.collectionId, req.body?.expectedRevision)));
  router.post('/:jobId/cancel', action(req => service.cancel(actor(req), req.params.jobId)));
  router.post('/:jobId/resume', action(req => service.resume(actor(req), req.params.jobId)));
  router.get('/:jobId', action(req => service.status(actor(req), req.params.jobId)));
  return router;
}
