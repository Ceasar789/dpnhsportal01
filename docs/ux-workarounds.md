# Temporary workarounds — remove in Phase 5

Things that exist only because an earlier phase could not reach the code that
really causes them. Each row names what removes it. Nothing here is a design
decision; if a row survives Phase 5, it has become one by accident.

| # | Where | What | Why it is there | Removed by |
|---|---|---|---|---|
| 1 | ~~`e2e/helpers.js` · `openAdminTab`~~ | ~~`item.click({ force: true })`~~ | **REMOVED in Phase 4f.** It existed because `.sidebar-item` carried `transition: all .3s ease` and the active entry animates its own padding and left border, so Playwright waited out its stability timeout on an element that was only changing appearance. 4f put the duration on the motion scale: 300ms to 150ms, confirmed by `getComputedStyle` rather than assumed. The removal condition said 150ms **and** `all` banned; half of it was enough. 43 admin tests pass without the force. | — done |

Things that exist only because an earlier phase could not reach the code that
really causes them. Each row names what removes it. Nothing here is a design
decision; if a row survives Phase 5, it has become one by accident.

| # | Where | What | Why it is there | Removed by |
|---|---|---|---|---|
| 1 | `e2e/helpers.js` · `openAdminTab` | `item.click({ force: true })` | `.sidebar-item` carries `transition: all .3s ease` and the active entry animates its padding and left border, so Playwright's stability check waits out its own timeout on an element that is only animating its own appearance. | **Rule L5** — transitions capped at 150ms and `all` banned. Drop `force` and confirm the click still lands. |
| 2 | `components/ui/Modal.jsx` | Reuses `.modal-overlay`, `.modal`, `.modal-title`, `.modal-actions` | Those classes live inside `AdminDashboard.jsx`'s injected `<style>`, so `<Modal>` currently renders correctly **only inside the admin shell**. Reusing them was deliberate: migrating a tab is then a behaviour diff a reviewer can read, with no visual change to eyeball. | **Phase 5**, when the modal's styling moves to `index.css` and stops depending on where it is mounted. Until then, do not use `<Modal>` in the student, teacher, registrar or faculty dashboards. |
| 3 | `styles/index.css` · `.ux-modal*` | A second set of classes layered over `.modal` | Adds the structure the originals never had — a body that scrolls on its own, a footer that stays put, the mobile sheet — without touching the originals. | **Phase 5** merges the two into one rule set. |
| 4 | `e2e/helpers.js` · `openAdminTab` | Reopens the drawer before every tab click | Not a workaround for a defect — clicking a tab calls `setSidebarOpen(false)`, so the drawer genuinely has to be reopened. It stays. | — |
| 5 | `e2e/admin.spec.js` · `FLOOR = 11` | The text-size floor is 11px, not 12px | Writing 12 before Phase 4 raises the type scale would make the suite red before any work started. | **Phase 4**, together with `e2e/text-size.spec.js`. |

| 6 | `styles/index.css` · `.ux-unbutton` | A reset that strips a button back to looking like a div | Phase 2 turned five click-only divs into real buttons, and a button brings its own background, border, font and centred text. Condition 1 said Phase 2 must not move anything. `:not(.toggle)` is part of it: a blanket `width: 100%` beat `.toggle`'s own `width: 44px` and flattened all three switches to 0px. | **Phase 5**, when these controls get real styling and stop needing to impersonate a div. |

## Deferred out of Phase 2 by condition 1

- **UX-014** — the destructive row actions in SubjectsTab and SectionsTab
  should take the `.archive-action` variant per Rule B4. That variant is
  `color: var(--red)`, so applying it turns two grey icons red. Condition 1
  forbids visual change in Phase 2, so it moves to **Phase 5**. It was
  applied, measured and reverted rather than argued about.
- **UX-107** — `formatDate()` exists and is deliberately still unused.
  Applying it changes how every date on the dashboard reads, which is again
  a visual change. **Phase 5**.

## UX-054 — fixed, with two things it did not reach

`withRetry` now catches. A thrown error becomes the same `{ data, error }`
an HTTP failure produces, retried the same number of times, and every
caller reports it without being changed. Ten unit tests;
five of them fail with the `try`/`catch` removed.

Two things that fix does **not** cover, both found while testing it:

**1. Some aborted queries never settle at all.** A probe inside `attempt_`
showed `PROBE_ENTER Sections fetch` four times and `PROBE_CAUGHT` zero
times: on `route.abort()` the supabase promise sometimes neither resolves
nor rejects, so there is nothing to catch and the screen stays on its
loading state forever while the fetch is re-issued. It is also
non-deterministic — the same abort test passed on one run and hung on the
next, which is why every UI test in `e2e/network-failure.spec.js` uses an
HTTP 500 and the mechanism is proven in unit tests instead.

The obvious remedy is a **timeout** in `withRetry` — race `queryFn()` against
a deadline and treat the deadline as an error. It was scoped, measured and
then **dropped to stay inside the admin dashboard's scope**. No code was
written; what follows is the analysis, so the next person does not have to
redo it.

**`withRetry` wraps reads only.** Every call site under `frontend/src`,
excluding `archives/` and test files, was walked with a brace-matching parser
that reads the whole balanced argument rather than a fixed line window:

| | |
|---|---|
| call sites | 104 |
| first supabase verb is `.select` | 103 |
| no verb (the definition itself, `supabaseRetry.js:58`) | 1 |
| `insert` / `update` / `delete` / `upsert` / `rpc` | **0** |
| storage `.upload()` calls in the app | 4, **none** inside `withRetry` |

So the two hardest parts of a timeout design have **no call sites to protect
today**: there is no write to leave in doubt, and no upload to exempt. The
four uploads — `useAdminLogic.jsx:550`, `LessonPlansTab.jsx:263`,
`WorksheetsTab.jsx:164`, `ProfileTab.jsx:78` — call supabase storage
directly.

If it is picked up later, the shape that was agreed:

- **Reads** — 15s deadline, then retry as normal.
- **Writes** — 15s deadline, **no** automatic retry: the write may have
  landed on the server and a retry would duplicate it. Report
  "Couldn't confirm the save. Refresh to check."
- **Uploads** — no deadline, or a far longer one, and cancel for real with
  `AbortController` via supabase-js `.abortSignal()` rather than just
  abandoning the wait.
- Unit tests: a read timeout retries, a write timeout does not, an upload
  running past 15s is not cut off.

Until then the failure mode in note 1 above stands: an aborted query can
hang the screen on its loading state, and nothing times it out.

## Out of scope — logged, not fixed

Found while working on the admin dashboard; none of it is admin code, so by
standing instruction it is recorded here and left alone.

| What | Where | Why it is parked |
|---|---|---|
| A failed read renders the empty state | `teacher/tabs/WorksheetsTab.jsx` | With `/rest/v1/worksheets` returning 500 the tab shows "No worksheets found" — no message, no retry. That is UX-048 in a dashboard this overhaul has not reached. `e2e/network-failure.spec.js` asserts the **current** behaviour so the suite stays a signal; invert that assertion when the teacher dashboard is done. |
| Registrar and faculty have no e2e fixture | `e2e/helpers.js` | There is a student, a teacher and an admin. No registrar or faculty test account exists and none is being created now, so `E2E_REGISTRAR_*` / `E2E_FACULTY_*` stay unset. Their fetchers go through the same `withRetry`, so the UX-054 fix reaches them — but that is reasoning, not measurement, and it is written down here rather than claimed in a test name. |

## Not a workaround, but owed

- **Drawer breakpoint is 900px**, not the 1024px Rule X2 asks for
  (`AdminDashboard.jsx:531`). Recorded as a **Phase 6** item rather than
  patched around in the test helper.
- **`handleOverlayClick`** is still exported from `useAdminLogic` and still
  destructured by some tabs, but every overlay is now a `<Modal>` and
  nothing calls it. Dead; delete it in **Phase 3** when those files are open
  anyway.

## Feature backlog — NOT part of this overhaul

The Settings page used to offer these as switches. Every column was
grepped across the frontend, the backend, the SQL and the GitHub
workflow: nothing reads them. UX-028 replaced each one with a read-only
statement of what the system actually does, because a switch that does
nothing is a worse lie than an absent feature. If any of these is built
later, the statement becomes a control again.

| Feature | What exists today | What building it would take |
|---|---|---|
| Two-factor authentication | Nothing. No `mfa`, `factor` or `otp` call anywhere. Sign-in is email + password; the password-reset email is a link, sent by SMTP configured in the Supabase dashboard. | Supabase MFA enrolment and challenge, plus a per-role policy for who must use it. |
| Login attempt limiting | Nothing counts or limits failed sign-ins. The only rate limiter in the repo is `express-rate-limit` on the AI route (`backend/src/routes/ai.js:34`). | An auth hook or edge function that counts failures per identifier and locks out, plus an unlock path. |
| Activity log retention | Nothing deletes old rows. Logs accumulate forever regardless of the 30 days / 90 days / 1 year that used to be selectable. | A scheduled job (pg_cron or an edge function) reading the retention setting and deleting past it. |
| Configurable backup schedule | `.github/workflows/supabase-backup.yml` runs on a hardcoded `30 16 * * *` (00:30 Manila) and never reads `auto_backup`, `backup_frequency` or `backup_time`. | Either a workflow that reads the setting before deciding to run, or moving the schedule into pg_cron where the setting lives. |
| One source of truth for the school year | Settings has an Academic Year field. The academic tabs ignore it and compute the year from the clock in `currentSchoolYear()` (`frontend/src/lib/academicRules.js:27`), rolling over every June. Two answers to one question, and only the computed one is load-bearing. **Visible today:** Overview reads `2025-2026` from Settings while Sections reads `Class sections for 2026-2027` from the calendar, on the same screen, one click apart. | Decide which wins. If Settings wins, the academic queries read it and the June rollover becomes a default rather than the rule; if the calendar wins, the Settings field is a banner caption and should be named as one. The hints on both rows say which it is today. |
| Email notifications | The portal sends no email of its own — no nodemailer, Resend, SendGrid or SMTP client in the repo. | A sender, templates, and a decision about what is worth emailing. |

## Test infrastructure — `networkidle` is not reliable here

Two specs have now failed a full-suite run on
`page.waitForLoadState('networkidle')` and passed on their own:
`polish.spec.js` (`/`) and `admin-a11y.spec.js` (its `beforeEach`).
Nothing in either spec relates to the change that was running at the
time.

The cause is that the app holds Supabase realtime websockets open, so
"no network activity for 500ms" is a condition the page does not
reliably reach under load — and a second Playwright process on the same
machine is enough load. It is a flaky wait, not a flaky application.

Replace those waits with a wait for the thing the test actually needs
(an element, a response) rather than for the network to go quiet.
Not done here: it touches specs this phase did not otherwise open.

## Schema drift — `school_settings`

Found while building the UX-028 save bar, by watching the request rather
than reading the code. **No setting on the admin Settings page had ever
saved**, including Session Timeout, which is the one setting the app
genuinely enforces.

`saveSettings` spread the whole fetched row back into its `update`, which
carried `academic_year`, `semester` and `portal_name` — none of which are
columns — plus `theme`, `language` and `auto_save`, which are not either.
PostgREST rejects a PATCH naming an unknown column outright:

```
PATCH /rest/v1/school_settings?id=eq.1  →  400
{"code":"PGRST204","message":"Could not find the 'academic_year' column
 of 'school_settings' in the schema cache"}
```

`saveSettings` never destructured the returned error, so it fell through
to `showToast('Settings saved!')` every time. That is why a page which had
never once written a row looked like it worked.

**Fixed** by writing the columns that exist (`school_year`,
`current_semester`) and reporting a failed write. What remains is the
drift itself, which is not fixed:

| Name | Where it exists | Where it does not |
|---|---|---|
| `academic_year` | nowhere | the UI read and wrote it for the life of this page |
| `semester` | nowhere | same |
| `portal_name` | nowhere | same; the UI also hardcodes its value |
| `theme` | nowhere | written on every save; now a localStorage preference instead |
| `language` | nowhere | written on every save; now a read-only row |
| `auto_save` | nowhere | written on every save; the toggle is gone |
| `school_year` | the live row, `database-schema.sql`, `COMPLETE_DATABASE_SCHEMA_v2.sql`, `setup-database.js` | the UI, until now |
| `current_semester` | same four | the UI, until now |
| `two_factor_auth`, `session_timeout`, `login_attempt_limit`, `email_notifications`, `auto_backup`, `backup_frequency`, `backup_time`, `activity_logs_retention` | the live row and `legacy/add-settings-backup-history.sql` | **none of the three canonical schema files.** They exist only because that legacy ALTER was run by hand. |

So the drift runs both ways: the UI invented six columns that were never
created, and a legacy migration created eight that the canonical schema
does not describe. A fresh database built from
`backend/database/schema/database-schema.sql` would **not** have
`session_timeout`, and the idle-logout timer would silently fall back to
its 30-minute default.

**Two follow-ups, neither taken here.** Fold the legacy ALTER into the
canonical schema so a fresh database matches production. And
`current_semester` is an INT holding a quarter number 1-4 — nothing reads
it and there is no CHECK constraint, so it works, but the name now lies.
Renaming it is a migration.

## Migrations owed — not part of this overhaul

Both came out of the `school_settings` work. Neither is urgent, and
neither is UI, so neither was taken here.

**Rename `current_semester`.** It is an `INT` that now holds a quarter
number, 1-4. Nothing reads it, there is no CHECK constraint, and the
round trip is tested — so it works. The name is what is wrong:
`current_quarter` is what it holds. A rename is a migration plus the two
helpers in `useAdminLogic.jsx` that translate it.

**Move the legacy settings columns into the canonical schema.**
`session_timeout`, `two_factor_auth`, `login_attempt_limit`,
`email_notifications`, `auto_backup`, `backup_frequency`, `backup_time`
and `activity_logs_retention` exist in the live database only because
`backend/database/legacy/add-settings-backup-history.sql` was run by
hand. They appear in none of `database-schema.sql`,
`COMPLETE_DATABASE_SCHEMA_v2.sql` or `backend/scripts/setup-database.js`.

A database built fresh from those files would have no `session_timeout`,
so the idle-logout timer in `AuthContext.jsx:107` would find nothing and
silently fall back to 30 minutes — and the Settings save would fail on an
unknown column again, exactly the way it did before this phase. This is
the one of the three with a real failure mode behind it.

## Phase 5: dark-mode bugs

Found during Phase 4 while deciding which colour literals could be
replaced by a token. None of them is a token problem — each is a colour
that was picked for one theme and is being shown in both. Phase 4 gave
them names at their current values and changed nothing; Phase 5 is where
the second value gets chosen.

| # | Where | What is wrong |
|---|---|---|
| 1 | `AdminDashboard.jsx:40-90` — the session-loading and access-denied screens | A fixed dark panel that ignores the theme entirely: `#1a1d23` background, `#f1f5f9` text, `#8b92a5` muted. A light-mode admin whose session is loading, or who lands on access-denied, gets a dark screen with no warning. Now `--gate-*`. |
| 2 | `AdminDashboard.jsx:67, 78, 79` | `#f1f5f9` used as a **text** colour. It is `--card2`'s light value — a surface — so the distance metric reports a perfect match while the role is wrong. Any future tool will keep offering that substitution; it would make the text invisible on its own panel. |
| 3 | `AdminDashboard.jsx:228` — `.nav-logout-btn:hover` | `#dc2626` text on a hardcoded `#fee2e2` pink. Both are light-mode values, so in dark mode the logout button flashes a pale pink panel out of nowhere. The pair has to move together or neither should. |
| 4 | `AdminDashboard.jsx:278-286` — the six badge variants | One definition each, used in both themes, and the values are dark-tuned: `#4ade80` on `rgba(34,197,94,0.1)`. On a white card in light mode that is a pale green on near-white. Now `--badge-{hue}-{fg,border,bg}`, identical in both themes, so light can be given its own set in one place. |
| 5 | `AdminDashboard.jsx:461-478` — the calendar | `.cal-head` is `#f8fafc` and `.cal-cell:hover` is `#f1f5f9`, both hardcoded light surfaces. In dark mode the calendar keeps a light header strip. The event chips (`.ev-blue` and friends) are the same story. |
| 6 | `AdminDashboard.jsx:241` — `.sidebar-item.active` | `background: #eef0f5`, a light grey, on a sidebar that is `#1e2128` in dark mode. The active item is a bright block in a dark rail. |

**Not in this list, and not a bug:** `--on-accent`, `--brand-gold`,
`--brand-cyan` and the white-on-navy header colours are white in both
themes **on purpose**. What they sit on is the accent or the brand navy,
neither of which follows the theme.

## Colour literals Phase 4b did not name

Left as literals, with the reason, so the next pass does not re-derive it:

- **The JS colour palettes** — `shared/helpers.js:11` (avatar colours) and
  `tabs/OverviewTab.jsx:15` (role colours) are arrays of hex strings used
  as data, not styling. A CSS variable cannot be indexed, so these need a
  palette exported beside the tokens, not `var()`.
- **`<Icon color="#ffffff">`** (`OverviewTab.jsx:70`) — lucide passes
  `color` straight to the SVG's `stroke` **attribute**, and a `var()` does
  not resolve in a presentation attribute. It would render unstroked.
- **One-off tints** — `rgba(99,102,241,.12)`, `rgba(148,163,184,0.12)`,
  `rgba(59,130,246,0.08)` and about twenty more, each used once or twice
  for a single hover or highlight. Naming each one produces a token nobody
  reuses. They want grouping into a small set of interaction tints, which
  is a design decision.
- **The white-on-navy header family** — `rgba(255,255,255,.12/.22/.3/.5/
  .72/.85)` and `#ffffff` across the nav. A coherent `--on-brand-*` set,
  but it was not in Phase 4b's agreed list.

## Phase 6: responsive bugs

Found by review of the Phase 4c before/after screenshots. All of them are
present in BOTH sides, so none was introduced by the token work.

| Pri | Where | What |
|---|---|---|
| **High** | Overview banner at 360 | The title and school name wrap one word per line, and the Academic Year box overlaps the title and overflows past the right edge — "1st Quarter" is cut off. The banner has to stack vertically below the drawer breakpoint. |
| **High** | Every tab at 360 | The sidebar collapse `<` button sticks out of the left edge. `.sidebar-collapse` is absolutely positioned at `right: -14px` and is never hidden on mobile. Hide it below the breakpoint — there is no sidebar to collapse when it is a drawer. |
| **High** | System Settings at 360 | `.settings-input-row` keeps label and control side by side, which squeezes the hints into a narrow column — the Academic Year hint runs to six lines. Rule X4: stack label above control on mobile. |
| **High** | User Management at 360 | The full 123-row table renders at mobile width with tiny text. Rules R1/R2: the two-line row treatment. |
| **High** | Subjects and Sections at 360 | Both tables overflow their card. Measured either side of Phase 4d: 57 elements already painted past the right edge at 360 before the spacing scale, and rounding widened two of them - Subjects now clips by 17px where it did not, and the Sections delete icon pokes 5-12px out of a table that was already 48px too wide. The rounding was kept: un-rounding table cell padding alone would leave 10px inside tables and 12px everywhere else, and would not help a table 332px too wide. Same R1/R2 treatment as User Management. |
| **High** | Teaching Load at 360 | The whole builder overflows the right edge: the teacher picker and its search box, the department label beside each name, the subject select, the Add-to-list row and the "Nothing is saved until you press Assign below" hint are all cut off. The bulk-grid is two columns down to 860px and never stacks for a phone. |
| Medium | Overview at 360 | The four stat cards stack as four tall cards. A 2×2 grid would halve the scroll. |

## Phase 5: restyle items from the 4c review

- **Gradient stat-card headers** on Overview — the blue, green, orange and
  red gradient blocks.
- **Lavender gradient** on the System Settings page header in light mode.

Both are Rule D-series "remove the AI look" judgements, not token work,
and Phase 4 deliberately left them alone.

## activity_logs — why both panels are empty

Asked during Phase 4: is `activity_logs` empty, or is the read failing or
filtered by RLS? Measured rather than reasoned, by watching the requests.

**Neither. The read works and the table is genuinely empty, because every
write has always been rejected.**

```
GET  /rest/v1/activity_logs?...  →  200  []
POST /rest/v1/activity_logs      →  400
{"code":"PGRST204","message":"Could not find the 'details' column of
 'activity_logs' in the schema cache"}
```

RLS is not involved: a policy denial returns `200 []` on a read but a
`401`/`403` on a write, and this is a `400` naming a missing column.

The cause is the same drift that broke `school_settings`, and the two
schema files disagree:

| Column | `database-schema.sql` | `COMPLETE_DATABASE_SCHEMA_v2.sql` | Live |
|---|---|---|---|
| `details JSONB` | yes | **no** | **no** |
| `description TEXT` | no | yes | ? |
| `entity_name`, `old_values`, `new_values`, `status`, `error_message` | no | yes | ? |

`logActivity` writes `details`, so it was written against
`database-schema.sql` while the live database matches v2. Every call has
failed since the feature was built.

It is invisible because `logActivity` is deliberately forgiving: it writes
a copy to `localStorage` first, `console.warn`s the failure, and returns.
So the Overview's "Recent Activity" and Settings' "Activity Log History"
show the local cache — which is empty in a browser that has not performed
an admin action, and never contains anything another admin did.

**Not fixed here.** It is a data-layer change, and the fix is a decision
between two options: write `description` instead of `details`, or add
`details` to the live table. It also belongs with the other two schema
items above — one reconciliation of the canonical schema files against
production would settle `school_settings`, `activity_logs` and the
`session_timeout` gap together.

## Phase 7: data reconciliation

**Scheduled: after Phase 6, before any feature-backlog work.** Not to be
done during the UI overhaul.

Three findings of one kind, each found the same way — by watching the
request rather than reading the code — and each invisible because the
code that fails is written to keep going quietly:

| # | What | Evidence |
|---|---|---|
| 1 | **`school_settings` wrote six columns that do not exist** — `academic_year`, `semester`, `portal_name`, `theme`, `language`, `auto_save`. Every PATCH was rejected whole, so no setting on that page had ever saved, including `session_timeout`, the one the app enforces. `saveSettings` never destructured the error and said "Settings saved!" every time. | `PATCH → 400 PGRST204`. **Fixed in Phase 3b** by writing `school_year` and `current_semester`; the drift itself is not reconciled. |
| 2 | **The eight settings columns that DO exist are in no canonical schema file.** `session_timeout`, `two_factor_auth`, `login_attempt_limit`, `email_notifications`, `auto_backup`, `backup_frequency`, `backup_time`, `activity_logs_retention` live in production only because `legacy/add-settings-backup-history.sql` was run by hand. | A database built fresh from `database-schema.sql` has no `session_timeout`, so idle logout silently falls back to 30 minutes **and** the Settings save breaks again exactly as in 1. |
| 3 | **`activity_logs` has no `details` column**, which is what `logActivity` writes. Every write has failed since the feature was built, so the table is empty and both activity panels show a `localStorage` cache. | `POST → 400 PGRST204`; `GET → 200 []`. Not RLS: a policy denial reads as `200 []` but writes as 401/403. |

**A fourth case, and the clearest one.** The Overview banner hardcoded
`Dela Paz National High School` while `school_settings.school_name` held
`Dr. Paulino Ng National High School` and `school_year` held `2025-2026`.
Both live values were wrong and nobody could tell, because the screen was
showing a string from the source instead. Phase 5 pointed the subtitle at
the column, the wrong data became visible immediately, and it was
corrected in Supabase the same day — to `Delapaz National High School`
and `2026-2027`. That is the whole argument for this phase: a hardcoded
UI does not just duplicate data, it hides the data being wrong.

The two schema files disagree with each other as well as with
production: `database-schema.sql` has `activity_logs.details JSONB`,
`COMPLETE_DATABASE_SCHEMA_v2.sql` has `description TEXT` and no
`details`, and the live database matches v2.

One pass should settle all of it: decide which schema file is canonical,
reconcile it against production, fold the legacy ALTER in, and pick
`details` or `description` for `activity_logs`. Also in scope, because
it is the same conversation: renaming `current_semester`, which now
holds a quarter number 1-4.

## If the suite goes flaky again — options not taken

Phase 4's `networkidle` replacement got two consecutive full runs green
with no reruns, so neither of these was needed. They are written down so
the next person does not have to rediscover them.

- **One authenticated `storageState` instead of sixty logins.** The suite
  signs in to Supabase afresh in most specs. Capturing a signed-in state
  once in a global setup and reusing it would cut both the wall-clock and
  the dependence on auth latency, which is the most likely cause of the
  load-dependent failures seen during Phase 4. The cost is that tests
  stop exercising the login path, so the handful that are *about* logging
  in must keep doing it for real.
- **`retries: 1` in `playwright.config.js`.** Currently 0, deliberately —
  a retry hides a flake rather than reporting it. Worth turning on only
  with `--fail-on-flaky-tests` or an equivalent report, so a test that
  passes on retry is still visible rather than silently green.

Neither is in place. If a flake returns, start with the first: it removes
a cause, where the second only masks one.

### Flake log

Tests that have failed once inside a full or multi-spec run and passed
on repeat in isolation. Logged rather than chased, per the Phase 5 rule.
If one of these starts failing *reproducibly*, it is no longer a flake.

| Date | Test | Seen |
|---|---|---|
| Phase 5, step 1 | `admin-modal.spec.js` · "the destructive confirm button uses the named variant" | Failed once in an 8-spec admin run; passed alone and twice more across the whole spec (21/21 each). |

## The grade-tab badge counts two different things

Asked during Phase 5 batch 1: Schedules shows Grade 7 (8) and Grades
8-12 (0), while Sections has a section in every grade. Measured, by
reading the rows the page fetched rather than the code alone:

```
SCHEDULES badges        Grade 7 8 · Grade 8 0 · 9 0 · 10 0 · 11 0 · 12 0
sections per grade      one in every grade, six in total
schedule rows per grade Grade 7: 8 — and nothing anywhere else
TEACHING LOAD badges    8 in every grade
teacher_subjects rows   48, eight per grade
```

**The zeros are correct and not a bug.** The Schedules badge counts
rows in `schedules` — scheduled periods — not sections. There really
are eight scheduled periods in Grade 7 and none in any other grade. A
section existing does not mean a timetable exists for it.

**What is wrong is that the badge never says so.** `GradeTabs` is one
component used by two tabs, and it counts a different thing in each:

| Tab | What the badge counts | Source |
|---|---|---|
| Schedules | scheduled periods | `schedules` rows whose section is in that grade |
| Teaching Load | teacher-subject assignments | `teacher_subjects` rows for that grade |

Same component, same pill, two meanings, neither stated. An admin who
has just created a section in every grade reads "Grade 8 0" as "my
section is missing", which is exactly what happened here.

**Proposed, not done** (reported for a decision): give the pill an
accessible name that carries the unit — `aria-label="Grade 8, 0
scheduled periods"` on Schedules and `"Grade 8, 0 teaching
assignments"` on Teaching Load — and a visible `title` to match. It is
text rather than layout, so it fits Phase 5 if wanted; it is listed
here rather than done because the review said report first.

## Withdrawn: Overview's counts did NOT disagree with the tabs

Reported during Phase 5 batch 2 as a real discrepancy — Overview
showing "Published News 4" and "Memos Sent 2" while both tabs showed
zero. **That conclusion was wrong, and the way it was reached is the
lesson.**

Re-measured afterwards, with the count header and the list request read
in the same run:

```
HEAD /rest/v1/news?select=*&status=eq.Published&or=(...)   content-range: */0
GET  /rest/v1/news?select=*&order=created_at.desc          []
cards: Published News 0 · Memos Sent 0
```

Everything agrees. `fetchStats` reads `count: 'exact', head: true` from
the same tables the tabs list, `stats` starts at zero, and a failed
count keeps its previous value rather than inventing one. There was
never a second source.

**What actually happened** is that two observations taken at different
times were compared as if they were simultaneous:

1. The batch-2 screenshots caught the News and Memos **lists before
   they had loaded** — the shot harness waits 500ms after opening a
   tab, while Overview's counts had been fetched much earlier during
   login. So "Overview 4, tab 0" in one image was a render race, not a
   contradiction.
2. The follow-up probe that waited four seconds and still read 0 ran
   **after the rows had been deleted**, which made the race look
   confirmed.

The four-second wait felt like it ruled out a race, and it did — for
the second observation. It said nothing about the first, which is the
one the claim rested on. Two sound measurements, one unsound
comparison.

Nothing to fix here. Kept rather than deleted because the failure mode
is worth recognising: when a screenshot and a probe disagree, the
cheapest explanation is usually that they are describing different
moments.
