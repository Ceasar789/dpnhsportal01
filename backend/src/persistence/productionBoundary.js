import { UNAVAILABLE } from '../../../shared/trustedPersistence/contracts.js';
// Server-owned gate. No env/client flag can activate an unapproved adapter.
// Remains unavailable even if a caller asks to enable it. No SDK is imported.
export function createProductionPersistence() {
  return Object.freeze({ enabled: false, durable: false, execute: async () => ({ ...UNAVAILABLE }) });
}
// Express-compatible future seam. Intentionally NOT mounted in app.js.
// Enabled service construction must inject verified session + atomic repository.
export function createPersistenceHandler(service = createProductionPersistence()) {
  return async (req, res) => {
    const header = req.get('authorization') || '';
    const credential = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    const result = await service.execute(req.params.operation, credential, req.body);
    const status = result.ok ? 200 : result.code === 'integration_blocked' ? 503 :
      result.code === 'not_authenticated' ? 401 : result.code === 'not_found' ? 404 :
        ['revision_conflict', 'idempotency_conflict'].includes(result.code) ? 409 : 422;
    return res.status(status).json(result);
  };
}
