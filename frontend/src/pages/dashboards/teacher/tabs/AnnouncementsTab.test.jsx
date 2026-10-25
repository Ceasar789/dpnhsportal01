// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeContext } from '../hooks';
import AnnouncementsTab from './AnnouncementsTab';

const { retry } = vi.hoisted(() => ({ retry: vi.fn() }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: retry }));
vi.mock('../../../../config/supabase', () => ({ supabase: { from: vi.fn() } }));

const item = { id: 'news-1', title: 'School assembly', content: 'Monday morning',
  status: 'Published', priority: 'High', target_roles: 'teacher', created_at: '2026-10-12T08:00:00Z' };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const renderTab = () => render(
  <ThemeContext.Provider value={{ dark: false }}><AnnouncementsTab /></ThemeContext.Provider>
);

describe('Teacher announcements read states', () => {
  beforeEach(() => retry.mockReset());
  afterEach(() => cleanup());

  it('shows loading, then a populated teacher-only response with the existing filters', async () => {
    const first = deferred();
    retry.mockReturnValueOnce(first.promise);
    renderTab();
    expect(screen.getByRole('status').textContent).toContain('Loading announcements');
    first.resolve({ data: [item, { ...item, id: 'news-2', title: 'Student notice', target_roles: 'student' }], error: null });
    expect(await screen.findByRole('heading', { name: 'School assembly' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Student notice' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'General' }));
    expect(screen.getByText('No announcements match your search or filter.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByPlaceholderText('Search announcements...'), { target: { value: 'missing' } });
    expect(screen.getByText('No announcements match your search or filter.')).toBeTruthy();
  });

  it('shows a successful empty response separately from search with no matches', async () => {
    retry.mockResolvedValueOnce({ data: [], error: null });
    renderTab();
    expect(await screen.findByText('No announcements have been published yet.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps a failed read visible and never calls it an empty announcement list', async () => {
    retry.mockResolvedValueOnce({ data: null, error: new Error('Synthetic network failure') });
    renderTab();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Announcements could not be loaded');
    expect(screen.queryByText('No announcements have been published yet.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry announcements' })).toBeTruthy();
  });

  it('blocks duplicate retries while pending and restores results after success', async () => {
    const pending = deferred();
    retry.mockResolvedValueOnce({ data: null, error: new Error('Synthetic failure') })
      .mockReturnValueOnce(pending.promise);
    renderTab();
    const button = await screen.findByRole('button', { name: 'Retry announcements' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(retry).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status').textContent).toContain('Retrying announcements');
    pending.resolve({ data: [item], error: null });
    expect(await screen.findByRole('heading', { name: 'School assembly' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps Retry available when a retry also fails, including a thrown read', async () => {
    retry.mockResolvedValueOnce({ data: null, error: new Error('First failure') })
      .mockRejectedValueOnce(new Error('Second failure'));
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry announcements' }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry announcements' })).toBeTruthy();
    expect(screen.queryByText('No announcements have been published yet.')).toBeNull();
  });
});
