# Users QA Sprint 01

## Problem

The final Users QA found seven release issues in the existing Admin user-management workflow: a failed profile write could leave an incomplete Auth identity, the current administrator could change or archive their own access, create status was not persisted, archive history had no restore action, archive success was not confirmed, load failures became a false empty state, and RowSheet behavior overlapped desktop table actions at 768px.

This sprint fixes only those findings. It does not change the authentication architecture, database schema, RLS policies, backend, pagination, password accessibility, email semantics, or live-region behavior.

## Verified QA Findings

- Account creation used `auth.signUp`, administrator-session restoration, and a separate profile upsert.
- The create payload forced `status: 'active'`.
- Self-edit and self-archive had no guard.
- Archive used an unconfirmed update and removed the row locally without receiving the persisted record.
- Archive success promised restoration, but archive view still exposed Archive.
- Failed reads left the list rendering its ordinary empty state after the toast expired.
- `useIsNarrow` activated RowSheet through 1023.98px while the table changed to mobile rows only at 560px.

## Root Cause

The Users workflow grew around separate Supabase Auth and `profiles` operations. UI state assumed each request succeeded, and its responsive behavior used a shell breakpoint rather than the Users table's existing breakpoint. Archive history was added as a filter without completing the reverse status transition.

## Current Workflow

```text
UsersTab
  -> AdminContext
  -> useAdminLogic
  -> Supabase Auth / profiles / activity_logs
```

Creation remains:

```text
validate -> save admin session -> signUp -> restore admin session
         -> upsert profile -> update local list -> log activity
```

Archive and restore now share one confirmed status-transition path. The active/archive filter continues to derive the visible rows from the persisted status.

## Implementation

### Creation failure handling

- Requires `signUp` to return a user identifier.
- Restores the saved administrator session before profile creation.
- Treats administrator-session restoration failure as an operation failure.
- On profile failure, reasserts the saved administrator session, keeps the modal open, reports an error, and does not mutate the local directory or statistics.
- Persists the selected Active or Inactive value.

Browser code cannot delete another Auth identity safely because that requires privileged Admin API credentials. A hard Auth rollback therefore remains unavailable under this sprint's explicit no-backend/no-database contract. The implemented compensation protects the administrator session and application state; a trusted account-creation operation remains the complete atomic solution.

### Administrator continuity

- Blocks archive when the target ID is the current authenticated administrator.
- Blocks a current administrator edit when it changes that account's role or status.
- Keeps name and department edits available.
- Uses existing error toasts to explain both restrictions.

### Archive and restore

- Archive view replaces Archive with Restore on desktop and mobile.
- Both actions use the existing shared confirmation dialog.
- Mutations use `.select().single()` and require a returned row before updating local state, statistics, activity history, or success feedback.
- Failure returns `false` to the shared confirmation owner, so the dialog stays open.
- Focus settlement starts only after confirmed persistence.

### Persistent loading error

- `usersError` belongs to the existing Users loading owner in `useAdminLogic`.
- A failed initial request and retry render “Unable to load users.” with a Retry button.
- Retry calls the existing `fetchUsers` path and clears the error only when a new attempt starts.

### Responsive interaction

- RowSheet behavior now uses the existing 560px Users table boundary.
- Mobile rows use RowSheet.
- Wider table rows use their Edit and Archive/Restore actions only.
- Action handlers stop row propagation as a defensive boundary.

## Component Relationships

- `UsersTab.jsx` renders the persistent error, chooses mobile/table behavior, and selects Archive or Restore controls.
- `useAdminLogic.jsx` owns loading error, self-protection, creation compensation, persistence confirmation, and local state updates.
- `ConfirmationDialog`, `Modal`, `RowSheet`, `Button`, toast state, tokens, and Admin CSS remain shared and unchanged.
- `admin-users-qa-sprint-01.spec.js` uses a real browser and authenticated read-only session while intercepting every Users mutation, Auth signup, notification request, and activity-log request.

## Business Rules

- The signed-in administrator cannot archive themselves.
- The signed-in administrator cannot change their own role or account status.
- New profiles preserve the status explicitly selected in the form.
- Archive means `status = archived`; Restore means `status = active`.
- A status change is successful only when Supabase returns the updated row.
- Failed persistence never changes the local Users list or reports success.

## Engineering Decisions

- Kept the direct React/Supabase architecture required by the sprint.
- Used one shared status-transition handler to keep archive and restore symmetric.
- Preserved the active/archive filter instead of introducing duplicate archive state.
- Reused the existing confirmation owner and its `false` return contract.
- Aligned JavaScript behavior to the existing Users table breakpoint rather than changing CSS layout.
- Added only Users-focused component and intercepted browser coverage.

## Alternatives Rejected

- Supabase Admin API in the browser: would expose privileged credentials.
- New backend or Edge Function: explicitly outside sprint scope.
- Database trigger or RLS migration: explicitly outside sprint scope.
- Removing restore wording only: safe but incomplete because the existing status model supports a confirmed reverse transition.
- Changing the shared drawer breakpoint: would affect unrelated Admin modules.
- Pagination or virtualization: explicitly deferred.

## Impact Analysis

| Area | Impact | Explanation |
|---|---|---|
| Users | YES | Creation, self-protection, load error, archive, restore, and responsive actions changed. |
| Authentication | YES | Existing session restoration is now required and reasserted on profile failure. |
| Archive | YES | Archive is confirmed and a matching restore transition is available. |
| Search | NO | Search logic and values are unchanged. |
| Filters | NO | Existing derived filtering remains unchanged; persisted status drives visibility. |
| Dialogs | YES | Existing confirmation metadata is now supplied for Restore and failure keeps the dialog open. |
| Shared Components | NO | Modal, RowSheet, ConfirmationDialog, Button, and focus helpers were reused without modification. |
| Accessibility | YES | Conflicting 768px row/button behavior is removed and confirmed removals retain focus settlement. |
| Responsive | YES | RowSheet activation now matches the existing 560px Users breakpoint. |
| Performance | NO | No new request loop or rendering algorithm was introduced. |
| Backend | NO | No backend code or service was added. |
| Database | NO | No table, schema, migration, or policy changed. |
| State | YES | One persistent Users error value and one restore handler were added to existing ownership. |

## Complexity

Before: filtering and local status removal were **O(n)**.

After: filtering and local persisted-row replacement remain **O(n)**.

Network operations remain constant-count operations per action. The responsive decision and self-protection checks are **O(1)**. There is no algorithmic regression.

## Verification

### Component tests

```text
npm test --workspace frontend -- --run \
  src/pages/dashboards/admin/tabs/UsersTab.password.test.jsx \
  src/pages/dashboards/admin/tabs/UsersTab.qa.test.jsx
```

Result: 2 files passed, 5 tests passed, 5.35s.

Covered persistent error/Retry, archive-view Restore ownership, desktop table actions, mobile RowSheet activation, and existing password controls.

### Browser regression

```text
npx playwright test e2e/admin-users-qa-sprint-01.spec.js --project=chrome
```

Result: 3 tests passed, 30.8s.

Covered:

- failed profile creation with no local user;
- selected Inactive status in the profile request;
- current-admin role/status and archive protection;
- zero-row archive failure with the confirmation left open and local row preserved;
- confirmed archive and restore;
- persistent load failure and Retry;
- 360, 390, 768, 1024, and 1440 widths;
- light and dark themes;
- no page overflow;
- mobile RowSheet at 360/390 and table-only actions from 768 upward.

All mutation endpoints, Auth signup, notifications, and activity logging were intercepted. The run did not modify live application data.

### Targeted lint

The Users-only ESLint command completed with two existing `react-hooks/set-state-in-effect` errors and one existing ref-cleanup warning in the legacy touched components. None was introduced by this sprint, and resolving them would require unrelated hook lifecycle work outside the approved scope.

## Future Work

- Move account creation to a trusted operation capable of rolling back an Auth identity when profile creation fails.
- Verify and reconcile deployed `profiles` update policies separately; this sprint was prohibited from changing RLS.
- Add last-administrator protection when authoritative administrator-count rules are approved.
- Add real pagination when roster size requires it.
- Address the separately deferred password field errors, email semantics, loading announcements, and result-count live region.
