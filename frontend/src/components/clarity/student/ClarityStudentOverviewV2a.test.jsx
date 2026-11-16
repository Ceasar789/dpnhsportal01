// @vitest-environment jsdom
// V2a: the Student Overview's Getting started card and the scores empty state.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({ graph: null }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'stu-9', name: 'Sample Student' } }) }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({ useStudentData: () => ({ graph: h.graph, loading: false, refresh: null }) }));

import ClarityStudentOverviewTab from './ClarityStudentOverviewTab';

const Where = () => <output data-testid="where">{useLocation().pathname}</output>;
const show = () => render(
  <MemoryRouter initialEntries={['/student-dashboard']}>
    <Routes><Route path="/student-dashboard/*" element={<><ClarityStudentOverviewTab /><Where /></>} /></Routes>
  </MemoryRouter>,
);
const card = () => screen.queryByRole('region', { name: 'Getting started' });

// An enrolled student with no tasks and no released scores yet.
beforeEach(() => {
  h.graph = {
    fatalError: null, scheduleError: null,
    enrolments: [{ sections: { grade_level: 'Grade 8', name: 'Mabini', school_year: '2026-2027' } }],
    studentRecord: { lrn: '136482910027' }, attendance: [], releasedScores: [], subjects: [], subjectsById: new Map(),
    submissionStates: [], assignees: [], sheetById: new Map(),
  };
  window.localStorage.clear();
});
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe('V2a student Overview', () => {
  it('Getting started: tasks, open, turn in, score; the buttons open Tasks and Scores', () => {
    show();
    const items = within(card()).getAllByRole('listitem');
    expect(items.map(li => li.querySelector('.t').textContent)).toEqual(['See your tasks', 'Open a task', 'Turn in your work', 'See your score']);
    fireEvent.click(within(items[3]).getByRole('button', { name: 'Open Scores' }));
    expect(screen.getByTestId('where').textContent).toBe('/student-dashboard/scores');
    fireEvent.click(within(card()).getAllByRole('button', { name: 'Open Tasks' })[0]);
    expect(screen.getByTestId('where').textContent).toBe('/student-dashboard/tasks');
    expect(JSON.parse(window.localStorage.getItem('smartedu-getting-started-student-stu-9')).done).toEqual(['score', 'tasks']);
  });

  it('it sits after the page heading, before the progress tiles', () => {
    show();
    const order = [...document.querySelectorAll('h1, section[aria-label="Your progress"], section[aria-labelledby]')];
    expect(order[0].textContent).toBe('Overview');
    expect(order[1]).toBe(card());
  });

  it('no released scores: says when they will appear', () => {
    show();
    const empty = screen.getByText('No released scores yet.').closest('.x-empty');
    expect(empty.textContent).toContain('Scores show here after your teacher returns your work.');
  });
});
