// @vitest-environment jsdom
// 4c (design p4): Worksheets status filter All / Drafts / Saved / Distributed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WorksheetsTab from './WorksheetsTab';

const { db, auth, counts } = vi.hoisted(() => ({ db: { rows: [] }, auth: { userData: { uid: 'teacher-1' } },
  counts: { assigneeCounts: {}, assigneeCountsLoading: false, assigneeCountsError: false } }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  from: table => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      then: resolve => Promise.resolve({ data: table === 'worksheets' ? db.rows : [], error: null }).then(resolve),
    };
    return query;
  },
} }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../worksheets/useWorksheetAssessment', () => {
  const base = { mySubjects: [], schoolYear: '2030-2031', subjectLoading: false, subjectError: false,
    postings: [], postingsError: false, fetchMySubject: vi.fn(), fetchAssigneeCounts: vi.fn(), fetchPostings: vi.fn(),
    mySections: [], sectionsError: false, fetchMySections: vi.fn(), loadItems: vi.fn(), distributeTask: vi.fn(),
    firstAssignedAt: {} };
  return { useWorksheetAssessment: () => ({ ...base, ...counts }) };
});
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: () => null }));
vi.mock('../worksheets/DistributeModal', () => ({ default: () => null }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: () => null }));

const sent = { id: 's', title: 'Sent quiz', subject: 'English', origin: 'manual', source_lesson_plan_id: null, collection_id: null, task_type: 'quiz', items: 3 };
const kept = { id: 'k', title: 'Kept quiz', subject: 'English', origin: 'manual', source_lesson_plan_id: null, collection_id: null, task_type: 'quiz', items: 3 };

beforeEach(() => {
  db.rows = [sent, kept];
  Object.assign(counts, { assigneeCounts: { s: 12 }, assigneeCountsLoading: false, assigneeCountsError: false });
});
afterEach(cleanup);

const show = async () => {
  render(<WorksheetsTab />);
  await screen.findByRole('heading', { name: 'Sent quiz' });
};
const status = name => within(screen.getByRole('group', { name: 'Filter worksheets by status' })).getByRole('button', { name });
const cards = () => ['Sent quiz', 'Kept quiz'].filter(title => screen.queryByRole('heading', { name: title }));

describe('Status filter (4c)', () => {
  it('offers All, Drafts, Saved, Distributed and starts at All', async () => {
    await show();
    const group = screen.getByRole('group', { name: 'Filter worksheets by status' });
    expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['All', 'Drafts', 'Saved', 'Distributed']);
    expect(status('All').getAttribute('aria-pressed')).toBe('true');
    expect(cards()).toEqual(['Sent quiz', 'Kept quiz']);
  });

  it('Distributed shows assigned worksheets, Saved the rest, Drafts no saved card', async () => {
    await show();
    fireEvent.click(status('Distributed'));
    expect(status('Distributed').getAttribute('aria-pressed')).toBe('true');
    expect(cards()).toEqual(['Sent quiz']);
    fireEvent.click(status('Saved'));
    expect(cards()).toEqual(['Kept quiz']);
    fireEvent.click(status('Drafts'));
    expect(cards()).toEqual([]);
    fireEvent.click(status('All'));
    expect(cards()).toEqual(['Sent quiz', 'Kept quiz']);
  });

  it('with unknown counts nothing is hidden on a guess, and it says so', async () => {
    counts.assigneeCountsError = true;
    await show();
    fireEvent.click(status('Distributed'));
    expect(cards()).toEqual(['Sent quiz', 'Kept quiz']);
    expect(screen.getByText('Distribution counts are not available yet, so every saved worksheet is shown.')).toBeTruthy();
  });
});
