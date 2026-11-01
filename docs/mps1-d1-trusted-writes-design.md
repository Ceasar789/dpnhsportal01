# MPS1-D1 trusted Lesson Plan writes — isolated design

**DESIGN ONLY — NOT DEPLOYED. NOT PROVEN BY DATABASE TESTS.**

This document specifies a future database boundary. The executable D1 artifacts
are synthetic-only `frontend/ilaw-preview/trustedWriteContract.js` and
`syntheticTrustedPlanStore.js`. Neither is imported by the active Teacher app.
Production Manual Draft/Save remains disabled; the existing AI Save is unchanged.

## Evidence and unresolved deployed facts

The repository's canonical `lesson_plans` schema stores `objectives TEXT`,
`teacher_id`, `title`, `subject`, `grade_level`, `ai_generated`, and a status
limited to `draft|published|archived`. A separate migration adds `subject_id`.
The repository's ownership-only INSERT/UPDATE policies cannot enforce the new
assignment contract by themselves. Historical deployed screenshots confirmed
ownership-only policies, but not the complete current policy/grant inventory.
No deployed revision column or idempotency table has been verified. Verify the
current columns, constraints, policies (including permissive/restrictive mode),
table and column grants, triggers, function owners/EXECUTE grants, and subject
assignment contract before writing a migration.

## Proposed operations and trust boundary

### `save_manual_ilaw_v2` (proposed name; signature subject to metadata review)

Input: Version 2 document, `draft|saved` intent, stable request UUID, optional
plan UUID and expected revision. Output: one private row ID, verified revision,
workflow state, and a receipt for reconciliation. Caller-supplied Teacher ID,
subject name, year, role, `ai_generated`, and row status are never authority.

Within one database transaction, the future function must derive `auth.uid()`,
read an active Teacher profile, calculate the June-rollover year from trusted
database time in `Asia/Manila`, and verify an official
`teacher_subjects(teacher_id,subject_id,grade_level,school_year)` tuple. It must
verify a structurally valid, lossless Version 2 document, check document
learning-area/grade agreement, enforce the seven Saved completion requirements,
and derive the persisted assignment labels from trusted rows. Draft may be
educationally incomplete. Both states map to database `status='draft'`; the
validated payload's `workflowState` distinguishes them. No publishing or other
side-effect tables are part of this transaction.

On update, lock the existing row, verify ownership and stored Manual V2 type,
reject historical-year edits, compare the expected revision atomically, retain
the row ID, and allow only Draft→Draft, Draft→Saved, or Saved→Saved. A stale
revision or Saved→Draft request fails without writing. A new request ID scoped
to the authenticated Teacher must either return its prior committed receipt or
create once. Reusing the same ID with different content fails. A response lost
after commit is reconciled by request ID; the client must not blindly create
again. The in-memory D1 store illustrates behavior, not transaction isolation.

**Schema dependency:** a durable revision/CAS mechanism and durable unique
Teacher+request-ID receipt are needed unless the deployed schema already has
equivalent facilities. These require separate migration review and approval.

### `save_lesson_plan_html` (future trusted operation)

New future AI/HTML plans require the same authenticated active Teacher and
official subject-grade-current-year assignment. Server code determines HTML
classification and private status; a client `ai_generated` flag cannot relax
checks. Reject Manual V2 JSON through the HTML operation. A trusted HTML
sanitization/validation boundary remains required before storage; the D1
authorization seam intentionally returns **no storable HTML row**. Owned legacy
HTML reopen/update, title rename, PDF references, and existing sanitized output
need compatibility tests. Historical reads remain available under existing
authorized read rules. The current direct AI Save stays live until a coordinated,
separately approved migration replaces it; closing direct writes first would
break it.

## Grant/RLS and function prototype obligations

In a disposable database first, create separately reviewed functions owned by
a tightly controlled role, with a fixed safe `search_path` and schema-qualified
table/function references. Explicitly revoke `EXECUTE` from `PUBLIC` and grant
only the intended authenticated role. Verify function ownership and any
`SECURITY DEFINER` bypass privileges. Reconcile every applicable permissive
policy: PostgreSQL ORs permissive policies, so adding a stricter policy does not
close an existing ownership-only path. Coordinate revocation of direct
authenticated/anon/PUBLIC table **and column** INSERT/UPDATE grants with both
Manual and AI adapters. Preserve required SELECT behavior. Review DELETE on its
own merits; this design does not silently change it.

Deploy only after the trusted operations, frontend adapters, and AI/legacy
compatibility tests are ready together. A failed rollout must restore the
previous AI write path and its verified grants/policies from a reviewed rollback
plan; it must not leave direct writes closed with no working AI replacement.
No SQL is included here or executed by D1.

## D2 disposable-database proof and approval gates

Use a new disposable Supabase/Postgres project with only synthetic accounts,
profiles, assignments, and plans. Install the reviewed migration there, then
test actual authenticated JWT roles rather than a service-role simulation.
Prove authorized Draft/Saved, wrong Teacher, inactive/wrong-role Teacher,
unassigned subject/grade/year, adviser-only, malformed/forged documents,
private transitions, historical edit denial, direct INSERT/UPDATE bypass denial,
function EXECUTE restrictions, same-ID updates, concurrency, duplicate requests,
ambiguous-response reconciliation, and absence of Post/distribution/notification.
Run existing AI Save/HTML/rename/PDF and legacy read regressions. Inspect resulting
rows after each denial; a mock PASS is not a database PASS.

Owner approval is required before: (1) selecting a revision/idempotency schema
design after deployed metadata inspection; (2) applying any migration even to a
disposable project; (3) changing active AI or Manual write paths; and (4)
production deployment. The approved Manila academic-year rule and seven Saved
completion fields are already reflected in the isolated D1 contract; no
`school_settings` or historical read behavior was changed.
