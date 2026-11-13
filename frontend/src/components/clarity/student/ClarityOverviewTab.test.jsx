// @vitest-environment jsdom
// Clarity phase 4D: the Clarity Overview shows what the classic Overview
// shows, from the same graph, and overviewSummary (a temporary copy of the
// classic tab's rules) gives the classic tab's numbers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const state = vi.hoisted(() => ({ graph: null, loading: false, refresh: null }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: state.name } }) }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({
  useStudentData: () => ({ graph: state.graph, loading: state.loading, refresh: state.refresh }),
}));

import OverviewTab from '../../../pages/dashboards/student/tabs/OverviewTab';
import ClarityOverviewTab from './ClarityOverviewTab';
import OverviewTabSwitch from './OverviewTabSwitch';
import { overviewSummary } from './overviewSummary';
import { CLARITY_STORAGE_KEY } from '../useClarityFlag';

// 10:00 AM on Wed 13 Mar 2030 in Manila (the dueSoon test's clock).
const NOW = new Date('2030-03-13T02:00:00Z');
const quiz = (id, subject_id = 'eng', extra = {}) => ({ id, title: `Task ${id}`, subject: 'Legacy', subject_id, task_type: 'quiz', items: 5, instructions: 'A.', ...extra });
const handout = (id, subject_id = 'eng') => ({ id, title: `Activity ${id}`, subject_id, task_type: 'worksheet', items: 0, instructions: 'Do this.' });
// tasks: [{ sheet, due, submission }]
const makeGraph = (tasks = [], extra = {}) => ({
  fatalError: null, scheduleError: null, enrolments: [], studentRecord: null, attendance: [], releasedScores: [],
  subjects: [{ id: 'eng', name: 'English' }], cardSubjectIds: new Set(['eng']), subjectsById: new Map([['eng', 'English']]),
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
const flat = t => t.replace(/\s+/g, ' ').trim();
const progress = () => screen.getByRole('region', { name: 'Your progress' });
const tile = label => flat(within(progress()).getByText(label, { selector: 'p,span,div' }).closest('.x-kpi, .rounded-xl').textContent);
const due = () => screen.getByRole('region', { name: 'Due today and this week' });
const countOf = label => within(due()).getByText(label).nextElementSibling.textContent;
const dueLinks = () => within(due()).queryAllByRole('link').map(a => [a.textContent, a.getAttribute('href')]);
const subjectsHeading = () => screen.getByRole('heading', { name: 'Your Subjects' });

// The subject entries of either version: [text, tone] in order.
const LATE_CLASSIC = 'var(--badge-red-fg)';
const classicSubjects = () => [...subjectsHeading().closest('.p-5').querySelectorAll('button')]
  .map(b => [b.textContent, [...b.querySelectorAll('span')].some(s => (s.getAttribute('style') || '').includes(LATE_CLASSIC)) ? 'late' : 'neutral']);
const claritySubjects = () => [...subjectsHeading().closest('section').querySelectorAll('a')]
  .map(a => [a.textContent, a.querySelector('.x-badge.er') ? 'late' : 'neutral']);

// Everything visible that both versions must agree on.
const facts = (version) => {
  const body = flat(document.body.textContent);
  return {
    welcome: screen.getByRole('heading', { level: 2, name: /^Welcome back/ }).textContent,
    schoolYear: body.includes('School Year'),
    dueToday: countOf('Due today'), thisWeek: countOf('This week'), dueLinks: dueLinks(),
    subjects: version === 'classic' ? classicSubjects() : claritySubjects(),
    scoresLink: screen.getByRole('link', { name: 'See scores by subject →' }).getAttribute('href'),
  };
};

// The tile texts the classic shows, derived from overviewSummary.
const expectedTiles = (s) => ({
  perf: s.performance ? [`${s.performance.percent}%`, `${s.performance.count} worksheet${s.performance.count === 1 ? '' : 's'}`] : ['No scores yet'],
  att: s.attendance ? [`${s.attendance.percent}%`, `${s.attendance.present} of ${s.attendance.total} days`] : ['Not yet recorded'],
  pend: [String(s.pendingCount), s.pendingCount === 0 ? 'Nothing due' : `task${s.pendingCount === 1 ? '' : 's'} due`],
});

const compare = (graph) => {
  state.graph = graph;
  const summary = overviewSummary(graph, state.name);
  const want = expectedTiles(summary);
  show(OverviewTab);
  const classic = facts('classic');
  const classicTiles = { perf: tile('Worksheet Performance'), att: tile('Attendance'), pend: tile('Pending Tasks') };
  cleanup();
  show(ClarityOverviewTab);
  const clarity = facts('clarity');
  const clarityTiles = { perf: tile('Worksheet Performance'), att: tile('Attendance'), pend: tile('Pending Tasks') };
  expect(clarity).toEqual(classic);
  for (const key of ['perf', 'att', 'pend']) {
    for (const text of want[key]) {
      expect(classicTiles[key], `classic ${key}`).toContain(text);
      expect(clarityTiles[key], `clarity ${key}`).toContain(text);
    }
  }
  expect(document.body.innerHTML).not.toMatch(/NaN|undefined/);
  return { classic, clarity, summary };
};

let mql;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  Object.assign(state, { graph: null, loading: false, refresh: vi.fn(), name: 'Sample Student' });
  mql = vi.fn(query => ({ matches: query === '(min-width: 640px)', addEventListener() {}, removeEventListener() {} }));
  window.matchMedia = mql;
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); delete window.matchMedia;
  try { window.localStorage.clear(); window.sessionStorage.clear(); } catch { /* none */ }
});

describe('parity with the classic Overview (same graph, both versions)', () => {
  it('the dueSoon fixture: counts, items, order, hrefs, pending', () => {
    const { clarity } = compare(makeGraph([
      { sheet: quiz('today'), due: '2030-03-13T23:59:00' },
      { sheet: quiz('friday', null), due: '2030-03-15T08:00:00' },
      { sheet: quiz('far'), due: '2030-04-30T08:00:00' },
      { sheet: quiz('handed'), due: '2030-03-13T23:00:00', submission: { status: 'submitted' } },
    ]));
    expect([clarity.dueToday, clarity.thisWeek]).toEqual(['1', '2']);
    expect(clarity.dueLinks).toEqual([
      ['Task todayEnglishDue Mar 13, 2030, 11:59 PM', '/student-dashboard/tasks?view=todo&subject=eng'],
      ['Task fridayLegacyDue Mar 15, 2030, 8:00 AM', '/student-dashboard/tasks?view=upcoming'],
    ]);
    expect(tile('Pending Tasks')).toContain('3');
  });

  it('nothing due this week', () => {
    compare(makeGraph([{ sheet: quiz('far'), due: '2030-04-30T08:00:00' }]));
    expect(within(due()).getByText('Nothing due this week. Nice work!')).toBeTruthy();
  });

  it.each([
    ['a handout is not pending', [handout('a', 'eng'), quiz('q')], []],
    ['only a handout', [handout('a', 'eng')], []],
    ['in_progress on a handout', [handout('a', 'eng')], [{ worksheet_id: 'a', status: 'in_progress', released: false }]],
    ['a submitted task', [quiz('q')], [{ worksheet_id: 'q', status: 'submitted', released: false }]],
    ['in_progress on a quiz stays pending', [quiz('q')], [{ worksheet_id: 'q', status: 'in_progress', released: false }]],
    ['released and unreleased', [quiz('q'), quiz('r')], [{ worksheet_id: 'q', status: 'checked', released: true }, { worksheet_id: 'r', status: 'checked', released: false }]],
    ['unknown handout data stays pending', [{ ...handout('a'), items: undefined }, { ...handout('b'), instructions: null }], []],
  ])('handout fixture: %s', (_, sheets, submissionStates) => {
    compare(makeGraph(sheets.map(sheet => ({ sheet, due: '2000-01-15T23:59:00' })), { submissionStates }));
  });

  it('overdue (Late by …, red in both), due today, in 7 days (counted), in 8 days (not counted), no subject', () => {
    const { clarity } = compare(makeGraph([
      { sheet: quiz('late') , due: '2030-03-12T08:00:00' },
      { sheet: quiz('today'), due: '2030-03-13T23:00:00' },
      { sheet: quiz('seven'), due: '2030-03-20T08:00:00' },
      { sheet: quiz('eight'), due: '2030-03-21T08:00:00' },
      { sheet: quiz('nosub', null), due: '2030-03-14T08:00:00' },
    ]));
    expect(clarity.dueLinks.map(([t]) => t.split('Due')[0])).toEqual(['Task todayEnglish', 'Task nosubLegacy', 'Task sevenEnglish']);
    expect(clarity.subjects).toEqual([[expect.stringMatching(/^English4 pendingLate by /), 'late']]);
  });

  it('the neutral fixture: 80%, 50%, 1, enrolment line, school year', () => {
    compare(makeGraph([{ sheet: quiz('q', 'english'), due: '2099-01-15T23:59:00' }], {
      enrolments: [{ section_id: 's', sections: { name: 'Madrid', grade_level: 'Grade 7', school_year: '2026-2027' } }],
      studentRecord: { student_number: 'S-1' },
      attendance: [{ status: 'Present' }, { status: 'Absent' }],
      releasedScores: [{ worksheet_id: 'x', score: 8, total_points: 10 }],
      subjects: [{ id: 'english', name: 'English' }],
    }));
    expect(screen.getByText('Grade 7 · Madrid · ID: S-1')).toBeTruthy();
    expect(screen.getByText('2026-2027')).toBeTruthy();
    const labels = screen.getAllByRole('img').filter(i => i.tagName.toLowerCase() === 'svg').map(i => i.getAttribute('aria-label'));
    expect(labels).toEqual(['80 percent, Worksheet Performance', '50 percent, Attendance']);
  });

  it('the schoolYear fixture: newest year; hidden when unknown', () => {
    compare(makeGraph([], { subjects: [], enrolments: [
      { section_id: 'a', sections: { name: 'Rizal', grade_level: '7', school_year: '2025-2026' } },
      { section_id: 'b', sections: { name: 'Mabini', grade_level: '8', school_year: '2026-2027' } }] }));
    expect(screen.getByText('2026-2027')).toBeTruthy();
    cleanup();
    compare(makeGraph([], { enrolments: [{ section_id: 'a', sections: { name: 'Rizal', grade_level: '7', school_year: null } }] }));
    expect(screen.queryByText('School Year')).toBeNull();
  });

  it('zero scores and zero attendance rows: no ring, never 0%', () => {
    compare(makeGraph([]));
    expect(within(progress()).getByText('No released scores')).toBeTruthy();
    expect(within(progress()).getByText('No data yet')).toBeTruthy();
    expect(screen.queryAllByRole('img').filter(i => i.tagName.toLowerCase() === 'svg')).toHaveLength(0);
    expect(progress().textContent).not.toContain('0%');
  });

  it('0%, 100% and over 100%', () => {
    compare(makeGraph([], { releasedScores: [{ worksheet_id: 'a', score: 12, total_points: 10 }], attendance: [{ status: 'Absent' }] }));
    let labels = screen.getAllByRole('img').filter(i => i.tagName.toLowerCase() === 'svg').map(i => i.getAttribute('aria-label'));
    // 120%: no ring (it could only draw 100%); the plain 120% the classic prints.
    expect(labels).toEqual(['0 percent, Attendance']);
    expect(tile('Worksheet Performance')).toContain('120%');
    expect(tile('Worksheet Performance')).toContain('1 worksheet');
    cleanup();
    compare(makeGraph([], { releasedScores: [{ worksheet_id: 'a', score: 0, total_points: 10 }], attendance: [{ status: 'present' }] }));
    labels = screen.getAllByRole('img').filter(i => i.tagName.toLowerCase() === 'svg').map(i => i.getAttribute('aria-label'));
    expect(labels).toEqual(['0 percent, Worksheet Performance', '100 percent, Attendance']);
  });

  it('long names wrap; the name falls back to "Student"', () => {
    const long = 'Mathematics'.repeat(25);
    state.name = '';
    compare(makeGraph([{ sheet: quiz('x'.repeat(200)), due: '2030-03-14T08:00:00' }], {
      subjects: [{ id: 'eng', name: long }], subjectsById: new Map([['eng', long]]) }));
    expect(screen.getByRole('heading', { level: 2, name: 'Welcome back, Student!' })).toBeTruthy();
    const card = screen.getByRole('link', { name: new RegExp(`^${long}`) });
    expect(card.querySelector('.x-ct').style.overflowWrap).toBe('anywhere');
    expect(within(due()).getByText(`Task ${'x'.repeat(200)}`).style.overflowWrap).toBe('anywhere');
  });

  it('30 subjects', () => {
    const subjects = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, name: `Subject ${i}` }));
    const { clarity } = compare(makeGraph(subjects.map((s, i) => ({ sheet: quiz(`t${i}`, s.id), due: '2030-03-14T08:00:00' })), { subjects }));
    expect(clarity.subjects).toHaveLength(30);
  });

  it('a subject card opens Tasks for that subject in both versions', () => {
    state.graph = makeGraph([{ sheet: quiz('q'), due: '2030-03-14T08:00:00' }]);
    show(OverviewTab);
    fireEvent.click(classicSubjects().length && subjectsHeading().closest('.p-5').querySelector('button'));
    const classic = screen.getByTestId('where').textContent;
    cleanup();
    show(ClarityOverviewTab);
    const link = subjectsHeading().closest('section').querySelector('a');
    expect(link.getAttribute('href')).toBe(classic);
    expect(classic).toBe('/student-dashboard/tasks?subject=eng');
  });
});

describe('states (both versions)', () => {
  const texts = () => flat(document.body.textContent);

  it('null graph: welcome, not enrolled, dashes are not shown as 0%', () => {
    state.graph = null;
    show(OverviewTab); const classic = texts(); cleanup();
    show(ClarityOverviewTab); const clarity = texts();
    for (const t of ['Welcome back, Sample Student!', 'Not yet enrolled in a section', 'No scores yet', 'Not yet recorded',
      'Nothing due', 'Nothing due this week. Nice work!', 'No subjects scheduled yet.']) {
      expect(classic, t).toContain(t);
      expect(clarity, t).toContain(t);
    }
  });

  it('loading: visible loading text, no numbers', () => {
    state.loading = true;
    show(ClarityOverviewTab);
    expect(screen.getByText('Loading your enrolment…')).toBeTruthy();
    expect(within(progress()).getAllByText('Loading…')).toHaveLength(3);
    expect(countOf('Due today')).toBe('Loading…');
    expect(screen.getByText('Loading your subjects…').getAttribute('role')).toBe('status');
    expect(screen.queryByText('School Year')).toBeNull();
  });

  it.each([['fatalError'], ['scheduleError']])('%s: the same failure texts, Retry calls refresh', (key) => {
    state.graph = makeGraph([], { [key]: new Error('boom'), enrolments: [{ sections: { name: 'A', grade_level: 'B', school_year: '2026-2027' } }] });
    show(OverviewTab); const classic = texts(); cleanup();
    show(ClarityOverviewTab); const clarity = texts();
    for (const t of ['Could not load your enrolment', 'Could not load', 'Could not load your tasks.', 'Could not load your subjects.',
      'Check your connection and try again.']) {
      expect(classic, t).toContain(t);
      expect(clarity, t).toContain(t);
    }
    expect(countOf('Due today')).toBe('—');
    expect(clarity).not.toContain('School Year');
    expect(clarity).not.toContain('0%');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it('header: h1, subtitle, Refresh overview only with a refresh function', () => {
    state.graph = makeGraph();
    show(ClarityOverviewTab);
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy();
    expect(screen.getByText('Your subjects, tasks and attendance at a glance.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh overview' }));
    expect(state.refresh).toHaveBeenCalledTimes(1);
    cleanup();
    state.refresh = null;
    show(ClarityOverviewTab);
    expect(screen.queryByRole('button', { name: 'Refresh overview' })).toBeNull();
  });

  it('School Year follows the 640px breakpoint like the classic sm:block', () => {
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    state.graph = makeGraph([], { enrolments: [{ sections: { name: 'A', grade_level: 'B', school_year: '2026-2027' } }] });
    show(ClarityOverviewTab);
    expect(screen.queryByText('School Year')).toBeNull();
  });
});

describe('overviewSummary against the classic rules', () => {
  it('null graph and failures give the blank summary with the name fallback', () => {
    const blank = { info: { name: 'Student', studentId: null, gradeLevel: null, section: null, schoolYear: null },
      performance: null, attendance: null, subjects: [], tasksBySubject: {}, pendingCount: 0 };
    expect(overviewSummary(null, '')).toEqual(blank);
    expect(overviewSummary(makeGraph([], { fatalError: new Error('x') }), undefined)).toEqual(blank);
    expect(overviewSummary(makeGraph([], { scheduleError: new Error('x') }), null)).toEqual(blank);
  });

  it('buckets: nearest pending due per subject; a task with no subject counts but has no bucket; LRN fallback', () => {
    const s = overviewSummary(makeGraph([
      { sheet: quiz('a'), due: '2030-03-20T08:00:00' },
      { sheet: quiz('b'), due: '2030-03-14T08:00:00' },
      { sheet: quiz('c'), due: '2030-03-10T08:00:00', submission: { status: 'submitted' } },
      { sheet: quiz('d', null), due: null },
    ], { studentRecord: { lrn: '123' }, releasedScores: [{ score: null, total_points: 10 }, { score: 5, total_points: 0 }, { score: 3, total_points: 4 }] }), 'A');
    expect(s.pendingCount).toBe(3);
    expect(s.tasksBySubject).toEqual({ eng: { total: 3, pendingCount: 2, nearestDue: '2030-03-14T08:00:00' } });
    expect(s.info.studentId).toBe('123');
    expect(s.performance).toEqual({ percent: 75, count: 1 });
  });
});

describe('switch and source rules', () => {
  it('flag off (the default) renders the classic tab exactly', () => {
    state.graph = makeGraph([{ sheet: quiz('q'), due: '2030-03-14T08:00:00' }]);
    const classic = show(OverviewTab, '/student-dashboard?clarity=0').container.innerHTML;
    cleanup();
    const switched = show(() => <OverviewTabSwitch classic={OverviewTab} />, '/student-dashboard?clarity=0').container.innerHTML;
    expect(switched).toBe(classic);
  });

  it('flag on (stored) renders the Clarity tab', () => {
    window.localStorage.setItem(CLARITY_STORAGE_KEY, '1');
    state.graph = makeGraph();
    show(() => <OverviewTabSwitch classic={OverviewTab} />);
    expect(document.querySelector('.x-kpis')).toBeTruthy();
  });

  const SRC = resolve(['src', 'frontend/src'].find(p => existsSync(join(p, 'components', 'clarity'))));
  const source = readFileSync(join(SRC, 'components', 'clarity', 'student', 'ClarityOverviewTab.jsx'), 'utf8');

  it('its own elements use only x-* classes; no gradient, no non-Clarity variables, never "Average Grade"', () => {
    const tokens = [...source.matchAll(/className[=:]\s*\{?['"]([^'"]*)['"]/g)].flatMap(m => m[1].split(/\s+/));
    expect(tokens.length).toBeGreaterThan(25);
    for (const t of tokens) expect(t, t).toMatch(/^(x-[a-z0-9-]+|g|t|m|er)$/);
    expect(source).not.toMatch(/gradient|--banner-|Average Grade/i);
    expect(source).not.toMatch(/var\(--(?!cl-)/);
  });

  it('nothing outside StudentDashboard.jsx imports the switch (tests aside)', () => {
    const walk = dir => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const importers = walk(SRC)
      .filter(p => /\.(jsx?|tsx?)$/.test(p) && !/\.test\.(jsx?|tsx?)$/.test(p))
      .filter(p => /OverviewTabSwitch['"]/.test(readFileSync(p, 'utf8')))
      .map(p => relative(SRC, p).split(sep).join('/'));
    expect(importers).toEqual(['pages/dashboards/student/StudentDashboard.jsx']);
  });
});
