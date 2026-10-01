# Temporary workarounds — remove in Phase 5

Things that exist only because an earlier phase could not reach the code that
really causes them. Each row names what removes it. Nothing here is a design
decision; if a row survives Phase 5, it has become one by accident.

| # | Where | What | Why it is there | Removed by |
|---|---|---|---|---|
| 1 | `e2e/helpers.js` · `openAdminTab` | `item.click({ force: true })` | `.sidebar-item` carries `transition: all .3s ease` and the active entry animates its padding and left border, so Playwright's stability check waits out its own timeout on an element that is only animating its own appearance. | **Rule L5** — transitions capped at 150ms and `all` banned. Drop `force` and confirm the click still lands. |
| 2 | `components/ui/Modal.jsx` | Reuses `.modal-overlay`, `.modal`, `.modal-title`, `.modal-actions` | Those classes live inside `AdminDashboard.jsx`'s injected `<style>`, so `<Modal>` currently renders correctly **only inside the admin shell**. Reusing them was deliberate: migrating a tab is then a behaviour diff a reviewer can read, with no visual change to eyeball. | **Phase 5**, when the modal's styling moves to `index.css` and stops depending on where it is mounted. Until then, do not use `<Modal>` in the student, teacher, registrar or faculty dashboards. |
| 3 | `styles/index.css` · `.ux-modal*` | A second set of classes layered over `.modal` | Adds the structure the originals never had — a body that scrolls on its own, a footer that stays put, the mobile sheet — without touching the originals. | **Phase 5** merges the two into one rule set. |
| 4 | `e2e/helpers.js` · `openAdminTab` | Reopens the drawer before every tab click | Not a workaround for a defect — clicking a tab calls `setSidebarOpen(false)`, so the drawer genuinely has to be reopened. It stays. | — |
| 5 | `e2e/admin.spec.js` · `FLOOR = 11` | The text-size floor is 11px, not 12px | Writing 12 before Phase 4 raises the type scale would make the suite red before any work started. | **Phase 4**, together with `e2e/text-size.spec.js`. |

## Not a workaround, but owed

- **Drawer breakpoint is 900px**, not the 1024px Rule X2 asks for
  (`AdminDashboard.jsx:531`). Recorded as a **Phase 6** item rather than
  patched around in the test helper.
- **`handleOverlayClick`** is still exported from `useAdminLogic` and
  destructured by the seven tabs not yet migrated. It goes when the last one
  moves to `<Modal>`.
