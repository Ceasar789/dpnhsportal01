// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WorksheetsTab from './WorksheetsTab';

const { db, auth } = vi.hoisted(() => ({ db: { rows: [] }, auth: { userData: { uid: 'teacher-1' } } }));
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
    assigneeCounts: {}, firstAssignedAt: {}, assigneeCountsLoading: false, assigneeCountsError: false };
  return { useWorksheetAssessment: () => base };
});
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: () => null }));
vi.mock('../worksheets/DistributeModal', () => ({ default: () => null }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: () => null }));

const ai = { id: 'a', title: 'AI worksheet', subject: 'English', origin: 'ai_generated', items: 5 };
const day = { id: 'd', title: 'Day quiz', subject: 'Science', origin: 'manual', source_lesson_plan_id: 'p1', collection_id: null, task_type: 'quiz', items: 10 };
const hand = { id: 'h', title: 'Hand quiz', subject: 'English', origin: 'manual', source_lesson_plan_id: null, collection_id: null, task_type: 'quiz', items: 3 };
const collectionDay = { id: 'c', title: 'Monday collection day', subject: 'English', origin: 'ai_generated',
  source_lesson_plan_id: 'p2', collection_id: 'c1', day_of_week: 1, items: 5 };

beforeEach(() => { db.rows = [ai, day, hand, collectionDay]; });
afterEach(cleanup);

const show = async () => {
  render(<WorksheetsTab />);
  await screen.findByRole('heading', { name: 'AI worksheet' });
};
const source = name => within(screen.getByRole('group', { name: 'Filter worksheets by source' })).getByRole('button', { name });
const subject = name => within(screen.getByRole('group', { name: 'Filter worksheets by subject' })).getByRole('button', { name });
const cards = () => ['AI worksheet', 'Day quiz', 'Hand quiz', 'Monday collection day']
  .filter(title => screen.queryByRole('heading', { name: title }));
const badgeOf = title => screen.getByRole('heading', { name: title }).parentElement.textContent;

describe('Source filter', () => {
  it('starts at All and shows every card', async () => {
    await show();
    expect(source('All').getAttribute('aria-pressed')).toBe('true');
    expect(cards()).toEqual(['AI worksheet', 'Day quiz', 'Hand quiz']);
  });

  it('AI-generated shows AI rows and day tasks only', async () => {
    await show();
    fireEvent.click(source('AI-generated'));
    expect(source('AI-generated').getAttribute('aria-pressed')).toBe('true');
    expect(cards()).toEqual(['AI worksheet', 'Day quiz']);
  });

  it('Manual shows Create Worksheet rows only', async () => {
    await show();
    fireEvent.click(source('Manual'));
    expect(cards()).toEqual(['Hand quiz']);
    fireEvent.click(source('All'));
    expect(cards()).toEqual(['AI worksheet', 'Day quiz', 'Hand quiz']);
  });

  it('combines with the subject filter', async () => {
    await show();
    fireEvent.click(subject('English'));
    fireEvent.click(source('AI-generated'));
    expect(cards()).toEqual(['AI worksheet']);
    fireEvent.click(source('Manual'));
    expect(cards()).toEqual(['Hand quiz']);
  });

  it('combines with search', async () => {
    await show();
    fireEvent.change(screen.getByLabelText('Search worksheets'), { target: { value: 'quiz' } });
    fireEvent.click(source('AI-generated'));
    expect(cards()).toEqual(['Day quiz']);
  });

  it('shows the empty state when nothing matches', async () => {
    await show();
    fireEvent.click(subject('Science'));
    fireEvent.click(source('Manual'));
    expect(cards()).toEqual([]);
    expect(screen.getByText('No worksheets match your search, subject or source filter.')).toBeTruthy();
  });

  it('never turns a weekly collection day into a card', async () => {
    await show();
    for (const name of ['All', 'AI-generated', 'Manual']) {
      fireEvent.click(source(name));
      expect(screen.queryByRole('heading', { name: 'Monday collection day' })).toBeNull();
    }
  });

  it('leaves the subject filter alone when Source is All', async () => {
    await show();
    fireEvent.click(subject('Science'));
    expect(cards()).toEqual(['Day quiz']);
    expect(subject('Science').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Source badge', () => {
  it('shows AI-generated or Manual on each card', async () => {
    await show();
    expect(badgeOf('AI worksheet')).toContain('AI-generated');
    expect(badgeOf('Day quiz')).toContain('AI-generated');
    expect(badgeOf('Hand quiz')).toContain('Manual');
    expect(badgeOf('Hand quiz')).not.toContain('AI-generated');
  });

  it('keeps the existing distribution badge', async () => {
    await show();
    expect(badgeOf('Hand quiz')).toContain('Not distributed');
  });

  it('a title with an HTML tag renders as plain text', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    db.rows = [{ ...ai, title: `T ${attack}` }];
    render(<WorksheetsTab />);
    expect(await screen.findByRole('heading', { name: `T ${attack}` })).toBeTruthy();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});
