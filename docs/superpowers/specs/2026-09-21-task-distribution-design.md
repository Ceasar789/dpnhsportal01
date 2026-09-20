# Task Distribution & Subject Cards — Design

**Date:** 2026-09-21
**Status:** Approved for planning
**Builds on:** `docs/superpowers/specs/2026-09-20-student-overview-worksheet-scoring-design.md` (Phase 2)

## Context

Phase 2 gave worksheets questions, scores and a release gate. A teacher posts a
worksheet to a whole section with a date-only deadline, and the student sees it
in a flat list.

Testing it surfaced three gaps.

**Nothing reached the student.** The teacher pressed **Distribute**, which
writes `worksheets.status = 'Distributed'` and is read by nothing. **Post** is
the real mechanism. Two buttons, one of them inert, with the inert one better
named — the teacher picked the wrong one and concluded the feature was
unfinished.

**A worksheet goes to everyone or no one.** There is no way to give a task to
three students who missed a lesson, or to withhold one from a student on
leave.

**A task is only ever a worksheet.** The student's sidebar carries Assignments
and Quizzes tabs whose tables no part of the app has ever written. They are
permanently empty, and they imply systems that do not exist.

Underneath: `worksheets.subject` is free text from a five-item list hardcoded
in the source, and every uploaded file is stored with the subject
`'Uploaded Document'`. Phase 1 built a real `subjects` table and a
`teacher_subjects` teaching load; Worksheets has never used either.

## Goals

- A teacher distributes a task to chosen students, not only to whole sections.
- A deadline carries a time, and passing it marks a submission late rather than
  silently doing nothing.
- One task system with a type (worksheet, assignment, quiz, project), replacing
  two empty tabs that promise systems that were never built.
- A task's subject is the teacher's own subject, decided by the teaching load
  rather than typed.
- A student sees their work grouped by subject, with a live countdown.
- A student is told when a task arrives and when a score is released.

## Non-goals

- No separate builder, submission flow or checking flow per type. The type is a
  label on one system. A quiz and a worksheet differ in what the teacher calls
  them, not in how the software treats them.
- No scheduled reminders ("due tomorrow"). Every write in this application
  originates in somebody's browser; a reminder at 8am with nobody logged in
  needs `pg_cron` or an Edge Function, which is a new moving part. Both chosen
  notifications are consequences of an action and need nothing new.
- No change to how a worksheet is built, checked or released. Phase 2 stands.
- No grading, weighting or aggregation of task scores. Unchanged from Phase 2
  and still outside the paper's approved scope.

## Decisions

**The subject is assigned, never chosen.** A teacher's subject comes from
`teacher_subjects`, and every task they create carries it. The builder shows it
as a locked label, not a dropdown. A teacher with no teaching load cannot
create a task and is told to ask the admin — refusing is better than letting
them create work that lands in no subject card.

**One subject per teacher.** If the admin has assigned two, the system refuses
and names the conflict rather than picking one. Guessing would put a Math task
into a Science card with nothing to show it was a guess.

**Distribution is per student.** `task_assignees` holds one row per student who
was given the task. A student with no row cannot see the task at all — not
"sees it, cannot open it". Every checkbox starts ticked, because the ordinary
case is the whole class and it is easier to remove than to add.

**Late is a mark, not a lock.** A submission after `due_at` is accepted and
flagged `is_late`. The teacher sees the flag and decides. A hard lock would
punish the dropped connection this hosting tier produces regularly; no
consequence at all would make the countdown decorative.

**Subject cards come from the student's schedule, not from their tasks.** A
subject with no tasks still shows a card reading "no tasks" — which is
information. Deriving cards from tasks would make a subject vanish and reappear
as teachers post, and would never distinguish "nothing assigned" from "not
enrolled".

**Tasks are sorted by when they were distributed**, not by deadline. The
student asked for this: it matches the order they learned about the work.

**The Distribute button replaces Post and the old Distribute is deleted.**
Keeping an inert button beside a working one is what caused the original
confusion.

**Nothing assigned to a student is allowed to have nowhere to appear.** A task
whose subject is null — every task created before this phase — or whose subject
is not in the student's schedule still gets a card, labelled `Other`. Dropping
such a task from the cards would hide assigned work, which is this codebase's
signature defect wearing a new hat. The `Other` card is rendered only when it
has something in it.

**The notifications policies are written to be correct whatever state the live
table is in.** No archived SQL file contains a single policy for
`notifications`, so its current state is unknown and cannot be assumed. The
migration enables RLS explicitly and creates every policy the table needs from
scratch, idempotently: a user reads and updates their own rows, and a teacher
may INSERT a row addressed to a student they actually teach — insert only, no
update, no read of other people's notifications. Written this way it is correct
whether the table today has no policies, partial ones, or RLS switched off.

## Data model

### Already present, unused

`worksheets.subject_id` and `schedules.subject_id` were added by
`phase1-02-subject-id-columns.sql` and have never been populated. No migration
is needed for either — only writers.

### Changed

```
worksheets
  + task_type  IN (worksheet, assignment, quiz, project)  DEFAULT 'worksheet'
    subject_id  -- existing column; now written on create, from teacher_subjects
  - status      -- 'Draft'/'Distributed' retired; distribution is task_assignees
                --  (column left in place, stops being read or written)

worksheet_submissions
  + is_late BOOLEAN NOT NULL DEFAULT FALSE
```

`is_late` is set by the existing `guard_worksheet_submission_write` trigger on
the transition into `submitted`, in the same place it already stamps
`submitted_at`. Computing it client-side would let a student's clock decide
whether they were late.

### New

```
task_assignees                         -- who was given this task, and when it is due
  id, task_id -> worksheets, student_id -> students
  section_id -> sections               -- the section they were in when distributed
  due_at TIMESTAMP                     -- date AND time
  assigned_by -> profiles, assigned_at TIMESTAMP
  UNIQUE(task_id, student_id)
```

`due_at` lives here rather than on the worksheet so a teacher can give the same
task to two sections with different deadlines, which `worksheet_sections`
already allowed and this must not take away.

### `worksheet_sections`

Kept. It answers "which sections has this task gone to", which the teacher's
card summary and the student's `student_can_see_worksheet` RLS helper both use.
Distributing writes both: one `worksheet_sections` row per section touched, and
one `task_assignees` row per student.

The student's read path tightens: `worksheet_items` and `worksheets` become
readable when a `task_assignees` row exists for the caller, rather than when
they are merely enrolled in a section the task was posted to. A student who was
not ticked must not be able to read the questions.

### Row-level security

| Table | Teacher | Student | Admin |
|---|---|---|---|
| `task_assignees` | all, own tasks | read own rows | all |
| `notifications` | **insert for another user** (new) | read and update own | all |

`notifications` is the one that needs care. It has no policies in any archived
SQL file, so its state must be checked against the live database before this is
written. A teacher must be able to insert a row addressed to a student, which
is a write on behalf of someone else — the policy has to permit exactly that
and no more: insert only, and only for a student the teacher actually teaches.
Otherwise any signed-in user can post a notification to anyone in the school.

## Notifications

Two producers, both triggered by an action already being taken:

| When | Who is told | Text |
|---|---|---|
| A task is distributed | each newly assigned student | `New Worksheet in Math — due Sep 25, 5:00 PM` |
| A score is released | that student | `Your Math worksheet has been checked` |

Re-opening Distribute to add a student notifies only the added ones. A student
already assigned is not told twice.

Both writes are best-effort: a failed notification must not roll back the
distribution or the release. The teacher is told the task went out but the
notification did not.

## Surfaces

### Teacher — task builder

A **Type** selector (worksheet / assignment / quiz / project) and a locked
subject label reading `Subject: Math (from your teaching load)`. No subject
dropdown. With no teaching load, creation is refused with the reason.

### Teacher — Distribute

One modal, three parts:

- **Who** — advisory section (only if they advise one) or a section they teach,
  from their schedule.
- **Deadline** — date and time, defaulting to 11:59 PM, which is what "due
  Sep 25" ordinarily means.
- **Students** — the section roster, every box ticked, with a select-all. A
  running count: "3 of 4 will receive this".

Re-opening it shows who already has the task. Adding students is allowed.
**Unticking a student who has already started is refused** — their work is not
discarded silently; the teacher clears the submission first.

### Student — Overview

The flat Upcoming Tasks list becomes subject cards, one per subject in their
section's schedule:

- subject name, pending count, and the nearest deadline as a live countdown
- red under 24 hours, amber under 3 days, neutral beyond
- past the deadline: `Late by 2h 15m`, red
- a subject with no tasks says so

Clicking a card opens the Tasks tab filtered to that subject.

### Student — Tasks tab

`Worksheets` is renamed `Tasks`. **`Assignments` and `Quizzes` are removed** —
both have been empty since they were built and the type badge now covers what
they promised.

Each row carries the type badge, the title, when it was distributed, a live
countdown, the deadline in full, and either an action or the result. Sorted by
distribution date, newest first. A subject filter, pre-set when arriving from a
card.

The countdown runs in the browser from the `due_at` already loaded. No polling.

## Risks

**Teaching load becomes a prerequisite.** A teacher with no assigned subject
cannot create a task. That is the correct failure — a task with no subject
belongs to no card — but it means the admin's Teaching Load tab must be filled
before any teacher can work. The message has to name that, not just refuse.

**The subject cards depend on `schedules`.** If a section has no schedule rows,
the student sees no cards at all, even holding assigned tasks. The empty state
must distinguish "no subjects scheduled for your section yet" from "no tasks",
and tasks whose subject is not in the schedule need somewhere to go rather than
disappearing.

**`worksheets.subject` and `subject_id` will disagree.** Existing rows have the
free-text column filled and the id column null, and `'Uploaded Document'`
matches no real subject. Resolved by the `Other` card: those tasks are still
shown, just not under a subject. No backfill is attempted — guessing a subject
from free text would put work under the wrong heading, which is worse than
admitting it has none.

**Two writes, no transaction.** Distribution writes `worksheet_sections`,
`task_assignees` and notifications from the browser. A failure partway must
leave a state the teacher can understand and safely retry, not a task half
distributed with no indication of which half.

**Retiring two tabs is visible to users.** Students who have seen Assignments
and Quizzes will notice they are gone. They were always empty, so nothing is
lost, but it should be a deliberate statement rather than a silent removal.
