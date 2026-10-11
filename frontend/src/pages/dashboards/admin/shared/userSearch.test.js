import { describe, expect, it } from 'vitest';
import { filterAndRankUsers } from './userSearch';

const users = [
  { id: '5', name: 'Zed Email', email: 'philip@example.test', role: 'teacher', status: 'active' },
  { id: '4', name: 'Alpha Philip', email: 'alpha@example.test', role: 'teacher', status: 'active' },
  { id: '3', name: 'Polito Cruz', email: 'polito@example.test', role: 'teacher', status: 'active' },
  { id: '2', name: 'Philip Cruz', email: 'z@example.test', role: 'student', status: 'active' },
  { id: '1', name: 'Philip Cruz', email: 'a@example.test', role: 'student', status: 'archived' },
];

const select = (overrides = {}) => filterAndRankUsers({
  users,
  query: '',
  roleFilter: '',
  statusFilter: '',
  showArchived: false,
  onlineUserIds: new Set(['2', '3']),
  ...overrides,
});

describe('Admin user search relevance', () => {
  it('SR-01 preserves backend order for an empty query', () => {
    expect(select().map(user => user.id)).toEqual(['5', '4', '3', '2']);
  });

  it('SR-02 preserves backend order for whitespace-only input', () => {
    expect(select({ query: '   ' }).map(user => user.id)).toEqual(['5', '4', '3', '2']);
  });

  it('SR-03 ranks name-prefix matches ahead of name-contains and email matches', () => {
    expect(select({ query: 'p' }).map(user => user.id)).toEqual(['2', '3', '4', '5']);
  });

  it('SR-04 compares queries case-insensitively', () => {
    expect(select({ query: 'PHI' }).map(user => user.id)).toEqual(['2', '4', '5']);
  });

  it('SR-05 trims a non-empty query before ranking', () => {
    expect(select({ query: '  philip  ' }).map(user => user.id)).toEqual(['2', '4', '5']);
  });

  it('SR-06 sorts alphabetically inside a relevance group', () => {
    expect(select({ query: 'p' }).slice(0, 2).map(user => user.name)).toEqual(['Philip Cruz', 'Polito Cruz']);
  });

  it('SR-07 uses email and then id as deterministic tie-breakers', () => {
    expect(select({ users: [
      { id: 'b', name: 'Philip', email: 'same@example.test', status: 'active' },
      { id: 'a', name: 'Philip', email: 'same@example.test', status: 'active' },
    ], query: 'p' }).map(user => user.id)).toEqual(['a', 'b']);
  });

  it('SR-08 retains role filtering before ranking', () => {
    expect(select({ query: 'p', roleFilter: 'teacher' }).map(user => user.id)).toEqual(['3', '4', '5']);
  });

  it('SR-09 retains online filtering before ranking', () => {
    expect(select({ query: 'p', statusFilter: 'online' }).map(user => user.id)).toEqual(['2', '3']);
  });

  it('SR-10 retains offline filtering before ranking', () => {
    expect(select({ query: 'p', statusFilter: 'offline' }).map(user => user.id)).toEqual(['4', '5']);
  });

  it('SR-11 keeps archived users out of the active view', () => {
    expect(select({ query: 'p' }).map(user => user.id)).not.toContain('1');
  });

  it('SR-12 includes only archived users in the archive view', () => {
    expect(select({ query: 'p', showArchived: true }).map(user => user.id)).toEqual(['1']);
  });

  it('SR-13 does not mutate the backend user array', () => {
    const originalOrder = users.map(user => user.id);
    select({ query: 'p' });
    expect(users.map(user => user.id)).toEqual(originalOrder);
  });

  it('SR-14 handles missing names and emails without throwing', () => {
    expect(() => select({ users: [{ id: 'x', status: 'active' }], query: 'x' })).not.toThrow();
  });

  it('SR-15 returns an empty result when no field matches', () => {
    expect(select({ query: 'not-present' })).toEqual([]);
  });
});
