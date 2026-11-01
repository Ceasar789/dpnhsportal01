// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import WorksheetsTab from './WorksheetsTab';

const { fixture, userData } = vi.hoisted(() => ({
  fixture: { worksheets: [], collections: [], collectionLookups: [] },
  userData: { uid: 'teacher-1' },
}));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData }) }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  from: table => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      in: (_column, ids) => { fixture.collectionLookups.push(ids); return query; },
      then: resolve => Promise.resolve({ data: table === 'worksheets' ? fixture.worksheets : fixture.collections,
        error: null }).then(resolve),
    };
    return query;
  },
} }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../worksheets/useWorksheetAssessment', () => ({ useWorksheetAssessment: () => ({
  mySubjects: [], schoolYear: '2030-2031', subjectLoading: false, subjectError: false,
  assigneeCounts: {}, assigneeCountsLoading: false, assigneeCountsError: false,
  postings: [], postingsError: false, fetchMySubject: vi.fn(), fetchAssigneeCounts: vi.fn(), fetchPostings: vi.fn(),
  loadItems: vi.fn().mockResolvedValue({ items: [{ id: 'saved-question-1', position: 1,
    question: 'Saved question', item_type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], points: 1 }], keys: {} }),
}) }));
vi.mock('../worksheets/useDialogSafety', () => ({ default: () => ({ requestClose: vi.fn(), routeBlocker: null, busyNotice: '' }) }));
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: () => <section aria-label="Mock full-page editor" /> }));
vi.mock('../worksheets/DistributeModal', () => ({ default: () => null }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: () => null }));

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const row = day => ({ id: `saved-${day}`, collection_id: 'db-week', day_of_week: day,
  title: `Saved ${days[day - 1]}`, subject: 'Filipino', grade_level: 'Grade 7', items: 10,
  origin: 'ai_generated', created_at: '2030-01-01T00:00:00.000Z' });
const local = [{ collectionId: 'local-week', title: 'Local week',
  sourceLessonPlan: { title: 'Source Lesson Plan' }, worksheets: [] }];
const savedState = { 'local-week': { status: 'saved', receipt: { collectionId: 'db-week', worksheets: [{ id: 'saved-1' }] } } };
const renderTab = props => render(<WorksheetsTab jobClient={{ enabled: false }} {...props} />);

beforeEach(() => { vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '0'); fixture.worksheets = []; fixture.collections = []; fixture.collectionLookups = []; });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe('saved weekly worksheet collections', () => {
  it('groups five saved rows in weekday order and removes their plain cards', async () => {
    fixture.worksheets = [row(5), row(3), row(1), row(4), row(2)];
    fixture.collections = [{ id: 'db-week', title: 'Filipino 7 - Weekly Worksheets' }];
    renderTab();
    const collection = await screen.findByRole('region', { name: 'Weekly Worksheet Collection' });
    await waitFor(() => expect(within(collection).getByText('Filipino 7 - Weekly Worksheets')).toBeTruthy());
    expect(within(collection).getByText('Filipino · Grade 7')).toBeTruthy();
    expect(fixture.collectionLookups).toEqual([['db-week']]);
    fireEvent.click(within(collection).getByRole('button', { name: 'Open weekly collection' }));
    expect(within(collection).getAllByRole('region', { name: / Worksheet$/ })
      .map(card => card.getAttribute('aria-label'))).toEqual(days.map(day => `${day} Worksheet`));
    for (const day of days) expect(screen.queryByRole('button', { name: `More actions for Saved ${day}` })).toBeNull();
  });

  it('previews a saved row and keeps shuffle and collection deletion disabled', async () => {
    fixture.worksheets = [row(1)];
    renderTab();
    const collection = await screen.findByRole('region', { name: 'Weekly Worksheet Collection' });
    expect(within(collection).getByText('Weekly Worksheets')).toBeTruthy();
    expect(within(collection).getByRole('button', { name: 'Delete collection' }).disabled).toBe(true);
    expect(within(collection).getByText('Saved collections cannot be deleted in this version.')).toBeTruthy();
    fireEvent.click(within(collection).getByRole('button', { name: 'Open weekly collection' }));
    expect(within(collection).getByRole('button', { name: 'Shuffle Questions' }).disabled).toBe(true);
    expect(within(collection).getByText('Saved worksheets are read-only in this version.')).toBeTruthy();
    fireEvent.click(within(collection).getByRole('button', { name: 'Preview Monday' }));
    expect(await screen.findByText('1 questions')).toBeTruthy();
    expect(screen.getByText('1. Saved question')).toBeTruthy();
  });

  it('hides a saved local card only while its receipt has an unfiltered DB group', async () => {
    fixture.worksheets = [row(1)];
    const first = renderTab({ weeklyCollections: local, weeklySaveStates: savedState });
    await screen.findByRole('region', { name: 'Weekly Worksheet Collection' });
    expect(screen.queryByText('Local week')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search worksheets'), { target: { value: 'no matching worksheet' } });
    expect(screen.queryByText('Local week')).toBeNull();
    first.unmount();

    fixture.worksheets = [{ ...row(1), id: 'invalid-day', day_of_week: null }];
    renderTab({ weeklyCollections: local, weeklySaveStates: savedState });
    await waitFor(() => expect(screen.getByText('Local week')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'More actions for Saved Monday' })).toBeTruthy();
  });
});
