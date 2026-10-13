// ============================================
// FILE: src/lib/memoRecipients.js
//
// Who a memo can be addressed to, in one place.
//
// The compose form and the filter above the list each had their own
// hardcoded copy of the same six options, and the two departments in
// that list — "Science Dept" and "Math Dept" — do not exist. The real
// values in profiles.department are "Science" and "Mathematics", so a
// memo addressed through that form went to a department with no members
// and nobody found out.
//
// Three different kinds of thing were mixed into one list, and they have
// different sources:
//
//   * Role groups are a closed set this app defines. Fixed is correct.
//   * "Registrar Office" is an office, not a department. Also fixed.
//   * Departments are data. They come from profiles.department.
// ============================================

/** Groups the app itself defines. Not data, and not derived from any. */
export const FIXED_RECIPIENTS = ['All', 'All Faculty', 'All Students', 'Registrar Office'];

/** What the filter shows before anything is chosen. */
export const ALL_RECIPIENTS = '';

// A department is a staff grouping. One student profile in the live data
// carries department: 'Student', which is a data-entry slip rather than a
// department, and offering it as a recipient would spread the mistake.
const STAFF_ROLES = new Set(['teacher', 'faculty', 'registrar', 'admin', 'main_admin']);

/**
 * The departments that actually have staff in them, sorted.
 * @param {Array<{role?: string, department?: string}>} profiles
 */
export function departmentOptions(profiles = []) {
  const seen = new Set();
  for (const p of profiles) {
    const dept = (p?.department || '').trim();
    if (!dept) continue;
    if (!STAFF_ROLES.has((p.role || '').toLowerCase())) continue;
    seen.add(dept);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * Everything a new memo may be addressed to.
 * Fixed groups first — they are the common case — then departments.
 */
export function composeOptions(profiles = []) {
  return [...FIXED_RECIPIENTS, ...departmentOptions(profiles)];
}

/**
 * What the filter offers: only recipients that some memo actually has.
 *
 * A filter listing everything POSSIBLE can be set to a value that
 * matches nothing, which reads as "there are no memos" rather than "no
 * memo was ever sent to this group".
 *
 * Derived from the memos rather than from the department list on
 * purpose: a memo addressed to a department that has since been renamed
 * or emptied stays findable, because its own stored string is still one
 * of the options. Nothing is lost when the staff list changes.
 *
 * @param {Array<{recipient?: string}>} memos
 */
export function filterOptions(memos = []) {
  const seen = new Set();
  for (const m of memos) {
    const to = (m?.recipient || '').trim();
    if (to) seen.add(to);
  }
  // Known groups in their canonical order first, then anything else the
  // data holds — including values no longer offered when composing.
  const known = FIXED_RECIPIENTS.filter((r) => seen.has(r));
  const rest = [...seen].filter((r) => !FIXED_RECIPIENTS.includes(r)).sort((a, b) => a.localeCompare(b));
  return [...known, ...rest];
}
