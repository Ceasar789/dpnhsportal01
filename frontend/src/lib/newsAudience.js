// ============================================
// FILE: src/lib/newsAudience.js
// Who may read a news post (4j, QA ID-046 / ID-160).
// `target_roles` is a comma-separated text column: 'all', 'student',
// 'teacher', legacy 'faculty' / 'registrar' / 'staff', or 'custom:<text>'.
// A custom audience is free text that cannot be resolved to a role, so it is
// shown to nobody here (the public page and the teacher tab already did that).
//
// This is the browser half. The database half (row level security on `news`)
// is the proposed migration in autorun/sql/4j; until it is applied, these
// filters keep other roles' posts out of the reply and off the screen.
// ============================================

const STAFF_ROLES = ['teacher', 'faculty', 'registrar', 'main_admin'];

// A role we can put into a query; anything else reads as a guest.
export const audienceRole = (role) => {
  const value = String(role ?? '').trim().toLowerCase();
  return /^[a-z_]{1,32}$/.test(value) ? value : 'guest';
};

export const canReadNews = (item, role) => {
  const who = audienceRole(role);
  const targets = String(item?.target_roles || 'all').split(',').map(target => target.trim().toLowerCase());
  return targets.includes('all') || targets.includes(who)
    || (targets.includes('staff') && STAFF_ROLES.includes(who));
};

// The same rule as a PostgREST `or` filter, so other roles' posts are not
// sent at all. Loose (substring) on purpose: canReadNews still decides.
export const newsAudienceFilter = (role) => {
  const who = audienceRole(role);
  const parts = ['target_roles.is.null', 'target_roles.ilike.*all*'];
  if (who !== 'guest') parts.push(`target_roles.ilike.*${who}*`);
  if (STAFF_ROLES.includes(who)) parts.push('target_roles.ilike.*staff*');
  return parts.join(',');
};
