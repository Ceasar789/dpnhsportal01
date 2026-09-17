# Teacher Dashboard & Academic Structure — Design

**Date:** 2026-09-17
**Status:** Approved for planning

## Context

The Teacher Dashboard's most important features are built but inert. `StudentsTab`
already queries `sections` and `schedules`; it always renders empty because nothing
in the application can create that data and the tables carry no RLS policies, so
Postgres denies every read by default.

Three gaps compound:

1. **No producer.** No screen in any dashboard can create a section, a schedule, or
   place a student in a section. The Registrar's Scheduling tab lists and deletes
   schedules but has no insert path.
2. **No subject registry.** `subject` is free text on `schedules`, `lesson_plans`
   and `worksheets`. "MATH" and "Mathematics" are different values, which makes any
   "same subject" comparison unreliable.
3. **No RLS.** `sections`, `section_students`, `schedules` and fourteen other tables
   have row-level security enabled with zero policies. Reads fail closed.

A fourth problem sits alongside: `AssessmentsTab` implements a full question,
submission and grading UI against four tables that were never created. It is dead
code occupying a sidebar slot.

## Goals

- Admin can define the academic structure: subjects, teaching load, sections,
  class lists, and schedules.
- A teacher sees the subjects, sections, schedules and class lists that are actually
  theirs, derived from the schedule.
- Lesson plans and worksheets are tied to a subject the teacher holds, and can be
  posted to specific sections, reused, and reposted.
- A worksheet carries its own scores. Students may answer in the app or on paper;
  either way the score lands in one place.
- Lesson plans and worksheets export to DOCX and PDF.

## Non-goals

- PPT export. A lesson plan is document-shaped; auto-slicing it into slides produces
  poor output. Revisit only if asked.
- A separate assessments subsystem. Worksheets absorb it.
- Automatic student promotion between school years.
- Copying student enrolment across school years. Each year enrols fresh.

## Decisions

Each decision below was settled with the user; the rationale is recorded so later
work does not silently reverse it.

**Admin owns academic structure.** Subjects, teaching load, sections, class lists
and schedules all live in the Admin dashboard. The Registrar's half-built Scheduling
tab becomes read-only: it keeps listing schedules, and its delete action is removed,
so there is exactly one place where this data is authored.

**Teaching Load is a view as well as an editor.** It answers "which teachers hold
which subjects, at which grade level" in one screen — the faculty overview the user
asked for. It does not duplicate the existing Users tab, which stays responsible for
accounts and roles; Teaching Load covers only what a teacher teaches.

**Subjects are a table, not free text.** Eight rows (Mathematics, English, Science,
Filipino, Araling Panlipunan, TLE, MAPEH, ESP), admin-maintained. Grade level is a
separate dimension, never baked into the subject name — folding grade into the name
would turn eight rows into thirty-two and make the list hard to maintain. This also
fixes the Registrar Overview's "Subjects" count, which queries a table that has
never existed.

**Teaching load is explicit, per grade level, per school year.** A teaching load
record is `(teacher, subject, grade level, school year)`. Grade 7 Mathematics and
Grade 8 Mathematics are different assignments held by different people. Recording
the load separately from the schedule means a teacher can be established before any
class exists, the schedule's subject picker can be constrained to what the teacher
actually holds, and a new school year starts by copying last year's load and editing
only what changed.

**Posting is a relation, not a column.** One lesson plan reaches many sections, so
the link lives in a junction table rather than a `section_id` column. A unique
constraint on `(plan, section)` prevents double-posting.

**Reuse and repost are different operations.**
*Repost* adds a row to the junction table: one plan, now on two sections; editing it
changes both. *Reuse* copies the plan first, then posts the copy, so the second
section can diverge. Reuse also carries a plan across school years, since plans
belong to the teacher rather than to a year.

**Lesson plans are internal; worksheets are not.** A lesson plan's section link is
organisational — it tells the teacher which plan serves which class. Worksheets
appear in the student's dashboard.

**One score location.** Scores live on `worksheet_submissions`. A student who
answers in the app gets a submission with `source = 'online'`; a student who answers
on paper gets one with `source = 'manual'` holding only the teacher's encoded score.
There is no separate grades table, which is why the Grades tab is retired.

## Data model

### New tables

```
subjects
  id, name UNIQUE, code UNIQUE, description, is_active

teacher_subjects                          -- the teaching load
  id, teacher_id -> profiles
  subject_id -> subjects
  grade_level, school_year
  UNIQUE(teacher_id, subject_id, grade_level, school_year)

lesson_plan_sections
  id, lesson_plan_id -> lesson_plans, section_id -> sections
  posted_by, posted_at
  UNIQUE(lesson_plan_id, section_id)

worksheet_sections
  id, worksheet_id -> worksheets, section_id -> sections
  posted_by, posted_at, due_at
  UNIQUE(worksheet_id, section_id)

worksheet_items                           -- questions, when answered in-app
  id, worksheet_id -> worksheets
  position, question, item_type, options JSONB
  correct_answer, points
  UNIQUE(worksheet_id, position)
  item_type IN (multiple_choice, true_false, short_answer, essay)

worksheet_submissions                     -- one per student per worksheet
  id, worksheet_id, student_id, section_id
  source    IN (online, manual)
  status    IN (in_progress, submitted, checked)
  submitted_at, score, total_points, remarks
  checked_by, checked_at
  UNIQUE(worksheet_id, student_id)

worksheet_answers
  id, submission_id -> worksheet_submissions
  item_id -> worksheet_items
  answer, is_correct, points_earned
  UNIQUE(submission_id, item_id)
```

### Changed tables

- `schedules` — add `subject_id -> subjects`; drop NOT NULL on the legacy `subject`
  text column and stop writing it.
- `lesson_plans` — add `subject_id -> subjects`; same treatment of `subject`.
- `worksheets` — add `subject_id -> subjects`; same treatment of `subject`.

Whether a worksheet is file-based, question-based or both is derived, not stored: a
file exists when `file_url` is set, questions exist when `worksheet_items` has rows.
No redundant flag to fall out of sync.

### Row-level security

Policies are needed for `subjects`, `teacher_subjects`, `sections`,
`section_students`, `schedules` and the five new worksheet and lesson-plan tables.

Three `SECURITY DEFINER` helper functions carry the shared predicates, because a
policy on a table that sub-selects the same table recurses:

```
is_admin()                        -- caller's profiles.role is admin or main_admin
teacher_handles_section(section)  -- a schedule links caller to that section
student_in_section(section)       -- section_students links caller to that section
```

The shape of access:

| Table | Admin | Teacher | Student |
|---|---|---|---|
| subjects | all | read | read |
| teacher_subjects | all | read own | — |
| sections | all | read handled | read own |
| section_students | all | read handled | read own section |
| schedules | all | read own | read own section |
| lesson_plans, lesson_plan_sections | all | all own | — |
| worksheets, worksheet_sections | all | all own | read posted to own section |
| worksheet_items | all | all own | read when posted, minus `correct_answer` |
| worksheet_submissions | all | all for own worksheets | own only |
| worksheet_answers | all | all for own worksheets | own only |

`correct_answer` must not reach a student before checking. It is withheld by
selecting explicit columns in the student-facing query, not by hiding it in the UI.

## Phases

Each phase ends in something demonstrable. Later phases depend on earlier ones.

### Phase 1 — Foundation

Admin gains Subjects, Teaching Load, Sections (with class list) and Schedules. All
RLS policies land here.

The schedule form validates two things: the subject must be one the teacher holds,
and the section's grade level must match that teaching load entry.

Teaching Load is scoped by school year and offers "copy from previous year", which
duplicates the load rows under the new year for editing. Sections, schedules and
class lists are not copied.

*Demonstrable:* a section exists, a teacher is tagged to it, students are in it —
and the teacher's existing Students tab comes alive without being touched.

### Phase 2 — My Students & My Subjects

`StudentsTab` is rebuilt as **My Students & My Subjects**, driven by the schedule:
the teacher's subjects, the sections under each, meeting times, and the class list.

Also in this phase: retire the Grades tab, and bring the Overview tab's remaining
panels into the widget treatment already used by its stat cards.

*Demonstrable:* a teacher signs in and sees their real teaching assignment.

### Phase 3 — Lesson Plans

Subject picker limited to the teacher's load. Post to one or more sections. Repost
to another section, or reuse (copy, then post). DOCX and PDF export. The AI
generator receives the chosen subject and grade level as context.

*Demonstrable:* create a Grade 7 Mathematics plan, post it to 7-Rizal, repost to
7-Bonifacio, export as DOCX.

### Phase 4 — Worksheets and scoring

Worksheets gain everything lesson plans have, plus a question builder, a student
answering surface, submissions, auto-checking for objective items, manual scoring,
and a class scoreboard. The Assessments tab is removed once its capability is
present here.

*Demonstrable:* a teacher posts a worksheet, a student answers it, the teacher
checks it, and both see the score.

## Risks

**Scale.** Four phases is weeks of work. Phase 1 is a prerequisite for everything
the user actually asked about, so it must not be rushed.

**Free-tier connection pool.** Reads drop intermittently on this project. Every new
fetch goes through `withRetry`, and no failed read may render as zero or empty — a
failure must stay distinguishable from a legitimately empty result. Confusing the
two has already caused three user-visible incidents in this codebase.

**Existing schedule data.** `schedules.subject` is NOT NULL today. If rows exist,
the migration must populate `subject_id` before relaxing the constraint.

**Grade level values.** `sections.grade_level` is an unconstrained VARCHAR. The
teaching-load guard compares against it, so both sides must draw from one canonical
set of values.
