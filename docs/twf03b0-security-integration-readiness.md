# TWF-03B-0 — Student privacy and trusted transaction readiness

**Status: PARTIAL. Review-only source analysis, 22 October 2026. No database connection, SQL execution, migration, or production write.** The existing [TWF-03A contract](twf03a-trusted-teacher-workflows.md) remains the operation-level authorization baseline. This document narrows the next increment to student privacy and one score/review transaction. Migration files describe intended source behavior; they do not establish deployed grants, policies, data, or security.

## 1. Executive status and architectural evidence

| Finding | Classification | Evidence and limit |
| --- | --- | --- |
| React uses the public Supabase client for classroom reads; the student task graph requests submission state and released scores separately. | SOURCE VERIFIED | `frontend/src/lib/studentTaskGraph.js`, `frontend/src/pages/dashboards/student/tabs/TasksTab.jsx`. Its `.eq('released', true)` protects that UI request, not a crafted request. |
| Score and attendance writes remain disabled; essay feedback/approval are React state only. | SOURCE VERIFIED | `useWorksheetAssessment.jsx`, `AttendanceTab.jsx`, `CheckSubmissionsModal.jsx`; see TWF-03A. No durable save or release can be claimed. |
| Express has no mounted classroom score, review, release, or attendance route. TDI-04B authoring RPCs are unapplied proposals and exclude assessment. | SOURCE VERIFIED | `backend/src/app.js`, `backend/database/proposals/tdi04b/`. |
| Synthetic helper models current teaching-load/section/year/enrollment checks, score bounds, review revision, and released-only student result reads. | SYNTHETIC TEST VERIFIED only when its local test executes | `shared/trustedPersistence/teacherWorkflowContract.js` and `.test.js`; caller-supplied facts make it unsuitable as a production authorization boundary. |
| Actual schema, default/column grants, RLS, policies, views, function owners/EXECUTE, deployment order, and data contents. | LIVE DATABASE NOT VERIFIED | No shared metadata query is authorized for this sprint. Source migrations and SQL test files cannot settle deployment state. |
| Homeroom attendance writer role. | OWNER DECISION REQUIRED | Source policy admits an adviser **or** any scheduled Teacher; TWF-03A recommends adviser-only for homeroom, pending Owner decision. |

## 2. Student privacy threat review

**Priority finding — potential unreleased-grade disclosure if the inspected policy and broad SELECT grants are deployed.** `phase2-01-worksheet-assessment-tables.sql` puts `score`, `total_points`, `remarks`, `checked_by`, and `checked_at` on `worksheet_submissions`, and `is_correct`/`points_earned` on `worksheet_answers`. `phase2-02-worksheet-rls.sql` lets a student SELECT their entire own submission/answer rows without a `released` condition. RLS chooses rows, not columns. The React graph filters its score request and TasksTab selects only `answer`, but a student could make a different PostgREST SELECT if applicable grants permit it. **This is a source-supported conditional risk, not a verified production exposure.** Later policies and deployed grants remain unknown.

| Surface / attempted request | Source boundary | Risk / required containment | Classification |
| --- | --- | --- | --- |
| Own unreleased `worksheet_submissions.score,total_points,remarks,checked_by,checked_at` | `ws_subs_read` admits own row regardless of release. | High conditional disclosure via direct SELECT; withhold grading columns before release while retaining safe state access. | SOURCE VERIFIED / LIVE DATABASE NOT VERIFIED |
| Own `worksheet_answers.points_earned,is_correct` | `ws_answers_read` admits own submission answers. | High conditional per-question disclosure; preserve own `answer` read/write without grading fields. | SOURCE VERIFIED / LIVE DATABASE NOT VERIFIED |
| Another student's submission or answers | Student branches match `auth.uid()`/`own_submission`. | Expected denial; verify all other permissive policies, grants, RPCs, views, and actual JWT behavior. | SOURCE VERIFIED / LIVE DATABASE NOT VERIFIED |
| `worksheet_item_keys.correct_answer` | Separate key table; `ws_keys_all` has admin/teacher branches, no student branch. | Intended protection, contingent on deployed policy, grants, helper behavior, RPC/view/storage/worksheet JSON paths. Do not put keys in student-facing question rows or files. | SOURCE VERIFIED / LIVE DATABASE NOT VERIFIED |
| `worksheet_items` and own `worksheet_answers.answer` | Ordinary assigned question/answer content. | Keep accessible where task/enrollment rules allow; broad revocation that breaks task taking is unacceptable. | SOURCE VERIFIED / LIVE DATABASE NOT VERIFIED |
| Released result | React uses `released=true` and own student ID. | Server/database must enforce own, released-only safe projection; answer key stays private after release absent a separate approved rule. | SOURCE VERIFIED / DESIGN ONLY |
| Views, RPCs, table/column grants, storage links | No assessment-safe result RPC or view found in inspected migration source; TDI-04B functions concern authoring. | Inventory **all deployed** surfaces and privileges. Absence from source search does not prove absence in production. | SOURCE VERIFIED / LIVE DATABASE NOT VERIFIED |

### Review-only containment proposal

First reconcile deployed table and column grants, all permissive RLS policies, views and security modes, RPC signatures/EXECUTE, and student paths. Then keep ordinary questions and the student's own answer text on a safe read surface; expose submission ID/status/release state via a separate safe projection; expose own score/feedback only through a trusted released-only projection. Remove direct student SELECT of grading columns or move grading data to a private table if PostgreSQL grants cannot express the needed split without breaking teacher access. Narrow column grants are possible but one `authenticated` role is shared by Teachers and Students, so a global denial can break Teacher reads. A security-invoker view still follows caller grants/RLS; it is not a bypass or automatic concealment of the base table. A carefully scoped SECURITY DEFINER RPC can return different projections by verified actor and release state, but its owner may bypass RLS: derive actor from `auth.uid()`, validate active profile and all relationships inside it, fix `search_path`, qualify objects, revoke default/public EXECUTE, grant exact signature only to `authenticated`, and test direct base-table bypass. Select the final combination only after the isolated schema/grant reconciliation. No policy/grant SQL is proposed for execution here.

## 3. Trusted score and review transaction specification

**One proposed versioned RPC for saving a review draft (including manual scores and essay feedback); one separate RPC for approval. Neither releases results.** This reuses the direct Supabase plus trusted PostgreSQL transaction pattern in TDI-04B, without using its authoring executor as an assessment writer. No RPC exists or is deployed for this purpose.

| Contract item | Reviewable requirement |
| --- | --- |
| Arguments | `submission_id`, `expected_revision`, `request_id`, complete per-item marks and essay feedback. No teacher ID, role, owner, school year authority, student ID, total, maximum, approval, or release flag from client. Approval takes `submission_id`, expected review revision, and independent request ID. |
| Trusted actor and scope | Inside the transaction derive `auth.uid()`; require active Teacher profile. Load current official school year, teacher's **official subject/grade/year load**, worksheet author/provenance, posting, exact section, submitted student's active enrollment, submission and its worksheet, and permitted state. Adviser status alone cannot score. Historical-only rights permit reads, never current writes. Missing year/provenance fails closed. |
| Locking/validation | Lock submission/review and relevant authorization/provenance rows in a consistent order; recheck after lock. Require submitted/checked and unreleased state. Fetch item IDs/maxima from the stored worksheet; exactly one mark for each required item, correct association, finite nonnegative two-decimal score no greater than item maximum; define incomplete draft fields explicitly, while approval requires all required marks and feedback conditions. Reject changed/removed worksheet items and invalid enrollment. |
| Atomic write | In one database transaction upsert/replace marks, feedback, reviewer ID/time, draft status, revision, total and maximum computed from stored items, audit event, and request receipt. A material edit to an approved review transitions it to draft and invalidates approval in the same transaction. Never set `released=true` or expose marks through student reads. |
| Concurrency/retry | Compare expected revision under lock; stale update returns `revision_conflict` with no changes. Receipt key is actor + operation + request ID; same payload retry returns committed receipt, same ID/different payload conflicts. Lost response is resolved by receipt lookup. Unique constraints enforce duplicate prevention. Concurrent writers serialize or one fails CAS; no last-writer-wins. |
| Failure/outcomes | Any validation or insert/update/audit/receipt failure rolls back all rows. No UI durable-success message until trusted receipt confirms commit. Return generic `not_found` for unauthorized object IDs, `invalid_score`/`invalid_state` for authorized validation failures, `revision_conflict`/`idempotency_conflict`, and retryable transaction failure separately; avoid leaking cross-student existence. |
| Approval | Separate transaction and request receipt; rederive current authority, lock the same rows, compare revision, validate saved review completeness/total, stamp approver/time and increment revision. No result release, notification of grades, or student-visible scoring fields. Edit after approval must invalidate approval. |
| Audit | Append trusted actor, operation, submission/worksheet, old/new revision and state, request ID, time, and outcome without raw answer keys or unnecessary answer text. Resolve audit storage/retention from the isolated schema before final SQL. |

The current schema lacks a durable review revision, essay feedback, approval state, and verified worksheet school-year provenance. The additive shape, function owner, exception mapping, receipt and audit tables need a separate **unapplied** migration/RPC review after metadata reconciliation. Release remains a later separately authorized operation with its own action, revision/approval recheck, receipt, audit, and released-only read surface. Attendance persistence remains separate and disabled.

## 4. Attendance policy decision record

`phase2-03-attendance-rls.sql` permits `teacher_handles_section` **or** `teacher_advises_section`; the former checks a schedule for the section without subject/year, and the latter checks current `sections.adviser_id`. This is not a safe historical writer rule. The canonical attendance uniqueness includes nullable `subject`, so duplicate homeroom `(student, section, date, NULL)` rows may be possible; actual constraints/data are unverified.

| Option | Benefit | Cost / risk |
| --- | --- | --- |
| A. Current adviser alone writes homeroom attendance | One accountable section owner; aligns the current Teacher Attendance tab with a homeroom date. Easier unique key and transfer handoff. | Must preserve historical **read** via recorded adviser intervals; transfer ends write rights. Needs a substitute/delegation policy if adviser absent. |
| B. Scheduled Teachers also write | Supports subject-period attendance if timetable is authoritative. | Requires explicit subject, period, grade, section, school year, enrollment, and duplicate semantics; old `teacher_handles_section` is too broad. A homeroom row cannot safely be overwritten by any scheduled Teacher. |

**Recommendation: A for homeroom; OWNER DECISION REQUIRED.** If B is wanted, design a distinct subject/period attendance record and timetable authority rather than widening the homeroom writer. In either option: Manila `YYYY-MM-DD` calendar date, exact section/year/enrollment, non-null attendance kind or reviewed partial uniqueness, expected revision, audit, and read-only historical access. Keep current write gate disabled.

## 5. Disposable database plan and metadata checklist

**ISOLATED DATABASE NOT STARTED.** Prefer a reproducible local Supabase stack only after independently confirming CLI, Docker-compatible runtime, and a reviewed loopback identity protocol. Existing [TDI-04A readiness](tdi04a-isolated-integration-readiness.md) found those executables absent from PATH at its preflight and the current `tools/tdi04/isolationGuard.mjs` handles hosted canonical URLs only; do not assume present availability. A separate disposable hosted project is the alternative. The Owner must identify/attest an independent target, separate URL and credentials, cost/quota, no real data, and approve each identity check/marker read, synthetic Auth setup, migration/test execution, and cleanup gate. Never link the shared project or inherit production credentials. Use the guard's independent project-identity-before-marker ordering; add local-loopback support only after review. Establish reproducible reset/cleanup **inside the disposable target only**.

Before SQL design, capture an approved read-only inventory from that verified target: migration provenance/order; tables/columns/defaults/types; PK/FK/unique/check/index definitions; table and column grants/default privileges; RLS enable/force status; **every** policy and permissive/restrictive combination; views and `security_invoker` setting/base-table rights; all function signatures, owner, `SECURITY DEFINER`, `search_path`, and EXECUTE/default privileges; triggers; score/review/attendance rows and duplicates. Compare with local migrations, TDI-04B proposals, and observed queries. Unknown or divergent metadata is **LIVE DATABASE NOT VERIFIED** until captured. Do not extract real student rows.

Synthetic fixtures: active/inactive Teacher, Student A/B, Main Admin and unauthenticated actors with actual isolated Auth JWTs; official current/historical subject loads; adviser transfer; two subjects, grades, sections and years; matching/mismatching worksheet posting, enrollment and submission; released/unreleased results; private keys; duplicate attendance candidates. Enable actual RLS in the isolated test database. Do not substitute handcrafted JWT claims or mocked repositories for this gate.

## 6. Isolated authorization test matrix (planned, not executed)

Run direct PostgREST table/column SELECT and mutation attempts **plus** RPC calls with each real isolated actor JWT; check exact returned fields, error category, unchanged rows, audit/receipt, and absence of leaked keys. Positive controls: assigned active Teacher saves a complete draft and approves it without release; same-request retry returns the receipt; student reads own task/answer text and, after a separately approved explicit release operation exists, only their own released result; authorized adviser reads historical attendance without gaining current write rights.

| Negative case | Expected result |
| --- | --- |
| 1. Student selects own unreleased scoring fields; 2. selects private answer keys; 3. selects another student's submission | No grading fields before release; no key rows through table/view/RPC/storage; no other student row. |
| 4. Teacher unassigned subject; 5. adviser outside load; 6. other section; 7. historical-only assignment | Trusted score/review write denied; historical read may remain where provenance proves it. |
| 8. Negative/nonfinite/invalid-decimal mark; 9. above question maximum | Entire save rejected; no partial mark, review, receipt, or audit success. |
| 10. Duplicate retry and conflicting replay; 11. stale revision; 12. concurrent reviewers; 13. injected mid-transaction failure | Same payload retry idempotent; changed replay/stale write denied; one concurrent revision wins; rollback is complete. |
| 14. Approval without release; 15. premature student result request; 16. bypassed UI/direct request | Approved draft stays unreleased; result denied; server validates independently of UI. |
| 17. Unauthenticated direct table; 18. unauthorized function EXECUTE | Denied for protected score, key, review, and write surfaces. |
| 19. Attendance write to another section; 20. duplicate homeroom row | Denied or conflict under Owner-approved policy; one exact section/date/kind record. Attendance writer remains disabled until later increment. |

Also test inactive Teacher, wrong grade/year, invalid enrollment, wrong posting/worksheet/submission association, released-review edit, student requests grading columns through `select=*`, and permitted historical reads after transfer. Existing `backend/database/tests/phase5-01-rls-tests.sql` checks other-student rows and key rows, but its source does not establish unreleased grading-column denial or deployed behavior. These cases require future isolated execution.

## 7. Eleven skipped browser cases and restoration

All locations are `e2e/profile-browser.spec.js`. These are deliberately skipped while trusted writes are disabled; **none passed in this sprint**. A synthetic browser can verify disabled-write feedback now, but old success expectations need a trusted writer and revised safe UI contract. Six retired Quick Create skips in the same file are unrelated and excluded.

| # / location | Original expected behavior | Why skipped; local verification and trusted dependency | Restoration |
| --- | --- | --- | --- |
| 1 / 1827 `partial manual score writes identify the failed row without claiming rollback` | Partial per-row score writes and “saved and released.” | Disabled writer; old partial/release expectation conflicts with atomic save and separate release. Local no-write case exists. Needs transactional RPC and UI rewrite. | Score/review integration; replace old expectation. |
| 2 / 1847 `online work requires explicit per-student overwrite before paper scoring` | Confirm overwrite then PATCH submission. | Disabled writer; local confirmation UI may be tested without write. Needs trusted conflict/overwrite policy. | Paper-score later phase, after Owner rule. |
| 3 / 2032 `Check announces a synthetic write failure without closing` | Review save failure remains in dialog. | `Check` branch skipped; local mock can test future error UI, but durable save absent. | Score/review integration. |
| 4 / 2032 `Encode scores announces a synthetic write failure without closing` | Score save failure remains in dialog. | `Encode scores` branch skipped; same dependency. | Score/review integration. |
| 5 / 2073 `Check blocks dismissal and history navigation during a pending write` | Pending review save protects dirty work. | `Check` branch skipped; pending write does not exist. | Score/review integration. |
| 6 / 2073 `Encode scores blocks dismissal and history navigation during a pending write` | Pending score save protects dirty work. | `Encode scores` branch skipped; pending write does not exist. | Score/review integration. |
| 7 / 3694 `an unverified save keeps durable refresh guidance without claiming success` | Ambiguous attendance response requires refresh. | Disabled attendance writer; local no-write status tested. Needs trusted receipt/read reconciliation. | Attendance integration after policy choice. |
| 8 / 3711 `save serializes rows, prevents duplicate submission, and updates only after success` | One attendance write, pending UI, then saved status. | Disabled writer; trusted idempotent attendance endpoint needed. | Attendance integration. |
| 9 / 3733 `failed save keeps previous status and offers a row retry` | Failed attendance update retains old value; retry succeeds. | Disabled writer; trusted error/retry contract needed. | Attendance integration. |
| 10 / 3748 `a successful HTTP response without a matching update never claims saved` | Zero-row update is not success. | Disabled writer; trusted affected-row/receipt check needed. | Attendance integration. |
| 11 / 3760 `keyboard marking and changing dates load the matching saved records` | Keyboard attendance save and date-specific reload. | Disabled writer; local date navigation/read can be tested separately; needs trusted attendance persistence. | Attendance integration. |

## 8. Review artifacts, blockers, and next increment

This document is the only TWF-03B-0 review artifact and the only file changed by this sprint; no SQL/RPC implementation is applied. Remaining blockers: deployed grants/RLS/view/function inventory; verified independent test target and real synthetic Auth JWTs; trusted worksheet year/posting/enrollment provenance; additive durable review/revision/audit/receipt schema; student-safe projections; Owner attendance policy; explicit release design; historical assignment provenance. **Next smallest increment:** after Owner approval for a verified disposable target, reconcile its read-only metadata and validate student direct-table privacy first. Only then prepare an unapplied privacy containment and score/review RPC migration for review. Keep score, attendance, and release production gates disabled.

### Executed local checks

| Check | Result | Boundary |
| --- | --- | --- |
| `node --test shared/trustedPersistence/teacherWorkflowContract.test.js` | 5 passed, 0 failed, 0 skipped | Pure synthetic facts only. |
| Six focused frontend Vitest files: GradesTab, assessment subject scope, essay review model, worksheet checking, academic rules, calendar rules | 90 passed, 0 failed, 0 skipped | Unit/component behavior only. |
| `npx playwright test --config playwright.profile.config.js e2e/teacher-worksheet-scores.spec.js` | 31 passed, 0 failed, 0 skipped | Isolated mock browser. Fixture intercepts `**/*`, uses `.supabase.invalid`, aborts unmocked external requests, and asserts no real Supabase host. This is not a full browser-suite result. |
| Frontend `npm run build` | Passed; existing dynamic/static import and large-chunk warnings | Build only. |
| `git diff --check` | Passed; line-ending warnings for preexisting modified files | Does not include this untracked document, so its whitespace was inspected separately. |

Lint was not run: the inspected frontend `package.json` has no lint script. Database authorization, data persistence, and live student privacy remain **LIVE DATABASE NOT VERIFIED**. The prior TWF-03A counts were independently reproduced for its 5 pure and 90 focused frontend tests; its reported 16 browser count was not rerun as that exact selection. This sprint ran the 31-case worksheet-score browser file instead.
