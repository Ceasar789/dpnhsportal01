# Student Overview & Worksheet Assessment — Design

**Date:** 2026-09-20
**Status:** Approved for planning
**Implements:** Phase 4 of `docs/superpowers/specs/2026-09-17-teacher-academic-structure-design.md`, brought forward

## Context

Every summary card on the Student Dashboard's Overview tab shows a placeholder:
grade level and student ID render as em-dashes, and Average Grade, Attendance and
Pending Tasks are stuck at `0`. The Upcoming Tasks list is permanently empty.

None of it is a display bug. Five separate root causes were found:

1. **Columns that do not exist.** `OverviewTab.jsx` reads `profile.year`,
   `profile.section`, `profile.avg_grade`, `profile.attendance_rate` and
   `profile.student_no`. `profiles` has none of them. The real enrolment record is
   `section_students` joined to `sections`, built in Phase 1.

2. **A filter on a column that does not exist.** The tab filters `assignments` and
   `quizzes` by `student_id`. Neither table has that column — both are per-section
   artefacts owned by a teacher.

3. **No producer.** Nothing in the live application writes `assignments`,
   `quizzes`, `assignment_submissions` or `quiz_results`. The only writer is
   `AssignmentsTab_UNUSED.jsx`, wired to no route.

4. **RLS denies the reads.** `assignments` grants SELECT only to its owning
   teacher; `quizzes` has no policy at all; `attendance` grants SELECT only to a
   section's adviser. A student reading any of them gets zero rows.

5. **Attendance has never been writable.** `attendance` has RLS enabled with a
   single adviser-SELECT policy and no INSERT or UPDATE policy at all, so no
   teacher has ever been able to record attendance. The percentage cannot be
   anything but zero until that is fixed.

Underneath all of it: **worksheets have no assessment mechanism.** The
`worksheets` table holds a title, subject, file and a Draft/Distributed/Archived
status — no due date, no link to a section, no questions, no scores.

## Goals

- Grade level and section come from the student's enrolment record.
- The performance card is named for what it measures and shows a real average.
- Attendance shows a real percentage, and a teacher can actually record it.
- Pending and Upcoming Tasks reflect real worksheets with real due dates.
- A teacher can build a worksheet out of questions, a student can answer it in
  the app, and the result becomes a score the student sees.

## Non-goals

- No gradebook, report card, subject grade or GWA. A worksheet score stays a
  worksheet score; nothing aggregates it into a subject grade.
- No student-information profile. Grade level and section come from enrolment.
- No repair of `assignments`, `quizzes`, `assignment_submissions` or
  `quiz_results`, and no change to the Assignments or Quizzes sidebar tabs.
- No timed worksheets, no retakes, no randomised question order.

## Decisions

**Worksheets are the only task source.** Pending and Upcoming Tasks read
worksheets posted to the student's section. This matches the paper's terminology
and avoids building on four tables that never had a producer.

**"Average Grade" becomes "Worksheet Performance."** The old name implies a grade
computation the approved scope excludes. The new name states what the number is.

**Two answering paths, one score location.** A worksheet can carry a file (the
student downloads it, answers on paper, the teacher encodes the score) or
questions (the student answers in the app), or both. Either way the score lands
in `worksheet_submissions`, distinguished by `source`.

**Auto-check is per worksheet, and off by default.** The question builder carries
a `checking_mode` toggle. In `auto`, the review screen pre-fills each item's
points from the checker. In `manual`, it shows the same answers with empty points
boxes and the teacher fills in everything. The teacher picks once, while building,
when they can see the mix of question types in front of them.

The default is `manual`. A false positive is the dangerous direction: an
auto-checker that marks a *wrong* answer correct looks right on the review screen
and slips through, while one that marks a *correct* answer wrong is obvious and
gets fixed. Defaulting to manual means a teacher who never thinks about the
setting still gets the safe behaviour, and auto-check is something they opt into
deliberately — typically for an all-multiple-choice worksheet, where it cannot be
wrong.

**Review, then release.** Whichever mode, the teacher sees every item, sets or
confirms the points, and only then releases. The student sees nothing until
release.

**Checking runs in the teacher's browser, not the student's.** Answer keys live in
a table students cannot read at all. If checking ran client-side for the student,
the key would have to reach their browser — where it could be read straight off
the API regardless of what the UI displays. Running the check at review time, on
the teacher's side, removes that exposure entirely.

**Per-type checking rules:**

| Type | Rule |
|---|---|
| Multiple choice | Exact match against the chosen option. |
| True / False | Exact match. |
| Identification | Case-insensitive, whitespace-collapsed match against a list of accepted answers the teacher supplies (`Jose Rizal`, `Rizal`, `Dr. Jose Rizal`). |
| Enumeration | Order-independent. Partial credit: each matched answer earns `points ÷ expected count`. A duplicate answer is counted once. |
| Essay | No auto-check. The teacher types the points. |

**Submission is final.** A student submits once. There is no retake and no
post-submission editing; a teacher who needs to re-open one can clear the
submission. Answers are saved as the student works, so a dropped connection —
a known problem on this project's hosting tier — does not lose their progress.

**The Assessments tab is retired.** It queries four tables that were never
created. Once worksheets carry questions, it is redundant; removing it leaves
one system to explain instead of a working one beside a broken one.

## Data model

### Changed table

```
worksheets
  + checking_mode  IN (auto, manual)  DEFAULT 'manual'
```

### New tables

```
worksheet_sections                       -- where and when a worksheet is due
  id, worksheet_id -> worksheets, section_id -> sections
  due_at TIMESTAMP, posted_by -> profiles, posted_at
  UNIQUE(worksheet_id, section_id)

worksheet_items                          -- the questions; student-readable
  id, worksheet_id -> worksheets
  position INT, question TEXT
  item_type  IN (multiple_choice, true_false, identification, enumeration, essay)
  options JSONB                          -- choices for multiple choice
  points DECIMAL
  UNIQUE(worksheet_id, position)

worksheet_item_keys                      -- the answers; students cannot read this
  item_id -> worksheet_items  (PK)
  correct_answer JSONB                   -- MC: "B"
                                         -- identification: ["Jose Rizal","Rizal"]
                                         -- enumeration: ["Executive","Legislative","Judicial"]
                                         -- essay: null

worksheet_submissions                    -- one per student per worksheet
  id, worksheet_id, student_id -> students, section_id -> sections
  source     IN (online, manual)
  status     IN (in_progress, submitted, checked)
  released BOOLEAN DEFAULT FALSE
  submitted_at, score, total_points, remarks
  checked_by -> profiles, checked_at
  UNIQUE(worksheet_id, student_id)

worksheet_answers
  id, submission_id -> worksheet_submissions, item_id -> worksheet_items
  answer JSONB, is_correct BOOLEAN, points_earned DECIMAL
  UNIQUE(submission_id, item_id)
```

`worksheet_item_keys` exists as its own table purely so RLS can deny students the
answer key while still letting them read the question. Keeping the key in a column
of `worksheet_items` would mean any row a student can read carries the answer.

`released` is what the student's visibility hangs on — a submission that is
`checked` but not `released` is still invisible to them.

### Row-level security

Built on the `SECURITY DEFINER` helpers Phase 1 established (`is_admin`,
`is_school_staff`, `teacher_handles_section`, `teacher_advises_section`), plus a
new `teacher_owns_worksheet(worksheet_id)`.

| Table | Teacher | Student | Admin |
|---|---|---|---|
| `worksheet_sections` | all, own worksheets | read where posted to own section | all |
| `worksheet_items` | all, own worksheets | read where posted to own section | all |
| `worksheet_item_keys` | all, own worksheets | **none** | all |
| `worksheet_submissions` | all, own worksheets | read own; insert/update own while `in_progress` | all |
| `worksheet_answers` | all, own worksheets | read own; write own while submission is `in_progress` | all |
| `attendance` | **write** for handled/advised sections (new) | **read own rows** (new) | all |

A student's own `worksheet_submissions` row is readable at any status so the UI
can show "submitted, awaiting checking" — but `score` must not be shown unless
`released` is true. That is enforced in the query the UI issues; the row itself
stays readable because the student needs its status.

## Pure logic

`src/lib/worksheetChecking.js`, with no React and no Supabase, so it can be
unit-tested directly the way `academicRules.js` is:

- `normalizeAnswer(text)` — trim, collapse internal whitespace, lowercase.
- `checkItem(item, key, answer)` → `{ isCorrect, pointsEarned }`, returning
  `{ isCorrect: null, pointsEarned: null }` for essays.
- `scoreSubmission(items, keys, answers)` → `{ score, totalPoints, perItem }`.

The enumeration branch is where this earns its tests: order independence, partial
credit, duplicate answers counted once, and a student supplying more answers than
expected never scoring above the item's points.

## Surfaces

### Teacher — Worksheets tab

- **Post to section** — pick a section the teacher handles and a due date.
- **Question builder** — add, edit, reorder and delete items; pick a type per
  item; set options, accepted answers and points. Carries the `checking_mode`
  toggle. Saving writes `worksheet_items` and `worksheet_item_keys` together.
- **Check submissions** — the class list with each student's status. Opening one
  shows every item with the student's answer beside the expected answer and a
  points box per item. In `auto` mode those boxes arrive pre-filled by the
  checker and are marked as such, so the teacher can see what was machine-scored
  versus what they typed; in `manual` mode they start empty. **Save & Release**
  writes the score and sets `released`.
- **Encode score** — for the paper path: a single score box per student, writing a
  `manual` submission with no answers.

### Student — Worksheets

A new surface listing worksheets posted to their section: title, subject, due
date, and status (not started / in progress / submitted / score, once released).
Opening one that has questions renders them by type, saves answers as the student
works, and submits once.

### Student — Overview tab

| Element | Source |
|---|---|
| Grade level, section | `section_students` (status `active`) joined to `sections` |
| Student ID | `students.student_number`, falling back to `lrn`, else hidden |
| Worksheet Performance | mean of `score / total_points` as a percentage across **released** submissions, each worksheet weighted equally |
| Attendance | share of the student's `attendance` rows with status `Present` |
| Pending Tasks | worksheets posted to their section, due date not past, with no submitted submission |
| Upcoming Tasks | those same worksheets, ordered by due date |

Every one of these is a read that can fail. Per the standing rule in this
codebase, a failed read never renders as `0` or as an empty list — it shows a
distinct "could not load" state with a retry. An honest zero shows an empty state
that says so. The two must never look alike.

## Risks

**Scale.** This is roughly three to four times the minimal scoring mechanism that
was first considered, and it spans three roles. It should be built in stages —
data model and checking logic first, then the teacher's builder, then the
student's answering surface, then the Overview — so each stage is demonstrable.

**Nothing to show until a teacher acts.** On a fresh database every card is
legitimately empty. The empty states must say why rather than implying breakage.

**Attendance starts empty.** The new write policy lets a teacher record
attendance from today onward; there is no history. "No attendance recorded yet"
and "0% present" mean opposite things and must not render alike.

**Auto-check disagreement.** Identification and enumeration will sometimes mark a
defensible answer wrong, and — more dangerously — a mistyped answer key can mark a
wrong answer right, which looks correct on review and slips through. The
manual-by-default toggle and the release gate are the mitigations, and the review
screen must make overriding a single item fast. If it is tedious, teachers will
release without reading and the gate stops protecting anything.

**Grade-level format.** `sections.grade_level` stores `Grade 7`. The banner
currently renders `Grade {grade}-{section}`, which would read "Grade Grade
7-Rizal". Render the stored value as-is.

**The `students` row prerequisite.** A submission references `students(id)`.
Phase 1's class-list upsert creates that row for every student added to a section,
which is the same population that can be scored — but any path that scores a
student outside the class list would hit the foreign-key failure Phase 1 already
met once.
