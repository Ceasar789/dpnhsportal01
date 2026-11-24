// @vitest-environment jsdom
// 4s (Q7, design p12): All / Unread in both student announcement tabs; marks are per user, on this device.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const state = vi.hoisted(() => ({ result: null }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', role: 'student' } }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: { from() {
    const query = {
      select() { return query; }, eq() { return query; }, or() { return query; }, order() { return query; },
      then(resolve, reject) { return Promise.resolve(state.result).then(resolve, reject); },
    };
    return query;
  } },
}));

import AnnouncementsTab from './AnnouncementsTab';
import ClarityStudentAnnouncementsTab from '../../../../components/clarity/student/ClarityStudentAnnouncementsTab';
import { loadReadIds } from '../announcementReads';

const NEWS = [
  { id: 'n1', title: 'Exam week', content: 'a', target_roles: 'all', created_at: '2026-11-20T08:00:00Z' },
  { id: 'n2', title: 'Club fair', content: 'b', target_roles: 'student', created_at: '2026-11-19T08:00:00Z' },
];
beforeEach(() => { localStorage.clear(); state.result = { data: NEWS, error: null }; });
afterEach(() => { cleanup(); localStorage.clear(); });

const group = () => screen.getByRole('group', { name: 'Show announcements' });
const chip = name => within(group()).getByRole('button', { name: new RegExp(`^${name} \\(`) });

describe.each([['classic', AnnouncementsTab], ['Clarity', ClarityStudentAnnouncementsTab]])('%s Unread filter', (_, Tab) => {
  it('starts on All with counts; Unread lists only unread posts', async () => {
    render(<Tab />);
    await screen.findByText('Exam week');
    expect(chip('All').textContent).toBe('All (2)');
    expect(chip('Unread').textContent).toBe('Unread (2)');
    expect(chip('All').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Mark Exam week as read' }));
    expect(chip('Unread').textContent).toBe('Unread (1)');
    fireEvent.click(chip('Unread'));
    expect(screen.queryByText('Exam week')).toBeNull();
    expect(screen.getByText('Club fair')).toBeTruthy();
    expect([...loadReadIds('student-1')]).toEqual(['n1']);
    expect(JSON.parse(localStorage.getItem('eduscribe.announcements.read.student-1'))).toEqual(['n1']);
    expect(Object.keys(localStorage)).toEqual(['eduscribe.announcements.read.student-1']);
  });

  it('Mark all as read empties Unread with a friendly message; marks survive a reload', async () => {
    const { unmount } = render(<Tab />);
    await screen.findByText('Exam week');
    fireEvent.click(within(group()).getByRole('button', { name: 'Mark all as read' }));
    fireEvent.click(chip('Unread'));
    expect(screen.getByText('You have read every announcement.')).toBeTruthy();
    unmount();
    render(<Tab />);
    await screen.findByText('Exam week');
    expect(chip('Unread').textContent).toBe('Unread (0)');
    expect(screen.queryByRole('button', { name: /^Mark .+ as read$/ })).toBeNull();
  });

  it('marks belong to one student only', async () => {
    localStorage.setItem('eduscribe.announcements.read.someone-else', JSON.stringify(['n1', 'n2']));
    render(<Tab />);
    await screen.findByText('Exam week');
    expect(chip('Unread').textContent).toBe('Unread (2)');
  });
});
