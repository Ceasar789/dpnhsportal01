// @vitest-environment jsdom
// S3: the student's Your work panel, every state and action, with the API mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({
  loadYourWork: vi.fn(), ensureSubmission: vi.fn(), addAttachment: vi.fn(), replaceAttachment: vi.fn(),
  removeAttachment: vi.fn(), saveNote: vi.fn(), turnIn: vi.fn(), unsubmit: vi.fn(), signedOwnFileUrl: vi.fn(),
}));
vi.mock('./attachmentApi', () => api);
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'S' } }) }));

import YourWorkPanel from './YourWorkPanel';
import { MESSAGES } from './attachmentRules';

const FUTURE = '2099-01-15T23:59:00';
const PAST = '2000-01-15T23:59:00';
const sheet = { id: 'task-1', title: 'Poster', task_type: 'worksheet', items: 0, instructions: 'Make a poster.', submission_mode: 'attachment', max_points: 10 };
const fileRow = { id: 'att-1', kind: 'file', file_path: 'student-1/task-1/x-poster.pdf', file_name: 'poster.pdf', size_bytes: 2048, note: 'See page 2' };
const linkRow = { id: 'att-1', kind: 'link', link_url: 'https://docs.example.org/poster', note: null };
const sub = (over = {}) => ({ id: 'sub-1', status: 'in_progress', released: false, is_late: false, submitted_at: null, ...over });
const rowWith = (submission, due = FUTURE) => ({ sheet, assignee: { task_id: 'task-1', section_id: 'sec-1', due_at: due }, submission });

let toast; let changed; let guard;
const show = (row) => {
  toast = vi.fn(); changed = vi.fn(); guard = null;
  return render(<MemoryRouter><YourWorkPanel row={row} onChanged={changed} showToast={toast}
    registerLeaveGuard={(g) => { guard = g; }} /></MemoryRouter>);
};
const panel = () => screen.getByRole('region', { name: 'Your work' });
const loaded = attachment => api.loadYourWork.mockResolvedValue({ ok: true, attachment, feedback: null, feedbackFailed: false });

beforeEach(() => { Object.values(api).forEach(fn => fn.mockReset()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('A. no attachment yet', () => {
  it('no submission: nothing is read; File/Link switch, picker, note; no Turn in', () => {
    show(rowWith(null));
    expect(api.loadYourWork).not.toHaveBeenCalled();
    expect(within(panel()).getByText('Assigned')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'File' }).checked).toBe(true);
    expect(screen.getByRole('radio', { name: 'Link' })).toBeTruthy();
    expect(screen.getByLabelText('Note for your teacher (optional)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add file' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Turn in' })).toBeNull();
    expect(screen.getByText('Turn in becomes available after you add your work.')).toBeTruthy();
  });

  it('adds a link: starts the submission, adds it, then shows it with Turn in', async () => {
    api.ensureSubmission.mockResolvedValue({ ok: true, submission: sub() });
    api.addAttachment.mockResolvedValue({ ok: true, attachment: linkRow });
    show(rowWith(null));
    fireEvent.click(screen.getByRole('radio', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText('Link address'), { target: { value: 'https://docs.example.org/poster' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    expect(await screen.findByRole('button', { name: 'Turn in' })).toBeTruthy();
    expect(api.addAttachment).toHaveBeenCalledWith(expect.objectContaining({ kind: 'link', link: 'https://docs.example.org/poster',
      studentId: 'student-1', taskId: 'task-1', submission: sub() }));
    expect(screen.getByText('docs.example.org')).toBeTruthy();
    expect(toast).toHaveBeenCalledWith('Link added.');
    expect(changed).toHaveBeenCalled();
  });

  it('a refused link shows an inline alert tied to the field', async () => {
    api.ensureSubmission.mockResolvedValue({ ok: true, submission: sub() });
    api.addAttachment.mockResolvedValue({ ok: false, error: 'Enter a full link that starts with http:// or https://.', field: true });
    show(rowWith(null));
    fireEvent.click(screen.getByRole('radio', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText('Link address'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Enter a full link that starts with http:// or https://.');
    const input = screen.getByLabelText('Link address');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('a double click adds once', async () => {
    let finish;
    api.ensureSubmission.mockResolvedValue({ ok: true, submission: sub() });
    api.addAttachment.mockReturnValue(new Promise((r) => { finish = r; }));
    show(rowWith(null));
    fireEvent.click(screen.getByRole('radio', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText('Link address'), { target: { value: 'https://a.org' } });
    const add = screen.getByRole('button', { name: 'Add link' });
    fireEvent.click(add); fireEvent.click(add); fireEvent.click(add);
    await waitFor(() => expect(api.addAttachment).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Adding…' }).disabled).toBe(true);
    await act(async () => { finish({ ok: true, attachment: linkRow }); });
    expect(api.ensureSubmission).toHaveBeenCalledTimes(1);
  });

  it('past the due date: says the work will be marked late', () => {
    show(rowWith(null, PAST));
    expect(screen.getByText('The due date has passed. Your work will be marked late.')).toBeTruthy();
  });
});

describe('loading and load error', () => {
  it('shows a skeleton and a status while the work loads', () => {
    api.loadYourWork.mockReturnValue(new Promise(() => {}));
    const { container } = show(rowWith(sub()));
    expect(panel().getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Loading your work…');
    expect(container.querySelector('[data-skeleton]')).toBeTruthy();
  });

  it('a failed load offers Retry, which reads again', async () => {
    api.loadYourWork.mockResolvedValueOnce({ ok: false, error: MESSAGES.loadFailed });
    show(rowWith(sub()));
    expect((await screen.findByRole('alert')).textContent).toBe(MESSAGES.loadFailed);
    loaded(fileRow);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('poster.pdf')).toBeTruthy();
    expect(api.loadYourWork).toHaveBeenCalledTimes(2);
  });
});

describe('B. attached, not turned in', () => {
  it('reads the attachment for this submission (feedback only if released) and offers every action', async () => {
    loaded(fileRow);
    show(rowWith(sub()));
    expect(await screen.findByText('poster.pdf')).toBeTruthy();
    expect(api.loadYourWork).toHaveBeenCalledWith({ submission: { id: 'sub-1', released: false }, studentId: 'student-1' });
    for (const name of ['Open file', 'Turn in', 'Save note', 'Replace', 'Remove']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save note' }).disabled).toBe(true);
    expect(screen.getByLabelText('Note for your teacher (optional)').value).toBe('See page 2');
  });

  it('Turn in asks first; Cancel sends nothing; confirming turns in once and shows Turned in', async () => {
    loaded(fileRow);
    api.turnIn.mockResolvedValue({ ok: true, submission: sub({ status: 'submitted', submitted_at: '2026-11-14 10:00:00' }) });
    show(rowWith(sub()));
    fireEvent.click(await screen.findByRole('button', { name: 'Turn in' }));
    let dialog = screen.getByRole('dialog', { name: 'Turn in your work?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.turnIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Turn in' }));
    dialog = screen.getByRole('dialog', { name: 'Turn in your work?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn in' }));
    expect(await screen.findByRole('button', { name: 'Unsubmit' })).toBeTruthy();
    expect(api.turnIn).toHaveBeenCalledTimes(1);
    expect(api.turnIn).toHaveBeenCalledWith({ submission: sub(), studentId: 'student-1' });
    expect(within(panel()).getByText('Turned in')).toBeTruthy();
    expect(toast).toHaveBeenCalledWith('Turned in.');
  });

  it('a changed note is saved before turning in', async () => {
    loaded(fileRow);
    api.saveNote.mockResolvedValue({ ok: true, attachment: { ...fileRow, note: 'New note' } });
    api.turnIn.mockResolvedValue({ ok: true, submission: sub({ status: 'submitted', is_late: true }) });
    show(rowWith(sub()));
    fireEvent.change(await screen.findByLabelText('Note for your teacher (optional)'), { target: { value: 'New note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn in' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Turn in' }));
    await screen.findByRole('button', { name: 'Unsubmit' });
    expect(api.saveNote.mock.invocationCallOrder[0]).toBeLessThan(api.turnIn.mock.invocationCallOrder[0]);
    expect(toast).toHaveBeenCalledWith('Turned in late.');
    expect(within(panel()).getByText('Late')).toBeTruthy();
  });

  it('a refused turn-in shows the friendly message as an alert', async () => {
    loaded(fileRow);
    api.turnIn.mockResolvedValue({ ok: false, error: MESSAGES.attachmentRequired });
    show(rowWith(sub()));
    fireEvent.click(await screen.findByRole('button', { name: 'Turn in' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Turn in' }));
    expect((await screen.findByRole('alert')).textContent).toBe(MESSAGES.attachmentRequired);
    expect(screen.getByRole('button', { name: 'Turn in' })).toBeTruthy();
  });

  it('Replace opens the form for the current work and replaces it', async () => {
    loaded(fileRow);
    api.replaceAttachment.mockResolvedValue({ ok: true, attachment: linkRow, orphan: false });
    show(rowWith(sub()));
    fireEvent.click(await screen.findByRole('button', { name: 'Replace' }));
    expect(screen.getByRole('group', { name: 'Replace with' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText('Link address'), { target: { value: 'https://docs.example.org/poster' } });
    fireEvent.click(screen.getByRole('button', { name: 'Replace with link' }));
    expect(await screen.findByText('docs.example.org')).toBeTruthy();
    expect(api.replaceAttachment).toHaveBeenCalledWith(expect.objectContaining({ current: fileRow, kind: 'link', studentId: 'student-1' }));
    expect(toast).toHaveBeenCalledWith('Your work was replaced.');
  });

  it('Remove asks first, then returns to the empty state', async () => {
    loaded(fileRow);
    api.removeAttachment.mockResolvedValue({ ok: true, orphan: false });
    show(rowWith(sub()));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Remove your work?' })).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('button', { name: 'Add file' })).toBeTruthy();
    expect(api.removeAttachment).toHaveBeenCalledWith({ current: fileRow, studentId: 'student-1' });
  });
});

describe('opening the work', () => {
  const anchors = () => {
    const seen = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { seen.push({ href: this.href, target: this.target, rel: this.rel }); });
    return seen;
  };

  it('a file opens through a signed URL in a new tab (noopener noreferrer); the fallback link is tappable; nothing is logged', async () => {
    const seen = anchors();
    const log = vi.spyOn(console, 'log');
    loaded(fileRow);
    api.signedOwnFileUrl.mockResolvedValue('https://x.invalid/sign/poster.pdf?token=secret');
    show(rowWith(sub()));
    fireEvent.click(await screen.findByRole('button', { name: 'Open file' }));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toEqual({ href: 'https://x.invalid/sign/poster.pdf?token=secret', target: '_blank', rel: 'noopener noreferrer' });
    const fallback = screen.getByRole('link', { name: 'Open file' });
    expect(fallback.getAttribute('rel')).toBe('noopener noreferrer');
    expect(fallback.getAttribute('target')).toBe('_blank');
    expect(log.mock.calls.flat().join(' ')).not.toContain('token');
  });

  it('a link opens directly with noopener noreferrer', async () => {
    const seen = anchors();
    loaded(linkRow);
    show(rowWith(sub()));
    fireEvent.click(await screen.findByRole('button', { name: 'Open link' }));
    expect(seen).toEqual([{ href: 'https://docs.example.org/poster', target: '_blank', rel: 'noopener noreferrer' }]);
  });

  it('a failed signed URL says so', async () => {
    loaded(fileRow);
    api.signedOwnFileUrl.mockResolvedValue(null);
    show(rowWith(sub()));
    fireEvent.click(await screen.findByRole('button', { name: 'Open file' }));
    expect((await screen.findByRole('alert')).textContent).toBe(MESSAGES.openFailed);
  });
});

describe('C. turned in', () => {
  it('Unsubmit asks first, then the work is editable again', async () => {
    loaded(fileRow);
    api.unsubmit.mockResolvedValue({ ok: true, submission: sub() });
    show(rowWith(sub({ status: 'submitted', submitted_at: '2026-11-14 10:00:00' })));
    expect(await screen.findByText(/^Turned in Nov 14, 2026/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Turn in' })).toBeNull();
    expect(screen.queryByLabelText('Note for your teacher (optional)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Unsubmit' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Unsubmit your work?' })).getByRole('button', { name: 'Unsubmit' }));
    expect(await screen.findByRole('button', { name: 'Turn in' })).toBeTruthy();
    expect(api.unsubmit).toHaveBeenCalledWith({ submission: sub({ status: 'submitted', submitted_at: '2026-11-14 10:00:00' }), studentId: 'student-1' });
    expect(toast).toHaveBeenCalledWith('Unsubmitted. You can change your work and turn it in again.');
  });

  it('a late turn-in shows the Late badge; an unreleased score never shows', async () => {
    loaded(fileRow);
    show(rowWith(sub({ status: 'submitted', is_late: true, score: 9, total_points: 10 })));
    await screen.findByText('poster.pdf');
    expect(within(panel()).getByText('Late')).toBeTruthy();
    expect(panel().textContent).not.toMatch(/Score|9 \/ 10/);
  });

  it('Unsubmit refused because the teacher graded it', async () => {
    loaded(fileRow);
    api.unsubmit.mockResolvedValue({ ok: false, error: MESSAGES.alreadyGraded });
    show(rowWith(sub({ status: 'submitted' })));
    fireEvent.click(await screen.findByRole('button', { name: 'Unsubmit' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Unsubmit' }));
    expect((await screen.findByRole('alert')).textContent).toBe(MESSAGES.alreadyGraded);
  });
});

describe('D. graded, not returned', () => {
  it('Graded, no score, no actions but Open', async () => {
    loaded(fileRow);
    show(rowWith(sub({ status: 'checked', score: 8, total_points: 10 })));
    expect(await screen.findByText('Your teacher has graded this. You will see your score when it is returned.')).toBeTruthy();
    expect(within(panel()).getByText('Graded')).toBeTruthy();
    expect(panel().textContent).not.toMatch(/Score|8 \/ 10/);
    for (const name of ['Turn in', 'Unsubmit', 'Replace', 'Remove']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(api.loadYourWork).toHaveBeenCalledWith({ submission: { id: 'sub-1', released: false }, studentId: 'student-1' });
  });
});

describe('E. returned', () => {
  it('shows the released score and the feedback', async () => {
    api.loadYourWork.mockResolvedValue({ ok: true, attachment: fileRow, feedback: 'Clear and neat.', feedbackFailed: false });
    show(rowWith(sub({ status: 'checked', released: true, score: 9, total_points: 10 })));
    expect(await screen.findByText('Score: 9 / 10')).toBeTruthy();
    expect(screen.getByText('Clear and neat.')).toBeTruthy();
    expect(within(panel()).getByText('Returned')).toBeTruthy();
    expect(api.loadYourWork).toHaveBeenCalledWith({ submission: { id: 'sub-1', released: true }, studentId: 'student-1' });
    expect(screen.queryByRole('button', { name: 'Unsubmit' })).toBeNull();
  });

  it('feedback that failed to load is said plainly', async () => {
    api.loadYourWork.mockResolvedValue({ ok: true, attachment: fileRow, feedback: null, feedbackFailed: true });
    show(rowWith(sub({ status: 'checked', released: true, score: 9, total_points: 10 })));
    expect(await screen.findByText("Your teacher's feedback could not be loaded. Reopen this task to try again.")).toBeTruthy();
  });
});

describe('the unsaved-changes guard', () => {
  it('nothing typed: leaving goes straight through', () => {
    show(rowWith(null));
    const leave = vi.fn();
    act(() => { guard(leave); });
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('a typed note asks before leaving; Discard leaves', async () => {
    loaded(fileRow);
    show(rowWith(sub()));
    fireEvent.change(await screen.findByLabelText('Note for your teacher (optional)'), { target: { value: 'changed' } });
    const leave = vi.fn();
    act(() => { guard(leave); });
    expect(leave).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Unsaved changes' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('a draft link in the empty state counts too', () => {
    show(rowWith(null));
    fireEvent.click(screen.getByRole('radio', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText('Link address'), { target: { value: 'https://a.org' } });
    const leave = vi.fn();
    act(() => { guard(leave); });
    expect(leave).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeTruthy();
  });
});
