# MPS1-D2A — disposable Lesson Plan security test package

**DESIGN ONLY — NOT EXECUTED. NO DATABASE CONNECTION OR MIGRATION IN D2A.**

This runbook turns the six `mps1d0SecurityContract.test.js` TODOs into D2B
database assertions. It uses the fictional IDs and `example.invalid` emails in
[`backend/database/tests/mps1-d2a-synthetic-fixtures.json`](../backend/database/tests/mps1-d2a-synthetic-fixtures.json).
The file is data, **not** a seed script and contains no credentials. Existing
MPS1-D1 JavaScript tests prove only isolated contract behavior.

## Environment and stop conditions

Prefer a **separate disposable Supabase project**: it reproduces Supabase Auth,
PostgREST, PostgreSQL roles/RLS, and RPC privileges. A separate local Supabase
stack is acceptable if those same boundaries can be exercised. Do not point
the harness, CLI, frontend, or backend at a shared project. Use a unique project
name, URL, anon key, database credentials, and synthetic Auth users. Never copy
production keys, accounts, rows, Storage objects, or school data. The service
role, if needed for fixture setup/cleanup, must be isolated to that project and
must **not** be used as the acting role in authorization assertions.
The active browser client reads `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`; the backend separately reads `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. D2B must use an isolated
test configuration and must not edit or reuse the active `.env` files.

Prerequisites for D2B: owner-provided disposable environment and approval at
each gate below; PostgreSQL/Supabase tooling and a test runner with separate
per-user sessions; current metadata inventory; reviewed, manually selected
schema baseline; reviewed trusted Manual and AI function migration; reviewed
rollback; durable revision and idempotency design; and a trusted HTML sanitizer
contract. Tool installation and provisioning are not part of D2A. Keep test
configuration outside production `.env` files and validate the disposable
project identity before any SQL or authenticated request.

Use setup credentials only to create the fictional Auth users and minimum
profiles, subjects, assignments, and plans. Run each assertion as the specified
**authenticated user or anonymous role**, with no service-role fallback. Record
row counts and hashes of relevant plan payloads before and after denials.
Clear per-case rows/receipts in the disposable project; after the suite, remove
synthetic Auth users and project-specific secrets. Teardown or project deletion
is a later separately approved operation, not a D2A command.

**Stop D2B before testing** if the target project cannot be independently
identified as disposable, the schema/grants differ from the reviewed migration,
real data appears, the function owner/EXECUTE set is unknown, or an unexpected
network destination is observed. Never treat a policy-denied `0 rows` result as
success without checking that no mutation occurred.

## Compatibility matrix

| Contract item | Evidence class | Current evidence / required D2B check |
|---|---|---|
| `lesson_plans` core columns, `objectives TEXT`, status constraint, timestamps | Verified in repository only | `COMPLETE_DATABASE_SCHEMA_v2.sql:148–175`; inspect deployed columns/types/checks. |
| `lesson_plans.subject_id` | Verified in repository only | `phase1-02-subject-id-columns.sql:12` adds it; deployment and backfill unverified. |
| `teacher_subjects` subject/grade/year unique tuple and FK relationships | Verified in repository only | `phase1-01-academic-tables.sql:24–35`; inspect deployed constraints and relationships. |
| `profiles.role` and active-status field | Verified in repository only | Canonical schema and `requireAuth.js` use these; inspect deployed values/constraints without reading real profile rows. |
| `school_settings.school_year` | Verified in repository only | Overview reads it; approved write authority is separate Manila-time June rollover. No settings change. |
| `lesson_plans` RLS enabled; ownership-only INSERT/UPDATE | Previously verified deployed metadata | Earlier owner-provided screenshots showed these policy properties. They do **not** establish the full current policy set. |
| `teacher_subjects` own/admin SELECT and admin write; `subjects` authenticated SELECT/admin write; `is_admin()` helper | Previously verified deployed metadata | Earlier owner-provided metadata showed these definitions. Re-inventory before migration. |
| All other `lesson_plans` policies, permissive/restrictive composition, table and column grants | Unverified / requires future inspection | Query catalogs in D2B's approved environment/metadata review. Existing permissive policies combine with OR. |
| Function owner, `SECURITY DEFINER`, `search_path`, EXECUTE grants | Unverified / requires future inspection | Trusted functions are proposed, not deployed. Check `PUBLIC`, `anon`, and `authenticated` privileges. |
| Updated-at and other relevant triggers | Verified in repository only | Canonical schema declares `update_lesson_plans_updated_at`; deployed trigger set unverified. |
| Revision/CAS and durable request-id receipt | Unverified / requires future inspection | D1's `revision` is synthetic; no deployed column or idempotency table is established. |

No current deployed metadata was queried in D2A. The historical screenshots are
partial evidence, not proof that the current deployed schema is identical.

## Future harness interface

Implement D2B tests behind an adapter with `asUser(fixtureAlias)` (real
disposable-project Auth JWT), `asAnon()`, `rpc(name,args)`, `direct(table,verb,body)`,
`readOwnPlans()`, and privileged **assertion-only** snapshots of specified
synthetic row IDs and side-effect table counts. Function names in this runbook
are proposed contracts, not deployed endpoints. Fixtures must be built from
the Version 2 serializer, with a blank Draft and a Saved document containing
the four required information fields, one objective, one activity, and one
assessment. Use a clock controlled in the disposable environment or inject a
trusted test instant into a test-only function variant; never treat a client
date parameter on the production function as authorization evidence.

For each case below, **cleanup** means roll back the case transaction or delete
only its tagged synthetic rows/receipts using the disposable setup role, then
confirm the baseline snapshot. Auth users are removed at suite teardown.
Failure means stop promotion of the migration; inspect returned SQLSTATE,
effective grants/policies, and before/after snapshots before changing a test.

## Six database proof groups

Every case has synthetic setup, acting role, operation, expected result,
row-level assertion, cleanup, and failure interpretation. `A` is the active
synthetic Teacher; `B` is the other Teacher from the fixture manifest.

### A — Effective direct-write denial

| ID / setup | Acting role and operation | Expected result and row assertion | Cleanup / failure interpretation |
|---|---|---|---|
| A1: A has current-year Science assignment; no plan ID `manualA` | A JWT: direct `lesson_plans` INSERT with own `teacher_id`, valid-looking Manual JSON, `status=draft` | Permission/RLS denial; no `manualA` row or request receipt | Cleanup A1 synthetic rows. Any row means direct-write bypass remains. |
| A2: A owns a private Manual plan | A JWT: direct UPDATE of own `objectives`, status, or title | Denial or zero affected rows; original row hash/revision unchanged | Restore/delete fixture. Any changed column means direct UPDATE remains open. |
| A3: A owns plan; `ai_generated` and `subject_id` varied | A JWT: attempt column-targeted INSERT/UPDATE and ownership-only policy bypass | Denied for every variant; no row/column changes | Cleanup variants. A successful variant identifies a table/column grant or permissive-policy gap. |
| A4: no session | `anon`: direct INSERT and UPDATE | Denied; no rows changed | Cleanup fixture. Success means anonymous write exposure. |

### B — Trusted Manual writer and EXECUTE boundary

| ID / setup | Acting role and operation | Expected result and row assertion | Cleanup / failure interpretation |
|---|---|---|---|
| B1: A has current-year Science assignment; complete V2 fixture | A JWT: `save_manual_ilaw_v2` Draft and Saved creates with distinct request IDs | Each returns exactly one A-owned row; `status=draft`, `ai_generated=false`, V2 workflow matches intent; official subject/grade/year retained | Delete both rows/receipts. Failure suggests function identity, assignment, validation, or grant defect. |
| B2: same fixtures | `anon` and synthetic Student JWT: call Manual RPC | EXECUTE denied or authorization rejection; no row/receipt | Cleanup. Success means function exposed too broadly or role check missing. |
| B3: suspended Teacher has an assignment; adviser-only Teacher advises the synthetic section but has no `teacher_subjects` row | Each corresponding JWT: call Manual RPC | Both denied; no plan/receipt | Cleanup. Success means profile status or assignment check is missing. |
| B4: A identity, but request names B as Teacher | A JWT: call Manual RPC with forged `teacherId` | Reject or ignore forged value; no B-owned row and no B-visible plan | Cleanup. B-owned output means client identity was trusted. |

### C — Forged Manual content, owner and state

| ID / setup | Acting role and operation | Expected result and row assertion | Cleanup / failure interpretation |
|---|---|---|---|
| C1: A owns Science Grade 7 assignment | A JWT: change subject ID, grade, year, or display name in otherwise valid V2 payload | Each denied; no plan or receipt for rejected request | Cleanup. Success means official assignment is not authoritative. |
| C2: A owns a Draft | A JWT: request `published`, Saved→Draft, malformed V2, or unsupported version | Each denied; row status remains `draft`, old payload/revision unchanged | Restore fixture. Change means transition or format bypass. |
| C3: A has incomplete Saved document (missing each of seven approved fields in turn) | A JWT: Save each variant; Draft with same incomplete structure as control | Saved variants denied with stable field paths; Draft allowed; no rejected Saved row | Cleanup. Accepted incomplete Save or rejected valid Draft means validation mismatch. |
| C4: B owns `manualB`; A owns `manualA` | A JWT: update `manualB` while forging owner/plan ID | Denied with no B data in error; B row hash/revision unchanged | Restore fixture. Change or private-data leak means ownership flaw. |
| C5: historical-year Manual row for A | A JWT: update old row | Denied; row unchanged and remains readable under existing authorized SELECT | Restore fixture. Success means historical-edit gate missing; failed read means read regression. |

### D — AI/HTML compatibility and migration gate

| ID / setup | Acting role and operation | Expected result and row assertion | Cleanup / failure interpretation |
|---|---|---|---|
| D1: A has current-year official assignment; synthetic generated HTML | A JWT: future trusted AI create | One private A-owned AI/HTML row; server-derived assignment/classification; sanitized HTML; no published state | Delete row/receipt. Failure blocks closing current direct AI INSERT. |
| D2: A owns `aiA` with HTML, source PDF references, and an expected revision | A JWT: trusted HTML edit and title rename | Same ID, verified new title/HTML, source `file_url/file_name/file_path` preserved, revision advanced once | Restore fixture. Lost source fields or duplicate row is compatibility failure. |
| D3: A owns legacy HTML row with `ai_generated=false` | A JWT: authorized read/reopen; permitted legacy edit through the reviewed compatibility operation | Readable content; if edit is supported, same row ID and private state; no JSON conversion | Restore fixture. Failure means legacy breakage. |
| D4: A has no assignment or submits `ai_generated`, forged teacher, wrong year, or Manual V2 JSON as HTML | A JWT: future AI create/update variants | Each denied; no row/receipt | Cleanup. Accepted variant is authorization or classification bypass. |
| D5: current direct AI flow baseline and future writer coexist in disposable project | A JWT: isolated frontend Save/reopen/rename regression before direct-write closure, then repeat after coordinated replacement | Both phases pass; direct INSERT/UPDATE denied only after trusted replacement passes | Restore migration snapshot. Any interruption means rollout order is unsafe. |

Generation itself uses the existing AI endpoint and external provider; D2B
should stub the provider or use synthetic HTML. Print/PDF is a local rendering
regression, not an authorization proof. Do not send a real PDF or call Gemini.

### E — Transaction, concurrency and durable idempotency

| ID / setup | Acting role and operation | Expected result and row assertion | Cleanup / failure interpretation |
|---|---|---|---|
| E1: A owns Draft at revision R | A JWT: Draft→Saved, then Saved→Saved with expected revision | Same plan ID; each successful request increments revision exactly once | Restore fixture. Duplicate ID or wrong revision indicates update defect. |
| E2: two sessions read revision R | A JWT sessions: concurrent different updates using R | Exactly one commits; other conflicts; no merged/lost payload | Restore fixture. Two successes or silent overwrite means missing atomic CAS/lock. |
| E3: no `manualA` row; one request UUID | A JWT: repeat identical create, including parallel attempts | One row and one durable receipt; each successful response identifies same row | Cleanup row/receipt. Multiple rows mean idempotency failure. |
| E4: request UUID already used with different payload | A JWT: reuse UUID for different content | Conflict; original row and receipt unchanged | Cleanup. New content means request-key collision bypass. |
| E5: server commits but response is dropped by the test proxy | A JWT: reconcile by request UUID, then retry same request only if contract permits | Reconciliation returns committed row; no second create | Cleanup. Second row or unknown outcome without recovery means unsafe retry semantics. |

### F — Private Save and side-effect absence

| ID / setup | Acting role and operation | Expected result and row assertion | Cleanup / failure interpretation |
|---|---|---|---|
| F1: snapshot synthetic plans, class-posts, worksheet distribution/task, notification, enrollment, and activity tables that exist in reviewed schema | A JWT: Manual Draft then Manual Saved | Plan `status=draft`; V2 `workflowState` changes; no new publish/post/distribution/notification/enrollment rows | Remove plan/receipt; compare snapshots. Any side-effect row is a privacy breach or hidden trigger. |
| F2: equivalent snapshot for AI path | A JWT: future trusted AI private Save/update | Private plan only; no student-visible or related-table writes | Restore fixture. Any side effect violates Save/Post separation. |

For F1/F2, enumerate the **actual deployed** related tables and triggers before
running. Do not infer table names from UI labels, and do not count legitimate
internal request receipts as student-facing side effects.

## AI non-regression matrix

| Workflow | Current source behavior | D2B compatibility gate |
|---|---|---|
| Generate | AI endpoint returns HTML; `LessonPlansTab.jsx` sanitizes before editor insertion | Stub provider; returned HTML remains editable; no trusted writer called merely by Generate. |
| Save new | `handleSaveIlawPlan` directly INSERTs `lesson_plans`, including PDF references and `ai_generated:true` | Future writer must save equivalent private content before direct INSERT closure. |
| Reopen | Saved-list SELECT then `handleViewPlan` sanitizes `objectives` HTML | Existing AI and legacy rows still reopen, with no Manual JSON conversion. |
| Edit/rename | Existing UPDATE writes title/HTML with ID, owner, optional `updated_at` match | Trusted update retains same ID and conflict behavior; rename and HTML persist. |
| Print/PDF | `handlePrint` uses current editor HTML and filename utility | Synthetic browser regression; no change to current print/download behavior. |
| Legacy HTML | `savedPlanType` may classify non-V2 rows as Other | Authorized reads remain; trusted update must distinguish legacy HTML from Manual V2. |
| Source PDF | New AI INSERT includes `file_url`, `file_name`, `file_path` | References survive new Save, update, reopen, and rename; no real Storage upload in tests. |

The active AI path must not be disabled merely because the new Manual writer
passes. Direct-write closure and both frontend adapters form one separately
approved compatibility release.

## Gates and D2B order

1. **Provisioning approval:** owner confirms a unique disposable project/local
   stack, isolation method, tooling, budget, and teardown owner. No keys need
   to be pasted into reports.
2. **SQL approval:** inspect deployed metadata separately, reconcile schema and
   historical policies/grants, then review exact test-project migrations,
   function owner/search path, revision/idempotency schema, and rollback.
3. **Security-test approval:** verify disposable project fingerprint, synthetic
   Auth identities and migration state; run A–F with user JWTs and row snapshots.
4. **Frontend integration approval:** only after Manual and AI DB proofs and
   AI/legacy browser regressions pass, connect active adapters in a separate
   sprint. Manual buttons remain inactive until then.
5. **Production approval:** review evidence, rollback, direct-write closure,
   AI continuity, security review, and owner QA before any deployment.

Within D2B: provision → inspect metadata → approve/apply disposable migration →
seed synthetic fixtures → verify function/grant baseline → run A–F → run AI and
legacy browser regressions → capture sanitized evidence → rollback test →
approved teardown. Do not skip a gate or treat D1 mock results as DB proof.
