# Calendar QA Sprint 01

Date: 9 October 2026
Scope: Admin Dashboard Calendar only

## Problem

Final Calendar QA identified seven release defects: invalid date ranges could be submitted; the Custom Type filter did not match the stored representation; Upcoming ignored filtering and dropped ongoing events; delete was reachable only from the first four Upcoming cards; failed deletes reported success; and a read failure looked like a valid empty calendar.

## Verified QA findings

1. End Date accepted values earlier than Start Date.
2. Custom events are stored as `event_type = "Other"` with a non-empty `custom_event_type`, while the UI filter value is `Custom Type`.
3. Grid and Agenda filtered locally, while Upcoming used an independent unfiltered selection.
4. Upcoming compared only `event_date` against a UTC-derived date key.
5. Delete existed only in Upcoming, which is limited to four records.
6. The delete result was ignored and success work always ran.
7. Calendar fetch failure replaced data with an empty array and left no persistent failure state.

## Root cause

Calendar selection rules had been duplicated across the tab and its state hook. Those copies encoded different meanings for custom types and upcoming dates. Delete was attached to a limited presentation list instead of the existing edit workflow, and the shared confirmation shell closed before its asynchronous action could report failure. Fetch state distinguished loading from completion but did not distinguish a successful empty response from failure.

## Implementation

- Added `calendarRules.js` as the single owner of Calendar type matching, range validation, Philippine local date keys, and Upcoming selection.
- Reused `matchesCalendarFilter` in the grid, mobile agenda, and Upcoming selection.
- Added pre-submit date-range validation. An invalid End Date receives `aria-invalid`, references an inline error through `aria-describedby`, receives focus, and does not call save.
- Added the same range guard inside `saveEvent` so a non-UI caller cannot submit a reversed range.
- Changed Upcoming to retain events whose effective end date is today or later, using `Asia/Manila` calendar dates.
- Moved the Delete trigger into Edit Event. The trigger continues to open the existing destructive confirmation dialog.
- Required delete to return the deleted row id before success logging, refresh, toast, and workflow close occur.
- Made the shared confirmation shell await an asynchronous result and remain open when it returns `false`. A ref prevents duplicate confirmation while the request is pending; existing actions that return `undefined` retain their close behavior.
- Added persistent Calendar read-error state and a Retry action that calls the existing `fetchCalEvents`. Failed refreshes retain the last successfully loaded events.

## Component relationships

`CalendarTab` owns Calendar presentation and field-level accessibility. `useAdminLogic` continues to own fetch, CRUD, Calendar state, toast, and confirmation state. `agenda.js` continues to own mobile month grouping. `calendarRules.js` supplies deterministic rules to all three paths. `AdminDashboard` continues to render the existing shared confirmation dialog and now waits for the action result before closing it.

## Business rules

- End Date is optional, but when present it cannot precede Start Date.
- A custom event keeps the existing database representation: `Other` plus a non-empty custom value.
- `Other` continues to include all stored Other events; `Custom Type` selects the subset with a custom value.
- Upcoming includes a single-day future/today event and a multi-day event that has not ended in Philippine local time.
- Only a confirmed delete may produce success logging, refresh, toast, or workflow closure.
- An empty Calendar is shown only after a successful empty response; a failed response remains visibly actionable.

## Engineering decisions

The shared rules are pure functions so the three render paths cannot drift and boundary behavior can be tested without network state. ISO database date strings remain directly comparable, avoiding UTC conversion. Delete uses Supabase's returned representation to distinguish a confirmed row deletion from an error or an authorization result that deletes no row. The existing modal, confirmation, toast, fetch, and responsive architecture were retained.

## Alternatives rejected

- A data migration for Custom Type was rejected because the current representation is intentional and supported.
- Separate filter patches in Grid, Agenda, and Upcoming were rejected because they would preserve the source of the inconsistency.
- Closing and reopening confirmation after delete failure was rejected because it loses dialog continuity and focus stability.
- A new delete dialog or a second fetch owner was rejected because both duplicate existing architecture.
- UTC conversion and browser-local date slicing were rejected because Calendar dates are Philippine civil dates.
- Clearing events on failed refresh was rejected because it converts a transport failure into a false empty state.

## Impact analysis

| Area | Impact | Explanation |
|---|---|---|
| Calendar | YES | Validation, filtering, delete placement, and persistent read failure are corrected. |
| Upcoming | YES | It uses the active filter and effective end date. |
| Agenda | YES | It uses the shared filter predicate; grouping is unchanged. |
| Dialogs | YES | Edit Event exposes Delete; failed confirmation remains open. |
| Shared Components | YES | The existing confirmation host awaits the action result and blocks duplicate confirms. |
| Accessibility | YES | Invalid End Date is focused and programmatically described. |
| Responsive | NO | No breakpoint, dimensions, spacing, or layout structure changed. |
| Performance | NO | Existing linear filtering remains linear and no recurring request was added. |
| Backend | NO | No backend code or service contract changed. |
| Database | NO | No schema, data, migration, or RLS change was made. |
| State | YES | Calendar now distinguishes read failure from a successful empty result. |

## Complexity

Before: filtering and Upcoming selection were **O(n)** per pass; grid lookup was **O(d × n)** for visible days.
After: the shared predicate and effective-end check remain **O(n)** per pass; grid lookup remains **O(d × n)**.

There is no algorithmic regression. The delete response now returns one id, a constant-size confirmation payload.

## Verification

### Focused component and rule regression

Command:

```text
npm test -- --run src/lib/calendarRules.test.js src/lib/agenda.test.js src/pages/dashboards/admin/tabs/CalendarTab.test.jsx
```

Result: **3 files passed, 22 tests passed, 3.98 seconds**.

Verified range rejection, inline association, End Date focus, Custom Type storage matching, shared agenda filtering, ongoing Upcoming inclusion, Philippine date boundary, Edit Event Delete, and persistent Retry wiring.

### Focused browser regression

Command:

```text
npx playwright test e2e/admin-calendar-qa-sprint-01.spec.js --project=chrome
```

Result: **2 tests passed, 13.7 seconds**.

The browser used an authenticated throwaway student session with browser-intercepted admin role and in-memory Calendar responses. No Calendar, activity-log, backend, or database write reached Supabase. It verified:

- no request is submitted for a reversed date range;
- focus and accessible error state move to End Date;
- Custom Type agrees across Grid, Agenda, and Upcoming;
- an ongoing event remains Upcoming while an ended event does not;
- Delete is available from Edit Event for an event outside the first four Upcoming records;
- failed delete keeps both dialogs open, does not log, refresh, remove, or claim success;
- confirmed delete logs, refreshes, closes, and reports success;
- failed initial fetch shows `Unable to load Calendar.` and Retry restores content;
- 360, 390, 768, 1024, and 1440 layouts have no page or Calendar overflow in light and dark themes;
- the mobile Agenda/desktop Grid breakpoint behavior remains unchanged.

### Focused lint

The first targeted lint exposed the two pre-existing `useAdminLogic.jsx` hook findings already recorded by RC5 (`react-hooks/set-state-in-effect` and `react-hooks/exhaustive-deps`). With only those known rules disabled, all Calendar Sprint files passed targeted ESLint in 6.43 seconds. No lint issue was introduced by this sprint.

Unrelated Admin suites, live write tests, backend tests, and database tests were skipped because this sprint changed no such behavior and the contract requires focused Calendar regression only.

## Future work

The Today button, semantic Calendar grid, multi-day accessible naming, 1024px touch targets, Week View, realtime subscriptions, backend work, database work, and RLS work remain outside Calendar QA Sprint 01. This journal does not classify those excluded items as new defects.
