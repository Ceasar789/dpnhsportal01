// ============================================
// FILE: src/lib/newsRules.js
// PURPOSE: when a news post's publication date is written.
// ============================================

/**
 * The patch to merge into a news update so that `published_at` is stamped
 * once and never rewritten.
 *
 * Both admin write paths used to recompute it on every save:
 *
 *     published_at: status === 'Published' ? new Date().toISOString() : null
 *
 * which meant correcting a typo in a post from 3 September re-dated it to
 * now and threw it above a post from 9 September — the public feed was
 * ordered by last edit rather than by publication. Archiving also set it
 * back to null, losing the date permanently, which is how a Published row
 * ends up with no date for the feed to sort on.
 *
 * Returning an empty object rather than `{ published_at: existing }` keeps
 * the column out of the UPDATE entirely when there is nothing to change.
 *
 * @param {string} status            the status being saved
 * @param {string|null} publishedAt  what the row already has, if anything
 * @param {() => Date} clock         injectable for tests
 */
export function publishedAtPatch(status, publishedAt, clock = () => new Date()) {
  const firstPublication = status === 'Published' && !publishedAt;
  return firstPublication ? { published_at: clock().toISOString() } : {};
}
