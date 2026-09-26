# Handoff — 2026-09-25 (updated)

Written at the end of a long session so the next one can pick up cold. Branch
`task-distribution`, 112 commits ahead of master, 94 tests, clean tree, and
PUSHED to origin — the first time any of this work has left the machine.

## Where the work lives

Nothing is merged. Two stacked branches:

```
master
  └── worksheet-assessment   (Phase 2 — worksheet assessment)
        └── task-distribution  (Phase 3, performance, news expiry,
                                seed data, teaching load)  ← HEAD
```

`task-distribution` contains everything. Merging it brings Phase 2 with it.

## SQL the user has run against the live database

In this order. All idempotent; all run in the Supabase SQL Editor **without RLS**.

```
phase2-01 … phase2-05      Phase 2 tables, RLS, worksheet owner policies
phase3-01 … phase3-04      task_assignees, task RLS, notifications RLS, assignee read scope
phase4-01                  news.expires_at column
phase4-02                  trigger: notify the teacher when a student submits
phase4-03                  seed — 60 dummy students
phase4-04                  seed — 4 dummy teachers, SUPERSEDED by phase4-05
phase4-05                  seed — 48 dummy teachers, one per subject per grade
```

All of phase 4 was run on 2026-09-25 and the user confirmed it.

On `phase4-02`: a client write could not do this. `notifications_staff_insert_for_student`
only lets staff write to a student, and no policy lets a student write to their
teacher. Reviewed and sound, with one accepted caveat — plpgsql's `WHEN OTHERS`
does not catch `QUERY_CANCELED`, so a `statement_timeout` landing inside the
trigger body would fail the student's submit. Not mitigated, because shortening
the timeout inside the block still raises an uncatchable cancel; the trigger
does three small indexed operations, and a database congested enough to time
out there was already failing the UPDATE itself.

The seed files write to `auth.users` and `auth.identities` directly, which
Supabase does not support — those tables belong to GoTrue and their columns
change between releases. A GoTrue upgrade breaks those FILES, not the
application. Acceptable for throwaway test accounts; never for real users,
who go through the admin's Create User screen.

**Do not re-run `phase2-02` or `phase3-02` on their own.** Each supersedes objects
the other creates; both file headers carry the warning. If one is re-run, re-run
the later file after it.

## Deployed

Live at **https://eduscribe-dnhs-portal.vercel.app** since 2026-09-26.

One Vercel project: the React bundle as static files, the Express app as a
serverless function at `/api` via `api/index.js`. Same origin, so no CORS.
AI lesson plan generation confirmed working end to end in production.

Four things that each cost time and would cost it again:

- Renaming a Vercel project does NOT move its domain. The old one stays
  assigned until the new one is added by hand under Settings -> Domains.
- Supabase Auth's Site URL and Redirect URLs are pinned to whatever domain
  is actually live. An unlisted redirect is not refused — it is silently
  replaced by the Site URL, so a password reset lands somewhere unexpected
  and nothing anywhere reports a failure.
- Environment variables added under the **Shared** tab do nothing until they
  are linked to the project. They belong under Projects.
- Vercel caps a serverless request body at 4.5MB, before any application
  code runs, which is why the PDF ceiling is 3MB. That rejection arrives as
  a 413 with no body, so the frontend explains it on its own terms.

Code pushed to `master` deploys automatically. A change to an environment
variable or a project setting does not — that needs a manual Redeploy.

## Row Level Security — audited and closed

`backend/database/tests/phase5-01-rls-tests.sql`, run 2026-09-26 against the
live database: **26 PASS, 0 SKIP, 0 FAIL, 0 REVIEW.** Nothing untested.

The first run found two things no unit test could have, because the
application code is correct in both cases and the database was the one
saying no.

**Three features that had never worked.** `pre_enrollment`, `documents` and
`grades` each had RLS switched on and not one policy — which is default deny
on every command, not weak security. All three were empty, and the reason
was that the database refused every insert. The registrar's enrolment queue,
their document records and the teacher's grade sheet were all reachable in
the UI and all silently doing nothing. `phase5-03` gives them policies.

**Two policies that gave away too much.** `profiles` was fully readable by
every authenticated account, and it holds phone, date_of_birth and address —
any of the sixty seeded students could read every classmate's and every
teacher's home address. `memos` was readable by everyone despite being
addressed mail. Both narrowed.

Known and accepted, excluded from the suite BY NAME so a new one still
fails: six dead tables left on default deny (nothing imports the only file
referencing them), and three unconditional SELECTs that are correct — the
public calendar, the school's own contact details, and the subjects lookup.

**What `profiles` still exposes.** RLS is row-level and cannot hide `phone`
while showing `name`. Column privileges would, but five places call
`select('*')` on profiles and would fail outright rather than omit a column.
So a student now sees only themselves, staff, and their own classmates —
and a classmate's phone number is still visible to them. Closing that needs
a view with a named column list and a change at every `select('*')`.

**The last two checks were the hard ones**, and they now run against real
data: a second student can neither read nor overwrite another student's
answers.

They reported SKIP at first, and the reason is worth keeping. The fixture
named `student01@example.com` while the answer had been submitted from a
different account, so the suite went on saying "nothing to test" with a
real submission sitting in the table. A test that names its own fixture
reports SKIP forever and looks like it is working. It now finds the most
recent submission and works backwards to whoever owns it.

## Open items

Almost everything that stood here is now done. What remains:

**1. The end-to-end suite has never run.** Fifteen Playwright specs in
`e2e/`. They parse and list, and not one has executed — the machine they
were written on could not download a browser binary.

    npx playwright install chromium
    npm run test:e2e

Read-only by design: there is no test database, so they run against the
live one and nothing creates, edits or deletes a row.

**2. `profiles` still exposes columns a student should not see.** The RLS
audit narrowed WHICH ROWS a student may read — themselves, staff, their own
classmates — but Row Level Security cannot hide `phone`, `date_of_birth` or
`address` while showing `name`. A student can still read those for a
classmate.

Closing it needs a view with a named column list and a change at every
`select('*')` on profiles — five of them. Bigger than a policy change, and
worth doing before this holds real students' data.

## Done since this file was last rewritten

- **Backend built.** `backend/src` runs an Express service holding the
  Gemini key. Confirmed generating lesson plans in production.
- **Deployed.** One Vercel project, live, AI path verified end to end.
- **Merged.** `task-distribution` merged to `master` and pushed.
- **RLS audited.** 26 checks, all passing, nothing untested.
- **Three dead features revived.** `pre_enrollment`, `documents` and
  `grades` had RLS on with no policies and had never accepted a write.
- **Password reset verified** on the live site, after a rename left it
  pointing at a domain that no longer existed.
- **Monorepo split** into `frontend/` and `backend/` workspaces.
- **117 automated tests**, plus the RLS suite and the Playwright specs.

## Known gaps the user already knows about

- **Nothing auto-updates except the notification bell and the student graph on window focus.** No table is in the
  `supabase_realtime` publication and never has been, so the 27 dead
  `postgres_changes` subscriptions were removed. A student sees a newly distributed task or a released score when the
  window regains focus (or on Refresh); a teacher needs to reopen Check Submissions to see a new one. The bell
  refreshes on open, on tab focus, and on a 60s poll that pauses when hidden.
- The teacher's Grades tab has the same unresolvable PostgREST embed that
  broke attendance (`students(profiles(...))` — there is no FK between those
  two tables). Pre-existing, out of scope so far, and it will render an empty
  roster.
- `notifications.action_url` is written but nothing navigates by it.

## Architecture, stated plainly

**Frontend** React 18 + Vite. **Backend** a Node/Express service plus the
PostgreSQL schema and its policies. **Database** Supabase.

An npm workspaces monorepo: `frontend/`, `backend/`, and `api/index.js` which
exports the same Express app as a Vercel serverless function. One Vercel
project, so the API is same-origin and there is no CORS.

The backend is deliberately thin, and the rule is one sentence: **it owns the
credentials the browser must never see.** Today that is the Gemini API key.
Next it will be the Supabase service role, for creating user accounts
properly.

Everything else talks to Supabase directly, and that is a choice rather than
an omission. **Authorization is 41 Row Level Security policies inside the
database**, enforced per query, whoever is asking — not `if` statements in a
route that hold only for requests which went through that route. Re-expressing
them in JavaScript would be more code and fewer guarantees.

For a long time this repo genuinely had no Node backend, and earlier notes
said so. That is no longer true: `npm start -w backend` runs a real service,
and the AI generation path was confirmed working end to end on 2026-09-26.

Consequences that still shape every decision here: migrations are run by hand
in the SQL Editor; RLS is the authorization boundary; there are no scheduled
jobs, which is why news expiry filters on read rather than deleting at
midnight.

## The one debugging lesson worth carrying forward

The single biggest performance find this session — an 8.8-second deadlock on
every login, for every user — was invisible in the code and was found from a
browser console screenshot. `supabase.from()` was being called inside
`onAuthStateChange`, which holds an internal lock for the duration of the
callback; `await` suspends the function without releasing that lock, so the
query blocked until our own timeout fired, twice. Nothing about the source
looked wrong. What gave it away was the *pattern*: it timed out at exactly 4
seconds, every time, for all three roles, regardless of load — congestion is
intermittent, deadlock is not.

Ask for console output when something is slow. It finds what reading cannot.
