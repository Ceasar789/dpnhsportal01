import { describe, it, expect, vi } from 'vitest';
// Import the real application composition, replacing unrelated live services.
vi.mock('../../../../../../backend/src/routes/ai.js', () => ({ default: (_req, _res, next) => next() }));
vi.mock('../../../../../../backend/src/routes/onboarding.js', () => ({
  adminUsersRouter: (_req, _res, next) => next(), onboardingRouter: (_req, _res, next) => next(),
}));
import { createApp } from '../../../../../../backend/src/app.js';
import { OPERATIONS } from '../../../../../../backend/src/persistence/trustedPersistence.js';
describe('production route composition', () => {
  it('does not mount a trusted persistence writer', () => {
    const app = createApp();
    const mounted = app._router.stack.filter(layer => layer.name !== 'query' && layer.name !== 'expressInit');
    // The local AI HTML route has its own default-off gate; the generic persistence writer remains unmounted.
    expect(mounted.filter(layer => layer.regexp?.toString().includes('persistence'))).toHaveLength(0);
    expect(mounted.filter(layer => layer.route).map(layer => layer.route.path)).toEqual(['/health', '/api/health']);
    for (const operation of OPERATIONS) {
      const path = `/api/persistence/${operation}`;
      expect(mounted.filter(layer => !layer.regexp?.fast_slash && layer.match(path))).toHaveLength(0);
    }
  });
});
