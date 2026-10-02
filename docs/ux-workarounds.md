# Temporary workarounds — remove in Phase 5

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
| Email notifications | The portal sends no email of its own — no nodemailer, Resend, SendGrid or SMTP client in the repo. | A sender, templates, and a decision about what is worth emailing. |

## Blocked — `school_settings` does not have the columns the page writes

Found while building the UX-028 save bar, by watching the actual
request rather than reading the code. **No setting on the admin
Settings page has ever saved**, including Session Timeout, which is the
one setting the app genuinely enforces.

The live row returns:

```
id, school_name, school_year, current_semester, address, phone, email,
website, logo_url, description, established_year, region, division,
created_at, updated_at, two_factor_auth, session_timeout,
login_attempt_limit, email_notifications, auto_backup,
backup_frequency, backup_time, activity_logs_retention
```

`saveSettings` writes `academic_year`, `semester`, `portal_name`,
`theme`, `language` and `auto_save`, **none of which exist**. PostgREST
rejects the whole PATCH:

```
PATCH /rest/v1/school_settings?id=eq.1  →  400
{"code":"PGRST204","message":"Could not find the 'academic_year' column
 of 'school_settings' in the schema cache"}
```

`saveSettings` never destructures the returned error, so it falls
through to `showToast('Settings saved!')` every time. That is why this
went unnoticed: the page has always said it worked.

Two consequences already repaired, because they are UI and were making
the save bar misbehave:

- `setSettings({ ...data, … })` spread the row over an empty object, so
  the absent `academic_year` became `undefined` and React flipped the
  Academic Year input from controlled to uncontrolled mid-session. It
  now merges onto the defaults, so every field stays a string.
- The save-bar baseline is taken from what the page loaded rather than
  from the raw row, so Discard restores what the admin actually saw.

**What is still blocked, and needs a decision:** which columns the page
should write. Changing that is a data-layer change, not UI.

`e2e/admin-settings.spec.js` asserts the current 400 so the suite stays
a signal; that assertion inverts when this is settled.

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
