// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ThemeContext } from '../hooks';
import AnnouncementsTab from './AnnouncementsTab';

const { retry } = vi.hoisted(() => ({ retry: vi.fn() }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: retry }));
vi.mock('../../../../config/supabase', () => ({ supabase: { from: vi.fn() } }));

afterEach(cleanup);

describe('Announcements meta row', () => {
  it('wraps, so the role badge cannot push the page sideways on a phone', async () => {
    retry.mockResolvedValueOnce({ data: [{ id: 'n1', title: 'School assembly', content: 'Monday morning', status: 'Published',
      priority: 'Normal', target_roles: 'teacher', author_name: 'Principal with a long name', created_at: '2026-10-12T08:00:00Z' }], error: null });
    render(<ThemeContext.Provider value={{ dark: false }}><AnnouncementsTab /></ThemeContext.Provider>);
    const row = (await screen.findByText('By Principal with a long name')).parentElement;
    const classes = row.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'items-center', 'gap-x-4', 'gap-y-1', 'text-xs']));
    expect(row.contains(screen.getByText('teacher'))).toBe(true);
  });
});
