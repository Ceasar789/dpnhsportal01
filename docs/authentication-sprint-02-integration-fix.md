# Authentication Sprint 02 — Invitation Redirect Integration Fix

## Problem

Supabase successfully consumed the QA invitation, confirmed the email and
created a sign-in session, but the effective callback landed at the portal
root. The public landing route did not recognize an invited account whose
onboarding was still incomplete, so the user never reached the existing
password setup screen. A later use of the same one-time link returned
`otp_expired` at the root URL.

## Verified Root Cause

The live invited account recorded `email_confirmed_at` and `last_sign_in_at`
while its profile remained `inactive`/`guest` and
`app_metadata.onboarding_complete` remained false. This proves the invite was
consumed but onboarding was not completed. The frontend had no route-level
bridge from a root Auth callback to `/setup-password`.

The repository cannot prove why Supabase selected the Site URL instead of the
requested redirect. The hosted Redirect URL allow-list, Invite template and
deployed `APP_URL` are external configuration. This fix does not claim or mask
that uncertainty; deployment still requires the exact configuration listed
below.

## Architecture

The approved architecture remains unchanged:

1. React receives and persists the Supabase Auth callback session.
2. A small route guard recognizes an incomplete invited account.
3. The existing `/setup-password` page collects and validates the password.
4. Express verifies the bearer session and completes onboarding with the
   Supabase Admin client.
5. Express activates the existing profile and records completion in Auth
   metadata.
6. The frontend signs out and sends the user to the normal login flow.

No schema, RLS, profile ownership, role rule or dashboard component changed.

## Runtime Flow

```text
Invite callback
  → Supabase restores session
  → InvitationCallbackGuard checks trusted Auth metadata + profile status
  → /setup-password
  → POST /api/onboarding/complete
  → password stored by Supabase Auth
  → existing profile role/status activated
  → onboarding_complete recorded
  → local session signed out
  → /login
```

## Redirect Flow

The backend continues to derive all invitation destinations from `APP_URL`:

- Development: `http://localhost:5173/setup-password`
- Production: `https://eduscribe-dnhs-portal.vercel.app/setup-password`

No URL is hardcoded in invitation code. If Supabase sends a valid callback to
the Site URL, the guard waits for session restoration and replaces the root
route with `/setup-password`. If Supabase returns an expired/consumed error at
the root, the guard removes the raw error fragment and opens the existing
friendly invalid-link state.

## Authentication Lifecycle

An invitation remains incomplete only when all of the following hold:

- the Auth user has `invited_at`;
- `app_metadata.onboarding_complete` is not true; and
- the persisted profile is neither active nor archived.

Profile `active` remains authoritative if the secondary Auth metadata update
ever fails. This prevents an activated user from being routed back into setup.
The Admin Users endpoint continues to calculate status from current Auth and
profile data on every directory request, so successful completion changes
`invitation_pending` to `active` without a duplicate user or profile.

## Configuration Dependencies

The hosted environment must contain:

```ini
APP_URL=https://eduscribe-dnhs-portal.vercel.app
```

Supabase URL Configuration must allow both environments:

```text
http://localhost:5173/setup-password
https://eduscribe-dnhs-portal.vercel.app/setup-password
```

The Invite template must keep its action on Supabase's `ConfirmationURL`.
These hosted values were not changed during this sprint and must be verified
before deployment. `docs/DEPLOYING.md` now lists both setup destinations.

## Decisions

- Keep password creation and activation in the existing Express endpoint.
- Route using trusted Auth `app_metadata` together with persisted profile
  status; do not trust user-editable metadata.
- Treat an active or archived profile as final, avoiding redirect loops.
- Strip raw Supabase error fragments before showing the existing friendly
  invitation message.
- Preserve existing resend behavior, UUIDs, profiles and duplicate checks.

## Alternatives Rejected

- Hardcoding the production URL would break local QA and future domains.
- Replacing Supabase Auth or adding a second callback service would expand the
  architecture without being required for the verified integration gap.
- Activating an account when the email link is consumed would bypass password
  completion and the approved role transition.
- Allowing confirmed users to be reinvited is unsupported by
  `inviteUserByEmail` and would not safely repair a consumed link.
- Changing the email template was outside this sprint and cannot be justified
  without first inspecting its hosted value.

## Implementation

- Added `InvitationCallbackGuard` around the existing route tree.
- Added pure callback-decision logic with focused regression tests.
- Reused the existing password setup and friendly invalid-link UI.
- Added explicit production and local setup URLs to deployment guidance.
- Added an expired/consumed invitation regression assertion.

## Verification

Focused frontend tests verify:

- incomplete invitations route to `/setup-password`;
- root callbacks wait while Supabase restores the session;
- expired root callbacks route to the friendly setup state and drop the raw
  error fragment;
- active invited accounts are not redirected;
- password submission still calls the Express completion endpoint; and
- a callback without a session shows the administrator-resend message.

A read-only Chrome regression verifies that a root `otp_expired` callback is
replaced with `/setup-password`, shows the friendly invitation message and has
no horizontal overflow at 360, 390, 768, 1024 or 1440 pixels. The guard adds
no visual styling, so the existing password page's theme presentation is
unchanged.

Backend tests verify configured redirect generation and persisted onboarding
status precedence. A production deployment and a fresh real email were not
performed during this local sprint.

## Future Improvements

Supabase documents that some email security systems prefetch and consume
one-time confirmation links. If a controlled email trace proves that behavior,
adopt Supabase's supported OTP or two-step confirmation-link pattern as a
separate email-template change. Do not infer it from `otp_expired` alone.
