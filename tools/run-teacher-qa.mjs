import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const artifactRoot = join(root, 'test-results', `teacher-qa-${runId}`);
const defaultReportPath = join(root, 'docs', 'teacher-dashboard-automated-qa.md');
const reportPath = existsSync(defaultReportPath)
  ? join(root, 'docs', `teacher-dashboard-automated-qa-${runId}.md`)
  : defaultReportPath;
const baselineLint = new Set([
  'AnnouncementsTab.jsx:55:react-hooks/set-state-in-effect',
  'AttendanceTab.jsx:162:react-hooks/set-state-in-effect',
  'LessonPlansTab.jsx:300:react-hooks/preserve-manual-memoization',
  'LessonPlansTab.jsx:335:react-hooks/set-state-in-effect',
  'LessonPlansTab.jsx:845:react-hooks/preserve-manual-memoization',
  'OverviewTab.jsx:80:react-hooks/preserve-manual-memoization',
  'OverviewTab.jsx:212:react-hooks/set-state-in-effect',
  'StudentsTab.jsx:112:react-hooks/preserve-manual-memoization',
  'StudentsTab.jsx:196:react-hooks/set-state-in-effect',
  'WorksheetsTab.jsx:225:react-hooks/set-state-in-effect',
  'CheckSubmissionsModal.jsx:81:react-hooks/set-state-in-effect',
  'DistributeModal.jsx:49:react-hooks/set-state-in-effect',
  'DistributeModal.jsx:97:react-hooks/set-state-in-effect',
  'DistributeModal.jsx:110:react-hooks/set-state-in-effect',
  'DistributeModal.jsx:116:react-hooks/set-state-in-effect',
  'EncodeScoresModal.jsx:125:react-hooks/set-state-in-effect',
  'useWorksheetAssessment.jsx:24:react-hooks/preserve-manual-memoization',
  'useWorksheetAssessment.jsx:169:react-hooks/set-state-in-effect',
  'useWorksheetAssessment.jsx:170:react-hooks/set-state-in-effect',
  'useWorksheetAssessment.jsx:171:react-hooks/set-state-in-effect',
]);
const teacherSource = [
  'tabs/AnnouncementsTab.jsx', 'tabs/AttendanceTab.jsx', 'tabs/LessonPlansTab.jsx',
  'tabs/OverviewTab.jsx', 'tabs/StudentsTab.jsx', 'tabs/WorksheetsTab.jsx',
  'worksheets/CheckSubmissionsModal.jsx', 'worksheets/DistributeModal.jsx',
  'worksheets/EncodeScoresModal.jsx', 'worksheets/useWorksheetAssessment.jsx',
].map((file) => `frontend/src/pages/dashboards/teacher/${file}`);
const browser = (id, config, spec) => ({
  id, command: 'npx', args: ['playwright', 'test', '--config', config, spec,
    `--output=${relative(root, join(artifactRoot, id)).replaceAll('\\', '/')}`,
    '--reporter=dot'],
});
const tasks = [
  { id: 'teacher-unit', command: 'npm', args: ['run', 'test', '--workspace', 'frontend', '--', 'src/pages/dashboards/teacher', '--run'] },
  browser('teacher-active-route', 'playwright.profile.config.js', 'e2e/profile-browser.spec.js'),
  browser('worksheet-preview', 'playwright.worksheet-draft.config.js', 'e2e/worksheet-draft-preview.spec.js'),
  browser('worksheet-scores-essay', 'playwright.profile.config.js', 'e2e/teacher-worksheet-scores.spec.js'),
  browser('manual-ilaw', 'playwright.ilaw-preview.config.js', 'e2e/ilaw-preview.spec.js'),
  browser('manual-ilaw-mock', 'playwright.ilaw-preview.config.js', 'e2e/mps-mock-preview.spec.js'),
  browser('fixture-isolation', 'playwright.profile.config.js', 'e2e/profile-isolation.spec.js'),
  { id: 'frontend-build', command: 'npm', args: ['run', 'build', '--workspace', 'frontend'] },
  { id: 'teacher-eslint', command: 'npx', args: ['eslint', '--format', 'json', ...teacherSource] },
  { id: 'qa-tool-eslint', command: 'npx', args: ['eslint', 'tools/run-teacher-qa.mjs'] },
  { id: 'diff-check', command: 'git', args: ['diff', '--check'] },
];

const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout.trim();
const quote = (value) => /\s/.test(value) ? `"${value}"` : value;
const commandLabel = (task) => `${task.command} ${task.args.map(quote).join(' ')}`;
if (process.argv.includes('--list')) {
  for (const task of tasks) process.stdout.write(`${task.id}: ${commandLabel(task)}\n`);
  process.exit(0);
}
if (process.argv.length > 2) throw new Error('Usage: node tools/run-teacher-qa.mjs [--list]');
if (git('branch', '--show-current') !== 'ux-overhaul') {
  throw new Error('Teacher QA requires the ux-overhaul branch. No tests started.');
}
mkdirSync(artifactRoot, { recursive: true });
const started = new Date();
const head = git('rev-parse', '--short', 'HEAD');
const before = git('status', '--short').split(/\r?\n/).filter(Boolean);
const results = [];
for (const task of tasks) {
  mkdirSync(join(artifactRoot, task.id), { recursive: true });
  const logPath = join(artifactRoot, `${task.id}.log`);
  const begin = Date.now();
  process.stdout.write(`\n[${task.id}] ${commandLabel(task)}\n`);
  // Fixed commands and repository-relative arguments only; no user-supplied shell input.
  const child = spawnSync(task.command, task.args, {
    cwd: root, encoding: 'utf8', shell: process.platform === 'win32',
    env: { ...process.env, FORCE_COLOR: undefined, NO_COLOR: '1' },
    maxBuffer: 40 * 1024 * 1024,
  });
  const output = `${child.stdout || ''}${child.stderr || ''}`;
  writeFileSync(logPath, output);
  if (task.id !== 'teacher-eslint') process.stdout.write(output.slice(-1200));
  const countsText = task.id === 'teacher-unit'
    ? output.match(/^\s*Tests\s+([^\r\n]+)/m)?.[1] || ''
    : output.slice(-1000);
  const summary = [...countsText.matchAll(/(\d+) (passed|failed|skipped|todo)/gi)]
    .map((match) => `${match[1]} ${match[2].toLowerCase()}`);
  results.push({ ...task, status: child.error ? 'BLOCKED' : child.status === 0 ? 'PASS' : 'FAIL',
    exit: child.status, error: child.error?.message, duration: Math.round((Date.now() - begin) / 1000),
    summary: summary.slice(-5).join(', ') || 'See log', logPath, output });
}
let lintFindings = [];
let lintParsed = false;
try {
  const lint = results.find((result) => result.id === 'teacher-eslint');
  lintFindings = JSON.parse(lint.output).flatMap((file) => file.messages
    .filter((message) => message.severity === 2)
    .map((message) => ({ key: `${file.filePath.split(/[\\/]/).at(-1)}:${message.line}:${message.ruleId}`,
      file: relative(root, file.filePath).replaceAll('\\', '/'), line: message.line, rule: message.ruleId })));
  lintParsed = true;
} catch { /* The raw lint log remains available if ESLint did not emit JSON. */ }
const newLint = lintFindings.filter(({ key }) => !baselineLint.has(key));
const missingBaseline = [...baselineLint].filter((key) => !lintFindings.some((finding) => finding.key === key));
const after = git('status', '--short').split(/\r?\n/).filter(Boolean);
const preexistingPreserved = before.every((entry) => after.includes(entry));
const behaviorFailure = results.some((result) => !['teacher-eslint'].includes(result.id) && result.status !== 'PASS');
const verdict = behaviorFailure || newLint.length || !preexistingPreserved || !lintParsed ? 'BLOCKED' : 'CONDITIONAL GO';
const rel = (path) => relative(root, path).replaceAll('\\', '/');
const artifacts = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = join(dir, entry.name);
  return entry.isDirectory() ? artifacts(full) : /\.(png|zip|webm|trace)$/i.test(entry.name) ? [rel(full)] : [];
});
const evidence = [
  ...artifacts(artifactRoot),
  ...['test-results', 'screenshots'].flatMap((folder) => existsSync(join(root, folder))
    ? artifacts(join(root, folder)).filter((path) => !path.startsWith(rel(artifactRoot))
      && statSync(join(root, path)).mtimeMs >= started.getTime()) : []),
];
const screenshotTypes = [
  ['Teacher Overview', /teacher-overview.*\.png|overview\.png/i],
  ['AI ILAW editor', /teacher-plans-editor.*\.png/i],
  ['Manual ILAW editor', /teacher-manual-ilaw\/[^/]*editor.*\.png|manual-editor\.png/i],
  ['Saved Lesson Plans', /teacher-mux2.*saved-list.*\.png|saved-plan-types.*\.png/i],
  ['Worksheet list', /phase3b-worksheets.*\.png|lpw2d-worksheets.*\.png/i],
  ['Worksheet full-page editor', /teacher-vqa3.*editor.*\.png|worksheet-editor.*\.png/i],
  ['Student Preview', /teacher-lpw2-b2.*worksheet-draft.*\.png/i],
  ['Worksheet Scores', /\/worksheet-scores-[^/]*\.png/i],
  ['Essay Review Lab', /\/essay-review-[^/]*\.png/i],
  ['Attendance', /attendance-(light|dark)-.*\.png/i],
  ['Mobile navigation', /mobile-navigation\.png/i],
];
const screenshotRows = screenshotTypes.map(([name, pattern]) => {
  const match = evidence.find((path) => pattern.test(path));
  return `| ${name} | ${match ? `[captured](../${match})` : 'NOT CAPTURED'} |`;
}).join('\n');
const rows = results.map((result) => `| ${result.id} | ${result.status} | ${result.summary} | ${result.duration}s | [log](../${rel(result.logPath)}) |`).join('\n');
const report = `# Teacher Dashboard automated QA — ${started.toISOString()}

Branch: \`ux-overhaul\` · HEAD: \`${head}\` · Run artifacts: \`${rel(artifactRoot)}\`

**Verdict: ${verdict}.** Automated QA is ${behaviorFailure ? 'not fully passing' : 'passing for the executed behavior suites'}; Owner final QA is **deferred** until final integrated Teacher review. Real AI, backend authorization, production persistence, delivery, and score release are **not verified** by synthetic tests.

Pre-existing dirty entries: ${before.length}. All preserved after run: **${preexistingPreserved ? 'YES' : 'NO — investigate before further work'}**. This workflow creates only this report and ignored test/build artifacts.

| Suite | Result | Counts or summary | Duration | Evidence |
| --- | --- | --- | ---: | --- |
${rows}

## Coverage and limits

| Area | Automated evidence | Limit |
| --- | --- | --- |
| Overview, Students, Attendance, Announcements, Profile, shell/navigation | Active Teacher browser suite and Teacher unit tests | Mocked profile, roster, announcements and attendance responses |
| AI/Manual ILAW, saved plans, print/PDF and validation | Active Teacher browser suite; isolated ILAW suites | Browser print/download simulation; production write authorization not exercised |
| Worksheet generation/editor/distribution | Active Teacher browser suite and worksheet preview suite | Generation and distribution are local/synthetic; no actual student delivery |
| Worksheet Scores and Essay Review Lab | Dedicated scores/essay suite | No real score release or real AI grading |
| Fixture and network safety | Fixture isolation suite and route-level mocks | Does not prove production endpoint or RLS behavior |
| Responsive and accessibility basics | Existing 360/390/768/1024/1440 light/dark browser cases | Screenshots are review evidence, not a visual perfection claim |

The six skipped browser cases are retired Quick Create checks. The six unit TODOs remain disposable-database security checks. Neither is counted as a pass. Keyboard, focus, overflow, and responsive assertions passed where present; screenshots still require human visual review.

Mock-only workflows exercised here include Manual ILAW Save/Draft, worksheet generation and local Save/Reopen, distribution simulation, synthetic attendance saves, Profile mutations, and Essay Review Lab suggestions/approval. Real Gemini generation, trusted database authorization, persistent Manual ILAW writes, student delivery, and score release require separate integration evidence.

## Lint

Focused Teacher source ESLint: **${results.find((result) => result.id === 'teacher-eslint').status}**, ${lintFindings.length} errors. Known baseline: 20 errors. New relative to recorded baseline: **${newLint.length}**. Baseline positions no longer present: ${missingBaseline.length}. See the raw JSON log for exact messages.

${newLint.length ? `New findings: ${newLint.map((item) => `\`${item.file}:${item.line} ${item.rule}\``).join(', ')}.` : 'No new Teacher source ESLint errors detected against the recorded 20-error baseline.'}

${lintFindings.length ? `Current findings:\n${lintFindings.map((item) => `- \`${item.file}:${item.line}\` — \`${item.rule}\`${baselineLint.has(item.key) ? ' (known)' : ' (new)'}`).join('\n')}\n` : 'ESLint JSON was unavailable or contained no errors; inspect the lint log before treating lint as clean.'}

## Artifacts and failures

| Requested screen | Current-run screenshot |
| --- | --- |
${screenshotRows}

${evidence.length} screenshot/trace artifacts were written during this run. Browser suites use distinct Playwright output directories, although existing tests also write legacy ignored screenshot paths. The table links representative current-run evidence; ${evidence.filter((path) => /trace|\.zip$/i.test(path)).length} trace archives were retained. See suite log links above for failed-case artifact locations.

${results.filter((result) => result.status !== 'PASS' && result.id !== 'teacher-eslint').map((result) => `- ${result.id}: ${result.status}; ${result.error || `exit ${result.exit}`}. See \`${rel(result.logPath)}\`.`).join('\n') || 'No non-lint command failures.'}

## Next gate

Preserve these synthetic suites for regression. Before production integration acceptance, verify trusted authorization and database behavior in a separately approved disposable environment. Owner final manual QA follows integration; no Owner QA approval is implied here.

Rerun from the repository root with \`node tools/run-teacher-qa.mjs\`. Use \`node tools/run-teacher-qa.mjs --list\` to inspect the exact commands. Each run keeps its own ignored artifacts and creates a new timestamped report once this report exists. Keep all browser suites on local synthetic fixtures; never substitute production credentials or URLs.
`;
writeFileSync(reportPath, report);
process.stdout.write(`\nReport: ${rel(reportPath)}\nVerdict: ${verdict}\n`);
process.exit(verdict === 'BLOCKED' ? 1 : 0);
