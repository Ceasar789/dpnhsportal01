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

The remedy is a **timeout** in `withRetry` — race `queryFn()` against a
deadline and treat the deadline as an error. That changes behaviour for
genuinely slow-but-working connections, so it is a decision rather than a
repair. **Not done; needs a call on the deadline.**

**2. The teacher dashboard still swallows a failed read.** With
`/rest/v1/worksheets` returning 500, WorksheetsTab renders "No worksheets
found" — its empty state — with no message and no retry. That is UX-048 in
a dashboard this overhaul has not reached. `e2e/network-failure.spec.js`
asserts the current behaviour so the suite stays a signal; the assertion
inverts when the teacher dashboard is done.

**Registrar and faculty are untested.** `e2e/helpers.js` has a student, a
teacher and an admin. Their fetchers use the same `withRetry`, so the fix
reaches them — but that is reasoning, not measurement. `E2E_REGISTRAR_*`
and `E2E_FACULTY_*` in `.env` would close it.

## Not a workaround, but owed

- **Drawer breakpoint is 900px**, not the 1024px Rule X2 asks for
  (`AdminDashboard.jsx:531`). Recorded as a **Phase 6** item rather than
  patched around in the test helper.
- **`handleOverlayClick`** is still exported from `useAdminLogic` and still
  destructured by some tabs, but every overlay is now a `<Modal>` and
  nothing calls it. Dead; delete it in **Phase 3** when those files are open
  anyway.
