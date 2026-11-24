// 4j: who may read a news post, in the browser and in the query.
import { describe, expect, it } from 'vitest';
import { audienceRole, canReadNews, newsAudienceFilter } from './newsAudience';

const post = target_roles => ({ target_roles });

describe('canReadNews', () => {
  it('everyone reads "all" and an empty audience', () => {
    for (const role of ['guest', 'student', 'teacher', undefined]) {
      expect(canReadNews(post('all'), role)).toBe(true);
      expect(canReadNews(post(null), role)).toBe(true);
    }
  });
  it('a student never reads a teacher-only post, and a guest reads neither', () => {
    expect(canReadNews(post('teacher'), 'student')).toBe(false);
    expect(canReadNews(post('student'), 'teacher')).toBe(false);
    expect(canReadNews(post('student'), undefined)).toBe(false);
    expect(canReadNews(post('teacher'), 'guest')).toBe(false);
    expect(canReadNews(post('student'), 'student')).toBe(true);
    expect(canReadNews(post('teacher'), 'teacher')).toBe(true);
  });
  it('legacy staff posts reach staff roles only; custom audiences reach nobody', () => {
    expect(canReadNews(post('teacher,faculty,registrar'), 'teacher')).toBe(true);
    expect(canReadNews(post('staff'), 'teacher')).toBe(true);
    expect(canReadNews(post('staff'), 'student')).toBe(false);
    expect(canReadNews(post('custom:Grade 7 parents'), 'student')).toBe(false);
    expect(canReadNews(post('custom:all'), 'student')).toBe(false);
  });
});

describe('newsAudienceFilter', () => {
  it('a guest asks only for posts addressed to all', () => {
    expect(newsAudienceFilter(undefined)).toBe('target_roles.is.null,target_roles.ilike.*all*');
  });
  it('a student adds its own role, a teacher adds staff too', () => {
    expect(newsAudienceFilter('student')).toBe('target_roles.is.null,target_roles.ilike.*all*,target_roles.ilike.*student*');
    expect(newsAudienceFilter('Teacher')).toBe('target_roles.is.null,target_roles.ilike.*all*,target_roles.ilike.*teacher*,target_roles.ilike.*staff*');
  });
  it('an odd role value can never be injected into the filter', () => {
    expect(audienceRole('student),id.gt.(0')).toBe('guest');
    expect(newsAudienceFilter('x*,status.eq.Draft')).toBe('target_roles.is.null,target_roles.ilike.*all*');
  });
});
