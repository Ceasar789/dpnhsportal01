# Handoff — 2026-09-22

Written at the end of a long session so the next one can pick up cold. Branch
`task-distribution`, 89 commits ahead of master, 96 tests, clean tree.

## Where the work lives

Nothing is merged. Two stacked branches:

```
master
  └── worksheet-assessment   (Phase 2 — worksheet assessment)
        └── task-distribution  (Phase 3 + performance + news expiry)  ← HEAD
```

`task-distribution` contains everything. Merging it brings Phase 2 with it.

## SQL the user has run against the live database

In this order. All idempotent; all run in the Supabase SQL Editor **without RLS**.

```
phase2-01 … phase2-05      Phase 2 tables, RLS, worksheet owner policies
phase3-01 … phase3-04      task_assignees, task RLS, notifications RLS, assignee read scope
phase4-01                  news expiry column
```

**Not yet run, waiting on the user:** `phase4-02-submit-notification.sql` — the
AFTER UPDATE trigger that notifies a teacher when a student submits. A client
write could not do this: `notifications_staff_insert_for_student` only lets
staff write to a student, and no policy lets a student write to their teacher.
Reviewed and sound, with one accepted caveat — plpgsql's `WHEN OTHERS` does not
catch `QUERY_CANCELED`, so a `statement_timeout` landing inside the trigger
body would fail the student's submit. Not mitigated, because shortening the
timeout inside the block still raises an uncatchable cancel; the trigger does
three small indexed operations, and a database congested enough to time out
there was already failing the UPDATE itself.

**Do not re-run `phase2-02` or `phase3-02` on their own.** Each supersedes objects
the other creates; both file headers carry the warning. If one is re-run, re-run
the later file after it.

## Open items, most useful first

**1. Math tasks landing in the "Other" card.** The user distributed a task as a
Math teacher and it appeared under `Other` on the student's Overview. Not yet
diagnosed. Two possible causes and they need different fixes, so **do not start
changing code until this query has been run**:

```sql
SELECT w.title, w.subject AS text_subject, w.subject_id, s.name AS linked_subject
FROM worksheets w LEFT JOIN subjects s ON s.id = w.subject_id
ORDER BY w.created_at DESC LIMIT 5;

SELECT sec.name AS section, sub.id AS subject_id, sub.name AS subject
FROM schedules sch
JOIN sections sec ON sec.id = sch.section_id
LEFT JOIN subjects sub ON sub.id = sch.subject_id
ORDER BY sec.name;
```

`subject_id` null on the task → the write path is at fault, fix in code.
Task has a subject but the section's schedule has no row for it → working as
designed; the admin needs to add the schedule. Subject cards come from
`schedules.subject_id`, never from the tasks.

**2. Performance part 2 — DONE.** The student dashboard now fetches one
graph once (`src/lib/studentTaskGraph.js`, held by
`student/StudentDataContext.jsx`). 18 round trips across Overview + Tasks
became 9, and moving between the two costs none. Because nothing here
auto-updates, the graph reloads on window focus, throttled to 30s — the
refetch-on-tab-switch that used to surface a new task is gone.

**3. The Gemini API key ships to the browser.**
`src/pages/dashboards/teacher/tabs/LessonPlansTab.jsx:109` reads
`VITE_GEMINI_API_KEY`, and Vite inlines every `VITE_*` value into the bundle at
build time. `.env` being gitignored protects the repo, not the shipped
JavaScript. Anyone who opens the teacher dashboard can read the key. **This is
the one thing in the system that genuinely needs a server** — an API key cannot
be protected in a browser. Discussed with the user, not yet decided.

**4. Merge.** Not done, deliberately. The user has not browser-tested the full
flow end to end. Ask before merging.

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
