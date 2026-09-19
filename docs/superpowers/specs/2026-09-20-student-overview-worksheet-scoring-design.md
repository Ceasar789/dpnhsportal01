# Student Overview & Minimal Worksheet Scoring — Design

**Date:** 2026-09-20
**Status:** Approved for planning

## Context

Every summary card on the Student Dashboard's Overview tab shows a placeholder:
grade level and student ID render as em-dashes, and Average Grade, Attendance and
Pending Tasks are all stuck at `0`. The Upcoming Tasks list is permanently empty.

None of this is a display bug. Investigation found four separate root causes:

1. **Reading columns that do not exist.** `OverviewTab.jsx` reads `profile.year`,
   `profile.section`, `profile.avg_grade`, `profile.attendance_rate` and
   `profile.student_no`. The `profiles` table has none of these columns. The real
   enrolment record lives in `section_students` joined to `sections`, built in
   Phase 1 of the academic-structure work.

2. **Querying a column that does not exist.** The tab filters `assignments` and
   `quizzes` by `student_id`. Neither table has that column — both are
   per-section artefacts owned by a teacher, not per-student rows. The per-student
   records live in `assignment_submissions` and `quiz_results`.

3. **No producer.** Nothing anywhere in the live application writes to
   `assignments`, `quizzes`, `assignment_submissions` or `quiz_results`. The only
   writer is `AssignmentsTab_UNUSED.jsx`, a dead file wired to no route. These
   tables have never held real data.

4. **RLS denies the reads.** `assignments` grants SELECT only to its owning
   teacher; `quizzes` has no policy at all; `attendance` grants SELECT only to a
   section's adviser. A student reading any of them gets zero rows by
   default-deny, which the UI renders as `0`.

A fifth problem sits underneath the feature the user actually wants: **there is no
worksheet scoring mechanism in the database.** The `worksheets` table holds a
title, subject, file and a Draft/Distributed/Archived status. It has no due date,
no link to a section, and no per-student score. "Worksheet Performance" cannot be
computed from anything that exists today.

The capstone paper's approved scope (Ch.1, Table 1.1) excludes a full gradebook or
report-card system and a full student-information system. That rules out fixing
this by building either.

## Goals

- Grade level and section come from the student's enrolment record.
- The performance card is named for what it measures — worksheet scores — and
  shows a real average computed from them.
- Attendance shows the student's real attendance percentage.
- Pending Tasks and Upcoming Tasks reflect real worksheets posted to the
  student's section, with real due dates.
- A teacher can record a worksheet score, so the data above can exist at all.

## Non-goals

- No gradebook, report card, subject grade or GWA computation. A worksheet score
  is a worksheet score; it is never rolled into a subject grade.
- No student-information profile. Grade level and section are read from the
  enrolment record only.
- No question builder, in-app answering, auto-checking, submission workflow or
  class scoreboard. Those remain Phase 4 of the teacher-dashboard plan
  (`docs/superpowers/specs/2026-09-17-teacher-academic-structure-design.md`).
- No repair of `assignments`, `quizzes`, `assignment_submissions` or
  `quiz_results`, and no change to the Assignments or Quizzes sidebar tabs. Their
  fate is a separate decision.

## Decisions

**Worksheets are the only task source.** Pending Tasks and Upcoming Tasks read
worksheets posted to the student's section. This matches the paper's terminology
and avoids building on four tables that have never had a producer. The
Assignments and Quizzes tabs stay exactly as they are for now.

**Scoring is manual and minimal.** A teacher posts a worksheet to a section with
a due date, then types a score for each student. This is the smallest mechanism
that makes a real average possible. It is deliberately not the Phase 4 system —
no items, no answers, no auto-checking — and it is not a gradebook, because
nothing aggregates these scores into a subject grade.

**The card is renamed to "Worksheet Performance."** "Average Grade" implies a
grade computation the approved scope excludes. The new name states exactly what
the number is: the mean of this student's worksheet scores.

**`student_id` references `students(id)`.** This matches `attendance` and
`section_students`, the two tables it is queried alongside. Phase 1 already
established that adding a student to a section upserts their `students` row
first, so the row exists by the time any score can be recorded.

## Data model

### New tables

```
worksheet_sections                       -- where and when a worksheet is due
  id, worksheet_id -> worksheets, section_id -> sections
  due_at TIMESTAMP, posted_by -> profiles, posted_at
  UNIQUE(worksheet_id, section_id)

worksheet_scores                         -- one score per student per worksheet
  id, worksheet_id -> worksheets
  student_id -> students, section_id -> sections
  score DECIMAL, total_points DECIMAL
  remarks, checked_by -> profiles, checked_at
  UNIQUE(worksheet_id, student_id)
```

`section_id` is stored on `worksheet_scores` even though it is reachable through
`worksheet_sections`, matching how `attendance` also carries it — it keeps the
RLS predicate a single-table check instead of a join.

### Row-level security

New policies, using the `SECURITY DEFINER` helpers Phase 1 established
(`is_admin`, `is_school_staff`, `teacher_handles_section`, `teacher_advises_section`):

| Table | Teacher | Student | Admin |
|---|---|---|---|
| `worksheet_sections` | all, for own worksheets | read where posted to own section | all |
| `worksheet_scores` | all, for own worksheets | read own row only | all |
| `attendance` | **write** for handled/advised sections (new) | **read own rows** (new) | all |

A new helper `teacher_owns_worksheet(worksheet_id)` carries the ownership check,
for the same reason Phase 1 used helpers: a policy that joins back through
another RLS-protected table is fragile.

**The attendance write policy is not optional.** `attendance` currently has RLS
enabled with a single adviser-SELECT policy and no INSERT or UPDATE policy at
all, so the teacher's Attendance tab cannot record anything — every write is
denied. Without this policy the attendance percentage stays at zero no matter
what else is built.

## Surfaces

### Teacher — Worksheets tab

Two additions to the existing tab, both minimal:

- **Post to section.** Choose a section the teacher handles and a due date;
  writes one `worksheet_sections` row.
- **Enter scores.** Opens the class list for a posted section with a score input
  per student and a shared total-points value; writes `worksheet_scores` rows.

No other worksheet behaviour changes.

### Student — Overview tab

| Element | Source |
|---|---|
| Grade level, section | `section_students` (status `active`) joined to `sections` |
| Student ID | `students.student_number`, falling back to `lrn`, else hidden |
| Worksheet Performance | mean of `score / total_points`, as a percentage, across the student's `worksheet_scores` — each worksheet weighted equally regardless of its total points |
| Attendance | share of the student's `attendance` rows with status `Present` |
| Pending Tasks | count of worksheets posted to the student's section, due date not past, with no score row for this student |
| Upcoming Tasks | those same worksheets, ordered by due date, with title, subject and due date |

Every one of these is a read that can fail. Per the standing rule in this
codebase, a failed read must never render as `0` or as an empty list — it shows a
distinct "could not load" state with a retry, the pattern established in the
Phase 1 admin tabs. An honest zero (a student genuinely has no scores yet) is
shown as an empty state with explanatory text, which is different again.

## Risks

**No data until a teacher acts.** Every card depends on a teacher posting a
worksheet and entering scores. On a fresh database all of them legitimately show
empty states. That is correct behaviour, not a regression, and the empty states
must say so clearly rather than implying the feature is broken.

**Attendance has never been written.** Even with the new write policy, historical
attendance does not exist, so the percentage starts empty until a teacher records
a day. The card must distinguish "no attendance recorded yet" from "0% present" —
these look identical if handled carelessly and mean opposite things.

**The `students` row prerequisite.** A score cannot be recorded for a student who
has no `students` row. Phase 1's class-list upsert covers every student added to
a section, which is the same population that can be scored, so the two stay in
step — but a score-entry path that ever bypasses the class list would reintroduce
the foreign-key failure Phase 1 already hit once.

**Grade-level format.** `sections.grade_level` is an unconstrained VARCHAR holding
values like `Grade 7`. The banner currently renders `Grade {grade}-{section}`,
which would read "Grade Grade 7-Rizal". The rendering must use the stored value
as-is rather than prefixing it again.
