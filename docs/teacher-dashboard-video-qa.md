# TD-VIDEO-QA-01 — Teacher Dashboard video review

**Review date:** 2026-10-22. **Branch:** `ux-overhaul`. **Mode:** video and source inspection only. No application code, database, or configuration was changed. The working tree already contained extensive Owner changes; this report evaluates the source present during this review, which may differ from the source in the recording.

## A. Video access and review coverage

| Item | Finding |
| --- | --- |
| Exact file | `C:\Youtube Automation Clips\SCENE TO SCENE\QA Teacherdashboard.mp4` exists; 439,461,737 bytes. Original was not moved or modified. |
| Browser-decoded metadata | 05:27.309; 3840 × 2160. Chrome exposes one video track and one audio track. |
| Encoding and frame rate | **Not verified.** FFmpeg/ffprobe were unavailable, and Chrome's video element does not expose the encoded codec or nominal frame rate. |
| Visual method | Locally decoded with installed Chrome/Playwright. Frames sampled every five seconds from 00:00 through 05:25; closer samples at 00:55–01:10 (one second), 02:12–02:30 (two seconds), 02:54–03:24 (two seconds), 03:58–04:43 (two to three seconds), and 04:50–05:26 (three seconds). The brief intervals between samples were **not continuously inspected**. |
| Audio | Track **present; speech NOT VERIFIED**. No reliable offline transcription/listening facility was available. Text burned into video frames is quoted as *visible caption text*, not as verified speech. |
| Evidence handling | Contact sheets were made under the user's temporary directory, outside the repository. No raw video, private PDF, student roster, account email, or public object URL was copied into `docs/`. |

This is **PARTIAL visual coverage** across the full duration, with closer sampling at the demonstrated interactions. A missed sub-second click or toast remains possible. No live localhost, Supabase, backend, Gemini, or browser network log was inspected for this review.

## B. Chronological action timeline

Times are best-supported `MM:SS` from sampled frames. “Caption” means text visible in the video, not verified audio.

| Time | Screen and visible action | Visible result / interpretation |
| --- | --- | --- |
| 00:00–00:29 | Landing page and Faculty login | Teacher dashboard opens; credentials and authentication internals are not verified. |
| 00:30–00:44 | Overview | Statistics, recent lesson plans, schedules, and school year appear. No statistical correctness was established. |
| 00:45–00:49 | Students/Masterlist | Roster is shown. Authorization and historical access were not exercised. |
| 00:50–00:59 | Lesson Plans; choose a small English PDF and press Generate | Selected file is displayed; upload progress follows. |
| 01:00–01:03 | AI generation | “Uploading to storage…” changes to “Analysing your PDF…”; then red alert reports `Failed to fetch` against `http://localhost:3001`. **TD-VID-001.** |
| 01:07–01:35 | Explicit Generate retry with the same selected file | Loading returns; generated editable ILAW plan opens with success feedback around 01:35. The video cannot prove whether the second attempt uploaded another object. Visible caption near 01:10 says the retry working means there is a problem. |
| 01:35–02:10 | Generated ILAW editor | Owner scrolls through generated sections and previews/editable document. Contents were not academically validated. |
| 02:12–02:18 | Initial Save Plan | Save spinner then success toast; saved-plan editor exposes a new Lesson Plan Title field. This verifies visible feedback, not independent database persistence. |
| 02:20–02:35 | Rename saved plan to “7 English” and press Save Changes | Saved list later shows “7 English”; filename field also shows it. The embedded ILAW document heading still reads “ILAW LESSON PLAN IN ENGLISH 7.” Caption near 02:45 says it should update to “7 English.” **TD-VID-002.** |
| 02:35–02:55 | Back to saved plans; inspect new card | Three cards are shown. New card warns “Saved subject or grade is unknown”; this is a distinct metadata gap. **TD-VID-003.** |
| 02:54–03:08 | Generate Worksheet on newly saved plan; Retry; Cancel | Modal reports no local Assessment fixture, nothing generated or saved. Retry produces the same message. Caption near 03:04 asks for it to work. **TD-VID-004.** |
| 03:10–03:24 | Print, Download PDF, Open source PDF | Print preview opens; browser download notification appears; source PDF opens through a `/storage/v1/object/public/lesson-pdfs/…` URL. These controls respond. Private-source access design warrants separate review; see TD-VID-009. |
| 03:25–03:30 | Delete newly created plan | Count falls from three to two and success toast appears. Confirmation details were not sampled closely enough to judge safeguards; database deletion not independently verified. |
| 03:33–03:53 | Worksheets, Worksheet Scores, Fictional Essay Review Lab | Both real lists are empty. A clearly labeled synthetic essay review lab opens; this is not evidence of real scoring or release. |
| 03:55–04:01 | Attendance | Seven roster rows load. The page explicitly says export is unavailable. Caption near 04:00 asks for export. **TD-VID-005.** No attendance status is saved in the recording. |
| 04:02–04:10 | Announcements | Empty state appears; no export control is present. Caption at 04:04 asks for export of announcements. **TD-VID-006.** A logout confirmation briefly opens at about 04:07; it is canceled. |
| 04:13–04:19 | Lesson Plans and Worksheets navigation | Saved lesson plans still appear; Worksheets list is empty. No worksheet distribution is attempted. |
| 04:20–04:34 | Create Worksheet in development-only manual editor | Blank worksheet editor, question-section controls and student preview area appear. It says development sample, not saved to EduScribe; subject and grade are unspecified due unavailable assignment. No Save Worksheet click is visible. |
| 04:34–04:37 | Back to Worksheets | Unsaved-changes confirmation appears; Owner chooses Discard changes. Empty list afterward is expected, not evidence of a failed save. |
| 04:40–04:53 | Lesson Plans list scrolled near bottom | Large empty area remains below two cards. Caption around 04:45 asks to remove the white space. **TD-VID-007.** |
| 04:55–05:27 | Profile Settings | Teacher profile shows photo, full name, read-only profession, email/status and a broad mostly blank form card. Captions around 05:08–05:11 ask why “only this remains” and to fix it. Exact missing fields are unclear without audio or an approved field list. **TD-VID-008.** |

## C. Module coverage

| Module | Classification | Limit |
| --- | --- | --- |
| Teacher Overview; Masterlist; navigation/sidebar | **WORKFLOW OBSERVED WITHOUT ISSUE** | Rendering/navigation only; data correctness, authorization, search, mobile not tested. |
| Lesson Plans; AI ILAW Generation | **ISSUE OBSERVED** | Initial network failure; separate title and metadata issues. Explicit save/list/print/download responses are visible. |
| Manual ILAW Editor | **NOT SHOWN IN VIDEO** | Entry card only. |
| Lesson Plan Preview / Print / PDF / source opening | **WORKFLOW OBSERVED WITHOUT ISSUE** for control response | Print preview/download shown; PDF content, filename on disk, and private access not independently verified. |
| Lesson Plan Save / Reopen | **AMBIGUOUS / INSUFFICIENT EVIDENCE** | Save feedback and list change shown; true reload and database confirmation absent. |
| Post to Class | **NOT SHOWN IN VIDEO** | Must remain internal association, never student publication. |
| Worksheets / AI Worksheet Generation | **ISSUE OBSERVED** | Development fixture cannot match saved plan. |
| Manual Worksheet Builder | **WORKFLOW OBSERVED WITHOUT ISSUE** for opening and editing | Draft was deliberately discarded; saving/reopening not tested. |
| Worksheet Drafts / Distribution / Submissions | **NOT SHOWN IN VIDEO** as completed workflows | No real distribution or submission demonstrated. |
| Worksheet Scores / Essay Review | **AMBIGUOUS / INSUFFICIENT EVIDENCE** | Empty scores list and fictional lab only; no real grading, persistence, approval, or result release verified. |
| Attendance | **ISSUE OBSERVED** for export availability | Roster loading shown; write intentionally blocked. |
| Announcements | **ISSUE OBSERVED** for requested export | Empty state shown; export data cannot be tested. |
| Teacher Profile | **ISSUE OBSERVED** for sparse form and Owner complaint | Exact desired fields ambiguous; role must remain trusted/read-only. |
| Mobile responsiveness and accessibility | **NOT SHOWN IN VIDEO** | Desktop 3840 × 2160 recording only. |

## D. Master bug and request inventory

All entries are **OPEN**. An observed symptom does not prove it still occurs in today's localhost build. Existing tests are synthetic unless stated otherwise. “Verified” root cause refers to current source structure, not deployed state.

### TD-VID-001 — Initial AI generation request fails

- **Module / time:** AI ILAW, 01:00–01:10. **Category:** API/network. **Severity:** HIGH. **Priority:** P1.
- **Action / actual:** Generate on selected PDF; upload and analysis progress, then `Failed to fetch` for `http://localhost:3001`. Explicit retry later succeeds.
- **Expected / impact:** First attempt should either generate or give a precise, recoverable error; failed transport delays lesson planning and may leave an uploaded source PDF.
- **Active path / handler:** `frontend/src/routes/AppRoutes.jsx` → `TeacherDashboard.jsx` → `tabs/LessonPlansTab.jsx`, `handlePdfUpload` → `callGeminiWithPDF`; `frontend/src/lib/backendApi.js` selects development API base; `backend/src/app.js` mounts `routes/ai.js`.
- **Root cause / confidence:** **UNKNOWN.** The browser's `TypeError` is a transport-level failure. Backend offline, connection refusal, CORS, browser blocking, request interruption, or lost response cannot be separated without the original Network/console/backend logs. An HTTP 401/413/502 would use the `!response.ok` path, so none can be asserted from the alert alone. Current source uses a 100-second client timer; a 3-second failure is not proof of timeout. The current same-file upload cache was added after the recorded behavior and is not live-verified here.
- **Evidence:** Error at 01:03; retry running at 01:09; editable plan at ~01:35. No HAR or server log is in the video.
- **Proposed fix / security:** First capture a new failing request and backend log. Then change only the established failing layer. Keep session check before upload and no automatic retry, because upload and Gemini calls have side effects. Do not expose tokens in diagnostics.
- **Test / manual verification:** Mock rejected fetch, HTTP error, success and explicit retry; verify one in-flight request, accurate alert, cleanup and no auto-save. In a separately approved local test with a safe source, inspect Network preflight/request and backend logs at the same timestamp.
- **Blockers:** Original transport evidence absent; any real upload requires destination/privacy approval.

### TD-VID-002 — Saved title and document heading diverge

- **Module / time:** Lesson Plan editor, 02:20–02:50. **Category:** React state / document rendering. **Severity:** MEDIUM. **Priority:** P1.
- **Action / actual:** Rename list title to “7 English” and save; list changes, but the generated document heading visible in editor/print remains “ILAW LESSON PLAN IN ENGLISH 7.” Caption asks for the former.
- **Expected / impact:** If the title is meant to govern the displayed document heading, editor, print and downloaded PDF should agree with it; otherwise the UI must clearly distinguish the two. Current mismatch makes exported material look incorrectly named.
- **Active path / handler:** `LessonPlansTab.jsx`, `handleSaveIlawPlan`, `handleViewPlan`, `printSavedAi`, `downloadSavedAi`; generated HTML in `plan.objectives`.
- **Root cause / confidence:** **VERIFIED source separation:** save updates the `title` column and retains `objectives: safeHtml` unchanged; generated heading is embedded in the editable HTML and print/download consume that HTML. Whether automatic heading rewrite is the approved behavior is **not verified**. The recording establishes the Owner's expected visual result.
- **Evidence:** Title entry/save 02:20–02:30, saved card 02:35, caption at ~02:45, print heading at 03:14.
- **Proposed fix / security:** Confirm whether list title should replace the internal ILAW heading. If yes, update only the intended heading node with sanitized text at save/export, preserving other editable content and avoiding broad HTML string replacement. Keep Owner content editable.
- **Test / manual verification:** Synthetic plan with distinct list and document titles; rename, save, reopen, print and download; verify both title displays and content integrity.
- **Blockers:** Exact title semantics need Owner confirmation before code change.

### TD-VID-003 — Saved AI plan lacks subject/grade metadata for handoff

- **Module / time:** Saved Lesson Plans, 02:35–02:55 and 03:20. **Category:** Frontend/database contract and authorization. **Severity:** HIGH. **Priority:** P1.
- **Action / actual:** New AI plan card says saved subject or grade is unknown, although the source file/document describes English Grade 7.
- **Expected / impact:** A saved plan used for worksheet handoff should carry verified subject, grade and applicable school year from an authorized teaching load. Unknown values prevent safe real worksheet authoring/distribution and invite mistaken assumptions from filename text.
- **Active path / handler:** `LessonPlansTab.jsx`, `handleSaveIlawPlan` payload; `lessonPlans/worksheetContext.js`, `prepareDevelopmentWorksheetContext` and trusted assignment helpers.
- **Root cause / confidence:** **VERIFIED in current source:** AI save payload sets generic `subject: 'ILAW Lesson Plan'` but no `subject_id` or `grade_level`; the context falls back to blanks and marks assignment unverified. The actual database schema and deployed row were not inspected.
- **Evidence:** Card's explicit unknown-subject/grade notice at 02:54 and 03:20.
- **Proposed fix / security:** Capture subject and grade from current official teaching load during authoring, validate them server/database-side before any real worksheet operation, and preserve school-year isolation. Do not infer authority from `[G7]` in the filename or adviser status.
- **Test / manual verification:** Synthetic authorized/unauthorized assignments and missing official year; verify metadata save/handoff and rejection of unassigned combinations. Reopen an approved test plan and inspect displayed subject/grade.
- **Blockers:** Approved trusted persistence/authorization integration and schema confirmation are required for a durable fix; no SQL or shared queries performed.

### TD-VID-004 — Generate Worksheet cannot generate from this saved plan

- **Module / time:** Lesson Plan → Worksheet, 02:54–03:08. **Category:** Feature gate / unimplemented functionality. **Severity:** HIGH. **Priority:** P1.
- **Action / actual:** Generate Worksheet shows “No local test fixture matches this Assessment. Nothing was generated or saved.” Retry repeats the same result.
- **Expected / impact:** Target workflow is a teacher-reviewed worksheet generated from the selected saved plan's actual content, independently of Post to Class. Current development sample cannot handle ordinary AI output.
- **Active path / handler:** `LessonPlansTab.jsx`, `handleGenerateWorksheet`; `worksheets/developmentWorksheetDraft.js`, `createDevelopmentWorksheetResponse`; `lessonPlans/worksheetContext.js`.
- **Root cause / confidence:** **VERIFIED:** handler is development-only and matches one of three hard-coded Assessment fixtures exactly; the recorded plan does not match. This is an intentionally incomplete feature, not evidence of a Gemini outage or distribution failure.
- **Evidence:** Error modal and repeated Retry at 02:56–03:06.
- **Proposed fix / security:** A separate approved implementation should generate from selected saved plan content, validate output, keep answer keys private, and save a draft only after teacher review. Retrying the same unsupported fixture is not a repair.
- **Test / manual verification:** Mock generation from two distinct saved plan contents; assert alignment, no fixture substitution, no save/distribution before explicit action, and private answer key.
- **Blockers:** Real AI worksheet backend and trusted persistence/authorization are unfinished; outside this read-only task.

### TD-VID-005 — Attendance export unavailable

- **Module / time:** Attendance, 03:58–04:01. **Category:** Missing requirement / feature gate. **Severity:** MEDIUM. **Priority:** P2.
- **Action / actual:** Roster appears, page says “Export is unavailable.” Visible caption requests export.
- **Expected / impact:** Export an authorized attendance report for selected section, date/year, with historical isolation. Teacher cannot produce a report here.
- **Active path / handler:** `tabs/AttendanceTab.jsx`; no export handler exists in this tab.
- **Root cause / confidence:** **VERIFIED:** explicit unavailable text in source at line 420; write restriction is intentional and unrelated.
- **Evidence:** 03:58–04:01.
- **Proposed fix / security:** Add read-only export only after agreeing format/fields; derive authorized roster and dates from trusted data. Do not enable attendance writes or export unauthorized student details.
- **Test / manual verification:** Synthetic multi-section/year data: correct rows, exclusions, filename and spreadsheet-safe escaping; download from selected view.
- **Blockers:** Export specification and trusted roster authorization; no live data inspected.

### TD-VID-006 — Announcements export requested but absent

- **Module / time:** Announcements, 04:04. **Category:** Missing requirement. **Severity:** LOW. **Priority:** P3.
- **Action / actual:** Empty announcements page has search/filter controls and no export; visible caption asks for announcement export.
- **Expected / impact:** Owner appears to want export of visible announcements; format, audience scope and whether empty exports are useful remain unspecified.
- **Active path / handler:** `tabs/AnnouncementsTab.jsx`; no export control/handler.
- **Root cause / confidence:** **VERIFIED absence in current component;** Owner's precise intended export semantics **UNKNOWN** because audio was not understood and the page is empty.
- **Evidence:** 04:04–04:10.
- **Proposed fix / security:** Clarify format and authorized scope, then add a read-only export of permitted published announcements; avoid exposing drafts or unrelated audiences.
- **Test / manual verification:** Synthetic published/filtered and empty announcements; verify only authorized visible records export.
- **Blockers:** Clarification and suitable test data.

### TD-VID-007 — Large empty area under Lesson Plans list

- **Module / time:** Lesson Plans layout, 04:40–04:53. **Category:** UI/CSS and UX. **Severity:** LOW. **Priority:** P2.
- **Action / actual:** At the bottom of a two-plan list, broad white/near-white space fills the rest of the desktop viewport; caption asks to remove it.
- **Expected / impact:** Content should feel intentional at this screen size and scroll position; the sparse list currently looks unfinished.
- **Active path / handler:** `tabs/LessonPlansTab.jsx` list view; `TeacherDashboard.jsx` `TeacherLayout` main scroll shell.
- **Root cause / confidence:** **STRONGLY SUPPORTED:** few list cards inside a `h-screen`/`flex-1` dashboard main create unused viewport area. No overflow, overlay, or missing card is established. There is no specific failing event handler.
- **Evidence:** 04:40–04:53, after new plan deletion; two cards remain.
- **Proposed fix / security:** First reproduce at the Owner's desktop viewport and identify whether the complaint is list density, background mismatch, or excess scroll. Apply a focused layout change without hiding list actions. No security effect expected.
- **Test / manual verification:** Screenshot at same viewport and typical laptop width with two and many cards; verify no clipped controls or extra scroll.
- **Blockers:** Exact preferred layout is not specified.

### TD-VID-008 — Teacher Profile appears reduced and mostly empty

- **Module / time:** Profile Settings, 04:55–05:27. **Category:** UX / possible missing requirement. **Severity:** MEDIUM. **Priority:** P2.
- **Action / actual:** Form card contains full name, read-only “Teacher (account role),” and Save Changes, leaving much blank space. Captions ask why “only this remains” and request a fix.
- **Expected / impact:** Owner expects a fuller/useful profile; exact desired fields cannot be determined from verified audio or frames alone. The large empty card creates a weak visual hierarchy.
- **Active path / handler:** `TeacherDashboard.jsx` `/profile` route renders `ProfileTab teacherView`; `frontend/src/pages/profile/ProfileTab.jsx` form and submit handler.
- **Root cause / confidence:** **VERIFIED current rendering:** `teacherView` hides phone/date-of-birth/address/bio and shows only name/photo plus read-only role, with a tall two-card layout. Whether those omitted fields should be restored is **UNKNOWN**. Role read-only is correct for account security.
- **Evidence:** 04:56–05:26 and visible captions at ~05:08–05:11.
- **Proposed fix / security:** Obtain the Owner's precise permitted fields and redesign only the teacher profile presentation. Never make role, email, or account status client-editable merely to fill space.
- **Test / manual verification:** Render teacher view with permitted fields and long/empty values at desktop/mobile; verify authorized Save Changes and role remains trusted.
- **Blockers:** Field requirements and storage permissions need clarification; no save click was observed.

### TD-VID-009 — Source PDF public URL conflicts with private-source rule

- **Module / time:** Source PDF opening, 03:20–03:24. **Category:** Storage authorization risk. **Severity:** HIGH. **Priority:** P1, separate security audit.
- **Action / actual:** Open source PDF opens a browser route shaped `/storage/v1/object/public/lesson-pdfs/…`. The report intentionally omits the object URL and identifying path.
- **Expected / impact:** Uploaded source PDFs for private lesson plans must not be publicly readable merely because the teacher used them for generation.
- **Active path / handler:** `LessonPlansTab.jsx` calls `supabase.storage.from('lesson-pdfs').getPublicUrl`; `backend/database/schema/STORAGE_BUCKETS_CONFIGURATION.sql` declares `lesson-pdfs` `public=true` and a public-read policy.
- **Root cause / confidence:** **VERIFIED source-level public design and visible public URL shape. Deployed bucket/policy/effective unauthenticated access NOT VERIFIED.** Do not claim that any particular file was retrievable by a stranger.
- **Evidence:** 03:22 browser URL shape and source lines 25–26, 305–309.
- **Proposed fix / security:** Separate approved security audit of actual deployed bucket/RLS and file lifecycle; then migrate private source access to trusted, short-lived signed URLs if needed. Review existing links and migration before changing policies or deleting files.
- **Test / manual verification:** With explicit approval and synthetic objects only, verify owner access, other-teacher denial, anonymous denial and source opening. No hosted Storage inspection was performed here.
- **Blockers:** Hosted configuration and data impact are unverified; no SQL or Storage changes authorized.

## E. Non-issues, ambiguities, and production blockers

- **Expected:** The 04:34 worksheet draft was discarded through a confirmation dialog. The subsequent empty Worksheets list is not a demonstrated save failure. The empty Worksheet Scores list is consistent with zero worksheets. The Fictional Essay Review Lab explicitly identifies itself as local synthetic work, so its controls do not prove score persistence.
- **Expected restrictions:** Attendance writes, score saving, review persistence, result release, and unsafe worksheet distribution remain blocked. Do not bypass them. Review approval must not release results; Post to Class must not publish private plans.
- **Ambiguous:** The video has no authenticated Network panel, server logs, console, database query, or hosted policy evidence. The initial AI error's exact transport cause, true save durability, PDF export content fidelity, delete durability, announcement export semantics, and exact desired profile fields are not verified.
- **Source-supported additional reliability risk:** `LessonPlansTab.jsx` aborts its fetch after 100 seconds, while `backend/src/lib/gemini.js` may make two 90-second attempts plus delay. A late provider response could be lost and an explicit retry could incur a second generation. This **did not explain** the roughly three-second failure in the recording. Aligning timeout/cancellation/idempotency needs a separate design backed by runtime evidence.
- **Production-dependent:** Official `school_settings.school_year`, teaching-load authorization, durable manual worksheet drafts, worksheet distribution, scoring, attendance history/export and private source access all need trusted integration or approved database verification. The video and local source cannot certify them.

## F. Video-to-code traceability and fix order

| ID | Video | Active component / source cause | Test coverage seen | Readiness / next action |
| --- | --- | --- | --- | --- |
| 001 | 01:03 | `LessonPlansTab` → backend route; exact transport cause unknown | Mock generation tests cover rejection/retry, not original network | **Evidence first**: localhost Network + backend log; no speculative fix |
| 002 | 02:20–02:45 | `LessonPlansTab` saves metadata title separately from HTML heading | Rename test checks list/filename; embedded heading contract not established | **Owner title semantics**, then focused local UI fix |
| 003 | 02:54 | `LessonPlansTab` AI save omits trusted subject/grade; worksheet context keeps unknown | Context tests are synthetic | **Trusted authorization/database integration** |
| 004 | 02:56–03:06 | `developmentWorksheetDraft` exact fixture match | Fixture tests explicitly expect unmatched failure | **Separate AI worksheet feature**, after authorization contract |
| 005 | 03:58–04:01 | `AttendanceTab` explicitly disables export | No export test | **Read-only feature** after field/scope decision |
| 006 | 04:04 | `AnnouncementsTab` has no export | No export test | **Clarify request**, then read-only feature |
| 007 | 04:40–04:53 | Short list inside full-height dashboard main | No viewport-specific evidence in tests reviewed | **Local visual reproduction** before CSS edit |
| 008 | 04:55–05:26 | `ProfileTab teacherView` omits other fields and uses tall cards | Profile tests cover behavior, not desired field set | **Clarify permitted fields**, then focused UX task |
| 009 | 03:22 | `getPublicUrl` and public bucket SQL design | No hosted access test authorized | **Separate approved Storage security audit** |

**Recommended sequence:** (1) TD-VID-001 runtime diagnosis, because it blocks reliable plan generation and has no proven root cause; (2) TD-VID-009 approved privacy audit before any further real source uploads; (3) TD-VID-002 title contract and local fix; (4) TD-VID-003 trusted metadata contract; (5) TD-VID-004 real worksheet generation only when its backend/persistence scope is authorized; (6) TD-VID-005 and 006 read-only exports; (7) TD-VID-007 and 008 UX work after brief clarification. These are separate tasks unless a common root is demonstrated.

**Exact next recommended fix:** TD-VID-001 diagnostic retest on the actual localhost Teacher route. Before any PDF upload, confirm the backend health endpoint, configured Storage destination and privacy implications. With Owner approval and a non-sensitive fixture, record sanitized browser Network status/timing/preflight plus timestamp-matched backend logs. A connection error, CORS block, HTTP error, timeout and lost response require different fixes. No changes should be called “fixed” on mocked tests alone.

## G. Unverified items

Speech content beyond visible captions; nominal frame rate/codec; sub-second intervals between samples; mobile layout; manual ILAW creation; Post to Class; worksheet Save/Reopen and distribution; student submissions; real grading, review approval and release; attendance writes/history; exact announcement export requirements; deployed Supabase schema, RLS and Storage settings; real Gemini availability; backend status at recording time; current localhost recurrence of any recorded defect. **I cannot verify these from the currently available project evidence.**
