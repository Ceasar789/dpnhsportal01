// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SavedArchivedList from './SavedArchivedList';
import WorksheetsTab from '../tabs/WorksheetsTab';

const { archive, update, remove, rows, collections, userData } = vi.hoisted(() => ({
  archive: vi.fn(), update: vi.fn(), remove: vi.fn(), rows: { value: [] },
  collections: { value: [] }, userData: { uid: '00000002-1111-4111-8111-111111111111' },
}));
vi.mock('../persistence/aiWeeklyWorksheetManageClient', () => ({
  archiveAiWeeklyCollection: archive, updateAiWeeklyCollection: update,
  deleteAiWeeklyCollection: remove,
}));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData }) }));
vi.mock('../../../../config/supabase', () => ({ supabase: { from: table => {
  const query = { select: () => query, eq: () => query, order: () => query, in: () => query,
    then: resolve => Promise.resolve({ data: table === 'worksheets' ? rows.value : collections.value,
      error: null }).then(resolve) };
  return query;
} } }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('./useWorksheetAssessment', () => ({ useWorksheetAssessment: () => ({
  mySubjects: [], schoolYear: '2030-2031', subjectLoading: false, subjectError: false,
  assigneeCounts: {}, assigneeCountsLoading: false, assigneeCountsError: false,
  postings: [], postingsError: false, fetchMySubject: vi.fn(), fetchAssigneeCounts: vi.fn(),
  fetchPostings: vi.fn(),
}) }));

const archivedId = '00000001-1111-4111-8111-111111111111';
const currentId = '00000003-1111-4111-8111-111111111111';
const group = { id: archivedId, title: 'Archived week', revision: '2' };
const apiBase = 'http://localhost:3001';

beforeEach(() => {
  vi.stubEnv('DEV', true);
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  archive.mockReset().mockResolvedValue({ status: 'saved', code: null, message: '', receipt: {} });
  update.mockReset(); remove.mockReset();
  rows.value = [
    { id: 'archived-day', collection_id: archivedId, day_of_week: 1, title: 'Archived Monday',
      teacher_id: userData.uid, items: 1, origin: 'ai_generated' },
    { id: 'current-day', collection_id: currentId, day_of_week: 1, title: 'Current Monday',
      teacher_id: userData.uid, items: 1, origin: 'ai_generated' },
  ];
  collections.value = [
    { id: archivedId, title: 'Archived week', revision: 2, archived_at: '2030-01-01T00:00:00Z' },
    { id: currentId, title: 'Current week', revision: 1, archived_at: null },
  ];
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it('hides archived collections from main cards and restores them from Show archived', async () => {
  archive.mockImplementation(async () => {
    collections.value = collections.value.map(row => row.id === archivedId
      ? { ...row, revision: 3, archived_at: null } : row);
    return { status: 'saved', code: null, message: '', receipt: {} };
  });
  render(<WorksheetsTab jobClient={{ enabled: false }} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Show archived (1)' })).toBeTruthy());
  expect(screen.getAllByRole('region', { name: 'Weekly Worksheet Collection' })).toHaveLength(1);
  expect(screen.queryByText('Archived week')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show archived (1)' }));
  expect(screen.getByText('Archived week')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  await waitFor(() => expect(archive).toHaveBeenCalledWith(expect.any(String), {
    collectionId: archivedId, expectedRevision: 2, archived: false,
  }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Hide archived (0)' })).toBeTruthy());
  expect(screen.getAllByRole('region', { name: 'Weekly Worksheet Collection' })).toHaveLength(2);
});

it('keeps Restore disabled through an unknown result until refresh finishes', async () => {
  let finishRefresh;
  const onCollectionChanged = vi.fn(() => new Promise(resolve => { finishRefresh = resolve; }));
  archive.mockResolvedValue({ status: 'unknown', code: null,
    message: 'Could not confirm the change. Reload the collection before trying again.', receipt: null });
  render(<SavedArchivedList groups={[group]} apiBase={apiBase} onCollectionChanged={onCollectionChanged} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show archived (1)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  expect(await screen.findByText(/Could not confirm the change/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Restore' }).disabled).toBe(true);
  expect(onCollectionChanged).toHaveBeenCalledTimes(1);
  finishRefresh();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Restore' }).disabled).toBe(false));
});

it('shows a fixed failed message and refreshes without retrying Restore', async () => {
  const onCollectionChanged = vi.fn().mockResolvedValue();
  archive.mockResolvedValue({ status: 'failed', code: 'student_work_exists',
    message: 'This collection already has student work and cannot be changed.', receipt: null });
  render(<SavedArchivedList groups={[group]} apiBase={apiBase} onCollectionChanged={onCollectionChanged} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show archived (1)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
  expect(await screen.findByText('This collection already has student work and cannot be changed.')).toBeTruthy();
  expect(archive).toHaveBeenCalledTimes(1);
  expect(onCollectionChanged).toHaveBeenCalledTimes(1);
});

it('keeps the old read-only saved card and no archive controls with the flag off', async () => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '0');
  render(<WorksheetsTab jobClient={{ enabled: false }} />);
  const cards = await screen.findAllByRole('region', { name: 'Weekly Worksheet Collection' });
  expect(cards).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /Show archived/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Archive collection' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
  for (const card of cards) expect(within(card).getByRole('button', { name: 'Delete collection' }).disabled)
    .toBe(true);
});
