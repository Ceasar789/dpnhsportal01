// @vitest-environment jsdom
// X2: Worksheets create for a teacher whose only teaching-load row is an old
// Grade 11 row. The row is ignored (no crash), so the teacher sees the same
// friendly no-load text as a teacher with no load, and Create stays off.
// Supabase is a fake that answers per table (same shape as
// WorksheetsTab.noTeachingLoad.test.jsx).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import WorksheetsTab from './WorksheetsTab';

const { insert } = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'synthetic-teacher' } }) }));
vi.mock('../../../../config/supabase', () => ({
  supabase: {
    from: (table) => {
      const rows = {
        teacher_subjects: [{ subject_id: 'eng', grade_level: 'Grade 11', subjects: { id: 'eng', name: 'English' } }],
        schedules: [], sections: [], worksheet_sections: [], task_assignees: [],
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
    storage: { from: () => ({ upload: vi.fn() }) },
  },
}));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: (query) => query() }));
vi.mock('../worksheets/useDialogSafety', () => ({ default: () => ({ requestClose: vi.fn(), routeBlocker: null, busyNotice: '' }) }));
vi.mock('../worksheets/DistributeModal', () => ({ default: () => null }));
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: () => null }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: () => null }));

function Harness() {
  const [manualDrafts, setManualDrafts] = useState([]);
  return <WorksheetsTab manualDrafts={manualDrafts} onCreateManualDraft={draft => setManualDrafts([draft])}
    onDiscardManualDraft={() => setManualDrafts([])} />;
}

afterEach(() => { cleanup(); insert.mockReset(); });

describe('Worksheets create with only an old Grade 11 load row', () => {
  it('ignores the row, shows the friendly no-load text and never inserts', async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByText('Previously saved worksheet')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Worksheet' }));
    const dialog = screen.getByRole('dialog', { name: 'Create Worksheet' });
    expect(within(dialog).getByText(/No subject is assigned for this school year\. Ask your admin/)).toBeTruthy();
    expect(within(dialog).queryByText(/Grade 11/)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Blocked task' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create worksheet' }));
    expect(within(dialog).getAllByText('Choose the subject and grade from your teaching load.').length).toBeGreaterThan(0);
    expect(insert).not.toHaveBeenCalled();
  });
});
