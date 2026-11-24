// @vitest-environment jsdom
// 4j: students see only posts addressed to everyone or to students, in the
// classic tab and in Clarity alike. Teacher-only and custom audiences stay hidden.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

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

const NEWS = [
  { id: 1, title: 'School-wide notice', content: 'a', target_roles: 'all', created_at: '2026-11-20T08:00:00Z' },
  { id: 2, title: 'Quiz week for students', content: 'b', target_roles: 'student', created_at: '2026-11-19T08:00:00Z' },
  { id: 3, title: 'Faculty meeting memo', content: 'c', target_roles: 'teacher', created_at: '2026-11-18T08:00:00Z' },
  { id: 4, title: 'Grade 7 parents only', content: 'd', target_roles: 'custom:Grade 7 parents', created_at: '2026-11-17T08:00:00Z' },
  { id: 5, title: 'Older post without audience', content: 'e', target_roles: null, created_at: '2026-11-16T08:00:00Z' },
];

beforeEach(() => { state.result = { data: NEWS, error: null }; vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each([['classic', AnnouncementsTab], ['Clarity', ClarityStudentAnnouncementsTab]])('%s student announcements (4j)', (_, Tab) => {
  it('shows all / student / unaddressed posts and hides teacher-only and custom ones', async () => {
    render(<Tab />);
    expect(await screen.findByText('School-wide notice')).toBeTruthy();
    expect(screen.getByText('Quiz week for students')).toBeTruthy();
    expect(screen.getByText('Older post without audience')).toBeTruthy();
    expect(screen.queryByText('Faculty meeting memo')).toBeNull();
    expect(screen.queryByText('Grade 7 parents only')).toBeNull();
  });

  it('only hidden posts read as the empty state, not as an error', async () => {
    state.result = { data: [NEWS[2]], error: null };
    render(<Tab />);
    expect(await screen.findByText('No announcements are available right now.')).toBeTruthy();
  });
});
