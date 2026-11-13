// @vitest-environment jsdom
// Clarity S1: the Student Overview in the final design. The only data sources
// are mocked (useAuth and useStudentData, the shared graph); every number,
// list and link is checked against the same helpers and against the previous
// Clarity Overview (itself parity-tested against the classic tab).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const state = vi.hoisted(() => ({ graph: null, loading: false, refresh: null, name: 'Sample Student' }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: state.name } }) }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({
  useStudentData: () => ({ graph: state.graph, loading: state.loading, refresh: state.refresh }),
}));

import OverviewTab from '../../../pages/dashboards/student/tabs/OverviewTab';
import ClarityOverviewTab from './ClarityOverviewTab';
import ClarityStudentOverviewTab from './ClarityStudentOverviewTab';
import OverviewTabSwitch from './OverviewTabSwitch';
import RankedBars from '../charts/RankedBars';
import { CLARITY_STORAGE_KEY } from '../useClarityFlag';

// 10:00 AM on Wed 13 Mar 2030 in Manila.
const NOW = new Date('2030-03-13T02:00:00Z');
const sheet = (id, subject_id, title = `Task ${id}`) => ({ id, title, subject: 'Legacy', subject_id, task_type: 'quiz', items: 5, instructions: 'A.' });
const TASKS = [
  { sheet: sheet('q1', 'eng', 'Photosynthesis worksheet'), due: '2030-03-13T17:00:00' },
  { sheet: sheet('q2', 'math', 'Linear equations'), due: '2030-03-15T08:00:00' },
  { sheet: sheet('q3', 'sci', 'Far away'), due: '2030-03-25T08:00:00' },
  { sheet: sheet('r1', 'eng'), submission: { status: 'checked', released: true } },
  { sheet: sheet('r2', 'math'), submission: { status: 'checked', released: true } },
  { sheet: sheet('r3', 'sci'), submission: { status: 'checked', released: true } },
];
const makeGraph = (tasks = TASKS, extra = {}) => ({
  fatalError: null, scheduleError: null,
  enrolments: [{ sections: { grade_level: 'Grade 8', name: 'Mabini', school_year: '2026-2027' } }],
  studentRecord: { lrn: '136482910027' },
  attendance: [{ status: 'present' }, { status: 'Present' }, { status: 'present' }, { status: 'absent' }],
  releasedScores: [{ worksheet_id: 'r1', score: 9, total_points: 10 }, { worksheet_id: 'r2', score: 6, total_points: 10 }, { worksheet_id: 'r3', score: 8, total_points: 10 }],
  subjects: [{ id: 'eng', name: 'English' }, { id: 'math', name: 'Mathematics' }, { id: 'sci', name: 'Science' }],
  subjectsById: new Map([['eng', 'English'], ['math', 'Mathematics'], ['sci', 'Science']]),
  submissionStates: tasks.filter(t => t.submission).map(t => ({ worksheet_id: t.sheet.id, ...t.submission })),
  assignees: tasks.map(t => ({ task_id: t.sheet.id, section_id: 's', due_at: t.due ?? null, assigned_at: null })),
  sheetById: new Map(tasks.map(t => [t.sheet.id, t.sheet])),
  ...extra,
});

const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; };
const show = (Tab, path = '/student-dashboard') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="*" element={<><Tab /><Where /></>} /></Routes>
  </MemoryRouter>,
);
const region = name => screen.getByRole('region', { name });
const tiles = () => [...region('Your progress').querySelectorAll('.x-kpi')].map(t => t.querySelector('.x-ov-kpi > div').textContent);
const links = (el) => within(el).queryAllByRole('link').map(a => a.getAttribute('href'));
const bars = () => [...region('Your subjects').querySelectorAll('.x-rank .r')].map(r => r.textContent);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  Object.assign(state, { graph: makeGraph(), loading: false, refresh: vi.fn(), name: 'Sample Student' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); try { window.localStorage.clear(); } catch { /* none */ } });

describe('layout from real data', () => {
  it('header, the real enrolment line, and the three tiles from the summary', () => {
    show(ClarityStudentOverviewTab);
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy();
    expect(screen.getByText('Your subjects, tasks and attendance at a glance.')).toBeTruthy();
    expect(screen.getByText('Grade 8 · Mabini · ID: 136482910027 · School Year 2026-2027')).toBeTruthy();
    expect(tiles()).toEqual([
      'Worksheet performance77%Average of 3 released scores',
      'Attendance75%3 of 4 recorded days',
      'Pending tasks31 due today',
    ]);
    expect(screen.getByRole('img', { name: 'Worksheet performance: 77 percent, average of 3 released scores' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Attendance: 75 percent, 3 of 4 recorded days present' })).toBeTruthy();
  });

  it('due today and this week: the real due-soon items, the same links as before, today marked as text', () => {
    show(ClarityOverviewTab);
    const before = links(region('Due today and this week'));
    cleanup();
    show(ClarityStudentOverviewTab);
    const due = region('Due today and this week');
    expect(within(due).getByText('1 due today · 2 this week')).toBeTruthy();
    expect(links(due)).toEqual(before);
    const items = within(due).getAllByRole('link').map(a => a.textContent);
    expect(items[0]).toMatch(/^Photosynthesis worksheetEnglish · Due Mar 13, 2030, 5:00 PMDue today$/);
    expect(items[1]).toMatch(/^Linear equationsMathematics · Due Mar 15, 2030, 8:00 AMMar 15, 2030$/);
    expect(within(due).queryByText('Far away')).toBeNull();
  });

  it('your subjects: real per-subject averages; Ranked (high to low) and Bars (subject order)', () => {
    show(ClarityStudentOverviewTab);
    expect(bars()).toEqual(['English90%', 'Science80%', 'Mathematics60%']);
    const ranked = screen.getByRole('button', { name: 'Ranked' });
    expect(ranked.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Bars' }));
    expect(bars()).toEqual(['English90%', 'Mathematics60%', 'Science80%']);
    expect(screen.getByRole('img', { name: /^Average of released scores by subject: English 90 percent, Mathematics 60 percent, Science 80 percent$/ })).toBeTruthy();
  });

  it('one subject with scores: no toggle; none: a clean empty state, no bars', () => {
    state.graph = makeGraph(TASKS, { releasedScores: [{ worksheet_id: 'r1', score: 9, total_points: 10 }] });
    show(ClarityStudentOverviewTab);
    expect(bars()).toEqual(['English90%']);
    expect(screen.queryByRole('button', { name: 'Ranked' })).toBeNull();
    cleanup();
    state.graph = makeGraph(TASKS, { releasedScores: [] });
    show(ClarityStudentOverviewTab);
    expect(within(region('Your subjects')).getByText('No released scores yet.')).toBeTruthy();
    expect(tiles()[0]).toBe('Worksheet performanceNo released scoresNo scores yet');
  });

  it('nothing invented: no welcome card, no teacher names, no placeholder dashes, no "preview"', () => {
    const { container } = show(ClarityStudentOverviewTab);
    expect(container.textContent).not.toMatch(/Welcome back|—|NaN|undefined/);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    const attrs = [...container.querySelectorAll('[aria-label],[title],[alt]')].flatMap(el => ['aria-label', 'title', 'alt'].map(a => el.getAttribute(a) || ''));
    expect(`${container.textContent} ${attrs.join(' ')}`).not.toMatch(/preview/i);
  });
});

describe('every previous function, same targets', () => {
  it('Tasks by subject: the same subject cards and links as before', () => {
    show(ClarityOverviewTab);
    const before = [...screen.getByRole('heading', { name: 'Your Subjects' }).closest('section').querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href')]);
    cleanup();
    show(ClarityStudentOverviewTab);
    const now = [...region('Tasks by subject').querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href')]);
    expect(now).toEqual(before);
    expect(now.map(([, href]) => href)).toEqual(['/student-dashboard/tasks?subject=eng', '/student-dashboard/tasks?subject=math', '/student-dashboard/tasks?subject=sci']);
  });

  it('a due task opens Tasks on its view and subject; See scores by subject; Refresh calls refresh', () => {
    show(ClarityStudentOverviewTab);
    fireEvent.click(within(region('Due today and this week')).getAllByRole('link')[0]);
    expect(screen.getByTestId('where').textContent).toBe('/student-dashboard/tasks?view=todo&subject=eng');
    cleanup();
    show(ClarityStudentOverviewTab);
    fireEvent.click(screen.getByRole('link', { name: 'See scores by subject →' }));
    expect(screen.getByTestId('where').textContent).toBe('/student-dashboard/scores');
    cleanup();
    show(ClarityStudentOverviewTab);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh overview' }));
    expect(state.refresh).toHaveBeenCalledTimes(1);
    cleanup();
    state.refresh = null;
    show(ClarityStudentOverviewTab);
    expect(screen.queryByRole('button', { name: 'Refresh overview' })).toBeNull();
  });
});

describe('states', () => {
  it('loading: loading texts, no numbers', () => {
    Object.assign(state, { graph: null, loading: true });
    const { container } = show(ClarityStudentOverviewTab);
    expect(tiles()).toEqual(['Worksheet performanceLoading…', 'AttendanceLoading…', 'Pending tasksLoading…']);
    expect(within(region('Due today and this week')).getByText('Loading your tasks…')).toBeTruthy();
    expect(within(region('Your subjects')).getByText('Loading your scores…')).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d+%|—/);
  });

  it('failed load: "Could not load" text everywhere, Retry on subjects calls refresh, never a dash or 0', () => {
    state.graph = makeGraph(TASKS, { fatalError: new Error('synthetic') });
    const { container } = show(ClarityStudentOverviewTab);
    expect(tiles()).toEqual(['Worksheet performanceCould not load', 'AttendanceCould not load', 'Pending tasksCould not load']);
    expect(screen.getByText('Could not load your enrolment')).toBeTruthy();
    expect(within(region('Due today and this week')).getByText('Could not load your tasks.')).toBeTruthy();
    fireEvent.click(within(region('Tasks by subject')).getByRole('button', { name: 'Retry' }));
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toMatch(/—|\b0%/);
  });

  it('nothing due, no attendance, not enrolled: the real empty texts', () => {
    state.graph = makeGraph(TASKS.slice(3), { attendance: [], enrolments: [], studentRecord: null });
    show(ClarityStudentOverviewTab);
    expect(screen.getByText('Not yet enrolled in a section')).toBeTruthy();
    expect(tiles()).toEqual(['Worksheet performance77%Average of 3 released scores', 'AttendanceNo data yetNot yet recorded', 'Pending tasks0Nothing due']);
    expect(within(region('Due today and this week')).getByText('Nothing due this week. Nice work!')).toBeTruthy();
  });
});

describe('switch, shared chart and CSS', () => {
  it('flag off: the classic tab exactly; flag on: the final-design Clarity tab', () => {
    const classic = show(OverviewTab, '/student-dashboard?clarity=0').container.innerHTML;
    cleanup();
    expect(show(() => <OverviewTabSwitch classic={OverviewTab} />, '/student-dashboard?clarity=0').container.innerHTML).toBe(classic);
    cleanup();
    window.sessionStorage.removeItem(CLARITY_STORAGE_KEY);
    const { container } = show(() => <OverviewTabSwitch classic={OverviewTab} />);
    expect(container.querySelector('.x-sov')).toBeTruthy();
  });

  it('RankedBars: the default output is unchanged by the new optional prop', () => {
    const rows = [{ label: 'B', value: 40 }, { label: 'A', value: 90 }, { label: 'C', value: null }];
    const plain = render(<RankedBars rows={rows} label="x" />).container.innerHTML;
    cleanup();
    expect(render(<RankedBars rows={rows} label="x" sorted />).container.innerHTML).toBe(plain);
    cleanup();
    const kept = render(<RankedBars rows={rows} label="x" sorted={false} />).container;
    expect([...kept.querySelectorAll('.r')].map(r => r.firstChild.textContent)).toEqual(['B', 'A', 'C']);
  });

  it('every x-sov selector is scoped under the theme class, with no !important or nowrap', () => {
    const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
    const css = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const scope = ['html.theme', 'clarity'].join('-');
    const groups = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => m[1].includes('.x-sov'));
    expect(groups.length).toBeGreaterThanOrEqual(10);
    for (const [, selectors, body] of groups) {
      for (const sel of selectors.split(',').filter(s => s.includes('.x-sov'))) expect(sel.trim().startsWith(`${scope} .x-`), sel).toBe(true);
      expect(body, selectors).not.toMatch(/!important|nowrap/);
    }
  });
});
