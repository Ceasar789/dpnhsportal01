// @vitest-environment jsdom
// Clarity A4: the Admin Memos tab (final design, real data only): one real
// "Sent" column (memos have no draft or acknowledged status), no avatars
// (no per-person recipient list), every classic action through the same
// handlers, and the memo dialog a word-for-word copy (parity checked here).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));

import MemosTab from '../../../pages/dashboards/admin/tabs/MemosTab';
import ClarityAdminMemosTab from './ClarityAdminMemosTab';

const MEMOS = [
  { id: 'm1', subject: 'Faculty meeting', from_office: "Principal's Office", recipient: 'All Faculty', content: 'Room 3 at 3 PM.\nBring reports.', created_at: '2026-11-10T03:00:00Z' },
  { id: 'm2', subject: 'Uniform reminder', from_office: '', recipient: 'All Students', content: 'Wear ID.', created_at: '2026-11-09T03:00:00Z' },
  { id: 'm3', subject: 'Science lab', from_office: 'Science Dept', recipient: 'Science', content: 'Lab closed.', created_at: '2026-11-08T03:00:00Z' },
];
const USERS = [{ id: 'u1', role: 'teacher', department: 'Science', status: 'active' }, { id: 'u2', role: 'teacher', department: 'Mathematics', status: 'active' }];
const baseCtx = (extra = {}) => ({
  closeModal: vi.fn(), deleteMemo: vi.fn(), editMemo: null, filteredMemos: MEMOS, mBody: '', mFrom: '', mSaving: false, mSubj: '', mTo: 'All Faculty',
  memoFilter: '', memoSearch: '', memos: MEMOS, fetchMemos: vi.fn(), memosError: '', memosLoading: false, modal: null,
  openCompose: vi.fn(), openEditMemo: vi.fn(), saveMemo: vi.fn(), selMemo: null,
  setMBody: vi.fn(), setMFrom: vi.fn(), setMSubj: vi.fn(), setMTo: vi.fn(), setMemoFilter: vi.fn(), setMemoSearch: vi.fn(),
  setSelMemo: vi.fn(), users: USERS,
  ...extra,
});
const show = (Tab = ClarityAdminMemosTab) => render(<Tab />);
const sent = () => screen.getByRole('region', { name: 'Sent' });
const norm = html => html.replace(/:r[0-9a-z]+:/g, ':id:');

beforeEach(() => { h.ctx = baseCtx(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('layout from real data', () => {
  it('header and New memo', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Memos' })).toBeTruthy();
    expect(screen.getByText('See where every memo stands at a glance.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New memo' })).toBeTruthy();
  });

  it('one column, "Sent", with the real count; no Drafts or Acknowledged column', () => {
    show();
    const cols = screen.getAllByRole('heading', { level: 2 }).map(h2 => h2.textContent);
    expect(cols[0]).toBe('Sent');
    expect(document.body.textContent).not.toMatch(/Drafts|Acknowledged/);
    expect(within(sent()).getByText('3', { selector: '.x-sec-colhead > span' }).textContent).toBe('3 memos');
  });

  it('cards show the real subject, the sender and audience as stored, and the date; no avatar bubbles', () => {
    show();
    const cards = within(sent()).getAllByRole('button');
    expect(cards.map(c => c.querySelector('b').textContent)).toEqual(['Faculty meeting', 'Uniform reminder', 'Science lab']);
    expect(cards[0].textContent).toContain("Principal's Office → All Faculty");
    expect(cards[1].textContent).toContain('— → All Students');
    expect(document.querySelector('.x-ava, img')).toBeNull();
  });

  it('no "preview" anywhere', () => {
    const { container } = show();
    const attrs = [...container.querySelectorAll('[aria-label],[title],[alt]')].flatMap(el => ['aria-label', 'title', 'alt'].map(a => el.getAttribute(a) || ''));
    expect(`${container.textContent} ${attrs.join(' ')}`).not.toMatch(/preview/i);
  });
});

describe('every classic action, same handlers', () => {
  it('selecting a memo calls setSelMemo with it; the selected memo shows in full', () => {
    show();
    fireEvent.click(within(sent()).getAllByRole('button')[0]);
    expect(h.ctx.setSelMemo).toHaveBeenCalledWith(MEMOS[0]);
    cleanup();
    h.ctx = baseCtx({ selMemo: MEMOS[0] });
    show();
    const detail = screen.getByRole('region', { name: 'Selected memo' });
    expect(detail.textContent).toContain('Room 3 at 3 PM.\nBring reports.');
    expect(within(sent()).getAllByRole('button')[0].getAttribute('aria-current')).toBe('true');
  });

  it('Edit and Delete on the selected memo: the same calls as classic', () => {
    const run = (Tab) => {
      h.ctx = baseCtx({ selMemo: MEMOS[1] });
      show(Tab);
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      const calls = [h.ctx.openEditMemo.mock.calls, h.ctx.deleteMemo.mock.calls.map(c => c[0])];
      cleanup();
      return calls;
    };
    expect(run(ClarityAdminMemosTab)).toEqual(run(MemosTab));
  });

  it('after a delete, focus moves to the first memo card, or to the heading', () => {
    h.ctx = baseCtx({ selMemo: MEMOS[1] });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const after = h.ctx.deleteMemo.mock.calls[0][1];
    after();
    expect(document.activeElement).toBe(within(sent()).getAllByRole('button')[0]);
    document.querySelectorAll('.x-memo-card').forEach(el => el.remove());
    after();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Memos' }));
  });

  it('search, the recipient filter (built from the memos) and New memo use the same handlers', () => {
    show();
    fireEvent.change(screen.getByPlaceholderText('Search memos...'), { target: { value: 'lab' } });
    const filter = screen.getByLabelText('Filter by recipient');
    expect([...filter.options].map(o => o.textContent)).toContain('Science');
    fireEvent.change(filter, { target: { value: 'Science' } });
    fireEvent.click(screen.getByRole('button', { name: 'New memo' }));
    expect(h.ctx.setMemoSearch).toHaveBeenCalledWith('lab');
    expect(h.ctx.setMemoFilter).toHaveBeenCalledWith('Science');
    expect(h.ctx.openCompose).toHaveBeenCalledTimes(1);
  });
});

describe('states', () => {
  it('loading, empty, nothing selected and error (Retry calls fetchMemos)', () => {
    h.ctx = baseCtx({ memosLoading: true });
    show();
    expect(screen.getByRole('status').textContent).toBe('Loading memos…');
    cleanup();
    h.ctx = baseCtx({ filteredMemos: [] });
    show();
    expect(screen.getByText('No memos found')).toBeTruthy();
    expect(screen.getByText('Select a memo to view')).toBeTruthy();
    cleanup();
    h.ctx = baseCtx({ memosError: 'Memos are unavailable.' });
    show();
    expect(screen.getByRole('alert').textContent).toContain('Memos are unavailable.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.ctx.fetchMemos).toHaveBeenCalled();
  });
});

describe('the memo dialog is the classic one', () => {
  it.each([
    ['compose', { modal: 'memo' }],
    ['edit, addressed to a group no longer offered', { modal: 'memo', editMemo: MEMOS[2], mTo: 'Old Department', mSubj: 'Science lab' }],
  ])('%s: identical markup', (_, extra) => {
    h.ctx = baseCtx(extra);
    show(MemosTab); const classic = norm(screen.getByRole('dialog').outerHTML); cleanup();
    h.ctx = baseCtx(extra);
    show();
    expect(norm(screen.getByRole('dialog').outerHTML)).toBe(classic);
  });

  it('Send calls saveMemo; the discard guard is kept', () => {
    h.ctx = baseCtx({ modal: 'memo' });
    show();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send' }));
    expect(h.ctx.saveMemo).toHaveBeenCalledTimes(1);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    screen.getByLabelText('Subject').value = 'Changed';
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledWith('Discard changes?');
    expect(h.ctx.closeModal).not.toHaveBeenCalled();
  });
});
