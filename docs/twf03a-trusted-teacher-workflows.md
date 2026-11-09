# TWF-03A trusted Teacher workflows — review-only contract

> **Status update (2026-11-09).** The sections from "Source findings" to "TWF-03B isolated prerequisite" are the original design-phase review and are kept as history. Statements in them that are no longer true are followed by an **Update** note. The system as it stands now is described in [Current system](#current-system-2026-11-09) at the end of this document, written only from the repository files. Live database state was not inspected for this update.

**DESIGN ONLY (original design-phase note). No SQL was executed, no database was contacted, and no production writer was enabled.** `shared/trustedPersistence/teacherWorkflowContract.js` is a pure synthetic check. It accepts a snapshot labelled trusted for tests; nothing in the active application imports it or proves that a browser supplied snapshot is trustworthy.

## Source findings and boundary

The React frontend uses `frontend/src/config/supabase.js` with the public anon key and sends classroom reads directly to Supabase. `AuthContext.jsx` loads the signed-in profile for UI state. `useWorksheetAssessment.jsx`, `GradesTab.jsx`, `AttendanceTab.jsx`, `TasksTab.jsx`, and `studentTaskGraph.js` issue the relevant queries. The Express service in `backend/src/app.js` mounts AI and onboarding/admin routes, with bearer verification in `requireAuth.js`; it has no mounted classroom score, review, release, or attendance route. `backend/src/persistence/postgresAdapter.js` and the TDI-04B RPC SQL are disabled, review-only authoring work. TDI-04B explicitly excludes scoring, submissions, release, and attendance.

The current client-side score and attendance handlers return unavailable before writing. The Essay Review Lab is fictional. Review marks and feedback in `CheckSubmissionsModal.jsx` live in React state and disappear on close. Tests of these paths do not establish durable storage.

**Update:** release and attendance now write through trusted database functions. Release uses `eduscribe_worksheet_score_release_v1` (`worksheet-score-release.sql`), called from `useWorksheetAssessment.jsx` `releaseScore`. Attendance uses `eduscribe_attendance_save_v1` (`attendance-save.sql`) through `teacher/tabs/attendanceSaveClient.js`. Only paper score encoding is still blocked before writing (`trustedScoreWritesAvailable = false`, `useWorksheetAssessment.jsx:20`). "Accept provisional marks" in `CheckSubmissionsModal.jsx` now saves marks durably (`saveMarks`, `useWorksheetAssessment.jsx:418-433`). Essay feedback text is still not stored. The Essay Review Lab is still fictional, and its route exists only in development builds (`TeacherDashboard.jsx:434`).

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
