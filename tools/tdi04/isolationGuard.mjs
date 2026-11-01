// TDI-04A preparation only. No database client, network transport, or secret
// loader is imported. A future approved runner must provide independent
// metadata and synthetic-marker verifiers before supplying any test operation.
export const PRODUCTION_PROJECT_REF = 'jllstakxiamxiycnwrbd';

export class IsolationError extends Error {
  constructor(code) { super(code); this.name = 'IsolationError'; this.code = code; }
}
const deny = code => { throw new IsolationError(code); };
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const forbiddenEnvironment = new Set([
  'SUPABASE_URL', 'SUPABASE_PROJECT_REF', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'DATABASE_URL', 'PGHOST', 'PGPORT',
  'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'GEMINI_API_KEY', 'OPENAI_API_KEY',
]);

export function assertDisposableCandidate(candidate, environment = {}) {
  if (!isRecord(candidate) || !isRecord(environment)) deny('unsafe_configuration');
  const local = candidate.kind === 'local';
  const keys = local ? ['kind', 'apiUrl', 'localInstanceId', 'ownerAttestedDisposable', 'syntheticMarker'] :
    ['apiUrl', 'ownerAttestedDisposable', 'projectRef', 'syntheticMarker'];
  if (Object.keys(candidate).sort().join('|') !== keys.sort().join('|')) deny('unsafe_configuration');
  if (Object.keys(environment).some(key => forbiddenEnvironment.has(key.toUpperCase()))) deny('unsafe_environment');
  if (candidate.ownerAttestedDisposable !== true) deny('missing_owner_attestation');
  if (typeof candidate.syntheticMarker !== 'string' || !/^[A-Za-z0-9_-]{24,128}$/.test(candidate.syntheticMarker)) deny('missing_synthetic_marker');
  if (local) {
    if (typeof candidate.localInstanceId !== 'string' ||
      !/^[A-Za-z0-9_-]{24,128}$/.test(candidate.localInstanceId)) deny('missing_test_project_identity');
    if (candidate.apiUrl !== 'http://127.0.0.1:54321') deny('unverified_connection_url');
    return Object.freeze({ kind: 'local', localInstanceId: candidate.localInstanceId, apiUrl: candidate.apiUrl });
  }
  if (typeof candidate.projectRef !== 'string' || !/^[a-z0-9]{20}$/.test(candidate.projectRef)) deny('missing_test_project_identity');
  if (candidate.projectRef === PRODUCTION_PROJECT_REF) deny('production_project_forbidden');
  let url;
  try { url = new URL(candidate.apiUrl); } catch { deny('unverified_connection_url'); }
  if (url.protocol !== 'https:' || url.hostname !== `${candidate.projectRef}.supabase.co` ||
    url.origin !== `https://${candidate.projectRef}.supabase.co` || url.pathname !== '/' ||
    url.search || url.hash || url.username || url.password || url.port) deny('unverified_connection_url');
  return Object.freeze({ projectRef: candidate.projectRef, apiUrl: url.origin });
}

/**
 * Future test-only sequencing seam. The trusted caller supplies independently
 * implemented metadata and synthetic-marker readers AFTER separate approval.
 * The test operation is never reached unless both readers agree with the
 * locally screened project. A self-declared project name or marker is not proof.
 */
export async function withVerifiedDisposableTarget(candidate, environment, { verifyProject, verifyMarker, run } = {}) {
  const target = assertDisposableCandidate(candidate, environment);
  if (![verifyProject, verifyMarker, run].every(fn => typeof fn === 'function')) deny('verification_adapter_unavailable');
  let identity;
  try { identity = await verifyProject(target); } catch { deny('project_identity_unverified'); }
  if (!isRecord(identity) || identity.apiUrl !== target.apiUrl ||
    (target.kind === 'local' ? identity.localInstanceId !== target.localInstanceId :
      identity.projectRef !== target.projectRef)) deny('project_identity_unverified');
  let sentinel;
  try { sentinel = await verifyMarker(target); } catch { deny('synthetic_marker_unverified'); }
  if (!isRecord(sentinel) || sentinel.marker !== candidate.syntheticMarker ||
    (target.kind === 'local' ? sentinel.localInstanceId !== target.localInstanceId :
      sentinel.projectRef !== target.projectRef)) deny('synthetic_marker_unverified');
  return run(target);
}
