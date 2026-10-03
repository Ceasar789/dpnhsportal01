import { describe, expect, it } from 'vitest';
import { FORMER_USER, toActivityRow } from './activityLog';

const row = (over = {}) => ({
  id: 'r1',
  action: 'Updated settings',
  description: 'Academic Year',
  created_at: '2026-10-03T09:00:00Z',
  user_id: 'u1',
  profiles: { name: 'E2E Test Admin', status: 'active' },
  ...over,
});

describe('toActivityRow', () => {
  it('names the actor from the joined profile, not from the row', () => {
    const out = toActivityRow(row());
    expect(out.actorName).toBe('E2E Test Admin');
    expect(out.message).toBe('Academic Year');
    expect(out.action).toBe('Updated settings');
  });

  it('says Former user when the profile is gone', () => {
    expect(toActivityRow(row({ profiles: null })).actorName).toBe(FORMER_USER);
  });

  it('says Former user when the profile is archived', () => {
    expect(toActivityRow(row({ profiles: { name: 'Jane Cruz', status: 'archived' } })).actorName)
      .toBe(FORMER_USER);
  });

  it('says Former user rather than blank when the name is empty', () => {
    expect(toActivityRow(row({ profiles: { name: '', status: 'active' } })).actorName)
      .toBe(FORMER_USER);
  });

  it('keeps the record when the actor cannot be named', () => {
    // The whole point: losing the person must not lose the event.
    const out = toActivityRow(row({ profiles: null }));
    expect(out.action).toBe('Updated settings');
    expect(out.message).toBe('Academic Year');
    expect(out.created_at).toBe('2026-10-03T09:00:00Z');
  });

  it('renders an action with no description as an empty message', () => {
    expect(toActivityRow(row({ description: null })).message).toBe('');
  });

  it('does not throw on a malformed row', () => {
    expect(toActivityRow(undefined).actorName).toBe(FORMER_USER);
    expect(toActivityRow({}).action).toBe('');
  });
});
