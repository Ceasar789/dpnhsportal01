# Clarity redesign — status

Written from the repository at commit `5934476` (branch `master`) on 2026-11-11. Dates and times are Manila time, taken from the commit dates. **Unverified** marks anything the repository cannot show: how it looks in a real browser, on a real phone, or with a screen reader.

## What it is

"Clarity" is the new look chosen for the dashboards. The design brief is in a handoff kept outside the repository (`C:\SchoolWorks\design-handoff\README.md` and `alt.css`).

It is being added **beside** the current screens, not in place of them:
- The current ("classic") screens are unchanged.
- The new screens are separate components. Since F5 they are shown by default; the classic screens stay one hidden switch away (`?clarity=0` in the URL). Since G1 there is no visible **Classic view** button.
- Each new screen reads the same data as the classic one. Nothing new is fetched and nothing is written to the database.

## The Clarity flag

- **On by default, everywhere** (desktop and phone). A visitor who does nothing sees the Clarity dashboard. If the browser blocks storage, it also falls back to Clarity.
- **Stale "off" ignored (since G0):** before G0, the removed **Classic view** button and `?clarity=0` saved `smartedu-clarity = 0` in `localStorage`. That kept a device on the classic design for good, which is why some phones still showed it. A stored `0` no longer turns Clarity off, and it is removed when a dashboard loads.
- **Hidden rollback:** add `?clarity=0` to the URL. It lasts only for **this tab session**: it is saved in `sessionStorage` (same key), never in `localStorage`. A new tab or visit is back on Clarity. See `frontend/src/components/clarity/useClarityFlag.js`.
- **Turn it back on:** add `?clarity=1`. This clears the rollback.
- **While Clarity is on**, the class `theme-clarity` is placed on the page's `<html>` element. All Clarity styles only apply under that class, so they cannot change a classic screen.
- **Dark mode** is the existing dashboard setting. Clarity follows it.

> **Demo note:** Clarity is the default on every device. `?clarity=0` only affects the tab it is opened in.

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

## Admin User Management (G2)

- **Master-detail:** the users table is on the left and the profile card on the right. Below 1100px wide, the card stacks under the table.
- **Selecting a user:** clicking anywhere on a row selects that user. The name button in the first cell does the same from the keyboard (Enter or Space) and carries `aria-pressed`. Nothing is selected when the page opens; the card then reads "Select a user to see their profile."
- **What the card shows:** only fields that `GET /api/admin/users` returns. That route reads `profiles.*`, so the card shows the photo, name, email, role, status, Created, Department and the Profile Settings fields (phone, date of birth, address, about me). Any field that is empty is left out.
- **LRN:** the LRN is stored in `students.lrn`. The directory route now adds it to each row as `lrn` (`null` when there is none), and the card shows it for students only.
- **LRN when creating or editing a user:**
  - The user dialog, both classic and Clarity, has an **LRN** field that appears only when the role is Student. It accepts digits only, up to 12.
  - **Create:** a 12-digit LRN is required for a student. The invite route (`backend/src/routes/onboarding.js`) checks the format and that no other student has it, then creates the `students` row after the profile. If any step fails, the students row, the profile and the auth account are all removed.
  - **Edit:** the LRN is checked and saved (`students` upsert, before the profile update) only when it is filled in. A student with no LRN on record can still be saved with the field blank.
  - **Messages:** "A 12-digit LRN is required for a student." and "This LRN is already used by another student."
  - **Other roles:** the request is unchanged; any LRN is ignored.
  - Students still cannot change their own LRN in Profile Settings.
- **Actions:** Edit, Resend invitation and Archive/Restore are in the card and use the same handlers as before.

## Teacher Lesson Plans and Worksheets (G4)

- **What changed:** both pages still show the classic tab components, inside the Clarity shell. `ClarityTeacherLayout.jsx` gives their wrapper one more class, `x-tlp` (Lesson Plans) or `x-tws` (Worksheets). Scoped CSS in `clarity-components.css` then lays them out like the final design.
  - **Both pages:** the classic padding is removed, so content no longer sits further in than other pages, and titles are 26px.
  - **Lesson Plans:** the AI and Manual cards are on the left and the saved list on the right. Below 1100px wide they stack.
- **What did not change:** every editor, dialog, print, PDF and save path, and the shared draft props that `TeacherDashboard.jsx` passes these tabs.
- **Why not a rebuilt Clarity tab:** each tab keeps all of its state in one large component, and the Clarity shell cannot pass the shared draft props. The owner chose this restyle-in-place approach for G4.
- **Not matched yet:**
  - **Header text:** the subtitles keep the classic wording.
  - **Colours:** the classic markup sets its colours inline, and Clarity CSS does not use `!important`.
  - **Worksheets columns:** the "Not distributed / Distributed" columns are not built. Each worksheet does have a real assignee count, and the classic cards already show "Distributed · N" or "Not distributed", but splitting the list into two columns needs component logic, not CSS.
- **Rollback:** `?clarity=0` shows the classic shell, unchanged.

## Student Profile Settings (G5, "Option A")

- **Where:** `components/clarity/student/ClarityStudentProfileTab.jsx`. The Student Clarity shell shows it on `/student-dashboard/profile` through `CLARITY_PAGES` in `ClarityStudentLayout.jsx`. `?clarity=0` still shows the classic `ProfileTab`, which Admin and Teacher share and which is unchanged.
- **Logic:** a word-for-word temporary copy of `ProfileTab.jsx` (lines 22–90 and 93–377), checked by source-parity tests. The one declared substitution: `teacherView` is the constant `false`. Photo upload with the 3-per-7-days rule, save, discard, the leave guard and Change Password all behave exactly as before.
- **Layout:**
  - **Left card:** the photo (or initials), Change photo, the photo-rule text, name, email, the LRN, and the stored account status.
  - **Right side:** "Personal information" (Full name, Date of birth, Phone, Email read-only "managed by school", Address, About me; Discard and Save Changes), then a Password card.
- **Subtitle:** "Your student profile. Your LRN and email are managed by your school." The name is left out because students can edit their own name.
- **LRN:** read from the student data the dashboard already loads (`studentTaskGraph.js:128`, `students.lrn`). No new read. With no LRN on record, the box is left out.
- **Status:** only the stored status is shown. If none is stored, there is no pill and no assumed "active".

## Student Scores layout (G8)

Layout and type only; the data and behaviour are the same as before.
- **Overall average:** now a compact card, the first cell of the same auto-fill grid as the subject cards. It has a 72px ring beside "Overall average" and "N released scores", and takes only its content's height.
- **Subject cards:** equal height in each row (grid stretch, each card a flex column). Each card shows the subject name, a 64px ring with "Average" beside it, "Released N / M" at 22px/700, and "N awaiting results" only when it applies. The "Show released scores (N)" button is pinned to the card bottom, so buttons line up across a row, and stays on one line (an ellipsis only as a last resort).
- **Rings:** they no longer draw the inner "average" caption, which was about 6px. The centre shows the percentage only.

## Responsive pass, phones first (G10)

CSS only, plus one JSX fix, all in `clarity-components.css` and `ClarityAdminLayout.jsx`. Every new rule is inside a phone query (`max-width: 767px`) or a landscape-phone query (`max-width: 1023.98px` and `max-height: 500px`), so desktop is unchanged. Desktop screenshots at 1280 and 1440 were compared before and after, pixel by pixel.
- **No sideways scroll:** Admin Subjects and Calendar scrolled the whole page sideways on phones (by up to 149px and 319px). The cause was hidden screen-reader text inside the table's scroll box (`.x-tw`): the box was not positioned, so the text escaped it. `.x-tw` is now `position: relative` on phones.
- **Search boxes:** they were hidden on phones (`.x-search { display: none; }`). They now show full width on their own row: Users, Teaching Load, News, Memos, Teacher Students and Announcements, Student Announcements.
- **Toast:** on phones it now sits at the bottom, above the safe area, and still lets taps through. It no longer covers the top bar.
- **Top bar:** on phones the theme toggle comes first, then the bell. This is the visual order only; the keyboard order is unchanged (bell, then theme).
- **Student Overview:** the refresh button sits beside the title. Text values such as "No released scores" are 24px. The rings are 76px, so the percentage is about 12.7px instead of 9.3px.
- **Tap targets:** 44px minimum on phones for chips, segments, tabs, role and grade tabs, text links, the bell, task filters, the restyled Lesson Plans and Worksheets controls, pickers and the profile photo button (were 40px, some 20 or 36px).
- **Phones in landscape (844x390):** these get the drawer layout but not the 767px rules. They now also get 16px inputs (no iOS zoom), including classic inputs in Clarity pages and dialogs, plus the same 44px targets, top-bar order and ring.
- **Admin drawer focus (JSX):** closing the drawer (Escape, a link, the scrim) now returns focus to the menu button. Before, the shell hook focused the button while the header was still inert, so focus fell to the page body. The layout now repeats the focus after lifting inert.
- **Checked and fine:** the drawers (focus trap, Escape, closes on navigation, scrim, scroll lock, no layout jump), the dialogs (bottom sheets on phones, inner scroll in landscape, buttons in view), and tables (they scroll inside their own box).
- **Left as is:**
  - The Admin Profile "Change Password" text button is 20px tall; it is in the shared classic `ProfileTab`.
  - Classic toasts on restyled classic pages (such as Student Tasks) still sit at the top; they use shared classic classes.
- **Tests:** `styles/clarityG10Responsive.test.js` pins the rules. One existing assertion changed, with approval: `styles/clarityComponents.test.js` now expects the phone toast at the bottom.

## Student Profile: LRN always shown, Emergency contact (G7)

- **LRN box:** always shown on the student's Profile Settings.
  - With an LRN on record, it shows the value.
  - Without one, it shows "Not set yet. Please ask the administrator to add it."
  - It says "Loading…" while the student data loads, and "Could not load your LRN right now." if that load failed. That load fails as a whole if any of its reads fails.
- **Emergency contact card:** added under Personal information, inside the same form, with Contact person's name (max 80), Relationship (max 40) and Contact number (the same input as Phone). It uses the same Save Changes, Discard, unsaved-changes banner and leave guard.
  - **Validation:** all three are optional; once any is filled, the name and the number are required.
  - **Saving:** the three `profiles.emergency_contact_*` columns are added to the existing `updateProfile` save only when they changed. Values are trimmed, and an emptied field saves as `null`. They are only ever sent for students.
- **Admin:** the Users profile card shows a student's emergency contact when stored. It comes from the same `profiles.*` row as before, with no new read.

## Student My Attendance and Announcements (S2a)

- **Where:** `components/clarity/student/ClarityStudentAttendanceTab.jsx` and `ClarityStudentAnnouncementsTab.jsx`. The Student Clarity shell shows them through `CLARITY_PAGES` in `ClarityStudentLayout.jsx`. `?clarity=0` shows the classic tabs, which are unchanged.
- **Logic:** word-for-word temporary copies of the classic tabs (Attendance `:26` and `:30-93`; Announcements `:20-62`), with source-parity tests and no substitutions. Both make the same reads as before.
- **My Attendance:**
  - **Calendar:** a month grid with each real record's status on its date, written out (not colour alone).
  - **Rate and counts:** the attendance rate and its rule, and the Present / Late / Absent / Excused counts.
  - **Record list:** the full list (date, status, section, subject, notes) with Show more.
  - **Month and Section selects:** the same as before; "All" lists every record and hides the calendar.
  - **Empty values:** a missing subject or note is left empty. With no records, no rate or counts are shown.
- **Announcements:**
  - **Cards:** search, then one card per announcement with title, text, date, and NEW and Important as before.
  - **Sender:** shown only when stored. The classic "School Admin" fallback was dropped.
  - **Audience:** shown only when `target_roles` is stored, with the admin News labels.

## Student Tasks (S2b)

- **What changed:** the classic student Tasks tab (826 lines) is shown inside the Clarity shell unchanged. `ClarityStudentLayout.jsx` wraps it in one extra class, `x-stk`. Scoped CSS then applies the final design's layout and type: no double inset, a 26px title, 40px filter tabs, and roomier task cards with 16px titles.
- **What did not change:** every read, the `?view=` filter, and every answer, submit and save flow.
- **Not matched:**
  - **Group headings:** the PDF's Today / This week / Done / Later headings would need component logic.
  - **Checkboxes:** they have no function behind them.
  - **Colours:** the classic inline colours stay, because Clarity CSS does not use `!important`.
- **Rollback:** `?clarity=0` shows the classic shell, unchanged.

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
