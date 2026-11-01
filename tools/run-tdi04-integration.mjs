import { assertDisposableCandidate, IsolationError } from './tdi04/isolationGuard.mjs';

// Review-only CLI. No Supabase, PostgreSQL, HTTP, or test adapter is imported.
// Future execution requires separately approved independent verifiers and an
// isolated test adapter; this file cannot perform database operations.
const candidate = process.env.TDI04_TEST_TARGET_KIND === 'local' ? {
  kind: 'local', localInstanceId: process.env.TDI04_TEST_LOCAL_INSTANCE_ID,
  apiUrl: process.env.TDI04_TEST_API_URL,
  syntheticMarker: process.env.TDI04_TEST_SYNTHETIC_MARKER,
  ownerAttestedDisposable: process.env.TDI04_TEST_OWNER_ATTESTED === 'true',
} : {
  projectRef: process.env.TDI04_TEST_PROJECT_REF,
  apiUrl: process.env.TDI04_TEST_API_URL,
  syntheticMarker: process.env.TDI04_TEST_SYNTHETIC_MARKER,
  ownerAttestedDisposable: process.env.TDI04_TEST_OWNER_ATTESTED === 'true',
};
try {
  assertDisposableCandidate(candidate, process.env);
  process.stderr.write('BLOCKED: candidate passed local screening, but independent project and synthetic-marker verification are not installed. No database operation started.\n');
} catch (error) {
  const code = error instanceof IsolationError ? error.code : 'preflight_failed';
  process.stderr.write(`BLOCKED: ${code}. No database operation started.\n`);
}
process.exitCode = 1;
