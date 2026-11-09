// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../StudentDataContext', () => ({ useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }) }));

import OverviewTab from './OverviewTab';

const quiz = { id: 'q', title: 'Quiz', subject_id: 'english', task_type: 'quiz', items: 5, instructions: 'Answer.' };
const show = () => render(<MemoryRouter><OverviewTab /></MemoryRouter>);
// Every inline style and class on the page, so a gradient anywhere is caught.
const styled = (root) => [root, ...root.querySelectorAll('*')]
  .map(el => `${el.getAttribute('class') || ''} ${el.getAttribute('style') || ''}`).join('\n');

afterEach(() => cleanup());

describe('Overview uses neutral teacher-style cards', () => {
  it('renders the three stat cards with titles and numbers, and no gradient anywhere', () => {
    state.graph = { fatalError: null, scheduleError: null, studentRecord: null,
      enrolments: [{ section_id: 's', sections: { name: 'Madrid', grade_level: 'Grade 7', school_year: '2026-2027' } }],
      attendance: [{ status: 'Present' }, { status: 'Absent' }],
      releasedScores: [{ worksheet_id: 'x', score: 8, total_points: 10 }],
      subjects: [{ id: 'english', name: 'English' }], cardSubjectIds: new Set(['english']), subjectsById: new Map(),
      submissionStates: [], assignees: [{ task_id: 'q', section_id: 's', due_at: '2099-01-15T23:59:00', assigned_at: null }],
      sheetById: new Map([['q', quiz]]) };
    const { container } = show();

    const progress = screen.getByRole('region', { name: 'Your progress' });
    const card = label => within(progress).getByText(label).parentElement;
    expect(card('Worksheet Performance').textContent).toContain('80%');
    expect(card('Attendance').textContent).toContain('50%');
    expect(card('Pending Tasks').textContent).toContain('1');
    expect(screen.getByText(/Welcome back/)).toBeTruthy();

    const all = styled(container);
    expect(all).not.toMatch(/gradient/i);
    expect(all).not.toMatch(/--banner-(bg|accent|pill)/);
    for (const label of ['Worksheet Performance', 'Attendance', 'Pending Tasks']) {
      const style = card(label).getAttribute('style');
      expect(style).toContain('var(--card-bg)');
      expect(style).toContain('var(--border)');
    }
  });
});
