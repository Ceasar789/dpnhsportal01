# Clarity redesign — status

Written from the repository at commit `5934476` (branch `master`) on 2026-11-11. Dates and times are Manila time, taken from the commit dates. **Unverified** marks anything the repository cannot show: how it looks in a real browser, on a real phone, or with a screen reader.

## What it is

"Clarity" is the new look chosen for the dashboards. The design brief is in a handoff kept outside the repository (`C:\SchoolWorks\design-handoff\README.md` and `alt.css`).

It is being added **beside** the current screens, not in place of them:
- The current ("classic") screens are unchanged.
- The new screens are separate components. Since F5 they are shown by default; the classic screens stay one hidden switch away (`?clarity=0` in the URL). Since G1 there is no visible **Classic view** button.
- Each new screen reads the same data as the classic one. Nothing new is fetched and nothing is written to the database.

## The Clarity flag

- **On by default** (since F5). A visitor who does nothing sees the Clarity dashboard. If the browser blocks `localStorage`, it also falls back to Clarity.
- **Turn it off (hidden rollback):** add `?clarity=0` to the URL. The **Classic view** button was removed from all three Clarity headers in G1; the URL parameter is the only switch. The choice is remembered in the browser's `localStorage` under `smartedu-clarity` as `0` (`frontend/src/components/clarity/useClarityFlag.js:16`).
- **Turn it back on:** add `?clarity=1`; this is remembered as `1`.
- **While Clarity is on**, the class `theme-clarity` is placed on the page's `<html>` element. All Clarity styles only apply under that class, so they cannot change a classic screen.
- **Dark mode** is the existing dashboard setting. Clarity follows it.

> **Demo warning:** before the defense, open every demo device with `?clarity=0` once, so no device is still remembering the preview.

## What exists now (Student dashboard only)

| Phase | What it added | Commit |
|---|---|---|
| Tokens | Clarity colours, sizes and fonts, unused by the app | `02ef55d` (14:36) |
| 1b | Darker light-mode colours for readable contrast | `c763f8c` (14:52) |
| Components | The Clarity stylesheet (cards, buttons, rows, badges…) | `8e7e984` (15:16) |
| Charts | Small chart components: ring, donut, ranked bars, stacked bar | `6709832` (16:04) |
| 3b | Darker chart colours for contrast against the background | `e670504` (16:16) |
| 4B | Student Clarity shell (header, side menu, phone drawer) behind the flag | `4c716e1` (17:28) |
| 4C | Student Scores tab in Clarity | `3071456` (18:35) |
| 4D | Student Overview tab in Clarity | `9ca6287` (19:24) |
| 4D-b | School logo on the Overview; real numbers for out-of-range percents | `5934476` (19:52) |

All commits are dated 2026-11-11.

**Where the files are** (all under `frontend/src/components/clarity/`):
- **Shell:** `student/ClarityStudentLayout.jsx`, chosen by `student/StudentShellSwitch.jsx`.
- **Scores tab:** `student/ClarityScoresTab.jsx`, chosen by `student/ScoresTabSwitch.jsx`.
- **Overview tab:** `student/ClarityOverviewTab.jsx`, chosen by `student/OverviewTabSwitch.jsx`.
- **Charts:** `charts/ProgressRing.jsx`, `Donut.jsx`, `RankedBars.jsx`, `StackedBar.jsx`, `chartMath.js`.
- **Styles:** `frontend/src/styles/clarity.css` (colours and sizes) and `clarity-components.css` (components).

The only classic file that refers to Clarity is `frontend/src/pages/dashboards/student/StudentDashboard.jsx`: it uses the three switches (`:66`, `:68`). A guard test checks that no other app file imports from the Clarity folder.

**Rules the Clarity screens follow:**
- **Same information as the classic screen.** Every text, link and state is kept. Tests render both versions with the same data and compare them.
- **No invented data.** No trends, class averages or rankings that the app does not have.
- **No data is never shown as zero.** An empty average says "No released scores"; empty attendance says "No data yet".
- **Out-of-range percents** (above 100 or below 0) are shown as the plain number, for example "120%", with no ring. A ring can only draw 0–100 and would read "100%" next to the real value.
- **The school logo** is kept on the Overview welcome card, with the same image and alt text ("School Logo"), hidden if it fails to load.
- **"Worksheet Performance"** stays the label on the Overview; it is never called a grade.

**A temporary copy (to remove after the defense):** `student/overviewSummary.js` is a word-for-word copy of the calculations inside `pages/dashboards/student/tabs/OverviewTab.jsx` (worksheet performance, attendance, the welcome details, the pending count and the per-subject counts). It was copied so the classic file did not have to change before the defense. A parity test (`student/ClarityOverviewTab.test.jsx`) checks that both give the same numbers. After the defense, `OverviewTab.jsx` will import this helper instead of keeping its own copy (owner-approved "Option A").

## Not done yet

**Student:** Attendance, Announcements and Tasks still show the classic tab even with the flag on, and so does Profile. According to the owner's plan, Attendance, Announcements and Tasks need their data and handlers moved out of the tab files first; this was **not** re-checked tab by tab for this document.

**Teacher:** not started.

**Admin:** a read-only review (no code changed) found:
- **Shared styles:** the admin screens depend on one inline style block of about 1,030 lines (`frontend/src/pages/dashboards/admin/AdminDashboard.jsx:219-1250`). It also styles plain page elements (for example every `nav`, `table` and `input`), so it would leak into a Clarity shell.
- **Shell behaviour:** the navigation guards (unsaved changes), the archive/delete and logout confirmations, the phone drawer's focus trap and the toast messages all live inside `AdminDashboardShell` (`AdminDashboard.jsx:109`). They must move into a shared hook before an Admin Clarity shell can exist.
- **Guard tests:** three one-line test edits would be needed so that a second Clarity shell is allowed: `components/clarity/student/ClarityStudentLayout.test.jsx:273`, `styles/clarity.test.js:126` and `styles/clarityComponents.test.js:168`.
- **Estimate:** about 11–12 working rounds. This is an estimate from the review, not a measured number.
- **All Admin work is planned for after the defense.**

## Known limitations

- **Looks are unverified.** No Clarity screen has been checked in a real browser, on a real phone, at 320px wide, or with a screen reader. Layout at phone widths was checked by reading the CSS and by the automated tests only.
- **Flag and blocked storage:** if the browser blocks `localStorage`, the flag is not remembered, and a tab that rewrites the address can drop `?clarity=1`. The page then shows the classic view.
- **Chart caption overlap (not fixed):** the ring component's caption label is styled by a design rule (`.o-ring b`) meant for a centre label. The Clarity tabs avoid it by not passing that label. Found during review; not checked in a browser.

## Test status (2026-11-11, at `5934476`)

- **Frontend unit tests** (from `frontend/`: `npx vitest run --maxWorkers=2 --minWorkers=1`): **Test Files 225 passed (225); Tests 2508 passed, 1 skipped, 6 todo (2515).**
- **Backend unit tests** (from `backend/`: `npm test`): **485 tests, 485 passed, 0 failed.**
- **End-to-end (browser) specs:** none were run for the Clarity work.
