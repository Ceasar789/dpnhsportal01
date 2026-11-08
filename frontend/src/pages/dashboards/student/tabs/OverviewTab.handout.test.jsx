// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../StudentDataContext', () => ({ useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }) }));

import OverviewTab from './OverviewTab';

const handout = { id: 'a', title: 'Activity', subject_id: 'english', task_type: 'worksheet', items: 0, instructions: 'Do this.' };
const quiz = { id: 'q', title: 'Quiz', subject_id: 'english', task_type: 'quiz', items: 5, instructions: 'Answer.' };
const setGraph = (sheets, submissionStates = []) => {
  state.graph = { fatalError: null, scheduleError: null, enrolments: [], studentRecord: null, attendance: [], releasedScores: [],
    subjects: [{ id: 'english', name: 'English' }], cardSubjectIds: new Set(['english']), subjectsById: new Map(), submissionStates,
    assignees: sheets.map(sheet => ({ task_id: sheet.id, section_id: 's', due_at: '2000-01-15T23:59:00', assigned_at: null })),
    sheetById: new Map(sheets.map(sheet => [sheet.id, sheet])) };
};
const show = () => render(<MemoryRouter><OverviewTab /></MemoryRouter>);
const pendingTile = () => screen.getByText('Pending Tasks').parentElement.textContent;

afterEach(() => cleanup());

describe('Overview pending counts', () => {
  it('leaves a handout out of the tile and the subject card', () => {
    setGraph([handout, quiz]);
    show();
    expect(pendingTile()).toContain('1');
    expect(screen.getByText('1 pending')).toBeTruthy();
  });

  it('shows nothing due when a handout is the only task', () => {
    setGraph([handout]);
    show();
    expect(pendingTile()).toContain('0');
    expect(screen.getByText('Nothing due')).toBeTruthy();
    expect(screen.getByText('0 pending')).toBeTruthy();
    expect(screen.queryByText(/^Late by/)).toBeNull();
  });

  it('an in-progress row on a handout still does not count', () => {
    setGraph([handout], [{ id: 's', worksheet_id: 'a', status: 'in_progress', released: false }]);
    show();
    expect(screen.getByText('Nothing due')).toBeTruthy();
  });

  it('a submitted normal task is no longer pending', () => {
    setGraph([quiz], [{ id: 's', worksheet_id: 'q', status: 'submitted', released: false }]);
    show();
    expect(screen.getByText('Nothing due')).toBeTruthy();
    expect(screen.getByText('0 pending')).toBeTruthy();
  });

  it('a task with unknown data stays pending', () => {
    setGraph([{ ...handout, items: undefined }, { ...handout, id: 'b', instructions: null }]);
    show();
    expect(pendingTile()).toContain('2');
    expect(screen.getByText('2 pending')).toBeTruthy();
  });
});
