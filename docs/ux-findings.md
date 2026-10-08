# Admin dashboard — UX findings

Produced by `/ux-engine:ux-audit AdminDashboard` on 2026-10-01, against
`frontend/src/pages/dashboards/admin` — 15 source files, 4682 lines, screened
against 103 candidate failure modes.

The full machine report, including all 196 `UX-101` rows and the suppressed
scale groups, is at `.ux-engine/report.md`. This file is the working list:
every judgement finding, one row each, with the phase that owns it.

**Counts:** 37 high · 17 medium · 196 UX-101 (one Phase 4 batch) · 7 suppressed groups.

## How this list was produced, and what it is worth

Three subagents read the files — the shell, the content tabs, the academic
tabs and the two logic hooks — each screening every mode's Signal and reading
the full mode file before reporting, so a mode whose Counter-example covered
the situation was dropped rather than filed.

**Two reported findings were removed after checking them:**

- **UX-100** (no `prefers-reduced-motion`) — there is a global rule at
  `frontend/src/styles/index.css:201`. The agent had only read
  `AdminDashboard.jsx` and could not see it.
- **UX-094** (focus ring removed) — `input, select, textarea { outline: none }`
  is specificity (0,0,1); the global `:focus-visible` is (0,1,0) and wins.
  Measured in Chrome: `3px solid rgb(25, 8, 223)`.

**What this audit did not do:** none of it was measured in a browser. The e2e
suite had no admin fixture, so every row below was reasoned from source.
Phase 0.5 adds that fixture; from Phase 1 on, claims are measured.


## High (37)

| ID | Where | What | Phase |
|---|---|---|---|
| **UX-014** | `tabs/SectionsTab.jsx:68` | The section Delete button is weighted identically to its two safe siblings in the same row, with no use of the red .archive-action variant. | 2 |
| **UX-014** | `tabs/SubjectsTab.jsx:57` | The permanent-delete button carries exactly the same class, size and colour as the Edit button next to it, ignoring the destructive .archive-action variant the design system already provides. | 2 |
| **UX-025** | `tabs/SectionsTab.jsx:152` | Activating a row's Remove button unmounts the button that holds focus and nothing restores focus, so a keyboard user is dropped back to the document body inside an open modal. | 2 |
| **UX-025** | `tabs/TeachingLoadTab.jsx:342` | Removing a staged entry unmounts the focused button with no focus moved to a neighbouring row or the list heading, so keyboard focus is lost to the body. | 2 |
| **UX-025** | `tabs/UsersTab.jsx:81` | Archiving a user removes the row holding the focused button and no code moves focus, so the keyboard user is dropped back to the document body. | 2 |
| **UX-026** | `tabs/CalendarTab.jsx:97` | Dismissing the event dialog by backdrop click discards the entered title, dates and description with no prompt. | 1 |
| **UX-026** | `tabs/MemosTab.jsx:97` | Clicking outside the compose-memo dialog discards the typed subject and body without confirmation. | 1 |
| **UX-026** | `tabs/NewsTab.jsx:97` | A backdrop click silently throws away a half-written post, including an attached image, with no dirty-state check on any close path. | 1 |
| **UX-026** | `tabs/SchedulesTab.jsx:66` | A backdrop click discards the teacher, times and room already chosen in the schedule form, using the identical unconditional handler as Cancel. | 1 |
| **UX-026** | `tabs/SectionsTab.jsx:25` | Clicking the backdrop throws away everything typed into the section form without asking. | 1 |
| **UX-026** | `tabs/SubjectsTab.jsx:17` | A stray backdrop click silently discards a half-filled subject form, because the dismissal path and the cancel path are the same unconditional unmount with no dirty check. | 1 |
| **UX-026** | `tabs/UsersTab.jsx:104` | A stray backdrop click discards everything typed into the create/edit-user form without asking, because the dismissal path and the cancel path are the same unconditional close. | 1 |
| **UX-046** | `tabs/SchedulesTab.jsx:199` | When no active subjects exist the schedule table falls through to a bare header row over blank space, with no zero-result branch at all. | 3 |
| **UX-047** | `tabs/CalendarTab.jsx:79` | The calendar grid and the Upcoming sidebar render as a fully-populated empty month for the whole span of the events fetch, with no loading indicator at all. | 3 |
| **UX-047** | `tabs/OverviewTab.jsx:83` | While the overview's activity, role-distribution and stat fetches are in flight the screen renders zeros and 'No recent activity' with no spinner, skeleton or any other signal that work is in progress. | 3 |
| **UX-047** | `tabs/TeachingLoadTab.jsx:235` | The teacher picker has no loading state, so during the in-flight fetch it asserts there are no teachers and tells the admin to go create some. | 3 |
| **UX-048** | `tabs/TeachingLoadTab.jsx:271` | A failed subjects fetch sets an error flag this tab never reads, so the subject dropdown renders empty with no explanation while the sibling teachers failure is reported. | 3 |
| **UX-050** | `tabs/SchedulesTab.jsx:157` | A sections-only failure blanks the whole schedules screen behind a single generic error whose Retry re-runs the request that did not fail. | 3 |
| **UX-093** | `AdminDashboard.jsx:625` | The ten primary sidebar navigation items are plain divs with a click handler and pointer styling, so the dashboard's whole page switcher is unreachable by keyboard or screen reader. | 2 |
| **UX-093** | `AdminDashboard.jsx:641` | The Settings sub-section jump links are click-only divs, so the five section shortcuts cannot be focused or activated from the keyboard. | 2 |
| **UX-093** | `tabs/CalendarTab.jsx:63` | Calendar events in the grid are editable only by clicking a non-interactive div, so events outside the small Upcoming list are unreachable by keyboard. | 2 |
| **UX-093** | `tabs/MemosTab.jsx:45` | Selecting a memo — the only way to reach the preview pane and its Edit/Delete actions — is wired to a click handler on a generic div with no role, tab stop or key handler. | 2 |
| **UX-093** | `useAdminLogic.jsx:977` | The shared Toggle is a generic div made clickable, so it is operable by pointer only and is announced as nothing at all to assistive technology. | 2 |
| **UX-096** | `tabs/CalendarTab.jsx:101` | The event modal's labels are positional only, leaving every input without an accessible name. | 2 |
| **UX-096** | `tabs/MemosTab.jsx:101` | None of the compose-memo fields carries a programmatic label; the relationship exists only in the layout. | 2 |
| **UX-096** | `tabs/NewsTab.jsx:106` | The news modal's labels are unbound to their controls, so a screen reader announces each input with no name. | 2 |
| **UX-096** | `tabs/SettingsTab.jsx:32` | The settings fields are labelled with plain spans rather than associated label elements, so the inputs and selects have no accessible name. | 2 |
| **UX-096** | `tabs/UsersTab.jsx:108` | Every field in the user modal is labelled only by position; nothing programmatically associates the label text with its input. | 2 |
| **UX-097** | `AdminDashboard.jsx:627` | In the collapsed sidebar each navigation item is reduced to a bare icon whose meaning exists nowhere else on the screen, so the destination is unavailable to anyone not seeing the glyph. | 2 |
| **UX-098** | `AdminDashboard.jsx:674` | The shared delete/archive confirmation overlay never takes, holds or returns focus, so a keyboard user stays on the obscured page behind it and loses their place when it closes. | 2 |
| **UX-098** | `tabs/CalendarTab.jsx:97` | The event dialog mounts without a focus contract, leaving keyboard focus on the calendar underneath. | 2 |
| **UX-098** | `tabs/MemosTab.jsx:97` | The compose-memo dialog opens with focus left behind it on the page and nothing constraining or restoring focus. | 2 |
| **UX-098** | `tabs/NewsTab.jsx:97` | The news modal never takes, holds or returns focus, so keyboard tabbing walks straight out into the card grid behind it. | 2 |
| **UX-098** | `tabs/SchedulesTab.jsx:241` | The schedule modal never takes, holds or returns focus, so keyboard users remain outside the dialog they just opened. | 2 |
| **UX-098** | `tabs/SectionsTab.jsx:77` | Both section overlays leave focus on the page behind them, so tabbing walks straight out of the dialog and nothing returns focus when it closes. | 2 |
| **UX-098** | `tabs/SubjectsTab.jsx:66` | The subject modal opens without moving focus into it, without trapping focus inside it, and without returning focus to the button that opened it. | 2 |
| **UX-098** | `tabs/UsersTab.jsx:104` | The user modal opens without moving focus into it, without trapping focus inside it, and without returning focus to the control that opened it. | 2 |

## Medium (17)

| ID | Where | What | Phase |
|---|---|---|---|
| **UX-028** | `tabs/SettingsTab.jsx:76` | Settings in the Security, Notifications, Backup and Appearance cards change in place with no commit control, no cancel and no saved indication, so whether a change persisted depends on an invisible debounce or a button in another card. | 3 |
| **UX-029** | `AdminDashboard.jsx:80` | The access-denied screen's only way forward is a button that performs a programmatic redirect to a statically known route, so the destination is invisible to the platform's link affordances and announced with the wrong role. | 2 |
| **UX-030** | `tabs/NewsTab.jsx:83` | The per-card Delete, Archive, Publish and Restore controls expose only a bare verb as their accessible name, so the same label repeats across every post with no indication of which post it acts on. | 2 |
| **UX-049** | `tabs/UsersTab.jsx:94` | The user table renders the entire result set with no pagination, max-height or truncation — the page controls beneath it are inert decoration, so a production-sized roster produces one unbounded scroll. | 3 |
| **UX-052** | `tabs/NewsTab.jsx:68` | Archive, Publish and Restore fire an async status mutation while the button and the card render exactly as they did before, so a change in flight is indistinguishable from no change. | 3 |
| **UX-052** | `tabs/SectionsTab.jsx:127` | Adding a student to a section renders exactly the same tree for the duration of two round trips, so the press produces no visible change until it completes. | 3 |
| **UX-052** | `tabs/TeachingLoadTab.jsx:206` | The Copy from previous year button runs two network round trips while rendering identically to its idle state, so nothing on screen says the copy is under way. | 3 |
| **UX-058** | `tabs/SettingsTab.jsx:33` | Portal Name renders disabled next to editable siblings with nothing saying why it cannot be changed or what would make it editable. | 3 |
| **UX-058** | `tabs/UsersTab.jsx:113` | The email field is silently disabled when editing an existing user, with no message explaining that an account's address cannot be changed here. | 3 |
| **UX-061** | `useAcademicLogic.jsx:65` | The subject form's required-field rules run only when the save button is pressed and surface as a transient toast, never as an error on the field that caused it. | 3 |
| **UX-062** | `tabs/SectionsTab.jsx:82` | The section form mixes two required fields with two optional ones and distinguishes them nowhere in the labels, so the only way to learn which is which is to submit and read the toast. | 3 |
| **UX-062** | `tabs/UsersTab.jsx:128` | The user form mixes required and optional fields with no visual distinction, so the only way to learn which are required is to submit and read the error toast. | 3 |
| **UX-075** | `tabs/UsersTab.jsx:141` | The admin sets another person's password through a single masked field they can neither reveal nor re-enter, so a typo becomes the stored credential unseen. | 3 |
| **UX-099** | `AdminDashboard.jsx:565` | Every success and error message in the admin dashboard is delivered through a toast that is not a live region and is mounted only when it appears, so assistive technology never announces the outcome of an action. | 1 |
| **UX-099** | `tabs/UsersTab.jsx:92` | The result count that changes as the user types in search sits in a region that is not marked live, so the outcome of filtering is never announced. | 1 |
| **UX-106** | `AdminDashboard.jsx:710` | The confirmation dialog's destructive button invents a filled-danger variant by overriding .btn-primary's colours at the call site, so the appearance exists outside the button component's declared variant set. | 1 |
| **UX-107** | `tabs/CalendarTab.jsx:84` | Dates are formatted independently at each call site, so the calendar pins a long en-US format while the news and memo screens use the viewer's short default. | 1 |

## UX-101 — off-system colour literals (196)

Not listed individually; Phase 4 owns them as one batch.

| File | Count |
|---|---|
| `AdminDashboard.jsx` | 158 |
| `tabs/OverviewTab.jsx` | 21 |
| `shared/helpers.js` | 8 |
| `useAdminLogic.jsx` | 5 |
| `tabs/CalendarTab.jsx` | 4 |

121 distinct values. 158 of the 196 are inside the one injected `<style>`
block in `AdminDashboard.jsx`. Many already have an exact token — `#f1f5f9`
is `--card2` at distance 0.00, `#1908DF` is `--accent`, `#dc2626` is `--red`
— and the rest are status tints and overlays that need new named tokens with
both light and dark values.

## Suppressed scale groups (7)

The design system has **no spacing, radius, type, motion or sizing tokens at
all** — only 31 colour tokens. These are the raw material Phase 4's Rule T1
turns into scales.

| Group | Literals | Most used |
|---|---|---|
| spacing | 242 | `10px` ×32, `16px` ×29, `12px` ×26, `8px` ×25, `6px` ×19 |
| type | 92 | `12px` ×35, `13px` ×23, `11px` ×14 |
| length (border, shadow) | 83 | `border` ×40, `border-bottom` ×14, `box-shadow` ×10 |
| sizing | 81 | `40px` ×6, `8px` ×6, `20px` ×5, `64px` ×5, `256px` ×4 |
| radius | 41 | `10px` ×11, `7px` ×9, `8px` ×4, `12px` ×4, `20px` ×4 |
| motion | 25 | `.15s` ×13, `.3s` ×5, `.2s` ×4, `.7s` ×2 |
| duration (non-motion) | 3 | timeouts, not animation |

**The most-used spacing value, `10px`, is not on the T1 scale**, and neither
are `6px`, `14px`, `18px` or `20px`. Phase 4 is a visible change to the
admin's layout, not a mechanical substitution — hence the before/after
screenshots at 360 and 1440.

## Final report

Phase 6 closes with every ID above marked **fixed**, **not fixed** or
**disputed** with a reason. No ID may be left unlisted.

## Recovery status addendum — 8 October 2026 (Checkpoint C)

The findings above remain historical evidence. The final-report instruction is
not a completed status ledger: the 54 judgment findings (37 high, 17 medium)
and 196 UX-101 occurrences have not all been individually re-adjudicated here.
Do not mark the entire overhaul complete from this addendum. Current test
commands/results, database limits and Phase 7 evidence are in the recovery
section of [ux-workarounds.md](ux-workarounds.md).

**F1/F2 remain unresolved identifiers; no code changes made for them.**
Repository docs, relevant history/comments, Superpowers/SDD artifacts and
available sessions did not establish Admin Overhaul meanings. Unrelated
September academic-review labels were not substituted.

| Priority/status | Finding | Current conclusion |
| --- | --- | --- |
| ALREADY FIXED / VERIFIED | Notification tests could mark live inboxes read | PATCH interception committed locally as `efaa0e9`; cases pass, notification fingerprints unchanged |
| ALREADY FIXED / VERIFIED | 7C preview URL lifetime | Commit `dc7667a`; three regression tests red → green; zero live URLs after cancel in ten width/theme combinations; existing preview/undo tests pass |
| ALREADY FIXED / VERIFIED | Full-suite focus-test timing failure | Commit `af20034`; measure an actually focused control; targeted tests and 20 repeated focus cases pass; public app unchanged |
| ALREADY FIXED / VERIFIED | Event-author request coverage | Commit `effa33c`; intercepted request carries the authenticated admin ID without a live write |
| SHOULD FIX / DEFERRED pending approval | L1–L4 | All reproduced; source and proposals below |
| BLOCKED / NOT VERIFIED | F1/F2 | Definitions unproven; no implementation |
| PARTIAL / DEFERRED | Canonical DB reconciliation | Live columns show v2 still depends on legacy additions; no consolidation or SQL execution |
| DEFERRED | Lint | 256 errors/19 warnings, unchanged by recovery; touched/untouched attribution in workarounds |
| PARTIAL / SHOULD FIX | Full findings ledger | Only investigated recovery items are updated; no blanket closure of original IDs |
| NOT VERIFIED | Live policy targets, migration application, real Phase 7 write persistence | Read-only evidence cannot close these; write gates remain |

### Deferred UI: evidence and proposals

**None of L1–L4 has been implemented.** Approval is required by continuation
request sections 7 and 20. Before captures are local ignored artifacts under
`screenshots/admin-recovery-2026-10-08/before/`. Proposals preserve the existing
tokens, hierarchy, patterns, typography and light/dark design.

| ID/current status | UX cause and existing pattern | Smallest proposed fix | Affected matrix and intended verification |
| --- | --- | --- | --- |
| L1 — still reproducible | Save bar's accent top border reads as a stray line over its full-width backing. Approved surfaces use quiet neutral boundaries; dirty count and Save already identify pending work. | Use the existing neutral-border token instead of the accent boundary; retain sticky positioning, opaque backing, shadow, spacing and edge radius. | Both themes, clearest at 360; dirty-state screenshots at 360/390/768/1024/1440, Security scrolling, keyboard focus, Discard and footer coverage. |
| L2 — still reproducible | Two-line clamp in narrow seven-column cells truncates Midterm Examinations and School Foundation Day at 768. This is density, not a reason to shrink type. Existing chips wrap and cells can grow. | Permit three lines in the narrow calendar-grid container range; retain 12px type, tint/stripe, full accessible name, desktop two-line behavior and mobile agenda. | Both themes, 768 primary; 768/1024/1440 long-title and multi-event cells plus unchanged 360/390 agenda. Read-only response fixtures for edge content. |
| L3 — still reproducible / source-supported edge | Agenda headings exist only for event start groups. Today is 8 October; groups are 3/19/28, so the agenda has no Today marker while the grid marks the 8th. Later days in an event range have the same problem. | Ensure a current-month Today heading independently of event starts, using truthful “No events start today” wording when empty. Reuse agenda heading/empty styles; retain one listing per event and its date range. | Both themes, visible agenda at 360/390 (<768). Controlled-clock/read-only fixtures for no-start day, start day, later range day, filtered-empty current month and non-current month; no duplicate events. |
| L4 — still reproducible | Free wrapping puts the type filter alone on row three at 360; the navigation and action/filter controls lack deliberate grouping. At 390 they fit in two rows. | Group navigation/year as row one; use bounded flexible widths for view, Add Event and type filter in row two, retaining mobile gaps and 44px targets. Keep desktop layout. | Both themes, 360 primary; verify all five widths, keyboard order, filter behavior, long option text and zero body overflow. |

Examples: `light-360-settings-dirty.png`, `dark-360-settings-dirty.png`,
`light-768-calendar.png`, `dark-768-calendar.png`, `light-360-calendar.png`.
Calendar measurements show no body overflow at any matrix width. These are
BEFORE evidence; there are deliberately no L1–L4 AFTER claims.

Separate Supabase E2E setup, broad lint cleanup, schema consolidation, complete
original-findings adjudication and feature backlog remain outside approved
implementation scope. Readiness prerequisites are in workarounds; none was
silently started.
