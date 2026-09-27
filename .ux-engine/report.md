# UX findings

scope: path `frontend/src/pages/auth/FacultyLogin.jsx` · 30 high · 5 medium · 1 low · 2 suppressed

## High

- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:9` — Off-system colour `#dc3545` — nearest token `--red` (distance 0.03).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:10` — Off-system colour `#0d2b5c` — nearest token `--text` (distance 0.03).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:11` — Off-system colour `#6f42c1` — nearest token `--purple` (distance 0.07).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:12` — Off-system colour `#198754` — nearest token `--teal` (distance 0.08).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:143` — Off-system colour `#1a2b4a` — nearest token `--text` (distance 0.00).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:144` — Off-system colour `#d4a843` — no near token; likely a genuinely new value.
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:145` — Off-system colour `#6B7280` — nearest token `--heading-accent` (distance 0.07).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:149` — Off-system colour `#fee2e2` — nearest token `--reg-sidebar-active-bg` (distance 0.04).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:151` — Off-system colour `#dc3545` — nearest token `--red` (distance 0.03).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-096** · `frontend/src/pages/auth/FacultyLogin.jsx:157` — All three field labels are positional only, so a screen reader announces the inputs as bare edit boxes and never reads "LOGIN AS" for the role control.
  - Evidence: <label>LOGIN AS</label> at :157, EMAIL ADDRESS at :184 and PASSWORD at :192 carry no htmlFor, and the controls they sit above (the role <button> at :159, the inputs at :187 and :195) carry no id. The role control is a button, which a <label> cannot be associated with at all, so "LOGIN AS" never reaches its accessible name.
  - Fix: Bind the label to the input so the association is programmatic rather than positional, using the identifier the input already carries. Where the design has no visible label, give the input an accessible name directly rather than relying on a placeholder, and keep that name matching whatever visible text a voice-control user would say.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:157` — Off-system colour `#6B7280` — nearest token `--heading-accent` (distance 0.07).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:159` — Off-system colour `#F8F9FA` — nearest token `--sidebar-bg` (distance 0.00).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:159` — Off-system colour `#E5E7EB` — nearest token `--border` (distance 0.01).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:166` — Off-system colour `#9CA3AF` — nearest token `--text-dim` (distance 0.02).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:168` — Off-system colour `#9CA3AF` — nearest token `--text-dim` (distance 0.02).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:171` — Off-system colour `#E5E7EB` — nearest token `--border` (distance 0.01).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:184` — Off-system colour `#6B7280` — nearest token `--heading-accent` (distance 0.07).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:186` — Off-system colour `#9CA3AF` — nearest token `--text-dim` (distance 0.02).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:187` — Off-system colour `#F8F9FA` — nearest token `--sidebar-bg` (distance 0.00).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:187` — Off-system colour `#E5E7EB` — nearest token `--border` (distance 0.01).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:192` — Off-system colour `#6B7280` — nearest token `--heading-accent` (distance 0.07).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:194` — Off-system colour `#9CA3AF` — nearest token `--text-dim` (distance 0.02).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:195` — Off-system colour `#F8F9FA` — nearest token `--sidebar-bg` (distance 0.00).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:195` — Off-system colour `#E5E7EB` — nearest token `--border` (distance 0.01).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-091** · `frontend/src/pages/auth/FacultyLogin.jsx:196` — The show/hide password toggle announces as "button" and gives no way to tell whether the password is currently revealed.
  - Evidence: <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2"> holds only an Eye or EyeOff glyph, with no aria-label, no aria-pressed and no visually hidden text.
  - Fix: Give every icon-only control an accessible name that states the action in the same terms a text label would use — `aria-label="Delete invoice"`, not `aria-label="Trash icon"` — and keep it in sync with what the icon does if the action is conditional (a toggle's label should change with its state, e.g. "Mute" vs. "Unmute").
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:197` — Off-system colour `#9CA3AF` — nearest token `--text-dim` (distance 0.02).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:197` — Off-system colour `#9CA3AF` — nearest token `--text-dim` (distance 0.02).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:203` — Off-system colour `#b7950b` — nearest token `--yellow` (distance 0.09).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:206` — Off-system colour `#0d2b5c` — nearest token `--text` (distance 0.03).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.
- **UX-101** · `frontend/src/pages/auth/FacultyLogin.jsx:212` — Off-system colour `#6c757d` — nearest token `--heading-accent` (distance 0.09).
  - Fix: Replace the literal with the nearest existing token from the colour group; if none of the existing tokens is semantically correct, add a new token to the source file (`styling.tokenSource`) rather than inlining a one-off value, so the palette stays the single source of truth for every colour in the UI.

## Medium

- **UX-095** · `frontend/src/pages/auth/FacultyLogin.jsx:143` — The page's outline starts at level 2, so a screen reader's heading list shows a document with no top level.
  - Evidence: <h2>Faculty Portal</h2> at :143 is the only heading the page renders, and the auth routes mount bare with no shared layout supplying an h1 above it.
  - Fix: Choose the level from the section's actual depth in the structure, with one top-level heading naming the screen, and set the rendered size separately from the profile's type scale. Keeping the two decisions apart lets a deeply nested heading be small and a shallow one be large without either lying about the outline.
- **UX-099** · `frontend/src/pages/auth/FacultyLogin.jsx:149` — A rejected sign-in appears silently: the panel is painted red and nothing announces it, so a screen reader user is left on a form that looks unchanged.
  - Evidence: The error panel mounts from {errorMessage && (...)} at :148 with no role="alert" and no aria-live. Every failure path — the student block at :66, the role mismatch at :75 and :118, the credential failures from getErrorMessage at :127 — writes into it.
  - Fix: Render the changing content inside a region marked as live, choosing the politeness from the urgency — assertive for something that interrupts, polite for a result count or a status. Keep the live region mounted in the tree rather than creating it with its content, since a region that appears at the same moment as its text is frequently not announced at all.
- **UX-104** · `frontend/src/pages/auth/FacultyLogin.jsx:184` — The two sign-in forms have drifted apart: the same defect is fixed on one and live on the other, so the accessible version a user gets now depends on which role they picked.
  - Evidence: StudentLogin.jsx and FacultyLogin.jsx render the same sign-in concept from near-identical markup, but as of commit 0c5592d the student form has label associations, autocomplete, a named show/hide toggle, role="alert" and 24px targets, and this one has none of them. Both are reached from the same chooser at /login.
  - Fix: Keep the component that already covers both call sites, extend it with the variant the other one needed through the mechanism the profile records, and replace the second at its call sites before deleting it. Leaving both in the tree behind a preference guarantees the divergence continues.
- **UX-016** · `frontend/src/pages/auth/FacultyLogin.jsx:196` — Three controls sit under the 24x24 minimum, and the smallest of them is the one a phone user reaches for to check a mistyped password.
  - Evidence: The show/hide toggle at :196 has no padding around its 20px glyph, so its hit area is 20x20. "Forgot password?" at :203 and "Back to role selection" at :212 are text-sm buttons with no vertical padding, so each is about 20px tall. The WCAG 2.2 AA minimum for a web target is 24x24.
  - Fix: Grow the hit area to the platform minimum even when the visible icon stays small — padding counts, the glyph doesn't have to. Where several small targets are packed into a table row, add horizontal spacing between them sized from the layout's existing spacing tokens rather than shrinking padding to fit more in, and confirm the rendered box (not just the icon's viewBox) against the platform minimum.
- **UX-029** · `frontend/src/pages/auth/FacultyLogin.jsx:203` — Two pure navigations are built as buttons with no destination in the markup, so they cannot be opened in a new tab, middle-clicked, or seen by a screen reader as links.
  - Evidence: Both :203 and :212 are <button> elements whose only job is navigate('/forgot-password') and navigate('/login'). Both destinations are known at render time and neither waits on work that can fail, so the counter-example does not cover them.
  - Fix: Match the element to the behaviour: anything that goes somewhere is an anchor carrying the real destination, and anything that changes state is a button. Where a navigation also needs script — analytics, an unsaved-changes guard — keep the destination in the markup and let the handler run alongside it.

## Low

- **UX-072** · `frontend/src/pages/auth/FacultyLogin.jsx:187` — Neither credential field is annotated, so the browser and any password manager have nothing to fill — on a portal staff sign into daily.
  - Evidence: The email input at :187 and the password input at :195 declare neither autoComplete nor name.
  - Fix: Annotate each standard field with the autocomplete token naming what it collects, using the compound tokens for grouped values such as address lines so the platform can fill the group in one action. Keep the field's name, type and token consistent so a manager that stored a value can recognise it again.

## Suppressed

- UX-102 suppressed for 4 length(s) whose surrounding code does not say which token group they belong to — no scale was applied, so no substitution was offered
  - Written after: `border` (×4)
- UX-103 suppressed for motion — 0 distinct values, not a scale (1 literals)
  - Most used: `0.2s` (×1)
  - These are the raw material for a motion scale; the remedy is tokens, not a quieter report.

