// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import WorksheetsTab from './WorksheetsTab';

const { tablesRead, insert, upload, teacher } = vi.hoisted(() => ({
  tablesRead: [], insert: vi.fn(), upload: vi.fn(), teacher: { uid: 'synthetic-teacher' },
}));

vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: teacher }) }));
vi.mock('../../../../config/supabase', () => ({
  supabase: {
    from: (table) => {
      tablesRead.push(table);
      const rows = {
        teacher_subjects: [], schedules: [], sections: [], worksheet_sections: [], task_assignees: [],
        school_settings: { school_year: '2030-2031' },
        worksheets: [{ id: 'saved-1', title: 'Previously saved worksheet', subject: 'English', pages: 2, items: 5 }],
      };
      if (!(table in rows)) throw new Error(`Unexpected table request: ${table}`);
      const query = {
        select: () => query, eq: () => query, order: () => query, range: () => query,
        single: () => Promise.resolve({ data: rows[table], error: null }),
        insert: (...args) => insert(...args),
        then: (resolve) => Promise.resolve({ data: rows[table], error: null }).then(resolve),
      };
      return query;
    },
    storage: { from: () => ({ upload }) },
  },
}));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: (query) => query() }));
vi.mock('../worksheets/useDialogSafety', () => ({ default: () => ({ requestClose: vi.fn(), routeBlocker: null, busyNotice: '' }) }));
vi.mock('../worksheets/DistributeModal', () => ({ default: () => null }));
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: ({ draft, manualEligibility, onClose }) => <section aria-label="Manual editor fixture">
  <p>{draft.title || 'Blank worksheet title'}</p>
  <p>{manualEligibility?.subjects.length} eligible subjects</p>
  <button onClick={onClose}>Back to list</button>
</section> }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: () => null }));

function Harness() {
  const [manualDrafts, setManualDrafts] = useState([]);
  return <WorksheetsTab manualDrafts={manualDrafts}
    onCreateManualDraft={draft => setManualDrafts([draft])}
    onDiscardManualDraft={draftId => setManualDrafts(current => current.filter(item => item.draftId !== draftId))} />;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tablesRead.length = 0;
  insert.mockReset();
  upload.mockReset();
});

describe('Worksheet Test 4 — no teaching load', () => {
  it('keeps saved worksheets visible and blocks create without an assigned subject', async () => {
    const network = vi.fn(() => { throw new Error('Unmocked external network request'); });
    vi.stubGlobal('fetch', network);
    const runtimeErrors = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<Harness />);
    await waitFor(() => expect(screen.getByText('Previously saved worksheet')).toBeTruthy());
    expect(tablesRead).toContain('teacher_subjects');
    expect(screen.queryByRole('combobox', { name: 'Teaching-load subject' })).toBeNull();

    expect(document.getElementById('worksheet-upload')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upload worksheet' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Create Worksheet' }));
    expect(screen.getByRole('region', { name: 'Manual editor fixture' })).toBeTruthy();
    expect(screen.getByText('0 eligible subjects')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    expect(screen.getByText('Previously saved worksheet')).toBeTruthy();
    expect(insert).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(runtimeErrors).not.toHaveBeenCalled();
  });
});
