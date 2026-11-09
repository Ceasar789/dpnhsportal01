// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null, loading: false, refresh: null }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../StudentDataContext', () => ({ useStudentData: () => ({ graph: state.graph, loading: state.loading, refresh: state.refresh }) }));

import ScoresTab from './ScoresTab';
import OverviewTab from './OverviewTab';
import { overallScores, scoresBySubject } from '../scoresView';

const sheet = (id, subject_id, extra = {}) => ({ id, title: `Task ${id}`, subject: 'Legacy', subject_id, task_type: 'quiz',
  items: 5, instructions: 'A.', ...extra });
const makeGraph = (extra = {}) => ({
  fatalError: null, scheduleError: null, enrolments: [], studentRecord: null, attendance: [],
  subjects: [], cardSubjectIds: new Set(), subjectsById: new Map([['eng', 'English'], ['math', 'Math']]),
  assignees: ['q1', 'q2', 'e1', 'm1', 'm2', 'act'].map(task_id => ({ task_id, section_id: 's', due_at: null, assigned_at: null })),
  sheetById: new Map([
    ['q1', sheet('q1', 'eng')],
    ['q2', sheet('q2', 'eng', { task_type: 'exam' })],
    ['e1', sheet('e1', 'eng')], // essay quiz, submitted, not released
    ['m1', sheet('m1', 'math', { task_type: 'assignment' })],
    ['m2', sheet('m2', 'math')], // not started
    ['act', sheet('act', 'math', { task_type: 'worksheet', items: 0, instructions: 'Do this.' })],
  ]),
  submissionStates: [
    { worksheet_id: 'q1', status: 'checked', released: true, submitted_at: '2030-03-10T01:00:00+00:00' },
    { worksheet_id: 'q2', status: 'checked', released: true, submitted_at: '2030-03-12T01:00:00+00:00' },
    { worksheet_id: 'e1', status: 'submitted', released: false, submitted_at: '2030-03-11T01:00:00+00:00' },
    { worksheet_id: 'm1', status: 'checked', released: true, submitted_at: '2030-03-09T01:00:00+00:00' },
  ],
  releasedScores: [
    { worksheet_id: 'q1', score: 8, total_points: 10 },
    { worksheet_id: 'q2', score: 15, total_points: 20 },
    { worksheet_id: 'm1', score: 3, total_points: 6 },
  ],
  ...extra,
});
const showScores = () => render(<MemoryRouter><ScoresTab /></MemoryRouter>);
const subjectCard = name => screen.getByRole('heading', { name }).parentElement;

afterEach(() => { cleanup(); state.loading = false; state.refresh = null; });

describe('scoresView', () => {
  it('uses the Overview rule and groups by subject, alphabetically, without Activities', () => {
    const graph = makeGraph();
    expect(overallScores(graph)).toEqual({ percent: 68, count: 3 }); // (80 + 75 + 50) / 3
    const subjects = scoresBySubject(graph);
    expect(subjects.map(s => s.name)).toEqual(['English', 'Math']);
    expect(subjects[0]).toMatchObject({ assigned: 3, awaiting: 1, percent: 78 });
    expect(subjects[0].items.map(i => i.id)).toEqual(['q2', 'q1']);
    expect(subjects[1]).toMatchObject({ assigned: 2, awaiting: 0, percent: 50 });
  });

  it('skips a released row without a usable score, like the Overview', () => {
    const graph = makeGraph({ releasedScores: [{ worksheet_id: 'q1', score: null, total_points: 10 }, { worksheet_id: 'q2', score: 5, total_points: 0 }] });
    expect(overallScores(graph)).toEqual({ percent: null, count: 0 });
  });
});

describe('Scores tab', () => {
  it('shows the note, the overall card and one card per subject', () => {
    state.graph = makeGraph();
    showScores();
    expect(screen.getByText('Based on your released scores only. This is not an official grade.')).toBeTruthy();
    const overall = within(screen.getByRole('region', { name: 'Overall' }));
    expect(overall.getByText('68%')).toBeTruthy();
    expect(overall.getByText('3 released scores')).toBeTruthy();
    const english = subjectCard('English');
    expect(english.textContent).toContain('78%');
    expect(english.textContent).toContain('2 / 3');
    expect(within(english).getByText('1 awaiting results')).toBeTruthy();
    expect(subjectCard('Math').textContent).toContain('1 / 2');
  });

  it('lists only released items, with type, score, percent and Manila date', () => {
    state.graph = makeGraph();
    showScores();
    const english = subjectCard('English');
    const toggle = within(english).getByRole('button', { name: 'Show released scores (2)' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const items = within(english).getAllByRole('listitem').map(li => li.textContent);
    expect(items).toEqual([
      'Task q2ExamSubmitted Mar 12, 203015/20 · 75%',
      'Task q1QuizSubmitted Mar 10, 20308/10 · 80%',
    ]);
    expect(within(english).queryByText(/Task e1/)).toBeNull();
    expect(screen.queryByText(/Task act/)).toBeNull();
  });

  it('agrees with the Overview Worksheet Performance number', () => {
    state.graph = makeGraph();
    render(<MemoryRouter><OverviewTab /></MemoryRouter>);
    expect(screen.getByText('Worksheet Performance').parentElement.textContent).toContain('68%');
    expect(screen.getByRole('link', { name: 'See scores by subject →' }).getAttribute('href')).toBe('/student-dashboard/scores');
  });

  it('says so when nothing is released yet', () => {
    state.graph = makeGraph({ releasedScores: [], submissionStates: [{ worksheet_id: 'q1', status: 'submitted', released: false }] });
    showScores();
    expect(screen.getByText('No released scores yet.')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Overall' })).getByText('—')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Show released scores/ })).toBeNull();
  });

  it('a failed load shows an error with Retry, not an empty list', () => {
    state.refresh = vi.fn();
    state.graph = makeGraph({ fatalError: { message: 'offline' } });
    showScores();
    expect(screen.getByText('Could not load your scores.')).toBeTruthy();
    expect(screen.queryByText('No released scores yet.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.refresh).toHaveBeenCalled();
  });
});
