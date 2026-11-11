# TWF-03A trusted Teacher workflows — review-only contract

> **Status update (2026-11-09).** The sections from "Source findings" to "TWF-03B isolated prerequisite" are the original design-phase review and are kept as history. Statements in them that are no longer true are followed by an **Update** note. The system as it stands now is described in [Current system](#current-system-2026-11-09) at the end of this document, written only from the repository files. Live database state was not inspected for this update. The admin, responsive, test-status and limitation updates of 2026-11-11 are in [Current system update (2026-11-11)](#current-system-update-2026-11-11).

**DESIGN ONLY (original design-phase note). No SQL was executed, no database was contacted, and no production writer was enabled.** `shared/trustedPersistence/teacherWorkflowContract.js` is a pure synthetic check. It accepts a snapshot labelled trusted for tests; nothing in the active application imports it or proves that a browser supplied snapshot is trustworthy.

## Source findings and boundary

The React frontend uses `frontend/src/config/supabase.js` with the public anon key and sends classroom reads directly to Supabase. `AuthContext.jsx` loads the signed-in profile for UI state. `useWorksheetAssessment.jsx`, `GradesTab.jsx`, `AttendanceTab.jsx`, `TasksTab.jsx`, and `studentTaskGraph.js` issue the relevant queries. The Express service in `backend/src/app.js` mounts AI and onboarding/admin routes, with bearer verification in `requireAuth.js`; it has no mounted classroom score, review, release, or attendance route. `backend/src/persistence/postgresAdapter.js` and the TDI-04B RPC SQL are disabled, review-only authoring work. TDI-04B explicitly excludes scoring, submissions, release, and attendance.

The current client-side score and attendance handlers return unavailable before writing. The Essay Review Lab is fictional. Review marks and feedback in `CheckSubmissionsModal.jsx` live in React state and disappear on close. Tests of these paths do not establish durable storage.

**Update:** release and attendance now write through trusted database functions. Release uses `eduscribe_worksheet_score_release_v1` (`worksheet-score-release.sql`), called from `useWorksheetAssessment.jsx` `releaseScore`. Attendance uses `eduscribe_attendance_save_v1` (`attendance-save.sql`) through `teacher/tabs/attendanceSaveClient.js`. Only paper score encoding is still blocked before writing (`trustedScoreWritesAvailable = false`, `useWorksheetAssessment.jsx:20`). "Accept provisional marks" in `CheckSubmissionsModal.jsx` now saves marks durably (`saveMarks`, `useWorksheetAssessment.jsx:418-433`). Essay feedback text is still not stored. The Essay Review Lab is still fictional, and its route exists only in development builds (`TeacherDashboard.jsx:513`).

Migration source is not proof of the deployed database. In `phase2-02-worksheet-rls.sql`, `teacher_owns_worksheet` checks ownership only; `ws_subs_teacher_write` and `ws_answers_teacher_write` do not check current teaching load, section, enrollment, or year. `teacher_handles_section` in `phase1-03-rls-academic.sql` checks any schedule for a section, without subject or year. `ws_sections_write` also accepts adviser status. `attendance_staff_write` in `phase2-03-attendance-rls.sql` accepts either a schedule or adviser assignment. These are source-level gaps for the approved current-write contract, subject to live metadata verification.

**Update:** `attendance-write-lockdown.sql` drops `attendance_staff_write`. Teachers keep only a read policy (`attendance_staff_read`), admins keep full access (`attendance_admin_write`), and `anon` loses INSERT/UPDATE/DELETE/TRUNCATE. After it is applied, `eduscribe_attendance_save_v1` is the only teacher write path. Whether the lockdown is applied on the live database is unverified from the repository.

**Student privacy gap:** `ws_subs_read` permits a student to select their own entire submission row even when `released=false`; that row contains `score` and `total_points`. `ws_answers_read` permits their own answer rows, which contain `points_earned` and `is_correct`. `studentTaskGraph.js` filters scores in its own query, but a student can send another permitted PostgREST select if these policies and table grants are deployed as written. `ws_keys_all` has no student branch in the inspected migration, but the complete deployed policy/grant set is unverified. Do not claim unreleased-result secrecy until direct authenticated API probes prove it.

**Update (gap narrowed, not closed):**
- The trusted paths now write `score`/`total_points` on `worksheet_submissions` only together with `released = true`: the release function (`worksheet-score-release.sql:89-92`) and the instant auto-release (`auto-score-submission.sql:330-333`).
- Marks for an Auto worksheet with essays go to `worksheet_provisional_marks`, which has no student read policy (`auto-score-submission.sql:107-125`).
- Two exposures remain at the policy level:
  - `ws_subs_teacher_write` still lets the owning teacher write a score without releasing it through the API.
  - "Accept provisional marks" (`saveMarks`) writes `points_earned`/`is_correct` to `worksheet_answers` before release, and `ws_answers_read` lets the student read their own answer rows.
- Student screens never request those columns, but a crafted request could. See [Known limitations](#known-limitations-and-future-work).
- Unverified against the live database.

## Trusted authorization contract

Every entry below requires a validated bearer identity, a trusted `profiles` row with active status, and a fresh trusted relationship lookup. A missing session returns 401; a denied or missing record returns 403 or 404 without disclosing another student's existence; stale revision returns 409; invalid payload returns 422. Exact API codes remain a TWF-03B interface decision. No client Teacher ID, role, metadata, section membership, academic year, or submission ownership is authority.

| Operation | Actor, assignment, subject, section, year | Submission/enrollment and permitted state | Trusted decision and denial |
|---|---|---|---|
| A. Score submission | Active Teacher; current `teacher_subjects` tuple for worksheet subject, grade and official year; worksheet owner; section posting | Submission belongs to worksheet and section; student enrolled in posted section; submitted or reviewed, unreleased | Lock and compare all records; reject missing or mismatched relation |
| B. Edit manual question scores | Same as A | Item IDs belong to worksheet; every item represented once; reviewed draft, unreleased | Validate finite 0–item maximum, two-decimal marks and server-calculated total; reject bad marks |
| C. Save essay feedback | Same as A | Essay item belongs to submission worksheet; submitted/review draft, unreleased | Validate bounded text, expected revision, and save with marks atomically; reject stale or foreign item |
| D. Approve review | Same as A | Complete draft with all required marks; unreleased | Validate current revision and completeness; stamp trusted reviewer/time; no release side effect |
| E. Edit approved review | Same as A | Approved, unreleased | Atomic edit invalidates approval and increments revision; released review requires separate correction policy |
| F. Reopen review | Current assignment for edits; verified historical ownership may allow read only | Submitted, draft, or approved; released result is read only pending correction policy | Re-read current revision and state; deny historical writes |
| G. Release result | Active Teacher and the same current assignment/worksheet/section checks as A | Approved, unchanged revision, unreleased, valid student association | Separate explicit RPC; idempotent request receipt; stamp trusted release actor/time; deny draft or stale release |
| H. View current attendance | Active Teacher; current adviser section for homeroom view is the **proposed** policy; subject is not applicable | Section belongs to official year; read enrolled students and selected Manila date | RLS/RPC must scope section; deny unrelated section |
| I. View historical attendance | Active Teacher with verifiable former adviser/teaching relationship for that section and year | Historical row remains tied to original student and section | Read-only historical grant or assignment snapshot; deny if provenance is absent; never infer write permission |
| J. Create attendance | Active current adviser under the **proposed** homeroom policy; subject not applicable | Active enrollment in that exact section; section in official year; date in that academic year | Server derives actor and validates Manila `YYYY-MM-DD`; unique key and lock/upsert semantics; reject other section |
| K. Update attendance | Same as J | Existing row matches student, section, date, and attendance kind; unrevised history | Compare expected revision and update only that row; reject stale/foreign row |
| L. Student view own released result | Active Student; no teaching/adviser assignment | Own submission, `released=true`; worksheet and section match | Expose only result fields through a released-only trusted read; deny otherwise |
| M. Student try unreleased result | Active Student | Own submission, `released=false` | Result fields absent at database/API boundary, even with crafted `select=*`; return no result |
| N. Student try another result | Active Student | Submission belongs to another student | Identity derives from token; no row; answer with 404-style denial |
| O. Student try answer key | Active Student | Any worksheet/item, including assigned work | No SELECT/EXECUTE/Storage path to key; inspect every permissive policy and direct grant; deny |

Current/historical Teacher **read** may be retained for a worksheet they authored and an attendance section they demonstrably held. The current schema does not yet prove a past adviser interval or the worksheet's school year. A historical grant needs immutable provenance; a current schedule/adviser row is not a historical grant. The attendance adviser-only write rule above is a proposal for Owner confirmation: the inspected RLS currently also authorizes any Teacher scheduled into the section.

**Update:** the adviser-only rule is now implemented in `eduscribe_attendance_save_v1`. It accepts only an active teacher who advises the section in the current school year (`attendance-save.sql`), and a subject-only teacher gets `not_found`. Subject teachers keep read access only (`attendance-write-lockdown.sql`).

## Persistence contract and proposed implementation

Use authenticated, narrowly granted Supabase RPCs backed by one PostgreSQL transaction per operation, following TDI-04B's request receipt and expected revision pattern. This fits the current direct Supabase architecture and keeps `auth.uid()` inside the trusted transaction. The Express service exists, but adding a parallel service-role classroom authorization layer would duplicate rules and introduce a new operational dependency. No score RPC exists or is deployed today. An Edge Function is unnecessary unless a later integration needs a server-only external service.

**Update:** score release RPCs now exist in the repository (`eduscribe_worksheet_score_release_v1`), as do RPCs for distribution, question saving and attendance; see the migrations table below. The full draft/approve/revision/request-receipt design above was not built: release validates marks and writes them with the released submission in one transaction, without revisions or receipts. Deployment status is unverified from the repository.

**Score/review save:** derive actor from `auth.uid()`; lock profile, official Settings year, current teaching load, worksheet, posting, section, submission, enrollment, and review row. Validate worksheet subject/grade/year provenance and every item/mark. Compute score and maximum from trusted `worksheet_items`, not client totals. Persist question marks, essay feedback, review state/revision, and a request receipt in one transaction. Keep `released=false`. A duplicate same actor/request/payload returns the original receipt; same request ID with changed payload fails. A lost response is reconciled by receipt lookup. Any validation or write failure rolls back all marks, feedback, review state, and receipt. Audit reviewer and timestamp from trusted identity/time.

**Approval:** separate RPC, expected revision and complete saved review required. It stamps approval and revision only. Editing marks or feedback after approval changes state back to draft in the same transaction. An old approval cannot be reused. Concurrent editors get revision conflict and must reload; no last-writer-wins overwrite.

**Release:** separate explicit RPC with its own request ID. Lock and recheck authorized current assignment, submission and approved review revision; copy a consistent total; set release state/time/actor and receipt atomically. Replaying the same request is safe. A different release request against an already released result returns the existing result or a documented conflict without changing it. Notifications are after commit and never make the release appear failed or successful incorrectly. Published results must come only from a released-only read surface.

**Attendance:** under the proposed adviser-only policy, derive Teacher identity, lock section and exact active enrollment, validate official year and Manila date, then create/update the exact `(student_id, section_id, date, kind)` row with expected revision and request receipt. Reuse of the same request is idempotent; duplicate conflicting content is rejected. A date or section change never rewrites a historical row. The current `subject` nullable unique key does not prevent duplicate homeroom rows in PostgreSQL; design a non-null attendance kind or a reviewed partial unique index after inspecting live data. Existing duplicates require a separate data review, not an automatic cleanup.

**Update:** `attendance-save.sql` adds the partial unique index `attendance_daily_unique` (one daily row per student, section and date where `subject IS NULL`). If duplicate daily rows exist, it stops with `attendance_duplicates_exist` and creates nothing; it never cleans up automatically. No expected-revision column or request receipt was added (see Known limitations).

**Student reads:** direct table RLS alone cannot conceal selected columns on an allowed row. Prefer a released-only view/RPC with narrowly granted columns, while preserving a separate safe own-submission-state read. Remove direct student SELECT grants to score-bearing rows/columns where required, and reconcile all permissive policies. Keep answer keys in `worksheet_item_keys` with no student read grant, and verify crafted REST/RPC/storage requests under a real student JWT in a disposable environment. Do not put key material in student-visible worksheet JSON or frontend bundles.

## Schema and deployment review gates

1. `worksheets` in the inspected canonical schema has no `school_year`; add trusted creation-year provenance or equivalent immutable assignment snapshot. TDI-04B's unexecuted authoring proposal may supply some metadata, but it is not an assessment migration.
2. `worksheet_answers` has no feedback/review status; `worksheet_submissions.status='checked'` and `released` do not represent draft, approved and released separately. Propose additive review, revision, audit, and release fields/tables after live schema inspection. Preserve existing answer data and historical reads.
3. Reconcile old ownership-only and adviser/schedule policies, column/table grants, triggers, function owners, `EXECUTE` grants, and any later migrations. Adding one stricter permissive RLS policy does not close an existing permissive path.
4. Inspect actual indexes, unique constraints, triggers, duplicate attendance rows, enrollment history, and all deployed policies before writing SQL. No destructive migration or automatic backfill is approved.
5. Keep score, paper-score, release, and attendance UI write gates disabled until authenticated disposable-database tests prove both RPC authorization and direct-table bypass denial. The live database has not been inspected here.

   **Update:** the release and attendance UI write paths are now enabled and go through the trusted functions. Each function has a rolled-back selftest that probes authorization and bypass denial (see the migrations table). The paper-score gate is still disabled.

## TWF-03B isolated prerequisite and smallest next task

First, provision an Owner-approved disposable Supabase/PostgreSQL instance with only synthetic accounts and JWTs, confirm its loopback/project identity and marker using the existing TDI-04 harness guard, and collect read-only metadata for the relevant tables, policies, grants, functions, and triggers. Then review one additive schema/RLS/RPC proposal for the **score and review draft transaction** before any SQL execution. Prove authorized and unauthorized roles, adviser-only, wrong subject/grade/year/section/student, historical read versus write, injected IDs, duplicate/retry, concurrency, rollback, direct-table bypass, unreleased-field privacy, and answer-key denial. Release and attendance stay separate later increments.

## Current system (2026-11-09)

Written from the repository at commit `247de78` (branch `master`). File references are to the repository. Anything that depends on the live database, a browser, or the end-to-end suite is marked **unverified** with the reason.

### Teacher flows

**Tasks.**
- `worksheets/CreateTaskModal.jsx:12` offers four task types: **Activity, Quiz, Assignment, Exam**.
- An Activity is stored as `task_type 'worksheet'` with no questions (`dayTasks/dayTaskOptions.js:23`). It is directions only: the student reads it and submits nothing.
- `exam-task-type.sql` adds `'exam'` to the allowed task types. An exam is checked, distributed and released exactly like a quiz.
- A task is distributed to chosen students with a due date by `eduscribe_day_task_distribute_v1` (`day-task-distribute.sql`). The task notification to students is written by the client afterwards, and a failed notification does not undo the distribution (`useWorksheetAssessment.jsx` `notifyStudents`).

**Auto vs Manual checking.**
- Each task has `checking_mode` `'auto'` or `'manual'`, locked after the first distribution (`day-task-distribute-auto-essay.sql` header).
- **Auto, no essay:** when the student submits, `auto-score-submission.sql` scores every item against the answer key inside the submit transaction, then marks the submission `checked`, `released = true` with the score. The student sees the score immediately in the submit message (`student/tabs/studentAnswers.js` `submittedMessage`).
- **Auto with essay:** the objective items are scored as **provisional marks** only (`worksheet_provisional_marks`). Nothing is released, and the student sees "Your teacher will check the essay questions."
- **Manual:** nothing is scored on submit; the teacher checks and releases.

**Check submissions** (`worksheets/CheckSubmissionsModal.jsx`, opened from the Worksheets and Grading tabs):
- For an Auto task with essays, "**Accept provisional marks**" saves the provisional marks as teacher marks (`saveMarks`). The teacher then marks the essay and presses **Release**.
- **Release** and **Release all** (offered only when every item can be auto-checked, `CheckSubmissionsModal.jsx:269`) call `eduscribe_worksheet_score_release_v1`.
- That function validates every item mark against the item's maximum, recomputes the total in the database, and writes the marks, the score and `released = true` in one transaction (`worksheet-score-release.sql`).

**Late tag.**
- When a submission moves from `in_progress` to `submitted`, the database guard stamps `submitted_at` and `is_late` from the student's assignee due date (`phase3-02-task-rls.sql:132-177`).
- The Grading tab shows a **Late** badge (`tabs/GradesTab.jsx:25-28`), and the student list shows **Submitted late**.

**Questions.**
- The saved-mode question editor is a paper-style layout with a separate answer-key box (`worksheets/QuestionBuilderModal.jsx`).
- Saving calls `eduscribe_worksheet_items_replace_v1` (`worksheet-items-replace.sql`). In one transaction it replaces the worksheet's items, answer keys and question count, instead of four separate client writes.
- It is `SECURITY INVOKER`, so the existing owner/admin RLS and the item-delete guard still apply.

**Grading tab** (`tabs/GradesTab.jsx`):
- It shows worksheet outcomes, not a gradebook (`:1`).
- Rows have one status each: **Needs checking**, **Released**, **In progress**, **Not started**.
- Filter chips show counts per status plus All (`:26-27`); "Not started" comes from the assignment roster and appears only when that roster loaded.
- The released average is the mean of each released row's percentage (`:29-33`).

**Attendance (trusted)** (`tabs/AttendanceTab.jsx`, `tabs/attendanceSaveClient.js`, `attendance-save.sql`):
- **Who:** daily homeroom attendance for the teacher's **advisory** sections only.
  - The function accepts only an active teacher who is the section's adviser, for a section in the current school year (`school_settings` row 1).
  - A subject-only teacher is refused with `not_found`, and a past-year section is read-only in the tab.
- **Date:** the date must not be in the future in Manila time.
- **Marks:** status is Present, Absent, Late or Excused. Every student listed must be actively enrolled in the section.
- **Merge:** only the students sent change. A status `null` clears that student's daily row. Students not sent are left exactly as they were, and subject-level rows are never touched.
- **Tab behavior:**
  - Marks are a local draft until **Save attendance**, which sends only the changed students.
  - "Mark all present" fills only unmarked students.
  - Changing section or date with unsaved marks asks first.
  - The date picker cannot go past today in Manila time.
- **Messages:** errors map to fixed messages; database text is never shown.
- **Write lockdown** (`attendance-write-lockdown.sql`): direct teacher writes to `attendance` are removed. Teachers keep read access; admins keep full access; students keep reading their own rows. After this, the function is the only teacher write path.

### Student flows

**Shell** (`student/StudentDashboard.jsx`, `StudentDashboard.css`):
- **Design:** the same neutral design as the teacher dashboard: theme variables, plain cards, no gradients.
- **Navigation:** Overview, Tasks, Scores, Attendance, Announcements, with `aria-current="page"` on the active item.
- **Mobile drawer:** keeps focus inside, locks page scroll, closes with Escape or a visible Close button, and makes the header and page behind it inert; the menu button reports `aria-expanded`.
- **Logout:** asks for confirmation ("Log out of EduScribe?").
- **Notifications:** the bell follows a notification's in-app `action_url` on the student dashboard only (`components/NotificationBell.jsx` `followLinks`, `lib/inAppPath.js`).

**Tasks views** (`student/tabs/TasksTab.jsx`, `student/taskGroups.js`):
- **Views:** filter chips with counts for **To do** (default), **Upcoming**, **Done**, **Activities**, **All**. The choice is kept in the URL (`?view=`) and combines with `?subject=`.
- **Group definitions,** all in Manila time (`due_at` is a timestamp without time zone holding Manila clock time):
  - **Activities:** handouts. They are never counted in the other groups.
  - **Done:** submitted, checked or released.
  - **To do:** not done, and due today, overdue, or with no due date.
  - **Upcoming:** not done and due after today.
  - **Overdue:** not done and the deadline instant has passed. It shows a red **Overdue** badge.
  - **Today:** the Manila calendar date.
  - **This week:** today through the next 7 days, both ends included.
- **Row content:** each row keeps its type badge, status, Manila due text, countdown, "Submitted late" tag, "Score: x/y" when released, and Start/Open.
- A task with no questions shows "Ask your teacher for this task."

**Overview** (`student/tabs/OverviewTab.jsx`, `student/DueSoonCard.jsx`):
- **Stat cards:** Worksheet Performance, Attendance, Pending Tasks.
- **"Due today / this week" card:** two counts and up to five soonest unfinished tasks. Each links to its Tasks view and subject.
- **Pending Tasks** equals To do + Upcoming.
- **School year:** the newest year among the student's own sections; it is hidden when unknown.
- A failed load shows "—" and an error line, never 0.

**Attendance** (`student/tabs/AttendanceTab.jsx`, `student/attendanceView.js`):
- **Totals:** four cards for Present, Late, Absent, Excused. Any other status shows as a neutral "Other" badge.
- **Rate:** days Present ÷ all recorded days; Late and Excused count as not present. The rule is shown under the rate and is the same rule as the Overview card.
- **Records list:** newest first, 20 at a time with "Show more", filtered by month (default the current Manila month, or All). There is a Section filter when the rows span two or more sections.
- **Columns:** Date, Status, Section, Subject, Notes.
- **Dates:** shown as the same calendar day in any time zone.

**Scores** (`student/tabs/ScoresTab.jsx`, `student/scoresView.js`):
- The tab says "Based on your released scores only. This is not an official grade."
- **Overall average:** the same rule as Overview "Worksheet Performance": released rows with a score and a total above 0, mean of percentages.
- **Per subject:** average, released / assigned (Activities excluded), "N awaiting results", and an expandable list of released items with type, score, percentage and submitted date.
- Unreleased work never shows a score.

**Notifications** (`components/NotificationBell.jsx`):
- **Task distributed:** "<Type> — <Subject>", "\"<title>\" is due <date>.", link `/student-dashboard/tasks`, written by the client after distribution.
- **Result released** (`student-release-notification.sql`): title "Result ready", message `Your result for "<title>" is ready.`, link `/student-dashboard/tasks?view=done`.
  - It is written by a database trigger when a teacher releases.
  - It is not sent for the instant auto-release at submit, because the student already sees the score then.
  - It is sent once per submission and never contains a score.

### Security notes

- **Answer keys and provisional marks:**
  - Student code never reads `worksheet_item_keys` or `worksheet_provisional_marks`.
  - `student/tabs/studentNoProvisional.test.js` scans every student source file and `lib/student*` and fails if `worksheet_provisional_marks` appears.
  - The key table's policy has no student branch (`phase2-02-worksheet-rls.sql:112-116`), and provisional marks are teacher/admin read only (`auto-score-submission.sql:107-125`).
- **Scores:**
  - Scores reach student screens only from released rows: the shared read filters `released = true` in the query (`lib/studentTaskGraph.js:120-126`), and score re-reads also filter on released (`TasksTab.jsx`).
  - Essay tasks show "Submitted — awaiting result" until release.
- **Release notification:** the message contains only the worksheet title. The selftest checks that no score appears in it.
- **Attendance:** students read only their own rows (`attendance_student_read`). Teachers cannot write attendance directly after the lockdown.
- **Remaining policy-level exposures** (see Known limitations): unreleased per-item marks written by "Accept provisional marks", and teacher direct score writes.
- **Unverified:** all RLS statements above come from migration files. Whether the live database matches them was not inspected.

### Database migrations (this phase)

Convention:
- Every migration runs as `postgres` in one transaction with guards at the top, and uses named dollar quotes (never a bare `$$`).
- `*.selftest.sql` files are tests, not migrations. They create synthetic data, check each case, and always roll back. They end with a **deliberate error** whose text reports the result. Success is an error starting `SELFTEST PASSED_ROLLED_BACK failures=0`.
- `*.rollback.sql` / `*.undo.sql` undo a migration. `*.verify.sql` are read-only checks.

Apply in this order (each after its listed dependencies), then run its selftest:

| # | Migration | What it does | Selftest | Undo |
|---|---|---|---|---|
| 1 | `worksheet-score-release.sql` | `eduscribe_worksheet_score_release_v1`: validates item marks and writes marks, score and release in one transaction | `worksheet-score-release.selftest.sql` (and `.verify.sql`) | `worksheet-score-release.undo.sql` |
| 2 | `worksheet-anon-direct-grants-revoke.sql` | Removes direct `anon` grants from the three worksheet tables; review live ACLs first; needs PostgreSQL 17+ | `worksheet-anon-direct-grants-revoke.selftest.sql` (may also report `SELFTEST FIXTURE_UNAVAILABLE`) | `worksheet-anon-direct-grants-revoke.rollback.sql` |
| 3 | `day-task-distribute.sql` | `eduscribe_day_task_distribute_v1`: distributes one saved day task to chosen students | `day-task-distribute.selftest.sql` | `day-task-distribute.rollback.sql` |
| 4 | `exam-task-type.sql` | Adds `'exam'` to `worksheets.task_type` | `exam-task-type.selftest.sql` | `exam-task-type.rollback.sql` |
| 5 | `auto-score-submission.sql` | Essay rule columns, `worksheet_provisional_marks`, instant auto-scoring on submit (after 1, 4, `phase3-02`, `phase4-02`) | `auto-score-submission.selftest.sql` | `auto-score-submission.rollback.sql` |
| 6 | `day-task-distribute-auto-essay.sql` | Allows Auto checking for tasks with essays (after 3 and 5) | `day-task-distribute-auto-essay.selftest.sql` | `day-task-distribute-auto-essay.rollback.sql` |
| 7 | `worksheet-items-replace.sql` | `eduscribe_worksheet_items_replace_v1`: atomic question and key save (after 5) | `worksheet-items-replace.selftest.sql` | `worksheet-items-replace.rollback.sql` |
| 8 | `attendance-save.sql` | `attendance_daily_unique` index and `eduscribe_attendance_save_v1`; stops if duplicate daily rows exist | `attendance-save.selftest.sql` | `attendance-save.rollback.sql` |
| 9 | `attendance-write-lockdown.sql` | Removes direct teacher writes to `attendance` (after 8) | `attendance-write-lockdown.selftest.sql` | `attendance-write-lockdown.rollback.sql` |
| 10 | `student-release-notification.sql` | Release notification trigger (after 1 and 5) | `student-release-notification.selftest.sql` | `student-release-notification.rollback.sql` |

- Several selftests ask you to re-run related ones afterwards: for example `auto-score-submission.selftest.sql` names the release, grants and distribute selftests.
- **Unverified:** which of these migrations have been applied to the live database, and the live selftest results. The repository cannot show either.
- Other migrations added in the same period cover AI weekly worksheets and are outside this document: `dev-ai-*`, `weekly-draft-generation-jobs.sql`, `weekly-draft-confirmed-batch-recovery.sql`, `weekly-worksheet-production-save.sql`.

### Test status

- The frontend unit suite was run for this update (`npx vitest run --maxWorkers=2 --minWorkers=1`, commit `247de78`): **Test Files 174 passed (174); Tests 1929 passed, 1 skipped, 6 todo (1936)**.
- **Not run:** the Playwright end-to-end specs (`e2e/`), and browser, dark-mode and 360px checks.
- **Not run:** the SQL selftests (they need the database).

### Known limitations and future work

**Teacher side**
- **Paper score encoding is hidden.** The client gate `trustedScoreWritesAvailable = false` (`useWorksheetAssessment.jsx:20`) blocks it, and it would write directly, not through a trusted function.
- **Unreleased marks are readable at the API level.** "Accept provisional marks" (`saveMarks`, `useWorksheetAssessment.jsx:418-433`) writes `points_earned`/`is_correct` to `worksheet_answers` before release, and `ws_answers_read` lets the student read their own answer rows.
  - Student screens never request these columns.
  - A trusted save-marks function, or a column-restricted student read, would close this.
  - Unverified live.
- **Teacher direct score writes are still allowed.** `ws_subs_teacher_write` still lets the owning teacher write `score` without releasing, through the API.
- **The manual-draft authoring path is dead.** `TeacherDashboard.jsx:507` passes `onCreateManualDraft`, but `WorksheetsTab.jsx` never reads it, so no manual worksheet draft can be created.
- **Generate Day Task save is not atomic.** `dayTasks/dayTaskSave.js` notes that a lost response can still mean the row was written.

**Attendance**
- **No revision column,** so two advisers saving the same day concurrently are last-write-wins per student.
- **No per-subject attendance.** There is no teacher UI for it, and `eduscribe_attendance_save_v1` writes daily rows only.
- **Rate rule to be confirmed by the school.** The attendance rate counts Late and Excused as not present.

**Student side**
- **No photo upload for activities.** It would need a private storage bucket, storage policies, a submission-files table, client type/size validation, and a viewer in Check submissions.
- **No official teacher-entered final grade.** The Scores tab is a summary of released scores, and the approved capstone scope excludes a gradebook.
- **No download for no-question tasks.** The student sees "Ask your teacher for this task."
- **Stale navigation entries.** The student entries in `components/layout/SideBar.jsx` and `components/layout/MobileDrawer.jsx` are unused by students (only the Faculty dashboard uses that layout).

**Testing gaps**
- **Stale e2e specs were not updated:**
  - weekly collections (`e2e/profile-browser.spec.js` TD-VID-004A tests)
  - manual Worksheet authoring (`TDC4-C2`, `:435`)
  - Encode scores (`:2165`)
  - Attendance (`isolated Teacher Attendance`, `:3995`)
  - `e2e/teacher-worksheet-scores.spec.js:159` (TWF-02 attendance read only)
- **QA to do:** e2e, browser, dark-mode and 360px checks were not run by the assistant.

**Unverified live facts**
- RLS on `news` and `school_settings` (`phase1-05-school-settings-rls.sql` allows reads by anyone; `news` has no policy file in `migrations/`).
- The type of `news.created_at`: `TIMESTAMP` in the repo schema. The NEW badge assumes values without an offset are UTC.
- Whether `notifications.notification_type` has a CHECK constraint (none in the repo).
- Whether older subject-level attendance rows exist.

### How to verify (demo path)

**Teacher** (`/faculty-login`, then `/teacher-dashboard`):
1. Worksheets → create a task (Quiz, Exam, Assignment or Activity) and add questions with answer keys in the Questions editor. Choose Auto or Manual checking.
2. **Distribute** it to chosen students with a due date. The students get a task notification.
3. After students submit: **Check submissions**.
   - Manual: mark and **Release**.
   - Auto with essay: **Accept provisional marks**, mark the essay, **Release**.
   - Auto without essay is already released at submit.
4. Grading tab: the statuses move from Needs checking to Released; a late submission shows **Late**.
5. Attendance (advisers only): pick a date, mark students or use **Mark all present**, **Save attendance**, then reload to confirm.

**Student** (`/student-login`, then `/student-dashboard`):
1. Overview shows "Due today / this week". The bell shows the task notification; clicking it opens Tasks.
2. Tasks → **To do** / **Upcoming** → **Start**, answer, **Submit**.
   - Auto without essay: the score appears in the submit message.
   - Otherwise: "Submitted — awaiting result".
3. After the teacher releases: the bell shows **"Result ready"**. Clicking it opens Tasks → **Done**, where the row shows "Score: x/y".
4. The **Scores** tab shows the subject average; **Attendance** shows the day's mark after the adviser saves.

These steps describe what the code does. They were not run in a browser for this update.

## Current system update (2026-11-11)

Written from the repository at commit `ec3d724` (branch `master`). All dates and times are Manila time (UTC+8), taken from the commit dates. This section adds the admin dashboard work, the responsive work (R1-R5), the test and e2e status, and the known limitations. The sections above stay as they were.

**Unverified** means the fact needs the live database, a real browser session against the live project, or a real phone. The repository cannot show it.

### Admin dashboard (frontend only, no SQL)

**No new migration was needed for the admin work.** The seven admin commits change only files under `frontend/src/`. None of them adds or changes a file in `backend/database/`.

| Item | What it does | Main files | Commit (date) | Guard tests |
|---|---|---|---|---|
| A1: school year | The academic tabs (Sections, Schedules, Teaching Load) work in the year from System Settings (`school_settings.school_year`, row 1). If that row cannot be loaded, they fall back to the calendar year and say so. If the admin works in another year, a warning says teachers will not see it. The warning never blocks. | `admin/useAcademicLogic.jsx`, `admin/shared/SchoolYearNotice.jsx`, `admin/AdminContext.jsx`, `tabs/SettingsTab.jsx` | `7350b80` (2026-11-09 21:48) | `useAcademicLogic.schoolYear.test.jsx`, `tabs/schoolYearNotice.tabs.test.jsx` |
| A2: section delete counts | Deleting a section opens a dialog that counts what goes with it: class list records (including former members), schedules, attendance records, student submissions and task assignments. Each count reads "Counting…" or "Could not be counted" until known. Typing the section name is required unless the section is known to have no students and no schedules. | `admin/useAcademicLogic.jsx` (`countRows`), `admin/shared/ConfirmationDialog.jsx` | `672d049` (2026-11-09 21:12) | `useAcademicLogic.sectionDelete.test.jsx`, `ConfirmationDialog.typeToConfirm.test.jsx`, `ConfirmationDialog.defaults.test.jsx` |
| A3: schedule clash check | Before a period is saved, the app reads this year's periods again and refuses the save if the same teacher, the same room (trimmed, case-insensitive, only when a room is entered) or the same section has an overlapping period on that day. Periods that only touch do not clash. A failed read saves nothing. | `lib/academicRules.js` (`findScheduleClashes`, `describeScheduleClashes`), `admin/useAcademicLogic.jsx`, `tabs/SchedulesTab.jsx` | `c633da1` (2026-11-09 22:10) | `lib/academicRules.clash.test.js`, `useAcademicLogic.scheduleClash.test.jsx`, `tabs/SchedulesTab.clash.test.jsx` |
| A4: adviser warning | When the chosen adviser already advises another section this year, a yellow warning names those sections. It never blocks saving. | `admin/shared/sectionsValidation.js` (`otherAdvisedSections`), `tabs/SectionsTab.jsx` | `672d049` (2026-11-09 21:12) | `tabs/SectionsTab.adviserWarning.test.jsx` |
| A5: class setup summary | A read-only overview in Schedules and Sections: "N of M subjects have a teacher", and each subject's teachers and periods, Monday first. It uses data the tabs already load. | `admin/shared/classSetup.js`, `tabs/SchedulesTab.jsx`, `tabs/SectionsTab.jsx` | `781a0d9` (2026-11-09 22:39) | `shared/classSetup.test.js`, `tabs/classSetup.tabs.test.jsx` |
| B1: department lock | In Teaching Load, the teacher's department subject is pre-selected and cannot be removed. It is the one active subject whose name or code equals `profiles.department`. If none or more than one matches, nothing is locked and a note says why. | `admin/shared/departmentSubject.js`, `tabs/TeachingLoadTab.jsx`, `admin/useAcademicLogic.jsx` | `89ac297` (2026-11-10 19:12) | `shared/departmentSubject.test.js`, `tabs/TeachingLoadTab.departmentLock.test.jsx`, `useAcademicLogic.departmentLock.test.jsx` |
| B2a: section removal | Removing a student asks for a reason. **Dropped** and **Transferred** keep the `section_students` row with that status, and it is listed under "Previously in this section". **Added by mistake / wrong section** deletes the row, as removal did before. Re-adding a former member sets the row back to `active`. | `admin/shared/sectionMembership.js`, `tabs/SectionsTab.jsx`, `admin/useAcademicLogic.jsx` | `e872d1c` (2026-11-10 07:08) | `tabs/SectionsTab.removal.test.jsx`, `useAcademicLogic.membership.test.jsx` |
| B2b: profile sheets | **View profile** opens a student sheet from the Sections class list and a teacher sheet from Teaching Load. The student sheet is read-only except LRN (exactly 12 digits, or empty) and student status (Regular, Irregular, Transferee, Returnee, or not set). The teacher sheet is read-only and makes no new queries. | `admin/shared/StudentProfileSheet.jsx`, `admin/shared/TeacherProfileSheet.jsx`, `tabs/SectionsTab.jsx`, `tabs/TeachingLoadTab.jsx` | `41fd21c` (2026-11-10 18:46) | `shared/StudentProfileSheet.test.jsx`, `shared/TeacherProfileSheet.test.jsx`, `tabs/profileEntryPoints.test.jsx` |

All paths are under `frontend/src/pages/dashboards/`, except `lib/academicRules.js`, which is under `frontend/src/`.

**How to verify:**
- **Automated:** run the unit suite (see [How to verify (2026-11-11)](#how-to-verify-2026-11-11)). The guard tests above are part of it.
- **Mocked browser:** the sections, schedules, settings and admin-final mocked e2e specs cover some of these flows. See [Test and e2e status](#test-and-e2e-status-2026-11-11).
- **By hand:** log in as admin, then:
  - try a clashing period in Schedules
  - delete an empty section and a non-empty one
  - pick an adviser who already advises a section
  - remove a student with each reason
  - open View profile
  - check that a teacher's department subject cannot be removed
- **Unverified:** these admin flows were not run by hand against the live project.

### Student dashboard

The student dashboard was redesigned in six commits on 2026-11-09:
- `019bbd3` (15:31): shell accessibility and Manila dates
- `7cdd235` (15:58): neutral teacher-style cards
- `617c007` (16:33): To do, Upcoming, Done, the due-soon card and the Manila due-time fix
- `f6525a1` (17:02): the attendance view and the scores summary
- `247de78` (18:00) and `8974266` (19:06): cleanup, the release notification and docs

The behavior is described in [Student flows](#student-flows) above. In short:
- **Task views:** To do, Upcoming, Done, Activities and All. Overdue is a red badge on unfinished work past its deadline (`student/taskGroups.js`).
- **Manila week rule:** "This week" is today through the next 7 days, both ends included, in Manila time.
- **Scores:** students see scores from released rows only (`lib/studentTaskGraph.js`, `.eq('released', true)`).
- **Release notification:**
  - Migration: `backend/database/migrations/student-release-notification.sql`, with its `.selftest.sql` and `.rollback.sql`.
  - Message: "Result ready", with no score in it.
- **Attendance rate, as currently implemented:** days Present ÷ all recorded rows. Late and Excused are **not** counted as present (`student/attendanceView.js:23-26`). **To confirm with the adviser.**
- **Guard tests** (under `frontend/src/pages/dashboards/student/`): `taskGroups.test.js`, `tabs/TasksTab.views.test.jsx`, `tabs/OverviewTab.dueSoon.test.jsx`, `attendanceView.test.js`, `tabs/AttendanceTab.phase3.test.jsx`, `tabs/ScoresTab.test.jsx`, `tabs/studentNoProvisional.test.js`.
- **Unverified:**
  - the release notification in the real app
  - whether the migration and its selftest were run on the live database

### Responsive work R1-R5 (frontend only)

Phones (below 768px) were the main target. Each change was checked to leave 768px and wider unchanged.

| Step | Commit (date) | What it fixed | Guard tests |
|---|---|---|---|
| R1 | `c9725ad` (2026-11-10 21:45) | **Full-height shells:** full-height shells follow the visible screen (`dvh`, with `vh` as the fallback): `.h-viewport`, `.min-h-viewport` and `.max-h-viewport-85` in `styles/index.css`, and `lib/viewportHeight.js` for inline styles. **16px fields:** text fields are 16px on phones so iPhone Safari does not zoom in. **Attendance picker:** the teacher Attendance picker fits the screen. | `styles/phoneViewport.test.js` |
| R2 | `89a50ce` (2026-11-10 22:12) | **Dialog footers:** teacher dialog footers stay pinned at the bottom (`teacher/shared/ui.jsx`, Create Task, Distribute, Check Submissions). **Badges:** the teacher Announcements badges wrap. | `teacher/shared/ui.footer.test.jsx`, `teacher/worksheets/dialogFooters.test.jsx`, `teacher/tabs/AnnouncementsTab.badgeWrap.test.jsx` |
| R3 | `6e3a509` (2026-11-10 22:56) | Long text wraps instead of overflowing in the student pages: Overview, Tasks, Scores, Attendance, Announcements, the due-soon card and the worksheet header. | `student/tabs/longText.wrap.test.jsx` |
| R4 and R3b | `d56966d` (2026-11-10 23:35) | **Clash message:** the schedule clash message scrolls into view (`scrollIntoView`). **320px header:** below 360px the admin header logo gap is 8px instead of 12px, which removes a 1px sideways scroll. **Wrapping:** long text wraps in the shared Profile page and the notification bell. | `admin/tabs/SchedulesTab.clashInView.test.jsx`, `components/NotificationBell.wrap.test.jsx`, `pages/profile/ProfileTab.wrap.test.jsx` |
| R5 | `ec3d724` (2026-11-11 07:19) | **Toasts:** on phones, the toasts of all three roles sit at the top, full width with 16px margins, and let taps through (`pointer-events: none`) to the header under them. **40px tap targets:** the Home slideshow dots and Pause, the password eye on both login pages, the teacher Announcements filter chips, and the student and admin profile toggles. | `student/phonePolish.test.jsx`, `student/phoneToastClickThrough.test.jsx` |

Paths in the table are under `frontend/src/`, and `admin/`, `teacher/` and `student/` are under `frontend/src/pages/dashboards/`.

**Verification:**
- **Scratch-script sweeps:** each step was measured in desktop Chrome at phone sizes against the mocked e2e fixtures. The scripts and measurements are outside the repository, and these sweeps are not part of the test suite.
- **R5 tap timing:** with a toast showing, taps on the menu, bell and theme buttons responded in about 30-190 ms for each role. Before R5 they waited about 3 s for the toast to close.
- **Unverified on a real phone:** none of R1-R5 was checked on a real iPhone or Android phone.

### Test and e2e status (2026-11-11)

**Unit suite** (frontend, Vitest):
- **Command:** `npx vitest run --maxWorkers=2 --minWorkers=1`.
- **Last run:** 2026-11-11, on the tree committed as `ec3d724`.
- **Result:** **Test Files 203 passed (203); Tests 2105 passed, 1 skipped, 6 todo (2112).**
- `vite build` succeeded on the same tree.

**Mocked e2e specs:**
- **When:** last run 2026-11-10, about 20:00, on the tree committed as `c9269dc` ("e2e: update mocked specs…").
- **How:** each spec ran under its own config, with one worker, against a fake backend whose URL ends in `.invalid`.
- **Not re-run since:** none of these specs was run again after R1-R5. Those changes were checked only by the scratch sweeps above.
- **Where the results are:** in that session's reports, not in the repository. The spec edits themselves are in `c9269dc`.

| Config | Specs | Result |
|---|---|---|
| `playwright.sections.config.js` | `sections-browser`, `sections-isolation` | 14 passed |
| `playwright.schedules.config.js` | `schedules-browser`, `schedules-isolation` | `schedules-browser` 8 of 8 passed after the approved edit; `schedules-isolation` passed |
| `playwright.settings.config.js` | `settings-browser`, `settings-isolation` | 24 passed |
| `playwright.admin-final.config.js` | `admin-final-browser`, `admin-final-isolation` | 18 passed |
| `playwright.profile.config.js` | `profile-browser`, cross-role logout tests only | 5 passed |
| `playwright.profile.config.js` | `teacher-worksheet-scores`, TWF-02 tests left out | 28 passed (18, plus the 10 "stays readable" cases after the approved edits) |

These mocked configs were not run in this period: `playwright.ilaw-preview.config.js`, `playwright.quick-create-preview.config.js` and `playwright.worksheet-draft.config.js`.

**Live-login specs not run:**
- **Which:** 43 of the 58 spec files import `e2e/helpers.js`, which logs in to the real project. None of them was run. This includes:
  - `admin-teaching-load-overhaul.spec.js`: `loginAsStudent` at `:20`. Its fixture edit in `c9269dc` is untested.
  - `admin-mobile-rows.spec.js`: `loginAsAdmin`.
  - `admin-double-click.spec.js`: `loginAsAdmin`.
- **`E2E_ALLOW_WRITES`:** it was never set. It gates the live-write specs (`e2e/helpers.js:62`).

**Known stale e2e specs** (still in the repository and out of date with the app; not run):

| Spec | Test | Why it is stale |
|---|---|---|
| `e2e/profile-browser.spec.js:49-252` | TD-VID-004A weekly collection tests | Listed as stale under Testing gaps (2026-11-09) above |
| `e2e/profile-browser.spec.js:435` | `TDC4-C2 manual Worksheet authoring` | Listed as stale under Testing gaps (2026-11-09) above. The manual-draft path is dead (see Known limitations). |
| `e2e/profile-browser.spec.js:2165` and later | Encode scores | Paper score encoding is hidden (`trustedScoreWritesAvailable = false`, commit `741be26`). Some cases already `test.skip` (`:2457`, `:2498`). |
| `e2e/profile-browser.spec.js:3995` | `isolated Teacher Attendance` | Attendance now saves through `eduscribe_attendance_save_v1` |
| `e2e/teacher-worksheet-scores.spec.js:137`, `:159`, `:171` | TWF-02 review/release and attendance tests | Written when release was blocked and attendance was read-only. Release and attendance now write through trusted functions. |
| `e2e/admin-double-click.spec.js:134` | `Teaching Load · Save Assignment` | **Possibly stale.** Since B1 (`89ac297`), the department subject is pre-selected and locked, which can change which subject the test adds. It was not run, so whether it fails is unverified. |

Compared with the 2026-11-09 list above, this table adds the two other TWF-02 tests (`:137` and `:171`) and the admin-double-click case.

### Known limitations (2026-11-11)

**Admin rules enforced only in the browser:**
- **Not in the database:** the schedule clash check (`lib/academicRules.js:80-81`) and the department lock (`admin/shared/departmentSubject.js:3-4`). A direct API write, or two admins saving at the same moment, can get past them.
- **Advisers:** the adviser warning is a warning only. No rule limits a teacher to one advisory section.

**Section removal history:**
- **Nothing extra stored:** no reason note and no date are stored when a student is removed. Only the status (`dropped` or `transferred`) is kept (`admin/shared/sectionMembership.js:1-4`).

**Former members stay visible to staff:**
- **Which checks:** `staff_can_see_student` and `section_students_read` (`phase1-03-rls-academic.sql:56-71`, `:114-115`), and `ai_weekly_distribute_members_read` (`dev-ai-weekly-worksheet-distribute.sql:53-60`, for the role `eduscribe_ai_save_executor`).
- **The gap:** none of them filters `section_students.status = 'active'`. B2a keeps rows for Dropped and Transferred students, so the adviser and the scheduled teachers of that section can still read the student's record through the API.
- **Unverified live.**

**Scores before release:**
- **Unreleased marks:** "Accept provisional marks" (`saveMarks`, `useWorksheetAssessment.jsx:419`) writes `points_earned` and `is_correct` to `worksheet_answers` before release. `ws_answers_read` lets a student read their own answer rows.
  - **Still open:** no fix is in the repository.
- **Teacher direct score writes:** `ws_subs_teacher_write` (`phase2-02-worksheet-rls.sql`) lets the owning teacher write a score without releasing it, through the API.
- **Unverified live** for both.

**Phone layout:**
- **Admin row sheet:** in phone landscape, the Close button sits below the fold. It can be reached by scrolling the sheet, tapping the backdrop or pressing Escape. Measured in a mocked sweep, not covered by a test.
- **Admin toast in wide landscape:** at 844×390 landscape, the admin toast can still cover Cancel and Publish. The phone toast rule applies only up to 767px wide.
- **ILAW fields:** the lesson-plan fields stay 36px tall on phones (measured in a mocked sweep).
- **Safe-area insets:** they have no effect. `frontend/index.html:11` has no `viewport-fit=cover`, which was deliberately not added.

**Scope:**
- **Senior High is not supported:**
  - There are no SHS strands or semesters.
  - Grade 11 and Grade 12 still appear in the admin grade list (`lib/academicRules.js:7-9`, `admin/GradeTabs.jsx`).
- **No promotion:**
  - There is no Grade 7→8 promotion wizard.
  - There are no Promoted, Retained or Completed statuses.
  - The repository schema allows `active`, `dropped`, `transferred` and `graduated` for `section_students.status` (`backend/database/schema/COMPLETE_DATABASE_SCHEMA_v2.sql:138`).

**Backups** (`.github/workflows/supabase-backup.yml`):
- **Schedule:** daily at 16:30 UTC (00:30 Manila).
- **Database:** `pg_dump --format=custom --no-owner --no-privileges`, so grants are not in the dump and are not restored with it.
- **Storage files:** also downloaded (`backend/scripts/backup-storage.mjs`).
- **Retention:** the artifact is kept for 7 days.
- **Restore:** never tested.

**Storage** (`backend/database/schema/STORAGE_BUCKETS_CONFIGURATION.sql`):
- **Public buckets:** `lesson-pdfs` (`:26`) and `news-images` (`:93`).
- **`profile-photos`:** the repository script also creates it public (`:80`), with a public-read policy (`:401-403`). That it is private on the live project is **unverified**; the repository does not show it.
- **No quota:** there is no storage quota. The script sets per-bucket file size limits only.

### Future work (NOT built)

None of the following exists in the repository:
- a Grade 7→8 promotion wizard, and Promoted, Retained and Completed statuses
- Senior High strands and semesters
- database enforcement for one advisory section per teacher, the department lock and schedule clashes
- a department picker built from the subjects list
- profile photo upload
- per-subject attendance
- an official teacher-entered final grade
- a tested backup restore
- `viewport-fit=cover`, plus safe-area padding where needed
- a storage quota and a reviewed storage backup plan

### Live-unverified facts (2026-11-11)

These need the live database or a real phone:
- **Release notification:** an end-to-end test in the real app (teacher releases, then the student sees "Result ready").
- **Migrations:** which of them, including `student-release-notification.sql`, are applied live, and the live selftest results.
- **Admin flows by hand against the live project:** A1-A5, B1, B2a and B2b.
- **Student pages:** dark mode and 360px in a real browser against live data.
- **Device QA checklist:** the results from a real iPhone (Safari) and a real Android phone (Chrome). None are recorded in the repository.
- **Live RLS and storage:** that the deployed RLS and storage settings match the repository files, including the `profile-photos` bucket privacy.
- **Live-login specs:** the e2e specs that log in to the live project.

### How to verify (2026-11-11)

Run from the repository root unless noted:
1. **Unit suite** (from `frontend/`): `npx vitest run --maxWorkers=2 --minWorkers=1`. `--maxWorkers=2` alone fails at start-up with a worker-count conflict.
2. **Build** (from `frontend/`): `npx vite build`.
3. **Mocked e2e specs:** these use a fake backend and no real login. Run each with one worker, and leave `E2E_ALLOW_WRITES`, `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` unset:
   - `npx playwright test -c playwright.sections.config.js --workers=1`
   - `npx playwright test -c playwright.schedules.config.js --workers=1`
   - `npx playwright test -c playwright.settings.config.js --workers=1`
   - `npx playwright test -c playwright.admin-final.config.js --workers=1`
   - `npx playwright test -c playwright.profile.config.js --workers=1`. This config also matches the stale tests listed above, so expect those to fail.

**Manual device checklist (headings).** No checklist file exists in the repository. These headings come from the responsive audit of 2026-11-10:
- Safari's toolbar over full-height screens: the Attendance save bar, the worksheet Submit, the last list items
- iPhone zoom on fields, and whether the page stays zoomed
- The on-screen keyboard over pinned dialog footers and the Attendance save bar (Android resize compared with iPhone overlay)
- Long-press, text selection and typing inside the worksheet
- Toasts and bottom sheets against the iPhone home indicator
- Rotating the phone while a dialog or drawer is open
- Native date and time pickers in Distribute and Attendance
- Tap reach of the 40px targets, and the top toast with the keyboard open

### Clarity redesign (frontend only, behind a preview flag)

A new dashboard look ("Clarity") is being added beside the current screens. It is **off by default**: `?clarity=1` turns it on (remembered in `localStorage` as `smartedu-clarity`), and `?clarity=0` or the **Classic view** button turns it off. Only the Student dashboard has Clarity screens so far: the shell, Scores and Overview (commits `4c716e1`, `3071456`, `9ca6287` and `5934476`). Attendance, Announcements, Tasks, the Teacher dashboard and the Admin dashboard are not done; the Admin work is planned for after the defense. **Before the demo, open every demo device with `?clarity=0`.** The full status, file list, commits and limitations are in [docs/clarity-redesign.md](clarity-redesign.md).

### Later changes on 2026-11-11 (after `ec3d724`)

Written from the repository at commit `7e778f6`. This part adds the work done later on 2026-11-11, apart from the Clarity redesign (already linked above). **Owner-reported** means the owner told us the result; we did not check it ourselves.

**Roles: three roles only.**

| Step | Commit (time) | What changed |
|---|---|---|
| F1 | `d35a8fe` (09:16) | An account with an unknown role gets **no access**. Before, it was treated as a student. |
| F2 and F2b | `0520c2f` (10:14) | The `faculty` and `registrar` roles and their dashboards were removed from the app. The F2b follow-ups (approved test edits, Teacher Students tab, admin News tab) are in the same commit. |

- **Roles the app knows:** `main_admin` (with `admin` as another name for it), `teacher` and `student` (`frontend/src/context/AuthContext.jsx:18-28`, `frontend/src/routes/ProtectedRoute.jsx:11-14`).
- **What was removed:** the faculty and registrar routes and dashboards, their login options and role flags, and the two roles in the backend's `ASSIGNABLE_ROLES` (`backend/src/routes/onboarding.js:9`).
- **Unknown roles:**
  - At login, the message is "This account has no valid role. Please contact the administrator." (`AuthContext.jsx:384`).
  - A restored session with an unknown role gets no protected page (`ProtectedRoute.jsx:11-23`).
- **`/faculty-login` stays.** It offers Admin and Teacher only (`frontend/src/pages/auth/FacultyLogin.jsx:11-12`).
- **Memo labels:** "All Faculty" and "Registrar Office" are kept as recipient labels (`frontend/src/lib/memoRecipients.js:22`). They are stored in `memos.recipient`.
- **The `guest` role** stays.
  - The repository uses it for an invited account whose set-up is not finished (`onboarding.js:125`).
  - Archiving an account changes its **status** to `archived`, not its role (`onboarding.js:173-181`).
  - That archived teacher accounts have the role `guest` on the live project is **unverified**; the repository does not show it.

**Database not changed** (deferred until after the defense):
- **Role check:** `profiles.role` still allows 7 values: `main_admin`, `admin`, `faculty`, `teacher`, `registrar`, `student` and `guest` (`backend/database/schema/COMPLETE_DATABASE_SCHEMA_v2.sql:33`).
- **Staff functions** still name the removed roles:
  - `is_school_staff()` (`migrations/phase1-03-rls-academic.sql:40-46`) includes `registrar`.
  - `is_any_staff()` (`migrations/phase5-03-close-the-rls-gaps.sql:52-58`) and `is_active_profile_staff()` (`migrations/phase8-01-profile-authorization-hardening.sql:56-70`) include `registrar` and `faculty`.
- **Old objects:** the `teacher_workload` view (`COMPLETE_DATABASE_SCHEMA_v2.sql:663`) and the `documents` and `pre_enrollment` tables (`:484`, `:507`).
  - No file under `frontend/src` reads them.
  - That both tables have 0 rows on the live project is **owner-reported**.

**Data privacy: consent at login and legal pages.**

| Step | Commit (time) | What changed |
|---|---|---|
| B1 | `7c68595` (10:55) | Clickable links in the public footer and the login panel. |
| B2 | `da8fa96` (12:05) | Terms and Privacy pages, and a required consent tick on the Student and Faculty login. |

- **The consent tick:**
  - Both login pages require it before signing in (`components/auth/ConsentCheckbox.jsx`).
  - Without it, the page shows "Please agree to the Terms of Use and Privacy Statement to sign in.", moves focus to the checkbox, and stops before any login request is sent (`pages/auth/StudentLogin.jsx:75`, `pages/auth/FacultyLogin.jsx:127`).
- **The tick is not stored.** No consent record is written to the database, so the school cannot later show who agreed or when.
- **New public pages:** `/terms` and `/privacy` (`routes/AppRoutes.jsx:40-41`).
  - **Status:** the text is a draft for the school to review (`pages/public/Terms.jsx:3`, `Privacy.jsx:3`). The pages do not say "draft" on screen.
  - **Shown on both:** "Last updated: November 11, 2026" (`Privacy.jsx:35`, through the shared `LegalPage`) and the contact address `307915@deped.gov.ph` (`Privacy.jsx:11`).
  - **School review:** pending.
- **Footer and login links:**
  - **Footer** (`components/PublicFooter.jsx`): the Facebook page, the Google Maps location, the school email (`mailto:`), and links to Privacy Policy (`/privacy`) and Terms of Service (`/terms`).
  - **Login panel** (`pages/public/Login.jsx:126-127`): Facebook and a feedback email (`mailto:` with the subject "Feedback").
  - **Removed:** the Camera icon.
  - **Still plain text:** the phone number `(02) 8642-1234`, which is unconfirmed, and Alumni, which has no page.

**Student announcements fix** (`48044b1`, 13:28): the "Important" badge shows when the priority is "High" in any capitals and with any surrounding spaces (`pages/dashboards/student/tabs/AnnouncementsTab.jsx:109-110`).

**Phone work R1-R5:** described in [Responsive work R1-R5](#responsive-work-r1-r5-frontend-only) above. In short:
- Full-height screens follow the visible screen (`dvh`).
- Fields are 16px on phones, so iPhone does not zoom in.
- Dialog footers stay pinned.
- Long text wraps.
- The header fits a 320px screen.
- On phones up to 767px wide, the toast sits at the top and lets taps pass through.
- Tap targets are at least 40px.
- Each step has guard tests.

**Storage buckets on the live project** (owner-reported, 2026-11-11):

| Bucket | Live setting | Objects | Repository script (`STORAGE_BUCKETS_CONFIGURATION.sql`) |
|---|---|---|---|
| `assignment-submissions` | private | not reported | private (`:53`) |
| `ilaw-exports` | public | not reported | public (`:106`) |
| `lesson-pdfs` | public | 87 | public (`:26`) |
| `news-images` | public | 6 | public (`:93`) |
| `profile-photos` | **private** | 3 | **public** (`:80`), with a public-read policy (`:401-403`) |
| `student-documents` | private | not reported | private (`:66`) |
| `temporary-uploads` | private | not reported | private (`:119`) |
| `worksheets` | public | 2 | public (`:40`) |

- **`profile-photos`:** the repository script does not match the live project. Running the script again would make the bucket public.
- **`worksheets`:** this public bucket holds 2 PDFs whose contents we did not check (**unverified**). Recommended: check that they are handouts, not answer keys or personal information.

**More known limitations** (in addition to the list above):
- **Scores before release:** the unreleased-marks gap above ("Accept provisional marks" writes marks before release, and `ws_answers_read` lets a student read their own answer rows) is still open.
  - **Two options:** A, a database fix, or D, document it only.
  - **Recommendation:** D. The owner's decision is pending.
  - `ws_subs_teacher_write` (listed above) is also unchanged.
- **Every active staff member can read every profile row:**
  - `profiles_read` lets any active staff member, including teachers, read every row in `profiles`, including phone, address and date of birth (`phase8-01-profile-authorization-hardening.sql:90-97`).
  - The Privacy text tells users this: "teachers and administrators can also see the school directory, including contact details" (`Privacy.jsx:62-64`).
- **Unused layout files:** `components/layout/DashboardLayout.jsx`, `SideBar.jsx`, `MobileDrawer.jsx` and `MobileAppBar.jsx`. No app file imports them; only `routes/roleRemoval.test.jsx` mentions them.
- **No priority on admin news:** the admin News form has no field for it (no `priority` in `admin/tabs/NewsTab.jsx` or `admin/useAdminLogic.jsx`).
- **Senior High:** Grade 11 and 12 are left out of QA and the demo, but still appear in the admin grade list (see Scope above).
- **Unchanged and still listed above:**
  - `staff_can_see_student` and `section_students_read` do not filter `status = 'active'`.
  - The schedule clash check and the department lock run in the browser only.
  - No removal reason is stored.
  - The admin row sheet's Close button can sit below the fold in phone landscape.
  - The admin toast can cover Cancel and Publish at 844×390.
  - ILAW fields are 36px.
  - There is no `viewport-fit=cover`.

**Manual QA on the Vercel testing site** (owner-reported, 2026-11-11, not independently verified by us):
- **Reported passed:**
  - Student and Faculty login, with and without the consent tick
  - Admin and Teacher login
  - `/terms` and `/privacy`
  - the footer and login links
  - `/faculty-dashboard` and `/registrar-dashboard` show "not found"
  - a full demo run-through
- **Test accounts archived:** the owner archived the two test accounts `faculty@dpnhs.edu.ph` and `registrar@dpnhs.edu.ph` in the Admin Users tab, and saw them in the archived list.
- **Pending:**
  - device QA by a tester on iPhone Safari, Android Chrome and a tablet, and in dark mode
  - the school's review of the Terms and Privacy text
  - the owner's Vercel check of the Clarity preview (`?clarity=1`)

**Automated tests** (run 2026-11-11 on `7e778f6`; the code is the same as `5934476`):
- **Frontend** (from `frontend/`: `npx vitest run --maxWorkers=2 --minWorkers=1`): Test Files 225 passed (225); Tests 2508 passed, 1 skipped, 6 todo (2515). `vite build` last succeeded on `5934476`, the same code.
- **Backend** (from `backend/`: `npm test`, with the real Supabase and Gemini environment variables unset): 485 tests, 485 passed, 0 failed.
- **End-to-end:**
  - The mocked specs were not re-run for these changes.
  - The live-login specs are not run.
  - `E2E_ALLOW_WRITES`, `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` stay unset.

**Future work (not built):**
- Database clean-up of the `registrar` and `faculty` objects: the role check, the three staff functions, `teacher_workload`, `pre_enrollment` and `documents`
- A consent record (a migration that stores who agreed, and when)
- A feedback form backed by the database (feedback is an email link today)
- The Grade 7→8 promotion wizard
- Senior High (Grade 11-12)
- A priority field for admin news
- Hardening the gaps above: unreleased marks, `ws_subs_teacher_write`, the active-status filters, server-side clash and department checks, the removal reason, phone landscape, `viewport-fit=cover`, and narrower profile reads
- Finishing the Clarity redesign (see [docs/clarity-redesign.md](clarity-redesign.md))
