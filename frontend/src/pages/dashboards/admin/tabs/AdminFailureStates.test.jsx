// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));
import MemosTab from './MemosTab';
import NewsTab from './NewsTab';
import OverviewTab from './OverviewTab';

afterEach(cleanup);

const shared = {
  modal: null,
  closeModal: vi.fn(),
};

describe('Admin persistent failure states', () => {
  it('shows a retryable News error without a false empty state', () => {
    const fetchNews = vi.fn();
    h.ctx = {
      ...shared, fetchNews, filteredNews: [], newsItems: [], newsLoading: false,
      newsError: 'Could not load news. Check your connection and try again.',
      newsSearch: '', newsCatF: '', newsStatF: '', nImageFile: null,
      setNewsSearch: vi.fn(), setNewsCatF: vi.fn(), setNewsStatF: vi.fn(), openNewPost: vi.fn(),
    };
    render(<NewsTab />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load news');
    expect(screen.queryByText('No posts found')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(fetchNews).toHaveBeenCalledOnce();
  });

  it('shows a retryable Memo error without a false empty state', () => {
    const fetchMemos = vi.fn();
    h.ctx = {
      ...shared, fetchMemos, filteredMemos: [], memos: [], memosLoading: false,
      memosError: 'Could not load memos. Check your connection and try again.',
      memoSearch: '', memoFilter: '', users: [], selMemo: null,
      setMemoSearch: vi.fn(), setMemoFilter: vi.fn(), openCompose: vi.fn(),
    };
    render(<MemosTab />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load memos');
    expect(screen.queryByText('No memos found')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(fetchMemos).toHaveBeenCalledOnce();
  });

  it('marks only failed Overview metrics unavailable and exposes retries', () => {
    const fetchStats = vi.fn();
    const fetchLogs = vi.fn();
    const fetchRoleDist = vi.fn();
    h.ctx = {
      activityError: 'Recent activity is unavailable.', activityLogs: [], fetchLogs,
      fetchRoleDist, fetchStats, overviewLoading: false,
      roleDist: [], roleDistError: 'Role distribution is unavailable.',
      setPage: vi.fn(), settings: { academic_year: '2026-2027', semester: '1st Quarter' },
      stats: { users: 12, news: 0, events: 4, memos: 2 },
      statsErrors: { users: false, news: true, events: false, memos: false },
    };
    render(<OverviewTab />);
    expect(screen.getByRole('button', { name: 'Open Total Users' }).textContent).toContain('12');
    expect(screen.getByRole('button', { name: 'Open Published News' }).textContent).toContain('Unavailable');
    expect(screen.queryByText('No recent activity')).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Retry totals' }));
    expect(fetchStats).toHaveBeenCalledOnce();
  });
});
