// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../StudentDataContext', () => ({ useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({ supabase: { from() {
  const query = { select: () => query, eq: () => query, order: () => query, single: () => query,
    then: resolve => Promise.resolve({ data: [], error: null }).then(resolve) };
  return query;
} } }));

import StudentTasksTab from './TasksTab';

afterEach(cleanup);

const showWith = (sheet) => {
  state.graph = { fatalError: null, assignees: [{ task_id: sheet.id, section_id: 's1', assigned_at: null, due_at: '2099-01-15T23:59:00' }],
    sheetById: new Map([[sheet.id, sheet]]), submissionStates: [], releasedScores: [], subjectsById: new Map(), enrolments: [] };
  render(<MemoryRouter><StudentTasksTab /></MemoryRouter>);
};

describe('student task list and Exam', () => {
  it('labels an exam Exam, and it opens with Start like a quiz', async () => {
    showWith({ id: 'e1', title: 'Unit exam', subject: 'English', subject_id: null, task_type: 'exam', items: 5, instructions: 'Answer all.' });
    expect(await screen.findByRole('button', { name: 'Start' })).toBeTruthy();
    expect(screen.getByText('Exam')).toBeTruthy();
    expect(screen.queryByText('Task')).toBeNull();
    expect(screen.queryByText('Activity')).toBeNull();
  });

  it('a quiz keeps its Quiz label', async () => {
    showWith({ id: 'q1', title: 'Unit quiz', subject: 'English', subject_id: null, task_type: 'quiz', items: 5, instructions: 'Answer all.' });
    expect(await screen.findByText('Quiz')).toBeTruthy();
  });
});
