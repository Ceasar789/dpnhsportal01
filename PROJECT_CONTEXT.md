# SmartEdu Portal — project context

Audited 2026-10-07 at branch `ux-overhaul`, HEAD `75b8ed1`. This is a navigation aid; recheck current source and live database before changing behavior. No secrets are recorded here.

**Evidence labels:** VERIFIED = inspected source/configuration or executed local check; INFERRED = expected consequence not executed; NOT VERIFIED = unavailable evidence. A verified SQL definition does **not** establish that it is installed in production. No callable read-only Supabase MCP was available for this audit.

## Purpose and actual architecture

VERIFIED: school portal with public news/calendar, staff administration, academic assignments, teacher lesson planning and assessment, student tasks, and registrar/faculty screens. Root npm package retains the name `eduscribe`.

Most operations follow browser React → Supabase Auth/PostgREST/Storage directly. React hooks/components hold much business logic; SQL RLS, ownership helpers and triggers enforce another portion. There is no general account-management/CRUD backend. A real Express backend handles authenticated AI generation and health routes. No repository Supabase Edge Function implementation was found.

Stack verified from source and lockfile:

- JavaScript ESM, npm workspaces `frontend` and `backend`; no TypeScript application.
- React 18.3.1, Vite 5.4.21, React Router 6.30.6, Tailwind 3.4.19, custom CSS/UI, Lucide; Context/hooks manage state.
- Supabase JS 2.117.2; hosted PostgreSQL accessed through PostgREST, Auth and Storage.
- Express 4.22.3, native fetch, CORS, express-rate-limit; backend Node engine >=20.18.
- Vitest 2.1.9, Testing Library/jsdom, Playwright 1.63.0, ESLint 10.12.
- MUI/Emotion/axios are declared dependencies, but no direct frontend source imports were found; investigate before removal.

## Navigation map

| Location | Responsibility |
|---|---|
| `frontend/src/main.jsx`, `App.jsx`, routing modules | React bootstrap, BrowserRouter, public and protected routes |
| `frontend/src/context/AuthContext.jsx` | Auth events, profile/role resolution, login/logout, idle timeout, presence |
| `frontend/src/config/supabase.js` | Browser client, per-tab session storage key, storage URL helper |
| `frontend/src/pages/auth/` | Staff/student login, reset/recovery, password change, verification |
| `frontend/src/pages/dashboards/admin/` | Admin dashboard, `useAdminLogic.jsx`, `useAcademicLogic.jsx`, academic tabs |
| `frontend/src/pages/dashboards/teacher/` | Lesson plans, students, grades, attendance, task building/checking/distribution |
| `frontend/src/pages/dashboards/student/` | Student overview, tasks, attendance, announcements, profile |
| `frontend/src/pages/dashboards/faculty/`, `registrar/` | Pre-enrollment, registrar records/documents/scheduling/reports |
| `frontend/src/lib/` | Pure academic/task rules and student data loading |
| `frontend/src/components/`, role contexts/hooks | Shared UI, notification bell, profile/photo components and state |
| `backend/src/app.js`, `server.js`, `routes/ai.js` | Express app, environment checks, `/api/ai/lesson-plan`, health |
| `backend/src/middleware/requireAuth.js` | Bearer validation plus active teacher/admin profile check |
| `backend/src/lib/gemini.js`, prompt file | Gemini request, timeout/retry, fixed ILAW instructions |
| `backend/database/schema/`, `migrations/` | Alternative base schemas, storage SQL, incremental phase SQL |
| `backend/database/legacy/`, `seeds/`, `tests/` | Historical fixes, demo accounts/data, RLS test scripts |
| `backend/scripts/`, `.github/workflows/` | Setup/diagnostics/backup utilities and scheduled backup workflow |
| `api/index.js`, `vercel.json` | Express serverless adapter, frontend build and SPA/API rewrites |
| `docs/`, `docs/archive/`, `docs/superpowers/` | Handoffs, old schema/deployment guides, implementation plans |
| `AGENTS.md`, `.claude/`, Continue configuration | Agent instructions and legacy tooling; do not assume hooks execute in Codex |

## Authentication and roles

VERIFIED login: email/password → Supabase `signInWithPassword` → profile lookup → normalized profile role → protected dashboard. Role comes from `profiles`, not editable user metadata. `admin` normalizes to `main_admin`; recognized dashboards are main_admin, teacher, faculty, registrar, student. Unknown/missing/guest roles fall back to student. Schema also permits guest, but no guest dashboard exists.

The client creates a persistent session storage key unique to a tab, refreshes tokens and listens to auth events. Profile retrieval has timeout/retry and retains previously resolved role on transient errors. Auth event work is deferred to avoid the Supabase auth lock, with stale-request guards. Logout clears local state even after sign-out errors. School settings control a browser idle timer (default 30 minutes), not server JWT expiration.

Frontend archive checks sign out `archived` profiles; inactive/suspended are not consistently blocked. Database helper functions generally check role/ownership without account status. AI middleware separately requires active teacher/admin. Do not equate archiving a profile with revoking its Auth token or database permissions.

Password creation/reset/change validation requires >=12 characters, uppercase, digit and special character in the client. Reset uses `resetPasswordForEmail`, recovery/session state and `updateUser`. No verified forced-password-change or MFA implementation. Login lockout is browser localStorage, five attempts without expiry; it is not a server security boundary. Verification resend calls an absent `sendVerificationEmail` provider method.

## Authorization model

Frontend routes/menus are role-gated; database RLS is essential because browser clients can issue their own requests.

| Role | UI scope | Checked-in SQL/API scope and caveats |
|---|---|---|
| main_admin / admin | Accounts, academics, settings, content, logs | `is_admin()`; AI permitted when active |
| teacher | Assigned/advised students, tasks, assessment, attendance, lesson plans | Schedule/adviser and owner policies; AI when active |
| registrar | Records, pre-enrollment, documents, scheduling, reporting | `is_school_staff()` includes registrar; some UI payloads do not match base schema |
| faculty | Overview/pre-enrollment/profile | Read access as staff; pre-enrollment writes use office helper excluding faculty |
| student | Own/enrolled data and assigned tasks | Own-record/assignment policies, submission/answer guards; some owner policies omit teacher-role checks |
| anonymous | Public pages | Public published-news/settings and public storage paths in source; live grants unknown |

`phase1-03-rls-academic.sql` defines pinned-search-path SECURITY DEFINER helpers to avoid recursive RLS. `is_school_staff()` means admin/main_admin/registrar. Later `is_any_staff()` includes all staff. `phase5-04-profiles-column-exposure.sql` supersedes the earlier student-directory policy: students read their own profile, staff read profiles broadly. `phase7-01-activity-logs-rls-record.sql` records admin-only read/insert with actor binding.

Legacy `fix-privilege-escalation` SQL guards profile role/status UPDATE; its installation and remaining INSERT policies are NOT VERIFIED. Never remove/reorder policy migrations without inspecting live policies and grants.

## Database overview and rules

VERIFIED repository declarations (not a live inventory): 34 distinct table names across base schemas/migrations/legacy, including deprecated assignments/quizzes. There are 19 phase migration files, one of which is a diagnostic state check. The repository is not a demonstrated clean, reproducible database bootstrap; base schemas differ and some referenced helpers/relations are missing.

Core relations:

- `profiles.id` and `students.id` separately reference `auth.users`. No declared direct students→profiles foreign key was found; nested PostgREST joins must not assume one.
- `subjects`, `teacher_subjects`, `sections`, `section_students`, `schedules`: academic catalogue, teacher load, per-year sections, enrollment and timetable. Section name uniqueness is per school year; enrollment pairs are unique.
- `worksheets` is the unified task parent: worksheet/assignment/quiz/project, teacher owner, subject, manual checking default and opt-in auto checking.
- `worksheet_sections` stores distribution; `task_assignees` is the per-student assignment ledger retaining assignment-time section/deadline. Unique task/student pairs prevent duplicates. Existing assignments survive later unenrollment.
- `worksheet_items` and private `worksheet_item_keys` separate questions from correct answers; five question types. `worksheet_submissions` has unique task/student, online/manual source, in_progress/submitted/checked, score/release metadata; `worksheet_answers` has unique submission/item.
- Submission guards pin student grading fields and immutable associations. Task submission trigger stamps submission/lateness and notifies teacher. Item deletion guard prevents rebuilding questions after student work exists.
- Other domains: attendance, grades, lesson_plans, news, calendar_events, memos, documents, pre_enrollment, notifications, school_settings, activity_logs, backup_history.

Important source-only rules: one subject per teacher per year/load validity are UI/pure-library checks; no corresponding complete DB rule was found. Schedule end must follow start in UI; clash/capacity enforcement was not found. School-year calculation uses June rollover; settings display can differ. Some timestamps use UTC defaults while task submission/due comparisons use Manila local time.

Schema mismatch warnings: registrar expects extra profile/enrollment/document fields and five reporting relations (`document_stats`, `enrollment_stats_monthly`, `enrollment_by_dept`, `gender_distribution`, `enrollment_by_year_level`) without checked-in definitions. Grades UI uses a missing nested relationship and omits base-schema-required section/year. Live custom schema could change these outcomes: NOT VERIFIED.

## Main workflows and current feature state

- Admin account creation: browser `auth.signUp` → restore admin session → profile upsert. No server Admin Auth provisioning/transaction/rollback. Student row is lazily created when adding to a section. INFERRED risk: session disruption or orphan partial account.
- Academic management: admin hooks load subjects/sections/teacher loads → client validation → direct table writes. Implemented in source; live end-to-end NOT VERIFIED.
- Teacher tasks: create/upload → save question items/keys → post section → insert assignees → notify. Multi-request operations are not atomic.
- Student tasks: shared graph load → start in-progress submission → save answers → flush pending writes → submit → DB guards/time/teacher notification → refresh.
- Checking: teacher/manual encoder saves answer marks → updates checked/released submission → notifies. UI hides unreleased scores; SQL own-row read policies do not hide those columns.
- News/calendar/memos: admin direct writes; published news notifications, audience/expiry presentation. Some delete handlers ignore returned errors. Memo UI writes text recipient but not recipient_id used by RLS.
- Registrar/faculty enrollment and documents: partial implementation; payload/status/policy discrepancies and placeholder analytics prevent claiming working enrollment workflow. Approval does not perform atomic academic enrollment.
- Notification bell: latest 15, polling/visibility refresh, marks read on opening; no action URL navigation. Presence uses a realtime channel; table refresh primarily uses polling/manual/focus fetches.
- Active AI/manual lesson planning and Word/print export are implemented. Standalone `components/ilaw/` subtree has no found active-route import, mock AI and placeholder PPT functionality: legacy/unused.

## AI, storage, deployment and external services

AI flow: teacher PDF (3 MiB client cap) → public lesson-pdfs upload → bearer `/api/ai/lesson-plan` → validated Supabase user + active teacher/admin → 20/hour per-user in-memory limiter → fixed server ILAW prompt + PDF → Google Gemini `gemini-2.5-flash` → returned HTML → contentEditable → `lesson_plans.objectives` → Word/print. No active OpenAI integration. Server-only `GEMINI_API_KEY` and Supabase service role; browser uses anon/publishable key.

Gemini has 90-second timeout per attempt, one retry after 2 seconds, max output 65,536 tokens and no usage-log write. Client abort is 100 seconds; Vercel function max is 120 seconds. Model HTML is not sanitized or structurally validated. Upstream errors are returned through error.message. Actual provider availability/cost/production behavior NOT VERIFIED.

Storage SQL declares public lesson-pdfs/worksheets/profile-photos/news-images/ilaw-exports and private assignment-submissions/student-documents/temporary-uploads. Public mutation policies constrain only bucket ID, without role/owner/path checks. File limits/MIME/retention are largely comments rather than installed bucket restrictions. `school-assets` is referenced by app URL helpers but absent from this bucket declaration. Deleting task/lesson DB rows does not necessarily remove stored objects.

Local backend defaults to port 3001. Vercel builds frontend/dist and rewrites API to `api/index.js`, other paths to SPA. Local frontend/backend URL and anon-key environment values match; Vite proxy target matches. Env files are ignored; examples tracked. Do not print secret values.

Daily GitHub backup workflow uses PostgreSQL 17 pg_dump + Storage downloader, records backup_history, retains artifacts seven days. Cron 16:30 UTC is 00:30 Taipei/Manila next day. UI backup settings do not schedule this workflow. Restore quality, execution success and deployed settings NOT VERIFIED. Never execute setup/seed/backup scripts as a read-only check.

## Verified concerns and verification limits

Highest-priority source findings: unsanitized AI HTML (DOM/stored XSS sink); unrestricted public-bucket mutations; grades/task owner policies accepting any authenticated matching UID without teacher role; account status not consistently enforced by database helpers. Their live exposure must be checked before claiming production exploitation.

Other concerns: own-row policies expose unreleased assessment fields; assignee write policy does not bind target student to the supplied section; profile/storage/registrar schema drift; nontransactional multi-write workflows; public files bypass assignment confidentiality when URL is known; client-only news audience checks; shared seed credentials if fixtures reach production.

Maintainability: AdminDashboard ~1,323 lines, useAdminLogic ~1,198, useWorksheetAssessment ~888; repeated role/validation/query/UI patterns, mixed generations of schema/docs, unused useSupabaseQuery abstraction, retained `.jsx.orig` and older ILAW components. Do not delete legacy material until runtime imports and migration dependencies are confirmed.

Local read-only verification on audit date:

- Vitest: 15 files, 188 tests passed; mocks/pure rules/render checks, not live database security validation.
- Vite production build: passed with `write:false`, no dist output.
- ESLint: 256 errors, 19 warnings across inspected lint output; no fixes. Most errors are unused variables and React hooks rules; diagnostic login script references undefined `user`.
- Tracked-text credential-pattern scan found no matching privileged key/private-key patterns; this is not proof of clean history or safe live fixtures.
- Live E2E/RLS scripts were not executed because they include writes. No database/configuration/source/Git changes were made during audit; only this document was authorized for creation.

## Project evolution

VERIFIED Git landmarks: Aug 28 initial React/Supabase project (`be3cf77`); early Sept auth/reset/role dashboards and SPA/presence; Sept 17 academic structure; Sept 20 worksheet assessment/RLS (`e56d151`, `737160e`); Sept 21 task distribution (`9f597b7`, `4c21bcb`); Sept 25 merged task work (`1f2386f`); Sept 26 npm workspaces (`f6ad84b`), real Express/Gemini backend (`e1c32f9`), Vercel API (`b6e2fbb`) and auth/RLS fixes; Oct 1 profile exposure restriction (`7317c07`); Oct 2–4 admin UX and activity-log work; current HEAD `75b8ed1` adds mocked admin write coverage.

At audit HEAD, ux-overhaul is 12 commits ahead of its locally recorded origin tracking ref. Remote freshness/deployed commit NOT VERIFIED. Docs describe earlier test/policy counts; prefer current source/results. Before changes, obtain live read-only policy/schema/grant inventory, establish the canonical migration baseline, then address security boundaries and workflow/schema discrepancies with focused regression checks.
