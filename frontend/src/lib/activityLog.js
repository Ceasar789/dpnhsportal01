// ============================================
// FILE: src/lib/activityLog.js
//
// Shaping an activity_logs row for display.
//
// The actor's name is NOT stored on the row. It is read through user_id,
// a foreign key to profiles, because a name copied onto the row goes
// stale the first time someone is renamed — and an audit trail that
// disagrees with itself is worse than one that has to do a join.
//
// That makes the display rule a real decision rather than a field read,
// so it lives here where it can be tested: the actor may be missing, or
// archived, and the row still has to say something.
// ============================================

/** The columns and embed every activity read needs. */
export const ACTIVITY_SELECT =
  'id, action, description, created_at, user_id, profiles(name, status)';

/** What to call an actor whose profile no longer exists at all. */
export const FORMER_USER = 'Former user';

/**
 * One row, in the shape the Overview and Settings panels render.
 *
 * Removing a person must never remove the record of what they did, so a
 * row whose actor cannot be named keeps everything else and says so.
 *
 * Archived is NOT the same as deleted, and the distinction matters on an
 * audit trail. An archived profile still has a name, and replacing it
 * with "Former user" would throw away the one fact the row exists to
 * record. It is shown, marked, so a reader knows the account is no
 * longer active: "Jane Cruz (archived)".
 *
 * "Former user" is reserved for a profile that is genuinely gone — the
 * FK is ON DELETE SET NULL, so user_id becomes null and there is nothing
 * left to read a name from.
 */
export function toActivityRow(log) {
  const who = log?.profiles;
  const name = who?.name;
  let actorName;
  if (!name) actorName = FORMER_USER;
  else if (who.status === 'archived') actorName = `${name} (archived)`;
  else actorName = name;

  return {
    id: log?.id,
    action: log?.action ?? '',
    message: log?.description || '',
    actorName,
    created_at: log?.created_at,
  };
}
