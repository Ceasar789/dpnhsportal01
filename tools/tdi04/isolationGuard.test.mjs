import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertDisposableCandidate, withVerifiedDisposableTarget, PRODUCTION_PROJECT_REF } from './isolationGuard.mjs';
import { runApprovedIntegration } from './integrationHarness.mjs';

const ref = 'abcdefghijklmnopqrst';
const marker = 'synthetic-test-marker-1234567890';
const candidate = () => ({ projectRef: ref, apiUrl: `https://${ref}.supabase.co`, syntheticMarker: marker, ownerAttestedDisposable: true });
const verifyProject = async target => ({ projectRef: target.projectRef, apiUrl: target.apiUrl });
const verifyMarker = async target => ({ projectRef: target.projectRef, marker });
const expectCode = (value, code) => assert.throws(() => assertDisposableCandidate(value), error => error.code === code);

test('requires an independently named hosted test project, never the production ref', () => {
  expectCode({ ...candidate(), projectRef: '' }, 'missing_test_project_identity');
  expectCode({ ...candidate(), projectRef: PRODUCTION_PROJECT_REF, apiUrl: `https://${PRODUCTION_PROJECT_REF}.supabase.co` }, 'production_project_forbidden');
  const withDigits = { ...candidate(), projectRef: 'abcdefghij0123456789', apiUrl: 'https://abcdefghij0123456789.supabase.co' };
  assert.equal(assertDisposableCandidate(withDigits).projectRef, withDigits.projectRef);
});
test('requires canonical HTTPS host matching the independent reference', () => {
  for (const apiUrl of [`https://${PRODUCTION_PROJECT_REF}.supabase.co`, `http://${ref}.supabase.co`,
    `https://${ref}.supabase.co.evil.test`, `https://${ref}.supabase.co:8443`,
    `https://${ref}.supabase.co/other`, `https://user:pass@${ref}.supabase.co`]) {
    expectCode({ ...candidate(), apiUrl }, 'unverified_connection_url');
  }
});
test('requires explicit disposable attestation and a bounded synthetic marker', () => {
  expectCode({ ...candidate(), ownerAttestedDisposable: false }, 'missing_owner_attestation');
  expectCode({ ...candidate(), syntheticMarker: '' }, 'missing_synthetic_marker');
  expectCode({ ...candidate(), syntheticMarker: 'short' }, 'missing_synthetic_marker');
});
test('rejects inherited production and ambiguous connection configuration without reading values', () => {
  for (const key of ['DATABASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'PGHOST']) {
    assert.throws(() => assertDisposableCandidate(candidate(), { [key]: 'never displayed' }), error => error.code === 'unsafe_environment');
  }
  expectCode({ ...candidate(), databaseUrl: 'unreviewed' }, 'unsafe_configuration');
});
test('never runs tests when independent verifiers are absent or disagree', async () => {
  let invoked = false;
  const run = () => { invoked = true; };
  const cases = [
    [{ run }, 'verification_adapter_unavailable'],
    [{ verifyProject: async () => ({ projectRef: PRODUCTION_PROJECT_REF, apiUrl: candidate().apiUrl }), verifyMarker, run }, 'project_identity_unverified'],
    [{ verifyProject, verifyMarker: async () => ({ projectRef: ref, marker: 'wrong-marker-1234567890123456' }), run }, 'synthetic_marker_unverified'],
    [{ verifyProject: async () => { throw new Error('secret details'); }, verifyMarker, run }, 'project_identity_unverified'],
  ];
  for (const [adapters, code] of cases) await assert.rejects(withVerifiedDisposableTarget(candidate(), {}, adapters), error => error.code === code && !error.message.includes('secret details'));
  assert.equal(invoked, false);
});
test('runs only after both independent observations match the screened target', async () => {
  const events = [];
  const value = await withVerifiedDisposableTarget(candidate(), {}, {
    verifyProject: async target => { events.push('identity'); return verifyProject(target); },
    verifyMarker: async target => { events.push('marker'); return verifyMarker(target); },
    run: target => { events.push('operation'); return { ...target }; },
  });
  assert.deepEqual(events, ['identity', 'marker', 'operation']);
  assert.deepEqual(value, { projectRef: ref, apiUrl: candidate().apiUrl });
});
test('review-only integration CLI exits blocked without a database adapter', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const result = spawnSync(process.execPath, ['tools/run-tdi04-integration.mjs'], {
    cwd: root, encoding: 'utf8', env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BLOCKED: missing_owner_attestation/);
  assert.match(result.stderr, /No database operation started/);
});

test('local-first target requires exact loopback endpoint and independently observed instance', async () => {
  const local = { kind: 'local', localInstanceId: 'synthetic-local-instance-12345',
    apiUrl: 'http://127.0.0.1:54321', syntheticMarker: marker, ownerAttestedDisposable: true };
  assert.equal(assertDisposableCandidate(local).kind, 'local');
  for (const apiUrl of ['http://localhost:54321', 'http://127.0.0.1:54322',
    'http://127.0.0.1:54321/other', `https://${PRODUCTION_PROJECT_REF}.supabase.co`]) {
    expectCode({ ...local, apiUrl }, 'unverified_connection_url');
  }
  let connected = false;
  await assert.rejects(runApprovedIntegration(local, {}, {
    verifyProject: async () => ({ localInstanceId: 'another-local-instance-12345', apiUrl: local.apiUrl }),
    verifyMarker: async () => ({ localInstanceId: local.localInstanceId, marker }),
    connect: async () => { connected = true; }, runCases: async () => {},
  }), error => error.code === 'project_identity_unverified');
  assert.equal(connected, false);
});

test('integration client construction is sequenced after both independent checks', async () => {
  const events = [];
  const value = await runApprovedIntegration(candidate(), {}, {
    verifyProject: async target => { events.push('identity'); return verifyProject(target); },
    verifyMarker: async target => { events.push('marker'); return verifyMarker(target); },
    connect: async () => { events.push('connect'); return { synthetic: true }; },
    runCases: async driver => { events.push('cases'); return driver.synthetic; },
  });
  assert.equal(value, true);
  assert.deepEqual(events, ['identity', 'marker', 'connect', 'cases']);
  await assert.rejects(runApprovedIntegration(candidate(), {}, {}), /integration_adapter_unavailable/);
});
