import { withVerifiedDisposableTarget } from './isolationGuard.mjs';

// This module imports no database or HTTP client. Future approved adapters
// must obtain independent server identity, then the synthetic marker, before
// connect() can construct a client or run fixtures. No default adapters exist.
export async function runApprovedIntegration(candidate, environment,
  { verifyProject, verifyMarker, connect, runCases } = {}) {
  if (typeof connect !== 'function' || typeof runCases !== 'function')
    throw new Error('integration_adapter_unavailable');
  return withVerifiedDisposableTarget(candidate, environment, {
    verifyProject,
    verifyMarker,
    run: async target => {
      const driver = await connect(target);
      return runCases(driver);
    },
  });
}
