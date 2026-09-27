import { describe, it, expect } from 'vitest';
import { publishedAtPatch } from './newsRules';

const AT = new Date('2026-09-20T08:00:00.000Z');
const clock = () => AT;

describe('publishedAtPatch', () => {
  it('stamps the date the first time a post is published', () => {
    expect(publishedAtPatch('Published', null, clock))
      .toEqual({ published_at: AT.toISOString() });
  });

  it('leaves an already-published post alone, which is the bug it exists for', () => {
    // Editing a typo must not re-date the post and jump it up the feed.
    expect(publishedAtPatch('Published', '2026-09-03T15:25:19.895Z', clock)).toEqual({});
  });

  it('does not clear the date when a post is archived', () => {
    // Archiving used to null it, losing the publication date for good.
    expect(publishedAtPatch('Archived', '2026-09-03T15:25:19.895Z', clock)).toEqual({});
  });

  it('does not clear the date when a post goes back to draft', () => {
    expect(publishedAtPatch('Draft', '2026-09-03T15:25:19.895Z', clock)).toEqual({});
  });

  it('stamps nothing for a draft that has never been published', () => {
    expect(publishedAtPatch('Draft', null, clock)).toEqual({});
  });

  it('stamps a post that was archived before it ever had a date', () => {
    expect(publishedAtPatch('Published', undefined, clock))
      .toEqual({ published_at: AT.toISOString() });
  });

  it('treats an empty string as no date, not as a date', () => {
    expect(publishedAtPatch('Published', '', clock))
      .toEqual({ published_at: AT.toISOString() });
  });
});
