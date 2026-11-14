// S4: the pure rules of the teacher's file/link review dialog.
import { describe, expect, it } from 'vitest';
import {
  FILTERS, GRADE_ERRORS, NETWORK, UNCONFIRMED, cleanFeedback, feedbackProblem, filterCounts, gradeErrorMessage,
  inFilter, matchesSearch, mergeRows, reviewStatus, scoreProblem,
} from './attachmentReviewRules';

const sub = (over = {}) => ({ id: `sub-${over.student_id || 'x'}`, status: 'submitted', released: false, is_late: false, ...over });

describe('reviewStatus', () => {
  it.each([
    [null, 'notSubmitted'],
    [{ status: 'in_progress' }, 'notSubmitted'],
    [{ status: 'submitted', is_late: false }, 'turnedIn'],
    [{ status: 'submitted', is_late: true }, 'late'],
    [{ status: 'checked', released: false }, 'graded'],
    [{ status: 'checked', released: true }, 'returned'],
    [{ status: 'checked', released: true, is_late: true }, 'returned'],
    [{ status: 'weird' }, 'notSubmitted'],
  ])('%j is %s', (submission, status) => {
    expect(reviewStatus(submission)).toBe(status);
  });
});

describe('filters, counts and search', () => {
  const rows = [
    { name: 'Ana', submission: null },
    { name: 'Ben', submission: { status: 'in_progress' } },
    { name: 'Cris', submission: { status: 'submitted', is_late: false } },
    { name: 'Dina', submission: { status: 'submitted', is_late: true } },
    { name: 'Emil', submission: { status: 'checked', released: false, is_late: true } },
    { name: 'Fe', submission: { status: 'checked', released: true } },
    { name: 'Gelo', submission: { status: 'in_progress', is_late: true } },
  ];

  it('the five filters, in order', () => {
    expect(FILTERS.map(([key]) => key)).toEqual(['all', 'submitted', 'notSubmitted', 'graded', 'late']);
  });

  it('counts per filter: Submitted = waiting for a score, Graded = scored, Late = turned in late at any stage', () => {
    expect(filterCounts(rows)).toEqual({ all: 7, submitted: 2, notSubmitted: 3, graded: 2, late: 2 });
    expect(rows.filter(r => inFilter(r, 'late')).map(r => r.name)).toEqual(['Dina', 'Emil']);
  });

  it('search ignores case and accents, and an empty search matches all', () => {
    const row = { name: 'Niña Dela Cruz' };
    expect(matchesSearch(row, 'nina')).toBe(true);
    expect(matchesSearch(row, 'DELA')).toBe(true);
    expect(matchesSearch(row, '  ')).toBe(true);
    expect(matchesSearch(row, 'ben')).toBe(false);
  });
});

describe('score and feedback', () => {
  it.each([['0', null], ['10', null], ['9.5', null], ['9.75', null], ['  7 ', null]])('score %j out of 10 is fine', (text, problem) => {
    expect(scoreProblem(text, 10)).toBe(problem);
  });
  it.each(['10.01', '11', '-1', '9.755', 'abc', '1e1', '.5', '12345'])('score %j out of 10 is refused', (text) => {
    expect(scoreProblem(text, 10)).toBe('Enter a score from 0 to 10 with at most 2 decimals.');
  });
  it('an empty score asks for one; 9999.99 is the largest possible', () => {
    expect(scoreProblem('', 10)).toBe('Enter a score.');
    expect(scoreProblem('9999.99', 9999.99)).toBeNull();
  });
  it('feedback: at most 2,000 characters, trimmed, null when empty', () => {
    expect(feedbackProblem('x'.repeat(2000))).toBeNull();
    expect(feedbackProblem('x'.repeat(2001))).toBe('Keep the feedback to 2,000 characters.');
    expect(cleanFeedback('  Good  ')).toBe('Good');
    expect(cleanFeedback('   ')).toBeNull();
  });
});

describe('the grade RPC error messages', () => {
  it.each([
    ['not_authenticated', 'Your session has ended. Sign in again, then save the score.'],
    ['not_found', 'This submission is no longer available to you. Refresh and try again.'],
    ['not_attachment_task', 'This task no longer takes files or links. Refresh the page.'],
    ['invalid_state', "This student's work is not turned in (they may have unsubmitted it). Refresh to see the latest."],
    ['invalid_score', 'Enter a score from 0 to 25 with at most 2 decimals.'],
    ['invalid_feedback', 'Keep the feedback to 2,000 characters.'],
    ['invalid_release', UNCONFIRMED],
    ['permission denied for function eduscribe_task_attachment_grade_v1', UNCONFIRMED],
  ])('%s', (code, message) => {
    expect(gradeErrorMessage(code, 25)).toBe(message);
  });
  it('no message carries database words', () => {
    const all = [...Object.values(GRADE_ERRORS).map(fn => fn(10)), UNCONFIRMED, NETWORK];
    for (const text of all) expect(text).not.toMatch(/eduscribe|rpc|sql|postgres|policy|_/i);
  });
});

describe('mergeRows', () => {
  it('every assigned student once, sorted by name, with their submission; missing names read as a dash', () => {
    const rows = mergeRows({
      roster: [{ student_id: 's2', section_id: 'a' }, { student_id: 's1', section_id: 'a' }, { student_id: 's3', section_id: 'a' }],
      submissions: [sub({ student_id: 's1' })],
      names: new Map([['s1', 'Zed'], ['s2', 'Ana']]),
    });
    expect(rows.map(r => [r.name, r.submission?.id ?? null])).toEqual([['Ana', null], ['Zed', 'sub-s1'], ['—', null]]);
  });

  it('a submission without an assignment row is still listed', () => {
    const rows = mergeRows({ roster: [], submissions: [sub({ student_id: 's9', section_id: 'b' })], names: new Map([['s9', 'Lone']]) });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ student_id: 's9', section_id: 'b', name: 'Lone' });
  });

  it('attaches the work only to turned-in submissions: a draft is never attached', () => {
    const draft = sub({ id: 'd1', student_id: 's1', status: 'in_progress' });
    const turned = sub({ id: 't1', student_id: 's2' });
    const rows = mergeRows({
      roster: [{ student_id: 's1' }, { student_id: 's2' }],
      submissions: [draft, turned],
      attachments: [{ submission_id: 'd1', kind: 'file', file_name: 'draft.pdf' }, { submission_id: 't1', kind: 'link', link_url: 'https://a.org' }],
      names: new Map([['s1', 'Ana'], ['s2', 'Ben']]),
    });
    expect(rows.find(r => r.student_id === 's1').attachment).toBeNull();
    expect(rows.find(r => r.student_id === 's2').attachment).toMatchObject({ kind: 'link' });
  });
});
