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

## Open items, most useful first

**1. Math tasks in "Other" — CLOSED.** Never diagnosed by the query that was
pending here for three days, because the design changed out from under it.
The subject cards used to come from `schedules` alone, so a task whose subject had no schedule row for that
section fell into an "Other" bucket that discarded the one useful thing about
it — its subject name.

The card set is now the schedule PLUS every subject the student has work in
(`src/lib/studentTaskGraph.js`), so a task always lands on a card named after
its own subject. Other emptied itself and was then deleted outright: the
card, the `?subject=other` filter and `src/lib/otherTask.js` with its six
tests are gone.

A task with no subject at all has no card. Deliberate and safe: it is still
counted in the pending total and still listed in full on the Tasks tab, and
the app cannot create one anyway — both worksheet insert paths set
`subject_id` and refuse without it.

**2. Performance part 2 — DONE.** The student dashboard now fetches one
graph once (`src/lib/studentTaskGraph.js`, held by
`student/StudentDataContext.jsx`). 18 round trips across Overview + Tasks
became 9, and moving between the two costs none. Because nothing here
auto-updates, the graph reloads on window focus, throttled to 30s — the
refetch-on-tab-switch that used to surface a new task is gone.

**3. Almost nothing built since 2026-09-22 has been clicked by a human.**
The student data-layer consolidation, the teacher-notification trigger, the
five seed files, the Teaching Load rebuild, the grade-level split of Teaching
Load and Schedules, the inline form validation, the bell's mark-on-open and
the removal of Other all passed `npm run build` and 94 tests. Almost none of
it has been opened in a browser.

That is the exact state the `Loader2` bug shipped in: Vite does not resolve
free identifiers, so an undeclared global goes into the bundle untouched and
fails only in a browser. `renderSmoke.test.jsx` now covers the student tabs
and both rebuilt admin tabs, which closes that hole and nothing wider — and
not even all of it: with no sections in the stub, SchedulesTab renders only
its empty state, so the section-open path is untested. Verified by removing
an import used only there and watching the suite still pass.

**4. The Gemini API key ships to the browser.**
`src/pages/dashboards/teacher/tabs/LessonPlansTab.jsx:109` reads
`VITE_GEMINI_API_KEY`, and Vite inlines every `VITE_*` value into the bundle at
build time. `.env` being gitignored protects the repo, not the shipped
JavaScript. Anyone who opens the teacher dashboard can read the key. **This is
the one thing in the system that genuinely needs a server** — an API key cannot
be protected in a browser. Discussed with the user, not yet decided.

**5. Merge.** Not done. The branch is pushed to origin, so the work is safe,
but nothing is merged into `master` and the full flow has never been
browser-tested end to end. Ask before merging.

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

There is **no Node backend**, and there never was — the user believed there was.
`package.json` has no server dependency and no start script; Node only runs Vite
during development and the build. The browser talks straight to Supabase.

**The backend is Supabase**: Postgres, Auth, Storage, the auto-generated REST
API, and RLS. This is a legitimate architecture (Backend-as-a-Service), and it
is worth the user being able to say so accurately — "Node.js" invites the
question "where is the server code?", which has no answer.

Consequences that shape every decision in this repo: migrations are run by hand;
**RLS is the only authorization boundary**; there are no scheduled jobs, which
is why news expiry filters on read rather than deleting at midnight.

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
