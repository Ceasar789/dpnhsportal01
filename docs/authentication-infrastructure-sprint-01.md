# Authentication Infrastructure Sprint 01

## Executive Summary

SmartEdu now provisions users through the existing Express service and Supabase Admin SDK. Administrators provide identity and role data only. Express creates an unconfirmed Auth user, creates an inactive profile, and asks Supabase Auth to send its configured Invite User email. The recipient creates the password through `/setup-password`; only a successful server-side password update activates the profile. No password is created, displayed, logged, stored, or emailed by an administrator.

## Architecture

`UsersTab` → `useAdminLogic` → authenticated Express endpoint → Supabase Admin SDK → `auth.users` and `profiles`.

The service-role key remains in Express. React sends the current administrator access token, and `requireAuth(['main_admin'])` verifies both the token and the active profile role before permitting directory, invitation, resend, or archive operations.

## Authentication Flow

Existing login and password recovery continue to use `AuthContext` and Supabase Auth. Invitation acceptance uses Supabase's one-time invite session, the existing reset-password presentation, the shared password policy, and `POST /api/onboarding/complete`. Express sets the password through the Admin SDK, activates the profile, and records completion in service-only Auth app metadata. The browser signs out afterward and returns the user to normal login.

## Invitation Flow

1. Express rejects invalid input and duplicate profile/Auth emails.
2. `generateLink({ type: 'invite' })` creates the unconfirmed Auth record without sending mail.
3. Express stores the assigned role in service-only Auth app metadata and inserts the matching profile as `role = guest`, `status = inactive`.
4. `inviteUserByEmail()` reissues the invite token and sends the configured Supabase Invite User template.
5. If profile creation or invitation delivery fails, Express deletes the records it created and returns an error rather than false success.

Resend uses `inviteUserByEmail()` only for an existing, unconfirmed invited account. It never deletes or recreates that account, so its UUID remains stable. Once the invite has confirmed the email, the resend control disappears; a user who lost the resulting session can use the existing password-recovery flow.

## Backend Responsibilities

- Authenticate the caller and enforce the `main_admin` role.
- Hold the service-role credential and perform all Admin SDK operations.
- Validate provisioning input and reject duplicate accounts.
- Keep Auth and profile creation consistent through compensation.
- Merge Auth onboarding evidence into the Users directory.
- Rate-limit invitation delivery.
- Validate and set an invited user's password before activation.

## Frontend Responsibilities

- Collect name, email, role, and optional department without collecting a password.
- Call Express with the administrator's access token.
- Display `Invitation Pending`, `Active`, and `Archived` states from server evidence.
- Offer resend only when Supabase still reports an unconfirmed invitation.
- Present password policy, confirmation, strength, invalid-link, and success states.

## Supabase Configuration Requirements

Complete these steps in **Authentication → URL Configuration** and **Authentication → Email Templates** before production invitation testing:

- Set **Site URL** to the deployed SmartEdu frontend origin.
- Add every permitted frontend origin plus `/setup-password` to **Redirect URLs**. Add the local development URL only for development.
- Configure the **Invite User** template with EduScribe branding, `{{ .Data.full_name }}` for the recipient, `{{ .ConfirmationURL }}` for password setup, `{{ .SiteURL }}` for the portal, an expiry notice matching the Auth setting, and the school administrator contact reminder.
- Keep the template action pointed at Supabase's `ConfirmationURL`; the backend supplies `/setup-password` as `redirectTo`.
- Review **Email OTP Expiration** and make the displayed expiration notice match that value. The application does not hardcode an expiry duration.
- Keep email/password authentication enabled. No OAuth, SMS, MFA, or third-party mail provider is required by this sprint.
- Set backend `APP_URL` to the same trusted frontend origin. Production startup fails if it is absent.
- Ensure the Supabase redirect allow-list contains the exact `APP_URL/setup-password` destination. Supabase otherwise silently falls back to Site URL.

The repository cannot read or modify Dashboard email-template configuration. Template content and actual delivery remain deployment checks.

## Security Decisions

- Browser-side `signUp` was removed from Admin user creation.
- The service-role key never crosses the Express boundary.
- Password completion is accepted only for a valid Supabase session whose Auth record was invited and is not already complete.
- Pending profiles use the existing `guest` role. The assigned role remains in service-only app metadata until successful setup, preventing an invite session from inheriting final role-based RLS access.
- Password validation is a single shared module imported by frontend and backend.
- Invitation links and passwords are never returned in API responses or written to logs.
- `APP_URL` is server configuration; request-controlled origins cannot choose an invitation destination.
- Pending accounts use inactive profiles, so existing authorization rejects dashboard access before setup completes.

## Business Rules

- Email addresses must be unique across both profiles and Supabase Auth.
- Newly invited profiles are inactive guests regardless of client input.
- Successful password setup applies the server-held intended role and activates the profile.
- Archived accounts cannot complete or receive invitations.
- Reinvitation retains the existing Auth UUID.
- Invitation expiry is owned by Supabase Email OTP Expiration. No truthful per-user expired state is available without custom persistence, so Sprint 01 exposes Pending, Active, Archived, and existing Inactive states only.

## Alternatives Rejected

- Browser `signUp`: can replace the administrator session and performs privileged workflow in React.
- Administrator-created or emailed temporary passwords: exposes another person's credential.
- Custom email providers: unnecessary and explicitly outside the approved stack.
- Deleting and recreating an invitee to resend: changes UUIDs and risks related data.
- Client-controlled activation: cannot prove that password creation succeeded.

## Component Relationships

- `backend/src/routes/onboarding.js`: directory, provisioning, resend, archive state, and password completion.
- `backend/src/middleware/requireAuth.js`: full admin authorization and invite-session verification.
- `frontend/src/lib/backendApi.js`: authenticated Express calls.
- `frontend/src/pages/dashboards/admin/useAdminLogic.jsx`: Users orchestration.
- `frontend/src/pages/dashboards/admin/tabs/UsersTab.jsx`: invitation and status UI.
- `frontend/src/pages/auth/ResetPassword.jsx`: shared reset/invitation password form.
- `shared/passwordPolicy.js`: one password rule for both runtimes.

## Impact Analysis

| Area | Impact | Explanation |
|---|---:|---|
| Authentication | YES | Adds invitation completion while preserving login and recovery. |
| Users | YES | Creation becomes invitation-based; real onboarding state and resend are visible. |
| Express Backend | YES | Adds authenticated Admin SDK endpoints. |
| Supabase Auth | YES | Uses invite, re-invite, user listing, password update, and user metadata. |
| Supabase Database | YES | Existing profiles are initially inactive; no migration or schema change. |
| Security | YES | Removes browser provisioning and administrator-managed passwords. |
| Responsive | NO | Existing modal, table, and row-sheet structures remain. |
| Accessibility | YES | Pending status is text, resend buttons have contextual names, and setup feedback uses live roles. |
| Performance | YES | Directory loading also pages through Auth users; work remains linear in user count. |
| Maintainability | YES | Privileged onboarding is centralized in Express and password rules have one owner. |
| State Management | YES | Users receive server-derived onboarding fields alongside profiles. |

## Complexity

Provisioning and password setup remain **O(1)** database/Auth operations per user. Directory merging changes from **O(n)** profile rendering to **O(n)** profile/Auth merging. Auth pages remain **O(1)**.

## Verification

Automated coverage checks invitation-only Admin UI, password completion routing, shared password validation, onboarding-state derivation, trusted redirect construction, failure behavior, archive/restore, responsive rows, and both Admin themes.

- `npm test --workspace backend` — 2 passed in 0.57s on the final run.
- `npm test --workspace frontend -- --run src/pages/dashboards/admin/tabs/UsersTab.password.test.jsx src/pages/dashboards/admin/tabs/UsersTab.qa.test.jsx src/pages/auth/ResetPassword.invitation.test.jsx` — 3 files and 7 tests passed in 5.02s on the final run. React Router printed only its existing v7 future-flag advisories.
- `npx playwright test e2e/admin-users-qa-sprint-01.spec.js --project=chrome` — 3 passed in 28.9s; includes 360, 390, 768, 1024, and 1440 widths in light and dark Admin themes.
- `npm run build --workspace frontend` — production build passed in 8.88s on the final run; the existing large-chunk advisory remains.
- `node --check` for the new backend route, middleware, and shared password module — passed.

Live delivery, template rendering, redirect allow-list behavior, and real Auth/database writes require the deployment checklist and were deliberately not executed against production data. The broader frontend suite, unrelated dashboards, and database tests were skipped because the sprint contract limits regression to Authentication, Users, Invitation, and Backend behavior.

## Future Enhancements

- A per-user `Invitation Expired` badge would require a trusted persisted expiry timestamp or an Admin API field that exposes token expiry; neither exists in the current schema/API response.
- If the roster grows substantially, cache or page the merged Auth/profile directory rather than listing all Auth users for every refresh.
