// @vitest-environment jsdom
// S4: the teacher's file/link review dialog, every state and action, with the reads and the RPC mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ loadReview: vi.fn(), gradeSubmission: vi.fn(), signedOwnFileUrl: vi.fn() }));
vi.mock('./attachmentReviewApi', () => ({ loadReview: api.loadReview, gradeSubmission: api.gradeSubmission }));
vi.mock('../../student/submissions/attachmentApi', () => ({ signedOwnFileUrl: api.signedOwnFileUrl }));

import AttachmentReviewModal from './AttachmentReviewModal';

const task = { id: 'task-1', title: 'Poster', submission_mode: 'attachment', max_points: 10 };
const fileWork = { submission_id: 'sub-3', kind: 'file', file_path: 'p/t/x-poster.pdf', file_name: 'poster.pdf', size_bytes: 2048, note: 'Page 2 has the diagram.' };
const linkWork = { submission_id: 'sub-4', kind: 'link', link_url: 'https://docs.example.org/poster', note: null };
const review = () => ({
  roster: ['s1', 's2', 's3', 's4', 's5', 's6'].map(id => ({ student_id: id, section_id: 'sec' })),
  submissions: [
    { id: 'sub-2', student_id: 's2', status: 'in_progress', released: false, is_late: false },
    { id: 'sub-3', student_id: 's3', status: 'submitted', released: false, is_late: false, submitted_at: '2026-11-13 16:45:00' },
    { id: 'sub-4', student_id: 's4', status: 'submitted', released: false, is_late: true, submitted_at: '2026-11-14 09:00:00' },
    { id: 'sub-5', student_id: 's5', status: 'checked', released: false, is_late: false, score: 8, total_points: 10, remarks: 'Neat work.' },
    { id: 'sub-6', student_id: 's6', status: 'checked', released: true, is_late: false, score: 9, total_points: 10, remarks: 'Great.' },
  ],
  // The draft's attachment is here on purpose: it must never be shown.
  attachments: [fileWork, linkWork, { submission_id: 'sub-2', kind: 'file', file_name: 'secret-draft.pdf', file_path: 'p/t/d.pdf' },
    { submission_id: 'sub-5', kind: 'file', file_name: 'graded.pdf', file_path: 'p/t/g.pdf', size_bytes: 10 },
    { submission_id: 'sub-6', kind: 'file', file_name: 'returned.pdf', file_path: 'p/t/r.pdf', size_bytes: 10 }],
  names: new Map([['s1', 'Ana'], ['s2', 'Ben'], ['s3', 'Cris'], ['s4', 'Dina'], ['s5', 'Emil'], ['s6', 'Fe']]),
});

let onClose;
const show = () => {
  onClose = vi.fn();
  return render(<MemoryRouter><AttachmentReviewModal worksheet={task} onClose={onClose} /></MemoryRouter>);
};
const pick = async (name) => {
  const students = await screen.findByRole('list', { name: 'Students' });
  fireEvent.click(within(students).getByRole('button', { name: new RegExp(`^${name}`) }));
};
const okGrade = (over = {}) => ({ ok: true, submission: { score: 9, total_points: 10, released: false, status: 'checked', remarks: null, ...over } });

beforeEach(() => { Object.values(api).forEach(fn => fn.mockReset()); api.loadReview.mockResolvedValue(review()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// S5: the busy Save/Return button keeps focus (aria-disabled, not disabled) and
// a second press sends nothing; after Return (the button is gone) focus is on the student heading.
describe('S5 review: busy buttons and focus', () => {
  it('while saving, Save stays focusable and a second press sends nothing', async () => {
    let finish;
    api.gradeSubmission.mockReturnValue(new Promise((r) => { finish = r; }));
    show();
    await pick('Cris');
    fireEvent.change(screen.getByLabelText(/^Score/), { target: { value: '9' } });
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    fireEvent.click(save);
    const busy = await screen.findByRole('button', { name: 'Saving…' });
    expect(busy.disabled).toBe(false);
    expect(busy.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(busy);
    fireEvent.click(busy);
    fireEvent.click(screen.getByRole('button', { name: 'Return to student' }));
    expect(api.gradeSubmission).toHaveBeenCalledTimes(1);
    await act(async () => { finish(okGrade()); });
  });

  it('after Return to student, focus is on the student heading', async () => {
    api.gradeSubmission.mockResolvedValue(okGrade({ released: true }));
    show();
    await pick('Cris');
    fireEvent.change(screen.getByLabelText(/^Score/), { target: { value: '9' } });
    const ret = screen.getByRole('button', { name: 'Return to student' });
    ret.focus();
    expect(document.activeElement).toBe(ret);
    fireEvent.click(ret);
    await screen.findByText('Returned to Cris.');
    expect(screen.queryByRole('button', { name: 'Return to student' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Cris' }));
  });
});
