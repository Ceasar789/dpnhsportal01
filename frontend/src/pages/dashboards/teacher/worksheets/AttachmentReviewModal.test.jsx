// @vitest-environment jsdom
// S4: the teacher's file/link review dialog, every state and action, with the reads and the RPC mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const dialog = () => screen.getByRole('dialog', { name: 'Submissions — Poster' });
const list = () => screen.getByRole('list', { name: 'Students' });
const pick = async (name) => {
  const students = await screen.findByRole('list', { name: 'Students' });
  fireEvent.click(within(students).getByRole('button', { name: new RegExp(`^${name}`) }));
};
const rowPill = name => within(within(list()).getByRole('button', { name: new RegExp(`^${name}`) })).getAllByText(/./)[1].textContent;
const okGrade = (over = {}) => ({ ok: true, submission: { score: 9, total_points: 10, released: false, status: 'checked', remarks: null, ...over } });

beforeEach(() => { Object.values(api).forEach(fn => fn.mockReset()); api.loadReview.mockResolvedValue(review()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('loading, errors and empty', () => {
  it('a skeleton and a status while loading; reads this task once', () => {
    api.loadReview.mockReturnValue(new Promise(() => {}));
    const { container } = show();
    expect(screen.getByRole('status').textContent).toBe('Loading submissions…');
    expect(container.ownerDocument.querySelector('[data-skeleton]')).toBeTruthy();
    expect(api.loadReview).toHaveBeenCalledWith({ taskId: 'task-1' });
  });

  it('a failed load offers Retry, which reads again', async () => {
    api.loadReview.mockResolvedValueOnce(null);
    show();
    expect((await screen.findByRole('alert')).textContent).toBe('Submissions could not be loaded. Check your connection.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await within(dialog()).findByRole('list', { name: 'Students' })).toBeTruthy();
    expect(api.loadReview).toHaveBeenCalledTimes(2);
  });

  it('not distributed yet', async () => {
    api.loadReview.mockResolvedValue({ roster: [], submissions: [], attachments: [], names: new Map() });
    show();
    expect(await screen.findByText('No students have this task yet. Distribute it from Worksheets.')).toBeTruthy();
  });
});

describe('the list', () => {
  it('every student with an exact status, and filter chips with counts', async () => {
    show();
    await within(dialog()).findByRole('list', { name: 'Students' });
    expect(['Ana', 'Ben', 'Cris', 'Dina', 'Emil', 'Fe'].map(rowPill)).toEqual(['Not submitted', 'Not submitted', 'Turned in', 'Late', 'Graded', 'Returned']);
    const chips = within(screen.getByRole('group', { name: 'Filter submissions' })).getAllByRole('button').map(b => b.textContent.replace(/\s+/g, ' '));
    expect(chips).toEqual(['All (6)', 'Submitted (2)', 'Not submitted (2)', 'Graded (2)', 'Late (1)']);
    expect(screen.getByText('File or link · 10 points')).toBeTruthy();
  });

  it('filters and search narrow the list', async () => {
    show();
    await within(dialog()).findByRole('list', { name: 'Students' });
    fireEvent.click(screen.getByRole('button', { name: /^Graded/ }));
    expect(within(list()).getAllByRole('button').map(b => b.textContent)).toEqual(['EmilGraded', 'FeReturned']);
    expect(screen.getByRole('button', { name: /^Graded/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    fireEvent.change(screen.getByLabelText('Search students'), { target: { value: 'din' } });
    expect(within(list()).getAllByRole('button')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search students'), { target: { value: 'zzz' } });
    expect(screen.getByText('No students match.')).toBeTruthy();
  });
});

describe('a student who has not turned in', () => {
  it('a draft is never shown or opened: no file name, no Open, no score', async () => {
    show();
    await pick('Ben');
    expect(screen.getByText('Not turned in yet.')).toBeTruthy();
    expect(screen.queryByText('secret-draft.pdf')).toBeNull();
    expect(screen.queryByRole('button', { name: /Open/ })).toBeNull();
    expect(screen.queryByLabelText(/Score/)).toBeNull();
  });
});

describe('a turned-in student', () => {
  it('shows the work, the note, the time; empty score and feedback; Save and Return', async () => {
    show();
    await pick('Cris');
    expect(screen.getByRole('heading', { name: 'Cris' })).toBe(document.activeElement);
    expect(screen.getByText('poster.pdf')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(screen.getByText('Page 2 has the diagram.')).toBeTruthy();
    expect(screen.getByText(/^Turned in Nov 13, 2026/)).toBeTruthy();
    expect(screen.getByLabelText('Score (out of 10)').value).toBe('');
    expect(screen.getByLabelText('Feedback (optional)').value).toBe('');
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Return to student' })).toBeTruthy();
  });

  it('an invalid score is an inline alert tied to the field, and nothing is sent', async () => {
    show();
    await pick('Cris');
    fireEvent.change(screen.getByLabelText('Score (out of 10)'), { target: { value: '10.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Enter a score from 0 to 10 with at most 2 decimals.');
    const input = screen.getByLabelText('Score (out of 10)');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
    expect(api.gradeSubmission).not.toHaveBeenCalled();
  });

  it('Save (Enter in the score): the list changes only after success, from the returned values', async () => {
    let finish;
    api.gradeSubmission.mockReturnValue(new Promise((r) => { finish = r; }));
    show();
    await pick('Cris');
    fireEvent.change(screen.getByLabelText('Score (out of 10)'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Feedback (optional)'), { target: { value: 'Clear labels.' } });
    fireEvent.submit(screen.getByLabelText('Score (out of 10)').closest('form'));
    expect(api.gradeSubmission).toHaveBeenCalledWith({ submissionId: 'sub-3', score: '9', feedback: 'Clear labels.', release: false, max: 10 });
    expect(rowPill('Cris')).toBe('Turned in');
    await act(async () => { finish(okGrade({ score: 8.5, remarks: 'Clear labels.' })); });
    expect(rowPill('Cris')).toBe('Graded');
    expect(screen.getByLabelText('Score (out of 10)').value).toBe('8.5');
    expect(screen.getByRole('status').textContent).toBe('Saved.');
  });

  it('a double click on Return sends once', async () => {
    let finish;
    api.gradeSubmission.mockReturnValue(new Promise((r) => { finish = r; }));
    show();
    await pick('Cris');
    fireEvent.change(screen.getByLabelText('Score (out of 10)'), { target: { value: '9' } });
    const ret = screen.getByRole('button', { name: 'Return to student' });
    fireEvent.click(ret); fireEvent.click(ret); fireEvent.click(ret);
    expect(api.gradeSubmission).toHaveBeenCalledTimes(1);
    expect(api.gradeSubmission.mock.calls[0][0].release).toBe(true);
    await act(async () => { finish(okGrade({ released: true })); });
    expect(rowPill('Cris')).toBe('Returned');
    expect(screen.getByRole('status').textContent).toBe('Returned to Cris.');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Return to student' })).toBeNull();
  });

  it('an RPC error is shown as given and changes nothing', async () => {
    api.gradeSubmission.mockResolvedValue({ ok: false, error: 'This submission is no longer available to you. Refresh and try again.' });
    show();
    await pick('Cris');
    fireEvent.change(screen.getByLabelText('Score (out of 10)'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Return to student' }));
    expect((await screen.findByRole('alert')).textContent).toBe('This submission is no longer available to you. Refresh and try again.');
    expect(rowPill('Cris')).toBe('Turned in');
    expect(screen.getByLabelText('Score (out of 10)').value).toBe('9');
  });

  it('a late turn-in shows Late in the list and the detail', async () => {
    show();
    await pick('Dina');
    expect(within(screen.getByRole('region', { name: 'Dina' })).getByText('Late')).toBeTruthy();
    expect(screen.getByText('docs.example.org')).toBeTruthy();
  });
});

describe('graded and returned', () => {
  it('graded: score and feedback filled in; Save and Return', async () => {
    show();
    await pick('Emil');
    expect(screen.getByLabelText('Score (out of 10)').value).toBe('8');
    expect(screen.getByLabelText('Feedback (optional)').value).toBe('Neat work.');
    expect(screen.getByRole('button', { name: 'Return to student' })).toBeTruthy();
  });

  it('returned: only Save changes, which keeps it returned', async () => {
    api.gradeSubmission.mockResolvedValue(okGrade({ score: 10, released: true }));
    show();
    await pick('Fe');
    expect(screen.queryByRole('button', { name: 'Return to student' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Score (out of 10)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved. Still returned to the student.'));
    expect(api.gradeSubmission.mock.calls[0][0].release).toBe(false);
    expect(rowPill('Fe')).toBe('Returned');
  });
});

describe('the unsaved-changes guard', () => {
  const typeScore = () => fireEvent.change(screen.getByLabelText('Score (out of 10)'), { target: { value: '7' } });

  it('switching student asks first; Cancel stays, Discard switches', async () => {
    show();
    await pick('Cris');
    typeScore();
    await pick('Dina');
    const confirm = screen.getByRole('dialog', { name: 'Unsaved changes' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Cris' })).toBeTruthy();
    expect(screen.getByLabelText('Score (out of 10)').value).toBe('7');
    await pick('Dina');
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Unsaved changes' })).getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByRole('heading', { name: 'Dina' })).toBeTruthy();
  });

  it.each([
    ['the close button', () => fireEvent.click(screen.getByRole('button', { name: 'Close Submissions — Poster' }))],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['the backdrop', () => { const overlay = dialog().parentElement; fireEvent.mouseDown(overlay); fireEvent.click(overlay); }],
  ])('%s asks before closing with unsaved changes', async (_name, close) => {
    show();
    await pick('Cris');
    typeScore();
    close();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Unsaved changes' })).getByRole('button', { name: 'Discard changes' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('nothing changed: closing goes straight through', async () => {
    show();
    await pick('Cris');
    fireEvent.click(screen.getByRole('button', { name: 'Close Submissions — Poster' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('opening the work', () => {
  const anchors = () => {
    const seen = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { seen.push({ href: this.href, target: this.target, rel: this.rel }); });
    return seen;
  };

  it('a file through a signed URL in a new tab (noopener noreferrer) with the fallback link; never logged', async () => {
    const seen = anchors();
    const log = vi.spyOn(console, 'log');
    api.signedOwnFileUrl.mockResolvedValue('https://x.invalid/sign/poster.pdf?token=secret');
    show();
    await pick('Cris');
    fireEvent.click(screen.getByRole('button', { name: 'Open file' }));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toEqual({ href: 'https://x.invalid/sign/poster.pdf?token=secret', target: '_blank', rel: 'noopener noreferrer' });
    expect(api.signedOwnFileUrl).toHaveBeenCalledWith({ current: fileWork });
    expect(screen.getByRole('link', { name: 'Open file' }).getAttribute('rel')).toBe('noopener noreferrer');
    expect(log.mock.calls.flat().join(' ')).not.toContain('token');
  });

  it('switching student drops the fallback link', async () => {
    anchors();
    api.signedOwnFileUrl.mockResolvedValue('https://x.invalid/sign/poster.pdf?token=secret');
    show();
    await pick('Cris');
    fireEvent.click(screen.getByRole('button', { name: 'Open file' }));
    await screen.findByRole('link', { name: 'Open file' });
    await pick('Dina');
    expect(screen.queryByRole('link', { name: 'Open file' })).toBeNull();
  });

  it('a link opens directly; a failed signed URL says so', async () => {
    const seen = anchors();
    api.signedOwnFileUrl.mockResolvedValue(null);
    show();
    await pick('Dina');
    fireEvent.click(screen.getByRole('button', { name: 'Open link' }));
    expect(seen).toEqual([{ href: 'https://docs.example.org/poster', target: '_blank', rel: 'noopener noreferrer' }]);
    await pick('Cris');
    fireEvent.click(screen.getByRole('button', { name: 'Open file' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The file could not be opened. Try again.');
  });
});
