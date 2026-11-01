// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useWorksheetAssessment } from './useWorksheetAssessment';
import CheckSubmissionsModal from './CheckSubmissionsModal';

const { rpc, from, writes } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), writes: [] }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1' } }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: {
    rpc,
    from: from.mockImplementation(table => {
      const query = {
        select: () => query, eq: () => query, in: () => query, range: () => query,
        single: () => Promise.resolve({ data: table === 'school_settings'
          ? { school_year: '2030-2031' } : null, error: null }),
        then: resolve => Promise.resolve({ data: [], error: null }).then(resolve),
        insert: () => { writes.push('insert'); return Promise.resolve({ error: null }); },
        update: () => { writes.push('update'); return query; },
        upsert: () => { writes.push('upsert'); return Promise.resolve({ error: null }); },
        delete: () => { writes.push('delete'); return query; },
      };
      return query;
    }),
  },
}));
vi.mock('../hooks', () => ({ useTheme: () => ({ dark: false }) }));
vi.mock('../shared/ui', () => ({
  Modal: ({ children, title }) => <div role="dialog" aria-label={title}>{children}</div>,
  Btn: ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock('./useDialogSafety', () => ({
  default: () => ({ requestClose: vi.fn(), routeBlocker: null, busyNotice: null }),
}));

const unconfirmed = 'Could not confirm the release. Check the submission and try again.';
const marks = [
  { item_id: 'item-1', isCorrect: true, pointsEarned: 2 },
  { item_id: 'item-2', isCorrect: false, pointsEarned: 1.5 },
];
const args = ['submission-1', 'worksheet-1', 3.5, 5, marks];

beforeEach(() => { rpc.mockReset(); from.mockClear(); writes.length = 0; });
afterEach(() => cleanup());

const assessment = async () => {
  const toast = vi.fn();
  const view = renderHook(() => useWorksheetAssessment(toast));
  await waitFor(() => expect(view.result.current.subjectLoading).toBe(false));
  return { ...view, toast };
};

describe('transactional score release', () => {
  it('sends two item marks to one RPC, returns success, and makes no table write', async () => {
    rpc.mockResolvedValue({ data: { ok: true, submissionId: 'submission-1', score: 3.5, totalPoints: 5 }, error: null });
    const { result, toast } = await assessment();
    expect(await result.current.releaseScore(...args)).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('eduscribe_worksheet_score_release_v1', {
      p_submission_id: 'submission-1',
      p_marks: [{ itemId: 'item-1', points: 2 }, { itemId: 'item-2', points: 1.5 }],
    });
    expect(writes).toEqual([]);
    expect(toast).toHaveBeenCalledWith('Score released to the student');
  });

  it('accepts the canonical UUID returned for an uppercase submission ID', async () => {
    const upper = 'A0000000-0000-4000-8000-000000000001';
    rpc.mockResolvedValue({ data: { ok: true, submissionId: upper.toLowerCase(), score: 3.5, totalPoints: 5 }, error: null });
    const { result } = await assessment();
    expect(await result.current.releaseScore(upper, 'worksheet-1', 3.5, 5, marks)).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['not_authenticated', 'Your session has ended. Sign in again before releasing this score.'],
    ['not_found', 'This submission is no longer available to you. Refresh and try again.'],
    ['invalid_state', 'This submission is not ready for score release. Refresh and review its status.'],
    ['invalid_marks', 'One or more item scores are invalid. Review every mark and try again.'],
  ])('maps %s to a fixed toast', async (message, toastText) => {
    rpc.mockResolvedValue({ data: null, error: { message } });
    const { result, toast } = await assessment();
    expect(await result.current.releaseScore(...args)).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(toastText, 'error');
    expect(writes).toEqual([]);
  });

  it('treats a network error as unconfirmed without retrying', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    const { result, toast } = await assessment();
    expect(await result.current.releaseScore(...args)).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(unconfirmed, 'error');
  });

  it('treats an unrecognized error name as unconfirmed', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'constructor' } });
    const { result, toast } = await assessment();
    expect(await result.current.releaseScore(...args)).toBe(false);
    expect(toast).toHaveBeenCalledWith(unconfirmed, 'error');
  });

  it('treats a thrown error as unconfirmed without retrying', async () => {
    rpc.mockRejectedValue(new Error('offline'));
    const { result, toast } = await assessment();
    expect(await result.current.releaseScore(...args)).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(unconfirmed, 'error');
    expect(writes).toEqual([]);
  });

  it('treats a missing receipt as unconfirmed', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { result, toast } = await assessment();
    expect(await result.current.releaseScore(...args)).toBe(false);
    expect(toast).toHaveBeenCalledWith(unconfirmed, 'error');
  });

  it('keeps paper score encoding unavailable without a call or write', async () => {
    const { result } = await assessment();
    expect(await result.current.encodeManualScore('worksheet-1', 'section-1', 'student-1', 2, 5))
      .toMatchObject({ ok: false, reason: 'unavailable' });
    expect(rpc).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('reloads the modal submission list after a confirmed release', async () => {
    const initial = { id: 'submission-1', name: 'Synthetic learner', status: 'submitted', released: false };
    const loadSubmissions = vi.fn()
      .mockResolvedValueOnce([initial])
      .mockResolvedValueOnce([{ ...initial, status: 'checked', released: true, score: 5, total_points: 5 }]);
    const releaseScore = vi.fn().mockResolvedValue(true);
    render(<CheckSubmissionsModal
      worksheet={{ id: 'worksheet-1', title: 'Synthetic worksheet', checking_mode: 'manual' }}
      loadItems={vi.fn().mockResolvedValue({ items: [
        { id: 'item-1', item_type: 'identification', points: 2, question: 'Synthetic item one' },
        { id: 'item-2', item_type: 'identification', points: 3, question: 'Synthetic item two' },
      ], keys: {} })}
      loadSubmissions={loadSubmissions}
      loadAnswers={vi.fn().mockResolvedValue({ answers: {}, prior: {} })}
      releaseScore={releaseScore} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check' }));
    fireEvent.change(await screen.findByLabelText('Score for question 1'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Score for question 2'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve review locally' }));
    fireEvent.click(screen.getByRole('button', { name: 'Release result' }));
    await waitFor(() => expect(loadSubmissions).toHaveBeenCalledTimes(2));
    expect(loadSubmissions).toHaveBeenNthCalledWith(2, 'worksheet-1');
    expect(releaseScore).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Released — 5/5')).toBeTruthy();
  });
});
