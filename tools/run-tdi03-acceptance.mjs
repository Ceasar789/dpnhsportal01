import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, totals, verdict } from './tdi03/results.mjs';

// Reuses the Teacher runner's unit scope, browser configurations/specs and build.
// No npm/npx install fallback, backend server, migrations or production client.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const artifacts = join(root, 'test-results', `tdi03-${runId}`);
const rel = path => relative(root, path).replaceAll('\\', '/');
const tasks = [
  { id: 'gate-tests', format: 'node', args: ['--test', '--test-reporter=./tools/tdi03/node-reporter.mjs', 'tools/tdi03/results.test.mjs'] },
  { id: 'persistence', format: 'node', args: ['--test', '--test-reporter=./tools/tdi03/node-reporter.mjs', 'backend/src/persistence/trustedPersistence.test.js'] },
  { id: 'generation', format: 'node', args: ['--test', '--test-reporter=./tools/tdi03/node-reporter.mjs', 'backend/src/lib/worksheetGenerator.test.js'] },
  { id: 'teacher', format: 'vitest', cwd: 'frontend', args: ['../node_modules/vitest/vitest.mjs', 'run', 'src/pages/dashboards/teacher', '--maxWorkers=2', '--minWorkers=1', '--reporter=json', `--outputFile=${join(artifacts, 'teacher.json')}`] },
  ...['profile', 'worksheet', 'ilaw'].map(id => ({ id, format: 'playwright', args: ['node_modules/@playwright/test/cli.js', 'test', '--config=tools/tdi03/playwright.config.mjs', `--output=${join(artifacts, id)}`] })),
  { id: 'build', args: ['../node_modules/vite/bin/vite.js', 'build'], cwd: 'frontend' },
  { id: 'lint', args: ['node_modules/eslint/bin/eslint.js', 'tools/run-tdi03-acceptance.mjs', 'tools/tdi03/*.mjs', 'frontend/src/pages/dashboards/teacher/persistence/productionRoutes.test.js'] },
];
if (process.argv.includes('--list')) {
  tasks.forEach(t => console.log(`${t.id}: node ${t.args.join(' ')} (cwd ${t.cwd || '.'})`));
  process.exit(0);
}
if (process.argv.length > 2) throw new Error('Usage: node tools/run-tdi03-acceptance.mjs [--list]');
mkdirSync(artifacts, { recursive: true });
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SystemRoot|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|ProgramFiles|ProgramFiles\(x86\)|CI)$/i.test(key)));
Object.assign(environment, {
  NODE_OPTIONS: `--require="${join(root, 'tools/tdi03/network-guard.cjs').replaceAll('\\', '/')}"`,
  TDI03_NETWORK_LOG: join(artifacts, 'network-violations.log'),
  VITE_SUPABASE_URL: 'https://profile-e2e.supabase.invalid', VITE_SUPABASE_ANON_KEY: 'profile-e2e-anon-key',
  NO_COLOR: '1', WORKSHEET_VQA_PORT: '4182',
});
function execute(command, args, options = {}) {
  return new Promise(resolveResult => {
    const child = spawn(command, args, { cwd: root, env: environment, ...options, shell: false });
    let stdout = '', stderr = '', error = null;
    child.stdout?.on('data', data => { stdout += data; });
    child.stderr?.on('data', data => { stderr += data; });
    child.on('error', value => { error = value.message; });
    child.on('close', code => resolveResult({ code, error, stdout, stderr }));
  });
}
const git = async (...args) => {
  const result = await execute('git', args);
  if (result.code !== 0) throw new Error(`Git baseline unavailable: ${result.error || result.stderr}`);
  return result.stdout.trim();
};
const suites = [];
let baseline = {}, safetyError = '';
try {
  baseline = { branch: await git('branch', '--show-current'), head: await git('rev-parse', 'HEAD'), status: await git('status', '--short') };
  if (baseline.branch !== 'ux-overhaul') throw new Error('Expected ux-overhaul; no tests started');
  // Fail closed if the reviewed interception/proxy setup has been removed.
  for (const [file, markers] of [
    ['frontend/vite.config.js', ["'profile-e2e'", '? undefined :']],
    ['e2e/profile-mock-fixture.js', ["page.route('**/*'", "route.abort('blockedbyclient')", 'profile-e2e.supabase.invalid']],
    ['e2e/ilaw-preview.spec.js', ["page.route('**/*'", "route.abort('blockedbyclient')"]],
    ['e2e/mps-mock-preview.spec.js', ["page.route('**/*'", "route.abort('blockedbyclient')"]],
    ['e2e/worksheet-draft-preview.spec.js', ["page.route('**/*'", "route.abort('blockedbyclient')"]],
    ['frontend/worksheet-draft-preview.vite.config.js', ['envDir: false', 'proxy: undefined']],
    ['frontend/ilaw-preview.vite.config.js', ['envDir: false', 'proxy: undefined']],
  ]) {
    const source = readFileSync(join(root, file), 'utf8');
    if (markers.some(marker => !source.includes(marker))) throw new Error(`Isolation requires review: ${file}`);
  }
} catch (error) { safetyError = error.message; }

for (const task of tasks) {
  if (safetyError) { suites.push({ id: task.id, status: 'BLOCKED', tests: [], error: safetyError }); continue; }
  console.log(`[${task.id}] node ${task.args.join(' ')}`);
  const heartbeat = setInterval(() => console.log(`[${task.id}] still running`), 30000);
  const started = Date.now();
  const result = await execute(process.execPath, task.args, { cwd: join(root, task.cwd || '.'), env: { ...environment, TDI03_BROWSER_SUITE: task.id } });
  clearInterval(heartbeat);
  const log = join(artifacts, `${task.id}.log`);
  writeFileSync(log, `${result.stdout}\n${result.stderr}`);
  let tests = [], parseError = '';
  try {
    if (task.format) {
      const raw = task.format === 'vitest' ? readFileSync(join(artifacts, 'teacher.json'), 'utf8') : result.stdout;
      writeFileSync(join(artifacts, `${task.id}.json`), raw);
      const data = JSON.parse(raw);
      if (task.format === 'node') tests = data.tests;
      if (task.format === 'vitest') tests = data.testResults.flatMap(file => file.assertionResults.map(t => ({ file: file.name, name: t.fullName, status: t.status === 'pending' ? 'todo' : t.status })));
      if (task.format === 'playwright') {
        const walk = suite => [
          ...(suite.specs || []).flatMap(spec => spec.tests.map(t => ({ file: spec.file, name: spec.title,
            status: t.status === 'skipped' ? 'skipped' : t.status === 'expected' && t.results.every(r => r.status === 'passed') ? 'passed' : 'failed' }))),
          ...(suite.suites || []).flatMap(walk),
        ];
        tests = data.suites.flatMap(walk);
        if (data.errors?.length) throw new Error('Browser runner reported global errors');
      }
      if (!Array.isArray(tests) || !tests.length) throw new Error('No executed test evidence');
    }
  } catch (error) { parseError = error.message; }
  const knownTodos = [
    'deployed grants and effective RLS deny direct authenticated lesson_plans INSERT and UPDATE bypass',
    'authenticated database role invokes restricted SECURITY DEFINER Manual RPC with server-derived identity, assignment, and Manila year',
    'database Manual RPC rejects forged payloads and enforces private transitions under actual role privileges',
    'database AI/HTML RPC preserves AI Save, update, and legacy reopen without a client flag bypass',
    'database transactions serialize same-ID updates and durably reconcile duplicate or ambiguous requests',
    'database Manual Draft and Save make no Post, distribution, or notification writes',
  ];
  const unexpectedOmissions = tests.filter(t => ['skipped', 'todo'].includes(t.status) && !(
    task.id === 'teacher' && t.status === 'todo' && /mps1d0SecurityContract\.test\.js$/.test(t.file) && knownTodos.some(name => t.name.endsWith(name)) ||
    task.id === 'profile' && t.status === 'skipped' && /^retired (QC5|QC6|active Quick Create|Quick Create manual draft guard)/.test(t.name)
  ));
  if (unexpectedOmissions.length) parseError = `Unapproved skipped/TODO evidence: ${unexpectedOmissions.map(t => t.name).join('; ')}`;
  const requiredBrowserFiles = { profile: ['profile-browser.spec.js', 'profile-isolation.spec.js', 'teacher-worksheet-scores.spec.js'],
    worksheet: ['worksheet-draft-preview.spec.js'], ilaw: ['ilaw-preview.spec.js', 'mps-mock-preview.spec.js'] };
  if (requiredBrowserFiles[task.id]?.some(file => !tests.some(t => t.file?.endsWith(file) && t.status === 'passed'))) {
    parseError = 'A required browser spec has no executed passing assertion';
  }
  const assertionFailed = tests.some(t => t.status === 'failed');
  const status = result.error || parseError && !assertionFailed ? 'BLOCKED'
    : result.code !== 0 || assertionFailed ? 'FAIL' : 'PASS';
  suites.push({ id: task.id, status, command: `node ${task.args.join(' ')}`, cwd: task.cwd || '.', exitCode: result.code,
    error: result.error || parseError, durationMs: Date.now() - started, log: rel(log), tests, counts: totals(tests) });
  console.log(`[${task.id}] ${status} ${JSON.stringify(totals(tests))}`);
  if (existsSync(environment.TDI03_NETWORK_LOG)) safetyError = 'Network guard intercepted an unapproved connection; remaining checks blocked';
}
const requirements = [
  ['AC-01', 'Manual ILAW', [['persistence', ['Manual draft', 'complete Manual validation', 'cross-owner reopen/update', 'unsupported Manual version']]]],
  ['AC-02', 'Worksheet private drafts', [['persistence', ['private empty worksheet', 'private partial worksheet', 'private no-key worksheet', 'projection preserves ordering', 'worksheet owner isolation']]]],
  ['AC-03', 'Official Settings year', [['persistence', ['Settings is authoritative', 'rejects wrong schoolYear']], ['teacher', ['preserves unfinished state without trusting owner/date flags']]]],
  ['AC-04', 'Teaching-load authorization', [['persistence', ['Manual draft', 'denies inactive', 'denies archived', 'rejects wrong subjectId', 'rejects wrong gradeLevel', 'rejects wrong schoolYear', 'adviser-only', 'forged owner', 'cross-owner reopen/update']]]],
  ['AC-05', 'Reliability', [['persistence', ['CreateIncompleteDraft: retries', 'CreatePrivateWorksheetDraft: retries', 'Manual draft', 'private partial worksheet']]]],
  ['AC-06', 'No automatic side effects', [['persistence', ['Manual draft', 'private empty worksheet', 'generation/distribution/publication']], ['generation', ['response parser creates no persistence or distribution fields', 'valid AI plan returns a private in-memory draft']]]],
  ['AC-07', 'Teacher regressions', [['teacher', ['@suite']], ['profile', ['@suite', 'blocks unexpected remote and local backend requests']], ['worksheet', ['@suite']], ['ilaw', ['@suite']]]],
  ['AC-08', 'Disabled production boundary', [['persistence', ['default server gate']], ['teacher', ['production port never calls network', 'rejects synthetic success', 'does not mount a trusted persistence writer']]]],
];
const criteria = requirements.map(([id, title, needs]) => ({ id, title, ...classify(suites, needs) }));
if (safetyError) suites.push({ id: 'safety', status: 'BLOCKED', tests: [], error: safetyError });
const localAcceptance = verdict(criteria, suites);
const report = {
  schemaVersion: 1, runId, runtime: { node: process.version, platform: process.platform }, baseline, localAcceptance, productionDurability: 'NOT VERIFIED', productionIntegration: 'BLOCKED',
  counts: totals(suites.flatMap(s => s.tests)), criteria, suites,
  productionBlockers: ['No approved durable database adapter or revision/idempotency receipts.', 'Deployed policies, grants, trusted identity and atomicity are not integration-tested.', 'No real distribution or production Storage verification.'],
  regressions: suites.filter(s => s.status !== 'PASS').map(s => ({ suite: s.id, status: s.status, attribution: 'Unclassified: do not assume pre-existing without baseline evidence.' })),
  existingLimitations: ['Existing database-security TODOs and retired browser skips are not passes.', 'Synthetic storage does not establish production durability.'],
  filesModified: ['tools/run-tdi03-acceptance.mjs', 'tools/tdi03/node-reporter.mjs', 'tools/tdi03/network-guard.cjs',
    'tools/tdi03/playwright.config.mjs', 'tools/tdi03/results.mjs', 'tools/tdi03/results.test.mjs',
    'frontend/src/pages/dashboards/teacher/persistence/productionRoutes.test.js', 'docs/tdi03-acceptance-report.md', 'docs/tdi03-acceptance-report.json'],
};
const rows = criteria.map(c => `| ${c.id} ${c.title} | ${c.status} | ${c.evidence.reduce((n, e) => n + e.tests.length, 0)} supporting matches (overlap allowed) | ${c.evidence.map(e => `${e.suite}: ${e.tests.join('; ') || `MISSING ${e.pattern}`}`).join('<br>')} | ${c.status === 'PASS' ? 'None locally' : 'See suite logs / missing evidence'} |`).join('\n');
const markdown = `# TDI-03 automated acceptance report\n\nRun: ${runId}\nBranch: ${baseline.branch || 'unknown'}; HEAD: ${baseline.head || 'unknown'}\n\nLOCAL ACCEPTANCE: **${localAcceptance}**\nPRODUCTION DURABILITY: **NOT VERIFIED**\nPRODUCTION INTEGRATION: **BLOCKED**\n\n| Criterion | Status | Tests | Evidence | Blocker |\n| --- | --- | --- | --- | --- |\n${rows}\n\n## Unique test totals\n\n${JSON.stringify(report.counts)}. Each suite executes once; criterion matches are not added to these totals. Focused frontend tests are included only in the Teacher run.\n\n## Commands and evidence\n\n${suites.map(s => `- ${s.id}: **${s.status}**; ${JSON.stringify(s.counts || {})}; cwd ${s.cwd || '.'}; \`${s.command || 'NOT EXECUTED'}\`; ${s.log ? `[log](../${s.log})` : s.error}.`).join('\n')}\n\n## Regressions and limitations\n\n${report.regressions.length ? JSON.stringify(report.regressions) : 'No new regressions or existing failures detected in executed suites.'}\n\n${report.existingLimitations.join(' ')} Skipped/TODO test names and all executed assertion names are recorded in the JSON report. Browser results cover the existing profile active-route, scores, isolation, worksheet preview and Manual ILAW suites. Build verifies module compatibility; it is not runtime database evidence.\n\n## Production blockers and next fixes\n\n${report.productionBlockers.map(s => `- ${s}`).join('\n')}\n\nResolve any local failures or missing evidence first. Database implementation and disposable integration tests require separate Owner approval. No local pass authorizes production activation.\n\n## Files modified by this task\n\n${report.filesModified.map(f => `- ${f}`).join('\n')}\n\n## Safety\n\nExisting Teacher runner/suites reused without replacing owner work. Node subprocess environment excludes inherited credentials; only synthetic Supabase settings are provided. External Node sockets are denied. Browser fixtures intercept remote traffic; an unreachable local proxy blocks unhandled external traffic. Service workers are blocked and test servers cannot reuse an unknown running server. No Supabase MCP, SQL, migrations, live database, Gemini, emails, Storage uploads, deployment, commit or push.\n\nRerun: \`node tools/run-tdi03-acceptance.mjs\`. Inspect commands: \`node tools/run-tdi03-acceptance.mjs --list\`. Exit 0 requires every local criterion and required suite to pass; expected production blockers are separate.\n`;
mkdirSync(join(root, 'docs'), { recursive: true });
for (const [extension, content] of [['md', markdown], ['json', JSON.stringify(report, null, 2)]]) {
  const path = join(root, `docs/tdi03-acceptance-report.${extension}`);
  if (existsSync(path)) copyFileSync(path, join(artifacts, `previous-report.${extension}`));
  writeFileSync(path, content);
  writeFileSync(join(artifacts, `report.${extension}`), content);
}
console.log(`LOCAL ACCEPTANCE: ${localAcceptance}; PRODUCTION DURABILITY: NOT VERIFIED\nReport: docs/tdi03-acceptance-report.md`);
process.exitCode = localAcceptance === 'PASS' ? 0 : 1;
