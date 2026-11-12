// @vitest-environment jsdom
// Clarity A4: the Admin News tab (final design) from real context data,
// every classic action through the same handlers, and the post dialog a
// copy of the classic one (parity checked here; the one wording change, the
// staged image's alt text, is pinned below).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));

import NewsTab from '../../../pages/dashboards/admin/tabs/NewsTab';
import ClarityAdminNewsTab from './ClarityAdminNewsTab';

const POSTS = [
  { id: 'p1', title: 'Enrollment opens', content: 'Bring your documents.', status: 'Published', category: 'Academics', target_roles: 'all', created_at: '2026-11-01T01:00:00Z', image_url: null },
  { id: 'p2', title: 'Sports fest', content: 'Wear your colors.', status: 'Published', category: 'Sports', target_roles: 'student', created_at: '2026-11-07T01:00:00Z', image_url: 'https://example.invalid/fest.jpg' },
  { id: 'p3', title: 'Exam schedule draft', content: 'Not final.', status: 'Draft', category: '', target_roles: 'custom:Grade 10 students', created_at: '2026-11-08T01:00:00Z' },
  { id: 'p4', title: 'Old notice', content: '', status: 'Archived', category: 'Events', target_roles: 'faculty', created_at: '2026-10-01T01:00:00Z', expires_at: '2026-10-05T00:00:00Z' },
];
const baseCtx = (extra = {}) => ({
  closeModal: vi.fn(), deleteNewsItem: vi.fn(), editNews: null, filteredNews: POSTS, modal: null,
  nAuthor: '', nCat: 'Academics', nContent: '', nCustomTarget: '', nExpiresDate: '', nImageFile: null, nImageUrl: '', nSaving: false,
  nStatus: 'Draft', nTarget: 'all', nTitle: '', newsReadOnly: false,
  fetchNews: vi.fn(), newsCatF: '', newsError: '', newsItems: POSTS, newsLoading: false, newsSearch: '', newsStatF: '', openEditNews: vi.fn(),
  openNewPost: vi.fn(), saveNews: vi.fn(), saveNewsExpiry: vi.fn(), setNAuthor: vi.fn(), setNCat: vi.fn(), setNContent: vi.fn(), setNExpiresDate: vi.fn(), setNStatus: vi.fn(),
  setNCustomTarget: vi.fn(), setNImageFile: vi.fn(), setNTarget: vi.fn(), setNTitle: vi.fn(), setNewsCatF: vi.fn(), setNewsSearch: vi.fn(), setNewsStatF: vi.fn(),
  updateNewsStatus: vi.fn(async () => true),
  ...extra,
});
const show = (Tab = ClarityAdminNewsTab) => render(<Tab />);
const hero = () => document.querySelector('.x-news-hero');
const card = title => screen.getByRole('heading', { level: 3, name: title }).closest('article');
const norm = html => html.replace(/:r[0-9a-z]+:/g, ':id:');
const visibleWords = (root) => {
  const clone = root.cloneNode(true);
  clone.querySelectorAll('style').forEach(el => el.remove());
  const attrs = [...root.querySelectorAll('[aria-label], [title], [alt]')]
    .flatMap(el => ['aria-label', 'title', 'alt'].map(a => el.getAttribute(a) || ''));
  return `${clone.textContent} ${attrs.join(' ')}`;
};

beforeEach(() => { h.ctx = baseCtx(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('layout from real data', () => {
  it('header, the real status segments and New post', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'News' })).toBeTruthy();
    expect(screen.getByText('What the school community is reading right now.')).toBeTruthy();
    const segs = within(screen.getByRole('group', { name: 'Show posts' })).getAllByRole('button');
    expect(segs.map(b => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['All', 'true'], ['Published', 'false'], ['Draft', 'false'], ['Archived', 'false'],
    ]);
    expect(screen.getByRole('button', { name: 'New post' })).toBeTruthy();
  });

  it('the wide card is the newest published post, with its real image, pills, date and audience', () => {
    show();
    const wide = hero();
    expect(within(wide).getByRole('heading', { level: 2 }).textContent).toBe('Sports fest');
    expect(within(wide).getByRole('img').getAttribute('alt')).toBe('Image for Sports fest');
    expect(within(wide).getByText('Published')).toBeTruthy();
    expect(within(wide).getByText('Sports')).toBeTruthy();
    expect(wide.textContent).toContain('Students');
    expect(wide.textContent).toContain('Wear your colors.');
  });

  it('without an image the art block is decorative: no image, no label text', () => {
    h.ctx = baseCtx({ filteredNews: [POSTS[0]] });
    show();
    expect(hero().querySelector('.x-news-art').textContent).toBe('');
    expect(within(hero()).queryByRole('img')).toBeNull();
  });

  it('no wide card when nothing is published (no fake highlight)', () => {
    h.ctx = baseCtx({ filteredNews: [POSTS[2], POSTS[3]] });
    show();
    expect(hero()).toBeNull();
  });

  it('cards: status pill, Expired only when expired, category, the stored audience, excerpt', () => {
    show();
    expect(within(card('Exam schedule draft')).getByText('Draft')).toBeTruthy();
    expect(within(card('Exam schedule draft')).getByText('Grade 10 students')).toBeTruthy();
    expect(within(card('Old notice')).getByText('Expired')).toBeTruthy();
    expect(within(card('Old notice')).getByText('faculty')).toBeTruthy();
    expect(within(card('Enrollment opens')).queryByText('Expired')).toBeNull();
  });

  it('no Featured / Important / General / Scheduled and no "preview" anywhere on the page', () => {
    const { container } = show();
    expect(visibleWords(container)).not.toMatch(/featured|important|general|scheduled|preview/i);
  });
});

describe('every classic action, same handlers and arguments', () => {
  it('status segments set the same status filter', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(h.ctx.setNewsStatF.mock.calls).toEqual([['Draft'], ['']]);
  });

  it('search and category filter use the same setters', () => {
    show();
    fireEvent.change(screen.getByPlaceholderText('Search articles...'), { target: { value: 'fest' } });
    fireEvent.change(screen.getByLabelText('Filter news by category'), { target: { value: 'Sports' } });
    expect(h.ctx.setNewsSearch).toHaveBeenCalledWith('fest');
    expect(h.ctx.setNewsCatF).toHaveBeenCalledWith('Sports');
  });

  it('view / archive / edit / publish / restore / delete: the same calls as the classic cards', async () => {
    const run = async (Tab) => {
      h.ctx = baseCtx();
      show(Tab);
      const click = name => fireEvent.click(screen.getAllByRole('button', { name })[0]);
      click('View Enrollment opens');
      click('Edit Exam schedule draft');
      await act(async () => { click('Archive Enrollment opens'); });
      await act(async () => { click('Publish Exam schedule draft'); });
      await act(async () => { click('Restore Old notice'); });
      click('Delete Old notice');
      const calls = [h.ctx.openEditNews.mock.calls, h.ctx.updateNewsStatus.mock.calls, h.ctx.deleteNewsItem.mock.calls.map(c => c[0])];
      cleanup();
      return calls;
    };
    const classic = await run(NewsTab);
    const clarity = await run(ClarityAdminNewsTab);
    expect(clarity).toEqual(classic);
    expect(classic[1]).toEqual([['p1', 'Archived'], ['p3', 'Published'], ['p4', 'Published']]);
  });

  it('the wide card offers View post, Archive and Delete for that post', async () => {
    show();
    fireEvent.click(within(hero()).getByRole('button', { name: 'View Sports fest' }));
    await act(async () => { fireEvent.click(within(hero()).getByRole('button', { name: 'Archive Sports fest' })); });
    fireEvent.click(within(hero()).getByRole('button', { name: 'Delete Sports fest' }));
    expect(h.ctx.openEditNews).toHaveBeenCalledWith(POSTS[1]);
    expect(h.ctx.updateNewsStatus).toHaveBeenCalledWith('p2', 'Archived');
    expect(h.ctx.deleteNewsItem.mock.calls[0][0]).toBe('p2');
  });

  it('after a delete, focus moves to the next Delete button, or to the heading', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Old notice' }));
    const after = h.ctx.deleteNewsItem.mock.calls[0][1];
    after();
    expect(document.activeElement.getAttribute('aria-label')).toMatch(/^Delete /);
    document.querySelectorAll('.x-news-del').forEach(el => el.remove());
    after();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'News' }));
  });

  it('New post opens the same dialog', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'New post' }));
    expect(h.ctx.openNewPost).toHaveBeenCalledTimes(1);
  });
});

describe('states', () => {
  it('loading, empty and error (Retry calls fetchNews); the totals line as classic', () => {
    h.ctx = baseCtx({ newsLoading: true });
    show();
    expect(screen.getByRole('status').textContent).toBe('Loading posts…');
    cleanup();
    h.ctx = baseCtx({ filteredNews: [] });
    show();
    expect(screen.getByText('No posts found')).toBeTruthy();
    expect(screen.getByText('4 total posts · 2 published · 1 drafts · 1 archived')).toBeTruthy();
    cleanup();
    h.ctx = baseCtx({ newsError: 'News is unavailable.' });
    show();
    expect(screen.getByRole('alert').textContent).toContain('News is unavailable.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.ctx.fetchNews).toHaveBeenCalled();
  });
});

describe('the post dialog is the classic one', () => {
  it.each([
    ['new post', { modal: 'news' }],
    ['edit draft with a custom audience', { modal: 'news', editNews: POSTS[2], nTitle: 'Exam schedule draft', nTarget: 'custom', nCustomTarget: 'Grade 10 students' }],
    ['published, locked, with its saved image', { modal: 'news', editNews: POSTS[1], newsReadOnly: true, nStatus: 'Published', nImageUrl: 'https://example.invalid/fest.jpg' }],
    ['an audience no longer offered', { modal: 'news', editNews: POSTS[3], nTarget: 'faculty' }],
  ])('%s: identical markup', (_, extra) => {
    h.ctx = baseCtx(extra);
    show(NewsTab); const classic = norm(screen.getByRole('dialog').outerHTML); cleanup();
    h.ctx = baseCtx(extra);
    show();
    expect(norm(screen.getByRole('dialog').outerHTML)).toBe(classic);
  });

  it('a newly chosen image: same staging, same Remove; only the alt text avoids the word "preview"', () => {
    const file = new File(['x'], 'poster.png', { type: 'image/png' });
    URL.createObjectURL = vi.fn(() => 'blob:poster');
    URL.revokeObjectURL = vi.fn();
    h.ctx = baseCtx({ modal: 'news', nImageFile: file });
    show(NewsTab); const classic = norm(screen.getByRole('dialog').outerHTML); cleanup();
    h.ctx = baseCtx({ modal: 'news', nImageFile: file });
    show();
    const dialog = screen.getByRole('dialog');
    expect(norm(dialog.outerHTML)).toBe(classic.replace('alt="Preview of poster.png"', 'alt="Chosen image: poster.png"'));
    expect(within(dialog).getByText('poster.png — not saved yet')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(h.ctx.setNImageFile).toHaveBeenCalledWith(null);
    expect(visibleWords(dialog)).not.toMatch(/preview/i);
  });

  it('Publish / Update / Save Expiry call the same save handlers', () => {
    h.ctx = baseCtx({ modal: 'news' });
    show();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Publish' }));
    expect(h.ctx.saveNews).toHaveBeenCalledTimes(1);
    cleanup();
    h.ctx = baseCtx({ modal: 'news', newsReadOnly: true, editNews: POSTS[1] });
    show();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save Expiry' }));
    expect(h.ctx.saveNewsExpiry).toHaveBeenCalledTimes(1);
  });

  it('the discard guard is kept', () => {
    h.ctx = baseCtx({ modal: 'news' });
    show();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    screen.getByLabelText('Title').value = 'Changed';
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledWith('Discard changes?');
    expect(h.ctx.closeModal).not.toHaveBeenCalled();
  });
});
