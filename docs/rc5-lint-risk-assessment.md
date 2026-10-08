# RC5 engineering journal — Admin lint risk assessment

Date: 8 October 2026

Scope: Admin Dashboard source, tabs, hooks, context, shared Admin UI components,
`Avatar`, and the Admin focus utility. Findings outside this scope were counted
by the project lint command but were not investigated or changed.

## Problem

The project lint command reported 274 findings: 256 errors and 18 warnings.
The number alone did not establish Admin release risk because most findings
belonged to unrelated modules, and several Admin findings came from compiler
and Fast Refresh rules that describe development structure rather than broken
production behavior.

RC5 isolated 17 Admin-related findings across nine files: 15 errors and two
warnings. Each was inspected against its source and classified before any edit.

## Classification Summary

| Category | Count | Decision |
|---|---:|---|
| A — Runtime Risk | 1 | Fixed. |
| B — Maintainability | 4 | Three dead imports fixed; one shared-component cleanup deferred. |
| C — Intentional Pattern | 11 | Preserved and documented. |
| D — Style Only | 0 | No finding. |
| E — False Positive | 1 | Preserved and documented. |
| **Total** | **17** | **Four fixed; thirteen intentionally remain.** |

## Findings

| # | Location and rule | Category | Evidence and risk | Recommended action and reason |
|---:|---|---|---|---|
| 1 | `components/Avatar.jsx:19` — `react-hooks/set-state-in-effect` | B | The effect resets a failed-image flag when `src` changes. It can add one render on a source change, but it prevents a failure from one URL suppressing a later valid URL. No release failure was reproduced. | Retain in RC5. A `failedSrc` design could remove the effect, but `Avatar` is shared beyond Admin and requires cross-dashboard regression before changing its state model. |
| 2 | `admin/AdminContext.jsx:7` — `no-unused-vars` | B | The automatic JSX runtime makes the default `React` import dead. | Remove the default import. This has no runtime effect. |
| 3 | `admin/AdminContext.jsx:11` — `react-refresh/only-export-components` | C | The file exports the context beside its provider so all Admin tabs share one context identity. The rule affects development Fast Refresh boundaries, not production execution. | Preserve ownership. Splitting the context solely for hot reload would create files and import churn without release benefit. |
| 4 | `admin/AdminContext.jsx:13` — `react-refresh/only-export-components` | C | `useAdminContext` is intentionally colocated with the context and provider. Runtime guards and imports are correct. | Preserve the established context API; do not refactor for this release. |
| 5 | `tabs/SchedulesTab.test.jsx:17` — `no-unused-vars` | B | The test uses the automatic JSX runtime; its default `React` import is unused. | Remove the import. Test behavior is unchanged. |
| 6 | `tabs/SectionsTab.jsx:41` — `react-hooks/set-state-in-effect` | C | `tried` resets when the section modal identity changes so validation from the previous session does not leak into the next form. The state transition is bounded to modal lifecycle changes. | Preserve. Moving the reset into every open/close path would duplicate lifecycle logic and increase behavior risk. |
| 7 | `tabs/SubjectsTab.jsx:33` — `react-hooks/set-state-in-effect` | C | The effect performs the same bounded validation reset for the subject modal. | Preserve for the same lifecycle reason. |
| 8 | `tabs/TeachingLoadTab.test.jsx:21` — `no-unused-vars` | B | The default `React` import is unused under the configured JSX runtime. | Remove the import. Test behavior is unchanged. |
| 9 | `tabs/UsersTab.jsx:50` — `react-hooks/set-state-in-effect` | C | The effect clears validation, password confirmation, and reveal state only after the user modal closes. Source comments document why resetting on open would interfere with the shared Modal dirty snapshot. | Preserve. Reordering this behavior risks false dirty-state prompts. |
| 10 | `useAcademicLogic.jsx:108` — `react-hooks/set-state-in-effect` | C | The mount effect invokes the stable subject fetch callback. Fetching and representing its loading/error/data states is the effect's purpose. | Preserve. Removing it prevents initial data load; replacing it requires a data-fetch architecture change. |
| 11 | `useAcademicLogic.jsx:270` — `react-hooks/set-state-in-effect` | C | The mount effect loads teacher choices used by Teaching Load. | Preserve the established data-fetch pattern. |
| 12 | `useAcademicLogic.jsx:271` — `react-hooks/set-state-in-effect` | C | The effect reloads teaching loads when the stable, school-year-dependent callback changes. | Preserve; it keeps the displayed year synchronized with fetched data. |
| 13 | `useAcademicLogic.jsx:477` — `react-hooks/set-state-in-effect` | C | The effect loads sections through the existing retry/loading/error path. | Preserve the established data-fetch pattern. |
| 14 | `useAcademicLogic.jsx:580` — `react-hooks/set-state-in-effect` | C | The effect loads schedules through the existing retry/loading/error path. | Preserve the established data-fetch pattern. |
| 15 | `useAdminLogic.jsx:819` — `react-hooks/exhaustive-deps` | A | `upcomingEvents` filtered against `today` but memoized only on `calEvents`. After a UTC date rollover, an unrelated render could retain the previous cutoff until event data changed. | Fixed by deriving the existing ISO date key and including that primitive in the memo dependencies. |
| 16 | `useAdminLogic.jsx:1138` — `react-hooks/exhaustive-deps` | E | The warning assumes `debounceTimersRef.current` may be replaced before cleanup. The code never assigns a new object; it only updates `.users`, `.stats`, and `.roleDist` properties. Reading the current object during cleanup intentionally clears the latest timers. | Preserve. Capturing the same stable object would only silence the warning and would not change behavior. |
| 17 | `useAdminLogic.jsx:1154` — `react-hooks/set-state-in-effect` | C | The initial-load effect invokes stable fetch callbacks for Admin data. Those callbacks own loading, error, and response state. | Preserve. Removing or distributing this orchestration would change initialization architecture. |

## Engineering Decisions

### Calendar date dependency

The existing ISO cutoff behavior is retained. RC5 extracts that same value as
`todayDateKey`, uses it in the filter, and declares it as a dependency. The
memo now refreshes after a date-key change on the next render without being
invalidated by every new `Date` object created during same-day renders.

Adding the `today` object directly was rejected because it has a new identity
on every render and would make the memo ineffective. Adding a timer was rejected
because automatic midnight scheduling is a new behavior outside lint triage.

### Dead imports

The three default `React` imports were removed because the configured JSX
runtime does not use them. No import used for hooks, mocks, or assertions was
changed.

### Findings intentionally retained

No ESLint suppression, configuration exception, dependency installation, hook
rewrite, context split, or fetching abstraction was introduced. Those changes
would make the lint count look better while increasing release scope and risk.

## Applied Fixes

- Added the Calendar date key to Upcoming-event memoization dependencies.
- Removed the unused default `React` import from `AdminContext.jsx`.
- Removed unused default `React` imports from the Schedules and Teaching Load
  test files.

The Admin subset changed from 17 findings (15 errors, 2 warnings) to 13
findings (12 errors, 1 warning). Every remaining finding is classified above.

## Rejected Fixes

- Splitting Admin context, hook, and provider exports solely for Fast Refresh.
- Replacing intentional mount-fetch effects with a new data layer.
- Duplicating modal-reset logic across event handlers.
- Changing shared `Avatar` state without non-Admin regression coverage.
- Capturing a debounce ref object that is never replaced.
- Disabling rules or adding inline suppressions.

## Engineering Impact

| Area | Affected | Explanation |
|---|---|---|
| Architecture | NO | Context, hooks, components, and data ownership are unchanged. |
| Hooks | YES | One memo dependency now includes the primitive date key it reads. |
| Context | NO | One dead import was removed; provider value and exports are unchanged. |
| State | NO | No state variable, transition, or initialization changed. |
| Rendering | YES, bounded | Upcoming events may recompute after the date key changes; same-day memoization is preserved. |
| Performance | NO material impact | Filtering remains O(n) and only the dependency key changed. |
| Maintainability | YES | Three dead imports were removed and all remaining findings are explained. |
| Accessibility | NO | Markup, names, focus behavior, and keyboard behavior are unchanged. |
| Regression Risk | YES, LOW | The production change is one memo dependency with focused Calendar coverage. |

## Complexity

Before: **O(n)** to filter Calendar events whenever the memo recomputed.

After: **O(n)** to filter Calendar events whenever the memo recomputes.

There is no algorithmic change. Import removal is compile-time only.

## Verification

Project lint baseline:

```text
npm run lint
```

Result: exit 1 with **274 findings — 256 errors and 18 warnings** in 25.61s.
Only the 17 Admin findings documented here were triaged.

Admin lint extraction:

```text
npx eslint frontend/src/pages/dashboards/admin frontend/src/components/ui frontend/src/components/Avatar.jsx frontend/src/lib/focusTrap.js --format json
```

- Before: **17 findings — 15 errors and 2 warnings** in 11.40s.
- After: **13 findings — 12 errors and 1 warning** in 9.90s. The nonzero result is
  expected because RC5 preserves the classified C, retained B, and E findings.
- Shared `Button`, `Modal`, `RowSheet`, and `focusTrap` produced no findings.

Affected unit regressions:

```text
npm run test --workspace frontend -- src/pages/dashboards/admin/tabs/SchedulesTab.test.jsx src/pages/dashboards/admin/tabs/TeachingLoadTab.test.jsx
```

Result: **2 files, 23 tests passed** in 23.23s. The initial sandbox attempt
could not spawn esbuild (`EPERM`); the approved rerun completed normally.

Focused Calendar Upcoming regressions:

```text
npx playwright test e2e/admin-polish.spec.js e2e/admin-a11y.spec.js --grep "Upcoming"
```

Result: **7 passed, 1 skipped** in 25.5s. The skip was the existing
data-conditional action-name case because the fixture had no upcoming event;
the responsive controls, rail placement, and multi-day range cases passed.

No broad application suite was run because RC5 requested targeted regression
for justified fixes and explicitly excluded Manual QA.

## RC5 Release Notes

Resolved:

- Calendar Upcoming-event memoization now follows the date key it reads.
- Removed three unused React imports from Admin context/test files.

No lint rule was disabled, and the remaining Admin findings do not materially
reduce release quality.

## Future Considerations

- If `Avatar` is revised, use a source-specific failure state and test every
  dashboard that consumes the shared component.
- Revisit Fast Refresh file boundaries only as a deliberate module-organization
  change, not as release cleanup.
- Reconsider effect-driven fetching only with an approved data-layer change and
  equivalent loading, error, retry, and refresh coverage.
- Manual QA remains the next release gate and was not started during RC5.
