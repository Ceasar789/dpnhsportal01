# Admin Dashboard release summary

Date: 8 October 2026

Stage: Release Candidate 4 — Release Documentation Finalization

Overall status: **ADMIN DASHBOARD READY FOR MANUAL QA**

This is the authoritative status page for the Admin Dashboard release. The
linked findings, workaround notes, and engineering journals retain the facts
and status language of their own checkpoints; this page supersedes those
checkpoint labels when determining current release state.

## Release Status

| Stage | Status | Final record |
|---|---|---|
| Recovery | ✓ Complete | [Recovery findings](ux-findings.md) and [recovery verification notebook](ux-workarounds.md) |
| L1 | ✓ Complete | Settings save-bar boundary changed to the established neutral border in `eb69f19`; behavior and layout were preserved. |
| L2 | ✓ Complete | [Calendar chip wrapping journal](ux-l2-engineering-journal.md) — `a15d6ea` |
| L3 | ✓ Complete | [Agenda Today marker journal](ux-l3-engineering-journal.md) — `4482e23` |
| L4 | ✓ Complete | [Narrow Calendar toolbar journal](ux-l4-engineering-journal.md) — `53ae135` |
| RC1 | ✓ Complete | [Week View release decision](rc1-week-view-engineering-journal.md) — `1bc227f` |
| RC2 | ✓ Complete | [Memo selection stability journal](rc2-memo-selection-engineering-journal.md) — `7def194` |
| RC3 | ✓ Complete | [Accessibility release journal](rc3-accessibility-engineering-journal.md) — `747e501` |
| RC4 | ✓ Complete | Documentation reconciled; this summary and continuity links are the RC4 changes. |

## Recovery

Recovery established the verified continuation baseline and protected existing
work before the remaining UI findings were implemented. Its local commits were:

- `efaa0e9` — notification-test write protection;
- `dc7667a` — News preview URL lifetime;
- `af20034` — focus-test timing;
- `effa33c` — event-author payload verification.

The dated recovery tables remain evidence of that checkpoint. Their statements
that L1–L4 were pending are superseded by the completed implementation journals
and commits linked above. The undefined F1/F2 labels were never supported by a
verifiable requirement and are not carried forward as release work.

## Released Admin State

### Architecture — PASS

The existing React, Admin context/hook, tab ownership, shared dialog, and
Supabase access boundaries were preserved. No release-candidate task introduced
a second state owner, backend layer, dependency, or database migration.

### UX — PASS

L1 removed the unintended accent boundary from the Settings save bar. L2–L4
resolved Calendar text density, Today orientation, and narrow toolbar grouping.
RC1 removed the unsupported Week View choice so the toolbar exposes only the
implemented Month workflow. Existing design language and interaction patterns
remain in use.

### Responsive — PASS

The implementation journals verify 360, 390, 768, 1024, and 1440px in light
and dark themes. The final Calendar paths retain the mobile Agenda, wider month
grid, deliberate phone toolbar grouping, and zero measured body overflow in
their recorded matrices.

### Accessibility — PASS

RC3 named the affected filters, Calendar navigation, and event-specific actions
and exposed the required state of enforced fields. Focus visibility, dialog
naming, initial focus, Tab/Shift+Tab trapping, Escape, focus restoration, theme
contrast, keyboard activation, and mouse activation passed the focused browser
regressions recorded in the RC3 journal.

### Regression — PASS

Each implemented stage has focused automated and responsive/theme evidence in
its journal. RC3 closed with 8 Admin accessibility, 9 dialog, 6 focus, and 2
contrast tests passing, plus a 10-case width/theme matrix. These are scoped
release checks; they do not replace the deferred isolated-database work or the
upcoming manual QA stage.

### Engineering — PASS

Changes remained scoped to their owning components and tests. No release stage
pushed commits, rewrote history, changed production data, or introduced a new
dependency. The engineering journals record root causes, alternatives,
complexity, risk, and verification.

## Known Deferred Items

Only these evidenced items remain outside the completed Admin UI release work:

- **Calendar Week View:** a future feature, deferred by RC1 until product
  behavior, responsive design, accessibility, date calculations, and tests are
  approved. The current release truthfully exposes Month only.
- **Isolated Supabase E2E environment:** still needed before write-gated tests
  can run without any route to school data.
- **Database reconstruction and policy verification:** canonical schema order,
  legacy-column dependencies, migration application, live RLS role targets,
  and real write persistence remain separate backend/data work. No SQL change
  is part of this Admin UI release.
- **Non-Admin roadmap:** Student, Teacher, Faculty, Registrar, Authentication,
  and unrelated feature backlog were outside the Admin release scope.

Historical audit rows and the undefined F1/F2 labels are not artificial future
tasks. They remain in their source documents as provenance, not as current
release commitments.

## Remaining Release Work

- **RC5 — Lint Triage:** not started during RC4.
- **Manual QA:** the next release gate; not performed or claimed by this
  documentation pass.

## RC4 Release Notes

RC4 changed documentation only:

- created this authoritative Admin release summary;
- marked Recovery, L1–L4, and RC1–RC3 complete in one chronology;
- added continuity links without rewriting historical journals;
- superseded stale checkpoint TODO language;
- separated genuine deferred work from historical labels and upcoming release
  gates.

No application code, test behavior, database object, dependency, or runtime
configuration changed during RC4.
