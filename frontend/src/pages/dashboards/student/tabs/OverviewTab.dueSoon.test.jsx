// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null, loading: false }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../StudentDataContext', () => ({ useStudentData: () => ({ graph: state.graph, loading: state.loading, refresh: vi.fn() }) }));

import OverviewTab from './OverviewTab';

// 10:00 AM on Wed 13 Mar 2030 in Manila.
const NOW = new Date('2030-03-13T02:00:00Z');
const quiz = (id, subject_id = 'eng') => ({ id, title: `Task ${id}`, subject: 'Legacy', subject_id, task_type: 'quiz', items: 5, instructions: 'A.' });
const setGraph = (tasks, extra = {}) => {
  state.graph = { fatalError: null, scheduleError: null, enrolments: [], studentRecord: null, attendance: [], releasedScores: [],
    subjects: [{ id: 'eng', name: 'English' }], cardSubjectIds: new Set(['eng']), subjectsById: new Map([['eng', 'English']]),
    submissionStates: tasks.filter(t => t.submission).map(t => ({ worksheet_id: t.sheet.id, ...t.submission })),
    assignees: tasks.map(t => ({ task_id: t.sheet.id, section_id: 's', due_at: t.due ?? null, assigned_at: null })),
    sheetById: new Map(tasks.map(t => [t.sheet.id, t.sheet])), ...extra };
};
const show = () => render(<MemoryRouter><OverviewTab /></MemoryRouter>);
const card = () => screen.getByRole('region', { name: 'Due today and this week' });
const countOf = label => within(card()).getByText(label).nextElementSibling.textContent;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  state.loading = false;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Overview Due today / this week', () => {
  it('shows the counts and the soonest items, each linking to its view in Tasks', () => {
    setGraph([
      { sheet: quiz('today'), due: '2030-03-13T23:59:00' },
      { sheet: quiz('friday', null), due: '2030-03-15T08:00:00' },
      { sheet: quiz('far'), due: '2030-04-30T08:00:00' },
      { sheet: quiz('handed'), due: '2030-03-13T23:00:00', submission: { status: 'submitted' } },
    ]);
    show();
    expect(countOf('Due today')).toBe('1');
    expect(countOf('This week')).toBe('2');
    const links = within(card()).getAllByRole('link');
    expect(links.map(l => l.textContent)).toEqual([
      'Task todayEnglishDue Mar 13, 2030, 11:59 PM',
      'Task fridayLegacyDue Mar 15, 2030, 8:00 AM',
    ]);
    expect(links[0].getAttribute('href')).toBe('/student-dashboard/tasks?view=todo&subject=eng');
    expect(links[1].getAttribute('href')).toBe('/student-dashboard/tasks?view=upcoming');
    // The existing counter and wording are unchanged.
    expect(screen.getByText('Pending Tasks').parentElement.textContent).toContain('3');
  });

  it('says so when nothing is due this week', () => {
    setGraph([{ sheet: quiz('far'), due: '2030-04-30T08:00:00' }]);
    show();
    expect(countOf('Due today')).toBe('0');
    expect(countOf('This week')).toBe('0');
    expect(within(card()).getByText('Nothing due this week. Nice work!')).toBeTruthy();
    expect(within(card()).queryAllByRole('link')).toHaveLength(0);
  });

  it('a failed load shows the error, never 0', () => {
    setGraph([{ sheet: quiz('today'), due: '2030-03-13T23:59:00' }], { fatalError: { message: 'offline' } });
    show();
    expect(countOf('Due today')).toBe('—');
    expect(countOf('This week')).toBe('—');
    expect(within(card()).getByText('Could not load your tasks.')).toBeTruthy();
    expect(within(card()).queryAllByRole('link')).toHaveLength(0);
  });
});
