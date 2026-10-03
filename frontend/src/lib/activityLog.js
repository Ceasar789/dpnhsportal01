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

/** What to call an actor whose profile is gone or archived. */
export const FORMER_USER = 'Former user';

/**
 * One row, in the shape the Overview and Settings panels render.
 *
 * Deleting or archiving a person must never delete the record of what
 * they did, so a row with no readable actor keeps everything else and
 * names the actor "Former user" rather than rendering a blank byline.
 */
export function toActivityRow(log) {
  const who = log?.profiles;
  const gone = !who || who.status === 'archived' || !who.name;
  return {
    id: log?.id,
    action: log?.action ?? '',
    message: log?.description || '',
    actorName: gone ? FORMER_USER : who.name,
    created_at: log?.created_at,
  };
}
