// @vitest-environment jsdom
// Clarity phase 4D-b: the school logo on the Clarity Overview, and the
// Scores tab printing out-of-range averages as the real number (no ring).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({
  useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }),
}));

import ClarityOverviewTab from './ClarityOverviewTab';
import ClarityScoresTab from './ClarityScoresTab';

const show = ui => render(<MemoryRouter>{ui}</MemoryRouter>);
const flat = t => t.replace(/\s+/g, ' ').trim();
const rings = () => [...document.querySelectorAll('svg[role="img"]')].map(s => s.getAttribute('aria-label'));

// One subject (Math), one released task with the given score out of 10.
const scoresGraph = score => ({
  fatalError: null, scheduleError: null, enrolments: [], studentRecord: null, attendance: [],
  subjects: [], cardSubjectIds: new Set(), subjectsById: new Map([['m', 'Math']]),
  assignees: [{ task_id: 't', section_id: 's', due_at: null, assigned_at: null }],
  sheetById: new Map([['t', { id: 't', title: 'Task t', subject_id: 'm', task_type: 'quiz', items: 5, instructions: 'A.' }]]),
  submissionStates: [{ worksheet_id: 't', status: 'checked', released: true, submitted_at: '2030-03-10T01:00:00+00:00' }],
  releasedScores: [{ worksheet_id: 't', score, total_points: 10 }],
});
const overviewGraph = () => ({
  fatalError: null, scheduleError: null, studentRecord: { student_number: 'S-1' },
  enrolments: [{ section_id: 's', sections: { name: 'Madrid', grade_level: 'Grade 7', school_year: '2026-2027' } }],
  attendance: [], releasedScores: [], subjects: [], cardSubjectIds: new Set(), subjectsById: new Map(),
  submissionStates: [], assignees: [], sheetById: new Map(),
});

beforeEach(() => {
  window.matchMedia = vi.fn(q => ({ matches: q === '(min-width: 640px)', addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { cleanup(); delete window.matchMedia; state.graph = null; });

describe('Clarity Overview: school logo', () => {
  const card = () => screen.getByRole('heading', { level: 2, name: /^Welcome back/ }).closest('.x-card');

  it('shows the classic logo with alt "School Logo" in a fixed 56px box', () => {
    state.graph = overviewGraph();
    show(<ClarityOverviewTab />);
    const logo = screen.getByRole('img', { name: 'School Logo' });
    expect(logo.getAttribute('src')).toBe('/capstonelogo.png');
    expect(card().contains(logo)).toBe(true);
    expect([logo.style.width, logo.style.height, logo.style.flex]).toEqual(['56px', '56px', '0 0 auto']);
    expect(logo.style.visibility).toBe('visible');
  });

  it('after an error it is hidden, its box is kept, and the rest of the card is unchanged', () => {
    state.graph = overviewGraph();
    show(<ClarityOverviewTab />);
    const logo = screen.getByRole('img', { name: 'School Logo' });
    const before = flat(card().textContent);
    fireEvent.error(logo);
    expect(logo.isConnected).toBe(true);
    expect(logo.style.visibility).toBe('hidden');
    expect([logo.style.width, logo.style.height]).toEqual(['56px', '56px']);
    expect(flat(card().textContent)).toBe(before);
    expect(before).toBe('Welcome back, Sample Student!Grade 7 · Madrid · ID: S-1School Year2026-2027');
  });
});

describe('Clarity Scores: values outside 0-100', () => {
  const overall = () => screen.getByRole('region', { name: 'Overall' });
  const math = () => screen.getByRole('article', { name: 'Math' });
  const itemRow = () => {
    fireEvent.click(screen.getByRole('button', { name: /Show released scores/ }));
    return flat(math().querySelector('li').textContent);
  };

  it('120: "120%" visible for overall, subject and item; no ring drawn above 100', () => {
    state.graph = scoresGraph(12);
    const { container } = show(<ClarityScoresTab />);
    expect(flat(overall().textContent)).toBe('Overall average120%1 released score');
    expect(math().textContent).toContain('120%');
    expect(itemRow()).toBe('Task tQuizSubmitted Mar 10, 203012/10 · 120%');
    expect(rings()).toEqual([]);
    expect(container.textContent).not.toMatch(/100%/);
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
  });

  it('-20: "-20%" visible everywhere, no ring', () => {
    state.graph = scoresGraph(-2);
    const { container } = show(<ClarityScoresTab />);
    expect(overall().textContent).toContain('-20%');
    expect(math().textContent).toContain('-20%');
    expect(itemRow()).toBe('Task tQuizSubmitted Mar 10, 2030-2/10 · -20%');
    expect(rings()).toEqual([]);
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
  });

  it('NaN (a non-numeric score): no data, never printed', () => {
    state.graph = scoresGraph('abc');
    const { container } = show(<ClarityScoresTab />);
    expect(overall().textContent).toContain('No released scores');
    expect(math().textContent).toContain('No released scores');
    expect(itemRow()).toBe('Task tQuizSubmitted Mar 10, 2030abc/10 · —');
    expect(rings()).toEqual([]);
    expect(container.innerHTML).not.toMatch(/NaN|undefined/);
  });

  it('in range (0 and 100) still draws rings with the real value in the label', () => {
    state.graph = scoresGraph(10);
    show(<ClarityScoresTab />);
    expect(rings()).toEqual(['100 percent, Overall average', '100 percent, Math average']);
    cleanup();
    state.graph = scoresGraph(0);
    show(<ClarityScoresTab />);
    expect(rings()).toEqual(['0 percent, Overall average', '0 percent, Math average']);
  });
});
