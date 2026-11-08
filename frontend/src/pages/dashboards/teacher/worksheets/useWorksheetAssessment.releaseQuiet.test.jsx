// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useWorksheetAssessment } from './useWorksheetAssessment';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1' } }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: {
    rpc,
    from: table => {
      const query = {
        select: () => query, eq: () => query, in: () => query, range: () => query,
        single: () => Promise.resolve({ data: table === 'school_settings' ? { school_year: '2030-2031' } : null, error: null }),
        then: resolve => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return query;
    },
  },
}));

const marks = [{ item_id: 'item-1', isCorrect: true, pointsEarned: 2 }];
const args = ['submission-1', 'worksheet-1', 2, 2, marks];

beforeEach(() => { rpc.mockReset(); });
afterEach(() => cleanup());

const mount = async () => {
  const toast = vi.fn();
  const view = renderHook(() => useWorksheetAssessment(toast));
  await waitFor(() => expect(view.result.current.subjectLoading).toBe(false));
  return { releaseScore: view.result.current.releaseScore, toast };
};

describe('releaseScore for the single Release button (unchanged)', () => {
  it('sends the same RPC, returns true and shows the success toast', async () => {
    rpc.mockResolvedValue({ data: { ok: true, submissionId: 'submission-1' }, error: null });
    const { releaseScore, toast } = await mount();
    expect(await releaseScore(...args)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('eduscribe_worksheet_score_release_v1',
      { p_submission_id: 'submission-1', p_marks: [{ itemId: 'item-1', points: 2 }] });
    expect(toast).toHaveBeenCalledWith('Score released to the student');
  });

  it('a refusal returns false with the friendly toast', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invalid_state' } });
    const { releaseScore, toast } = await mount();
    expect(await releaseScore(...args)).toBe(false);
    expect(toast).toHaveBeenCalledWith('This submission is not ready for score release. Refresh and review its status.', 'error');
  });
});

describe('releaseScore for Release all (quiet)', () => {
  it('sends the same RPC with no toast on success', async () => {
    rpc.mockResolvedValue({ data: { ok: true, submissionId: 'submission-1' }, error: null });
    const { releaseScore, toast } = await mount();
    expect(await releaseScore(...args, { quiet: true })).toBe(true);
    expect(rpc).toHaveBeenCalledWith('eduscribe_worksheet_score_release_v1',
      { p_submission_id: 'submission-1', p_marks: [{ itemId: 'item-1', points: 2 }] });
    expect(toast).not.toHaveBeenCalled();
  });

  it.each([
    ['a known code', { data: null, error: { message: 'not_found' } }, 'This submission is no longer available to you. Refresh and try again.'],
    ['an unknown database message', { data: null, error: { message: 'deadlock detected on relation 12345' } }, 'Could not confirm the release. Check the submission and try again.'],
    ['an unconfirmed receipt', { data: { ok: true, submissionId: 'other' }, error: null }, 'Could not confirm the release. Check the submission and try again.'],
  ])('%s gives the friendly reason to onFailure and shows no toast', async (_name, response, message) => {
    rpc.mockResolvedValue(response);
    const { releaseScore, toast } = await mount();
    const onFailure = vi.fn();
    expect(await releaseScore(...args, { quiet: true, onFailure })).toBe(false);
    expect(onFailure).toHaveBeenCalledWith(message);
    expect(toast).not.toHaveBeenCalled();
  });

  it('a thrown error gives the friendly reason', async () => {
    const { releaseScore } = await mount();
    rpc.mockRejectedValue(new Error('offline'));
    const onFailure = vi.fn();
    expect(await releaseScore(...args, { quiet: true, onFailure })).toBe(false);
    expect(onFailure).toHaveBeenCalledWith('Could not confirm the release. Check the submission and try again.');
  });
});
