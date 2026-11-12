// @vitest-environment jsdom
// Clarity phase 4C: the Clarity Scores tab shows everything the classic tab
// shows, from the same data, and the switch keeps the classic tab by default.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const state = vi.hoisted(() => ({ graph: null, loading: false, refresh: null }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({
  useStudentData: () => ({ graph: state.graph, loading: state.loading, refresh: state.refresh }),
}));

import ScoresTab from '../../../pages/dashboards/student/tabs/ScoresTab';
import ClarityScoresTab from './ClarityScoresTab';
import ScoresTabSwitch from './ScoresTabSwitch';
import { CLARITY_STORAGE_KEY } from '../useClarityFlag';

// The same fixture as pages/dashboards/student/tabs/ScoresTab.test.jsx.
const sheet = (id, subject_id, extra = {}) => ({ id, title: `Task ${id}`, subject: 'Legacy', subject_id, task_type: 'quiz',
  items: 5, instructions: 'A.', ...extra });
const makeGraph = (extra = {}) => ({
  fatalError: null, scheduleError: null, enrolments: [], studentRecord: null, attendance: [],
  subjects: [], cardSubjectIds: new Set(), subjectsById: new Map([['eng', 'English'], ['math', 'Math']]),
  assignees: ['q1', 'q2', 'e1', 'm1', 'm2', 'act'].map(task_id => ({ task_id, section_id: 's', due_at: null, assigned_at: null })),
  sheetById: new Map([
    ['q1', sheet('q1', 'eng')],
    ['q2', sheet('q2', 'eng', { task_type: 'exam' })],
    ['e1', sheet('e1', 'eng')],
    ['m1', sheet('m1', 'math', { task_type: 'assignment' })],
    ['m2', sheet('m2', 'math')],
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

// One subject per entry, one released task each: [name, score, total].
const graphOf = (rows) => {
  const ids = rows.map((_, i) => `t${i}`);
  return makeGraph({
    subjectsById: new Map(rows.map(([name], i) => [`s${i}`, name])),
    assignees: ids.map(task_id => ({ task_id, section_id: 's', due_at: null, assigned_at: null })),
    sheetById: new Map(ids.map((id, i) => [id, sheet(id, `s${i}`)])),
    submissionStates: ids.map(id => ({ worksheet_id: id, status: 'checked', released: true, submitted_at: '2030-03-10T01:00:00+00:00' })),
    releasedScores: rows.map(([, score, total], i) => ({ worksheet_id: ids[i], score, total_points: total })),
  });
};

const show = (ui, path = '/student/scores') => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
const flat = text => text.replace(/\s+/g, ' ').trim();
const openAll = () => screen.queryAllByRole('button', { name: /Show released scores/ }).forEach(b => fireEvent.click(b));
const rowsOf = node => [...node.querySelectorAll('li')].map(li => flat(li.textContent));

afterEach(() => {
  cleanup();
  Object.assign(state, { graph: null, loading: false, refresh: null });
  try { window.localStorage.clear(); } catch { /* none */ }
});

describe('parity with the classic tab (same fixture, both versions)', () => {
  const facts = () => {
    const subjects = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    const buttons = screen.getAllByRole('button').map(b => b.getAttribute('aria-label') || b.textContent);
    openAll();
    const lists = [...document.querySelectorAll('ul[id^="scores-"]')].map(ul => [ul.id, rowsOf(ul)]);
    const body = flat(document.body.textContent);
    return { subjects, buttons, lists, body };
  };

  it('shows the same headings, buttons, released counts, awaiting text and item rows', () => {
    state.graph = makeGraph(); state.refresh = vi.fn();
    show(<ScoresTab />); const classic = facts(); cleanup();
    show(<ClarityScoresTab />); const clarity = facts();

    expect(clarity.subjects).toEqual(classic.subjects);
    expect(clarity.subjects).toEqual(['English', 'Math']);
    expect(clarity.buttons).toEqual(classic.buttons);
    expect(clarity.lists).toEqual(classic.lists);
    expect(clarity.lists[0][1]).toEqual(['Task q2ExamSubmitted Mar 12, 203015/20 · 75%', 'Task q1QuizSubmitted Mar 10, 20308/10 · 80%']);
    for (const text of ['Scores', 'Your released scores by subject.', 'Overall average', '3 released scores',
      '2 / 3', '1 / 2', '1 awaiting results']) {
      expect(classic.body, text).toContain(text);
      expect(clarity.body, text).toContain(text);
    }
    // The percentages: classic prints them; Clarity draws rings whose labels carry them.
    expect(classic.body).toContain('68%');
    expect(classic.body).toContain('78%');
    expect(classic.body).toContain('50%');
    const rings = screen.getAllByRole('img').map(i => i.getAttribute('aria-label'));
    expect(rings).toEqual(['68 percent, Overall average', '78 percent, English average', '50 percent, Math average']);
  });

  it('the refresh and retry buttons call the same refresh', () => {
    state.graph = makeGraph(); state.refresh = vi.fn();
    show(<ClarityScoresTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh scores' }));
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it('the toggle keeps aria-expanded and aria-controls', () => {
    state.graph = makeGraph();
    show(<ClarityScoresTab />);
    const toggle = screen.getByRole('button', { name: 'Show released scores (2)' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('scores-eng');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Hide released scores');
    expect(document.getElementById('scores-eng')).toBeTruthy();
  });
});

describe('the Clarity Scores tab', () => {
  it('shows the banner text exactly, in a banner', () => {
    state.graph = makeGraph();
    show(<ClarityScoresTab />);
    const banner = screen.getByText('Based on your released scores only. This is not an official grade.');
    expect(banner.className).toBe('x-banner');
  });

  it('a null percent says "No released scores", never 0, with no NaN or undefined in the markup', () => {
    state.graph = makeGraph({ releasedScores: [] });
    const { container } = show(<ClarityScoresTab />);
    expect(screen.getAllByText('No released scores')).toHaveLength(3); // overall, English, Math
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByText('No released scores yet.')).toBeTruthy();
    expect(screen.getByText('0 released scores')).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/NaN|undefined|0%|null/);
  });

  it('zero released but some awaiting: says both', () => {
    state.graph = makeGraph({ releasedScores: [] });
    show(<ClarityScoresTab />);
    const english = screen.getByRole('article', { name: 'English' });
    expect(within(english).getByText('No released scores')).toBeTruthy();
    expect(within(english).getByText('0 / 3')).toBeTruthy();
    expect(within(english).getByText('1 awaiting results')).toBeTruthy();
    expect(within(english).queryByRole('button')).toBeNull();
  });

  it('0, 100 and over-100 percents: real values in the text and labels, the ring clamped with a note', () => {
    state.graph = graphOf([['Alpha', 0, 10], ['Beta', 10, 10], ['Gamma', 12, 10]]);
    show(<ClarityScoresTab />);
    const labels = screen.getAllByRole('img').map(i => i.getAttribute('aria-label'));
    expect(labels).toContain('0 percent, Alpha average');
    expect(labels).toContain('100 percent, Beta average');
    expect(labels.some(l => l.includes('Gamma'))).toBe(false);
    openAll();
    expect(rowsOf(screen.getByRole('article', { name: 'Gamma' }))[0]).toContain('12/10 · 120%');
    expect(rowsOf(screen.getByRole('article', { name: 'Alpha' }))[0]).toContain('0/10 · 0%');
  });

  it('a very long subject name wraps', () => {
    const name = 'Mathematics'.repeat(30);
    state.graph = graphOf([[name, 5, 10]]);
    show(<ClarityScoresTab />);
    const heading = screen.getByRole('heading', { level: 2, name });
    expect(heading.style.overflowWrap).toBe('anywhere');
    expect(heading.style.minWidth).toBe('0px');
  });

  it('30 subjects: 30 cards, 30 rings plus the overall one', () => {
    state.graph = graphOf(Array.from({ length: 30 }, (_, i) => [`Subject ${String(i).padStart(2, '0')}`, i, 30]));
    show(<ClarityScoresTab />);
    expect(screen.getAllByRole('article')).toHaveLength(30);
    expect(screen.getAllByRole('img')).toHaveLength(31);
    expect(screen.getByText('30 released scores')).toBeTruthy();
  });

  it('loading: a status message, nothing else', () => {
    state.loading = true;
    show(<ClarityScoresTab />);
    expect(screen.getByRole('status').textContent).toBe('Loading your scores…');
    expect(screen.queryByRole('region', { name: 'Overall' })).toBeNull();
  });

  it('error: the same alert, explanation and Retry as the classic tab', () => {
    state.graph = makeGraph({ fatalError: new Error('boom') }); state.refresh = vi.fn();
    show(<ScoresTab />);
    const classic = flat(screen.getByRole('alert').parentElement.textContent);
    cleanup();
    show(<ClarityScoresTab />);
    expect(screen.getByRole('alert').textContent).toBe('Could not load your scores.');
    expect(flat(screen.getByRole('alert').parentElement.textContent)).toBe(classic);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('No released scores')).toBeNull();
  });

  it('empty (no subjects, no scores): the empty message and no cards', () => {
    state.graph = makeGraph({ assignees: [], submissionStates: [], releasedScores: [] });
    show(<ClarityScoresTab />);
    expect(screen.getByText('No released scores yet.')).toBeTruthy();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('no graph and not loading: only the header and banner, like the classic tab', () => {
    show(<ClarityScoresTab />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Scores');
    expect(screen.queryByRole('region', { name: 'Overall' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh scores' })).toBeNull();
  });
});

describe('ScoresTabSwitch', () => {
  it('flag off (the default) renders the classic tab exactly', () => {
    state.graph = makeGraph();
    const classic = show(<ScoresTab />).container.innerHTML;
    cleanup();
    const switched = show(<ScoresTabSwitch classic={ScoresTab} />, '/student/scores?clarity=0').container.innerHTML;
    expect(switched).toBe(classic);
    expect(document.querySelector('.x-banner')).toBeNull();
  });

  it('?clarity=0 or a stored flag decide as everywhere else', () => {
    state.graph = makeGraph();
    show(<ScoresTabSwitch classic={ScoresTab} />, '/student/scores?clarity=1');
    expect(document.querySelector('.x-banner')).toBeTruthy();
    cleanup();
    window.localStorage.setItem(CLARITY_STORAGE_KEY, '1');
    show(<ScoresTabSwitch classic={ScoresTab} />);
    expect(document.querySelector('.x-banner')).toBeTruthy();
    cleanup();
    show(<ScoresTabSwitch classic={ScoresTab} />, '/student/scores?clarity=0');
    expect(document.querySelector('.x-banner')).toBeNull();
  });
});

describe('source rules', () => {
  const SRC = resolve(['src', 'frontend/src'].find(p => existsSync(join(p, 'components', 'clarity'))));
  const source = readFileSync(join(SRC, 'components', 'clarity', 'student', 'ClarityScoresTab.jsx'), 'utf8');

  it('its own elements use only x-* classes (no Tailwind)', () => {
    const tokens = [...source.matchAll(/className="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/));
    expect(tokens.length).toBeGreaterThan(20);
    for (const t of tokens) expect(t, t).toMatch(/^(x-[a-z0-9-]+|g|t|m|in)$/);
    expect(source).not.toMatch(/className=\{/);
    expect(source).not.toMatch(/var\(--(?!cl-)/);
  });

  it('nothing outside StudentDashboard.jsx imports the switch (tests aside)', () => {
    const walk = dir => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const importers = walk(SRC)
      .filter(p => /\.(jsx?|tsx?)$/.test(p) && !/\.test\.(jsx?|tsx?)$/.test(p))
      .filter(p => /ScoresTabSwitch['"]/.test(readFileSync(p, 'utf8')))
      .map(p => relative(SRC, p).split(sep).join('/'));
    expect(importers).toEqual(['pages/dashboards/student/StudentDashboard.jsx']);
  });
});
