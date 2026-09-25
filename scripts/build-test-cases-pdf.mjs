// ============================================
// FILE: scripts/build-test-cases-pdf.mjs
// Generates docs/SmartEdu-Portal-Test-Cases.pdf — the test case documentation
// for the capstone paper's appendix.
//
//   node scripts/build-test-cases-pdf.mjs
//
// A generator rather than a hand-written document on purpose: the test suites
// change every week, and a test case appendix that drifts from the tests it
// describes is worse than none — it is a document that asserts coverage the
// system does not have. Add a test, add its row here, regenerate.
//
// pdfmake rather than reportlab: there is no Python on the build machine.
// Rather than a headless browser: the Chromium download is blocked here.
// ============================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pdfmake from 'pdfmake';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const OUT = path.join(root, 'docs', 'SmartEdu-Portal-Test-Cases.pdf');

// pdfmake 0.3 replaced `new PdfPrinter(fonts)` with a singleton: setFonts,
// then createPdf().getBuffer(). Most examples online are still 0.2 and will
// not run here.
const fontDir = path.join(root, 'node_modules', 'pdfmake', 'fonts', 'Roboto');
pdfmake.setFonts({
  Roboto: {
    normal: path.join(fontDir, 'Roboto-Regular.ttf'),
    bold: path.join(fontDir, 'Roboto-Medium.ttf'),
    italics: path.join(fontDir, 'Roboto-Italic.ttf'),
    bolditalics: path.join(fontDir, 'Roboto-MediumItalic.ttf'),
  },
});
// This script reads only the bundled fonts and writes only into docs/. Both
// policies are set explicitly: left undefined, pdfmake warns on every run,
// and a generator that cries wolf is one whose output nobody reads.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((p) => p.startsWith(fontDir));

const NAVY = '#1a2b4a';
const ACCENT = '#1908DF';
const MUTED = '#64748b';
const RULE = '#cbd5e1';

const today = new Date().toLocaleDateString('en-PH', {
  year: 'numeric', month: 'long', day: 'numeric',
});

// ── The test cases ───────────────────────────────────────────────────────
// Each row: [id, what it checks, expected result, status]

const PASS = 'Pass';
const NOTRUN = 'Not executed';
const PENDING = 'Pending';

const rls = [
  ['TC-RLS-001', 'A student reads another student’s worksheet submissions', '0 rows returned', NOTRUN],
  ['TC-RLS-002', 'A student reads worksheet_item_keys (the answer key)', '0 rows returned', NOTRUN],
  ['TC-RLS-003', 'A student reads another student’s answers', '0 rows returned', NOTRUN],
  ['TC-RLS-004', 'A student reads a task nobody assigned to them', '0 rows returned', NOTRUN],
  ['TC-RLS-005', 'A student reads another student’s task_assignees rows', '0 rows returned', NOTRUN],
  ['TC-RLS-006', 'A student reads another user’s notifications', '0 rows returned', NOTRUN],
  ['TC-RLS-007', 'A teacher reads a task owned by another teacher', '0 rows, or a documented exception for a teacher scheduled into the section', NOTRUN],
  ['TC-RLS-008', 'A teacher writes to teacher_subjects (admin only)', 'Insert refused', NOTRUN],
  ['TC-RLS-009', 'A student writes a notification addressed to a teacher', 'Insert refused', NOTRUN],
  ['TC-RLS-010', 'A student updates another student’s submission', '0 rows affected', NOTRUN],
  ['TC-RLS-011', 'Row Level Security is enabled on all 14 student-facing tables', 'All report “on”', NOTRUN],
  ['TC-RLS-012', 'No policy grants unconditional access (qual or with_check = true)', '0 such policies', NOTRUN],
  ['TC-RLS-013', 'No table has RLS on with zero policies', '0 such tables', NOTRUN],
];

const unit = [
  ['TC-UNT-001', 'ITEM_TYPES lists the five supported question types', 'Exact list, in display order', PASS],
  ['TC-UNT-002', 'TRUE_FALSE_VALUES is exactly the two strings the answering UI uses', '["True","False"]', PASS],
  ['TC-UNT-003', 'normalizePoints keeps a deliberate 0 as 0', '0, not the 1 fallback', PASS],
  ['TC-UNT-004', 'normalizePoints falls back to 1 for blank, null, NaN and negative values', '1', PASS],
  ['TC-UNT-005', 'splitAcceptedAnswers trims, drops blanks and never invents an answer', 'Clean list, or empty', PASS],
  ['TC-UNT-006', 'normalizeAnswer lowercases, trims and collapses internal whitespace', 'Normalised string', PASS],
  ['TC-UNT-007', 'Multiple choice scores the correct option and only that option', 'Full points / 0', PASS],
  ['TC-UNT-008', 'A blank answer counts as wrong, never as a match', '0 points', PASS],
  ['TC-UNT-009', 'Identification accepts any answer the teacher listed, case-insensitively', 'Full points', PASS],
  ['TC-UNT-010', 'Enumeration awards partial credit per matched answer, order-independent', 'Proportional points', PASS],
  ['TC-UNT-011', 'Enumeration counts a duplicated answer once and never exceeds item points', 'Capped at item points', PASS],
  ['TC-UNT-012', 'Partial credit rounds to two decimals', 'e.g. 1.67', PASS],
  ['TC-UNT-013', 'An item with an empty answer key returns nulls for manual scoring', 'Nulls, not zero', PASS],
  ['TC-UNT-014', 'scoreSubmission sums auto-scored points and reports the full total', 'score ≤ totalPoints', PASS],
  ['TC-UNT-015', 'An essay counts toward totalPoints but not toward score', 'Unscored, still counted', PASS],
  ['TC-UNT-016', 'formatCountdown reports days, hours, minutes and seconds as the deadline nears', 'Correct tone per band', PASS],
  ['TC-UNT-017', 'formatCountdown flips to “late” once the deadline passes', 'tone = late, isLate = true', PASS],
  ['TC-UNT-018', 'The exact deadline instant is not yet late', 'tone ≠ late', PASS],
  ['TC-UNT-019', 'combineDateAndTime falls back to the default time, and returns null with no date', 'Timestamp or null', PASS],
  ['TC-UNT-020', 'GRADE_LEVELS lists Grade 7 to Grade 12 in order', 'Six values', PASS],
  ['TC-UNT-021', 'normalizeGradeLevel accepts a bare number and differing case or spacing', 'Canonical “Grade N”', PASS],
  ['TC-UNT-022', 'canTeachSection allows a subject and grade the teacher holds', 'ok = true', PASS],
  ['TC-UNT-023', 'canTeachSection rejects the right subject at the wrong grade level', 'ok = false, reason given', PASS],
  ['TC-UNT-024', 'canTeachSection rejects a load belonging to a different school year', 'ok = false', PASS],
  ['TC-UNT-025', 'currentSchoolYear rolls over in June, not in January', '“YYYY-YYYY”', PASS],
  ['TC-UNT-026', 'withRetry returns immediately on success, without sleeping', 'First result', PASS],
  ['TC-UNT-027', 'withRetry retries the configured number of times and returns the last result', 'Last result', PASS],
  ['TC-UNT-028', 'withRetry jitters the wait to 50–150% of delayMs', 'No synchronised retry storm', PASS],
  ['TC-UNT-029', 'Every student dashboard tab renders without throwing on first paint', 'No exception', PASS],
  ['TC-UNT-030', 'Every teacher dashboard tab renders without throwing on first paint', 'No exception', PASS],
  ['TC-UNT-031', 'Both rebuilt admin tabs render without throwing on first paint', 'No exception', PASS],
];

const comp = [
  ['TC-CMP-001', 'Teaching Load opens on Grade 7 and scopes its labels to it', '“Subject for Grade 7”', PASS],
  ['TC-CMP-002', 'Pressing Add with nothing chosen names BOTH missing fields', 'Two red fields, two messages', PASS],
  ['TC-CMP-003', 'Add to list stages the entry and writes nothing', 'Draft shown, no DB call', PASS],
  ['TC-CMP-004', 'Assign writes the whole draft in one call', 'addLoadEntries called once', PASS],
  ['TC-CMP-005', 'A failed write keeps the draft intact', 'Draft still on screen', PASS],
  ['TC-CMP-006', 'A teacher already holding something at this grade cannot be picked', 'Radio disabled', PASS],
  ['TC-CMP-007', 'A subject already taken at this grade cannot be picked', 'Option disabled, holder named', PASS],
  ['TC-CMP-008', 'Switching grade tab rescopes both the picker and the saved list', 'Grade 7 load absent on Grade 8', PASS],
  ['TC-CMP-009', 'Teacher search matches department, not only name', '“mathemat” finds the Math teacher', PASS],
  ['TC-CMP-010', 'A failed teaching-load read offers Retry instead of an empty school', 'Error + Retry button', PASS],
  ['TC-CMP-011', 'Schedules shows only the chosen grade’s sections', 'Grade 8 sections hidden on Grade 7', PASS],
  ['TC-CMP-012', 'A section whose grade_level is spelled “7” still groups under Grade 7', 'Section visible', PASS],
  ['TC-CMP-013', 'Each section chip counts its filled subjects without being opened', '“1/2 subjects”', PASS],
  ['TC-CMP-014', 'Nothing is offered to fill in until a section is chosen', '“Pick a section above”', PASS],
  ['TC-CMP-015', 'An opened section lists every subject, filled or not', 'Unfilled rows say “nobody scheduled”', PASS],
  ['TC-CMP-016', 'A filled row reads back teacher, day, time and room', 'e.g. “Monday · 08:00–09:00 · Room 201”', PASS],
  ['TC-CMP-017', 'Add opens the form already knowing the section and subject', 'Both pre-filled', PASS],
  ['TC-CMP-018', 'The teacher dropdown offers only holders of that subject at that grade', 'Ineligible teacher absent', PASS],
  ['TC-CMP-019', 'When nobody is eligible, the form names Teaching Load as the fix', 'Guidance shown', PASS],
  ['TC-CMP-020', 'Create with no teacher marks the field and refuses to save', 'Red field, saveSchedule not called', PASS],
  ['TC-CMP-021', 'An end time not after the start marks BOTH time boxes', 'Two red inputs, one message', PASS],
  ['TC-CMP-022', 'Create saves once the form is valid', 'saveSchedule called once', PASS],
  ['TC-CMP-023', 'A failed schedules read offers Retry; an empty grade points at Sections', 'Distinct messages', PASS],
];

const e2e = [
  ['TC-E2E-001', 'A student logs in and reaches the student dashboard', 'URL /student-dashboard, banner visible', NOTRUN],
  ['TC-E2E-002', 'A teacher logs in and reaches the teacher dashboard', 'URL /teacher-dashboard', NOTRUN],
  ['TC-E2E-003', 'A wrong password is refused and the user stays on the login page', 'No navigation', NOTRUN],
  ['TC-E2E-004', 'A student cannot get in through the staff login', 'No staff dashboard reached', NOTRUN],
  ['TC-E2E-005', 'A signed-out visitor cannot open a dashboard by typing its URL', 'Redirected away', NOTRUN],
  ['TC-E2E-006', 'Login completes in a sane time (guards against the auth deadlock)', 'Under 20 seconds', NOTRUN],
  ['TC-E2E-007', 'The enrolment banner resolves instead of loading forever', 'No permanent “Loading your enrolment…”', NOTRUN],
  ['TC-E2E-008', 'Subject cards render and none of them is “Other”', 'Cards present, no Other card', NOTRUN],
  ['TC-E2E-009', 'A subject card opens the Tasks tab filtered to that subject', 'URL carries ?subject=', NOTRUN],
  ['TC-E2E-010', 'Every student tab opens without a blank screen', '#root never empty', NOTRUN],
  ['TC-E2E-011', 'A failed stat read says so rather than showing a bare zero', 'Explicit failure text', NOTRUN],
  ['TC-E2E-012', 'The student notification bell opens', 'Dropdown visible', NOTRUN],
  ['TC-E2E-013', 'Every teacher tab opens without a blank screen', '#root never empty', NOTRUN],
  ['TC-E2E-014', 'The worksheets tab distinguishes “no teaching load” from “read failed”', 'At most one message, correct one', NOTRUN],
  ['TC-E2E-015', 'The teacher notification bell opens', 'Dropdown visible', NOTRUN],
];

// Manual cases: the flows automation deliberately does not cover, because
// running them writes to the live database.
const manual = [
  ['TC-MAN-001', 'Admin creates three sections for one grade level',
    'Admin → Sections → add name, grade level, school year → Save',
    'Sections appear, and each shows in the Schedules grade tab', PENDING],
  ['TC-MAN-002', 'Admin enrols students into a section',
    'Admin → enrolment → assign 20 seeded students to a section',
    'section_students rows exist; each student’s banner names the section', PENDING],
  ['TC-MAN-003', 'Admin assigns a teaching load in bulk',
    'Admin → Teaching Load → Grade 7 → pick teacher + subject → Add to list ×8 → Assign',
    'One toast reporting the count written; all eight appear in the grade’s list', PENDING],
  ['TC-MAN-004', 'Admin schedules a teacher into a section',
    'Admin → Schedules → Grade 7 → section → subject row → Add → teacher, day, time → Create',
    'Row appears under that subject with teacher, day, time and room', PENDING],
  ['TC-MAN-005', 'Teacher creates a task and builds its questions',
    'Teacher → Worksheets → New → title and type → add questions of each of the five types',
    'Task saved with the teacher’s own subject; item count matches', PENDING],
  ['TC-MAN-006', 'Teacher distributes a task to specific students with a due date',
    'Teacher → Worksheets → Distribute → section → tick some students → set due date and time → Distribute',
    'Only the ticked students receive it; each gets a notification', PENDING],
  ['TC-MAN-007', 'The task appears on the correct subject card for the student',
    'Log in as an assigned student → Overview',
    'The task is counted on the card named after the teacher’s subject, never elsewhere', PENDING],
  ['TC-MAN-008', 'The deadline countdown is live and turns late on time',
    'Open the Tasks tab and watch the countdown across the deadline',
    'Seconds tick; the badge turns red and reads “Late by …” once passed', PENDING],
  ['TC-MAN-009', 'A student answers and submits a task',
    'Student → Tasks → Start → answer every item type → Submit',
    'Status becomes Submitted; answers persist across a reload', PENDING],
  ['TC-MAN-010', 'A late submission is recorded as late',
    'Submit after the due date has passed',
    'worksheet_submissions.is_late is true, stamped in Manila time', PENDING],
  ['TC-MAN-011', 'The teacher is notified when a student submits',
    'As the owning teacher, open the bell within one minute of a submission',
    'A “New … submission” notification naming the student and task', PENDING],
  ['TC-MAN-012', 'Auto-checking scores the objective items',
    'Teacher → Check Submissions → open a submitted worksheet',
    'Objective items scored; essays left for manual marking', PENDING],
  ['TC-MAN-013', 'A score is invisible to the student until released',
    'Before release, view the task as the student',
    'No score shown anywhere, including in the browser’s network responses', PENDING],
  ['TC-MAN-014', 'Releasing a score makes it visible and updates Worksheet Performance',
    'Teacher releases → student reloads the Overview',
    'Score visible; the performance percentage moves accordingly', PENDING],
  ['TC-MAN-015', 'Opening the bell marks notifications read, and they stay read',
    'Open the bell, close it, log out, log back in',
    'The unread badge does not return', PENDING],
  ['TC-MAN-016', 'A news post disappears from the news page after its expiry date',
    'Admin sets an expiry date in the past → open the public news page',
    'The post is not listed, and the admin still sees it marked expired', PENDING],
  ['TC-MAN-017', 'Three dashboards open at once remain usable',
    'Log in as admin, teacher and student in three browser profiles at the same time',
    'Each dashboard loads in a few seconds; no tab hangs', PENDING],
  ['TC-MAN-018', 'A dropped connection shows a retry, never an empty list',
    'Open a dashboard with the network throttled to offline, then restore it',
    'An explicit failure message with a Retry button; never a silent “0” or empty state', PENDING],
  ['TC-MAN-019', 'Light and dark mode are both legible on every rebuilt screen',
    'Toggle the theme on Teaching Load, Schedules and the student Overview',
    'No unreadable text; red validation fields visible in both', PENDING],
  ['TC-MAN-020', 'A teacher cannot reach another teacher’s data by URL',
    'As teacher A, paste a URL containing teacher B’s task id',
    'No data from teacher B renders', PENDING],
];

// ── Document ─────────────────────────────────────────────────────────────

const cell = (text, opts = {}) => ({ text, fontSize: 8.5, ...opts });
const headerCell = (text) => ({
  text, bold: true, fontSize: 8.5, color: '#ffffff', fillColor: NAVY, margin: [0, 4, 0, 4],
});

const statusColor = (s) =>
  s === PASS ? '#15803d' : s === NOTRUN ? '#b45309' : MUTED;

const autoTable = (rows) => ({
  table: {
    headerRows: 1,
    widths: [58, '*', 150, 52],
    body: [
      ['Case ID', 'Test case', 'Expected result', 'Status'].map(headerCell),
      ...rows.map(([id, desc, expected, status]) => [
        cell(id, { bold: true, color: ACCENT }),
        cell(desc),
        cell(expected, { color: MUTED }),
        cell(status, { color: statusColor(status), bold: true }),
      ]),
    ],
  },
  layout: {
    hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
    vLineWidth: () => 0,
    hLineColor: () => RULE,
    paddingTop: () => 4,
    paddingBottom: () => 4,
  },
  margin: [0, 0, 0, 14],
});

const manualTable = (rows) => ({
  table: {
    headerRows: 1,
    widths: [58, 105, '*', '*', 52],
    body: [
      ['Case ID', 'Test case', 'Steps', 'Expected result', 'Status'].map(headerCell),
      ...rows.map(([id, desc, steps, expected, status]) => [
        cell(id, { bold: true, color: ACCENT }),
        cell(desc),
        cell(steps, { color: MUTED }),
        cell(expected),
        cell(status, { color: statusColor(status), bold: true }),
      ]),
    ],
  },
  layout: {
    hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
    vLineWidth: () => 0,
    hLineColor: () => RULE,
    paddingTop: () => 4,
    paddingBottom: () => 4,
  },
  margin: [0, 0, 0, 14],
});

const h1 = (text) => ({ text, fontSize: 15, bold: true, color: NAVY, margin: [0, 16, 0, 2] });
const h2 = (text) => ({ text, fontSize: 11, bold: true, color: NAVY, margin: [0, 12, 0, 4] });
const p = (text) => ({ text, fontSize: 9.5, color: '#334155', margin: [0, 0, 0, 6], lineHeight: 1.35 });

const total = rls.length + unit.length + comp.length + e2e.length + manual.length;
const executed = unit.length + comp.length;

const docDefinition = {
  pageSize: 'A4',
  pageMargins: [40, 52, 40, 48],
  defaultStyle: { font: 'Roboto', fontSize: 9.5, color: '#1e293b' },

  header: (currentPage) => (currentPage === 1 ? null : {
    margin: [40, 22, 40, 0],
    columns: [
      { text: 'SmartEdu Portal — Test Case Documentation', fontSize: 8, color: MUTED },
      { text: 'Dela Paz National High School', fontSize: 8, color: MUTED, alignment: 'right' },
    ],
  }),
  footer: (currentPage, pageCount) => ({
    margin: [40, 12, 40, 0],
    columns: [
      { text: `Generated ${today}`, fontSize: 8, color: MUTED },
      { text: `Page ${currentPage} of ${pageCount}`, fontSize: 8, color: MUTED, alignment: 'right' },
    ],
  }),

  content: [
    // ── Cover ──
    { text: 'SmartEdu Portal', fontSize: 26, bold: true, color: NAVY, margin: [0, 80, 0, 0] },
    { text: 'EduScribe', fontSize: 13, color: ACCENT, margin: [0, 2, 0, 24] },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: ACCENT }] },
    { text: 'Test Case Documentation', fontSize: 19, bold: true, color: NAVY, margin: [0, 20, 0, 4] },
    { text: 'Dela Paz National High School', fontSize: 11, color: MUTED, margin: [0, 0, 0, 40] },
    {
      table: {
        widths: [130, '*'],
        body: [
          [cell('Document date', { bold: true }), cell(today)],
          [cell('Total test cases', { bold: true }), cell(String(total))],
          [cell('Automated', { bold: true }), cell(`${rls.length + unit.length + comp.length + e2e.length} (RLS ${rls.length}, unit ${unit.length}, component ${comp.length}, end-to-end ${e2e.length})`)],
          [cell('Manual', { bold: true }), cell(String(manual.length))],
          [cell('Executed and passing', { bold: true }), cell(`${executed} (unit and component suites)`)],
          [cell('Awaiting first run', { bold: true }), cell(`${total - executed} (see Section 5)`)],
        ],
      },
      layout: 'lightHorizontalLines',
    },
    { text: '', pageBreak: 'after' },

    // ── 1 ──
    h1('1. Testing strategy'),
    p('The system is tested in four layers. Each layer catches a class of defect the others structurally cannot, and the reason for having four is that this project has already shipped one defect from each of the first three.'),

    h2('1.1 Unit and render tests (Vitest)'),
    p('Pure functions — scoring, deadline formatting, teaching-load rules, retry behaviour — plus a render smoke test that paints every dashboard tab once and asserts only that it does not throw. That smoke test exists because a component once used an icon it had never imported: the production build passed and every test passed, because Vite does not resolve free identifiers, and the undeclared global reached every student as a blank screen.'),

    h2('1.2 Component interaction tests (Vitest + jsdom)'),
    p('Rendering a screen proves nothing about whether its buttons work. These drive the two rebuilt admin screens through a real DOM and assert the rules they enforce — one teacher per subject per grade, the draft that writes nothing until Assign, the red fields. None of those rules is in the database, so when one breaks it breaks silently.'),

    h2('1.3 Row Level Security tests (SQL)'),
    p('The application has no backend server. The browser talks directly to Supabase, which makes Row Level Security the only barrier between one student and another student’s answers. No unit test touches a policy. This suite sets request.jwt.claims and asks the database questions as each user, comparing what comes back against what the policies promise.'),

    h2('1.4 End-to-end tests (Playwright)'),
    p('A real browser, a real login, the real database. This is the only layer that exercises authentication, routing and the network together. It earns its cost: the worst performance defect found in this project — an 8.8 second deadlock on every login for every user — was invisible in the source and invisible to every other test, and was diagnosed from a browser console.'),

    h2('1.5 Manual test cases'),
    p('Section 5 covers what the automated suites deliberately do not. There is no separate test database, so every automated suite is read-only; any flow that creates, distributes, answers or scores real work is verified by hand.'),

    // ── 2 ──
    h1('2. Test environment'),
    {
      table: {
        widths: [130, '*'],
        body: [
          [cell('Application', { bold: true }), cell('React 18, Vite 5, React Router')],
          [cell('Backend', { bold: true }), cell('Supabase — PostgreSQL, Auth, Storage, auto-generated REST API, Row Level Security. No application server exists.')],
          [cell('Unit / component', { bold: true }), cell('Vitest, jsdom, @testing-library/react — `npm test`')],
          [cell('End-to-end', { bold: true }), cell('Playwright (Chromium) — `npm run test:e2e`')],
          [cell('RLS', { bold: true }), cell('Supabase SQL Editor — archives/phase5-01-rls-tests.sql')],
          [cell('Test data', { bold: true }), cell('60 seeded students and 48 seeded teachers (archives/phase4-03, phase4-05), all on example.com addresses, deleted after testing.')],
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 6],
    },
    p('Because there is no separate test instance, the end-to-end and RLS suites run against the live database and are written to be read-only. The RLS suite’s two write probes roll themselves back.'),

    { text: '', pageBreak: 'after' },

    // ── 3 ──
    h1('3. Security test cases — Row Level Security'),
    p('Source: archives/phase5-01-rls-tests.sql. Each case runs as a real logged-in user. A result of SKIP means the fixture the case needs does not exist yet; it is not a pass, and a suite reporting only SKIP has tested nothing.'),
    autoTable(rls),

    h1('4. Functional test cases — automated'),
    h2('4.1 Unit and render tests'),
    p('Source: src/lib/*.test.js and src/pages/dashboards/renderSmoke.test.jsx. Rows group the 62 assertions in these files by behaviour.'),
    autoTable(unit),

    h2('4.2 Component interaction tests'),
    p('Source: src/pages/dashboards/admin/tabs/TeachingLoadTab.test.jsx and SchedulesTab.test.jsx.'),
    autoTable(comp),

    h2('4.3 End-to-end tests'),
    p('Source: e2e/. Requires the seeded accounts and a running development server.'),
    autoTable(e2e),

    h1('5. Manual test cases'),
    p('These write real data, so they are performed by hand rather than automated against the live database. Each is run by an admin, a teacher and a student account as the case requires.'),
    manualTable(manual),

    h1('6. Known limitations of this test suite'),
    p('Stated plainly, because a test document that overstates its coverage is worse than none.'),
    {
      ul: [
        'The RLS and end-to-end suites have never been executed. The machine they were written on has no PostgreSQL client and could not download a browser binary. Their first real run is on the developer’s machine.',
        'The render smoke test proves only that a tab does not throw on its first paint. It cannot see a button that does nothing.',
        'The Schedules smoke test renders only that tab’s empty state, because its stub contains no sections. This was verified by removing an import used solely inside an opened section and watching the suite still pass; the component interaction tests exist to cover that gap.',
        'No automated test writes to the database. Distribution, answering, checking and releasing are covered by Section 5 only.',
        'No load or concurrency test exists. The 60-user trial is a manual exercise (TC-MAN-017).',
        'The teacher Grades tab uses a PostgREST embed with no foreign key behind it and will render an empty roster. Known, pre-existing, and out of scope for this round.',
      ],
      fontSize: 9.5,
      color: '#334155',
      margin: [0, 0, 0, 8],
      lineHeight: 1.35,
    },
  ],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const buffer = await pdfmake.createPdf(docDefinition).getBuffer();
fs.writeFileSync(OUT, buffer);
const kb = (buffer.length / 1024).toFixed(0);
console.log(`Wrote ${path.relative(root, OUT)} — ${kb} KB, ${total} test cases`);
