// @vitest-environment jsdom
// S3: the student's Your work panel, every state and action, with the API mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
const sheet = { id: 'task-1', title: 'Poster', task_type: 'worksheet', items: 0, instructions: 'Make a poster.', submission_mode: 'attachment', max_points: 10 };
const linkRow = { id: 'att-1', kind: 'link', link_url: 'https://docs.example.org/poster', note: null };
const sub = (over = {}) => ({ id: 'sub-1', status: 'in_progress', released: false, is_late: false, submitted_at: null, ...over });
const rowWith = (submission, due = FUTURE) => ({ sheet, assignee: { task_id: 'task-1', section_id: 'sec-1', due_at: due }, submission });

let toast; let changed;
const show = (row) => {
  toast = vi.fn(); changed = vi.fn();
  return render(<MemoryRouter><YourWorkPanel row={row} onChanged={changed} showToast={toast}
    registerLeaveGuard={() => {}} /></MemoryRouter>);
};
const panel = () => screen.getByRole('region', { name: 'Your work' });
const loaded = attachment => api.loadYourWork.mockResolvedValue({ ok: true, attachment, feedback: null, feedbackFailed: false });

beforeEach(() => { Object.values(api).forEach(fn => fn.mockReset()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// S5: focus is never dropped on the page body: after an action the pressed
// button is often gone, so focus goes to the "Your work" heading.
describe('S5 Your work: focus after an action', () => {
  const heading = () => within(panel()).getByRole('heading', { name: 'Your work' });

  it('after adding a link, the heading has focus', async () => {
    api.ensureSubmission.mockResolvedValue({ ok: true, submission: sub() });
    api.addAttachment.mockResolvedValue({ ok: true, attachment: linkRow });
    show(rowWith(null));
    fireEvent.click(screen.getByRole('radio', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText('Link address'), { target: { value: 'https://docs.example.org/poster' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    await screen.findByRole('button', { name: 'Turn in' });
    expect(document.activeElement).toBe(heading());
    expect(heading().getAttribute('tabindex')).toBe('-1');
  });

  it('after Turn in (the button is gone), the heading has focus', async () => {
    loaded(linkRow);
    api.turnIn.mockResolvedValue({ ok: true, submission: sub({ status: 'submitted', submitted_at: '2026-11-14 10:00:00' }) });
    show(rowWith(sub()));
    fireEvent.click(await screen.findByRole('button', { name: 'Turn in' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Turn in your work?' })).getByRole('button', { name: 'Turn in' }));
    await screen.findByRole('button', { name: 'Unsubmit' });
    expect(document.activeElement).toBe(heading());
  });

  it('a failed action keeps focus where it was (no jump)', async () => {
    api.ensureSubmission.mockResolvedValue({ ok: true, submission: sub() });
    api.addAttachment.mockResolvedValue({ ok: false, error: MESSAGES.uploadFailed });
    show(rowWith(null));
    fireEvent.click(screen.getByRole('radio', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText('Link address'), { target: { value: 'https://a.org' } });
    const add = screen.getByRole('button', { name: 'Add link' });
    add.focus();
    fireEvent.click(add);
    await screen.findByRole('alert');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add link' }));
  });
});
