// @vitest-environment jsdom
// Clarity F3: presentation-only fidelity fixes against the final Admin design.
// The same real values, only their format/style: Schedules 12-hour times
// (no leading zero, AM/PM kept for screen readers), Calendar sentence-case
// day headers, the News featured image at about 55%, the Memos count pill.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));

import ClarityAdminSchedulesTab from './ClarityAdminSchedulesTab';
import ClarityAdminCalendarTab from './ClarityAdminCalendarTab';
import ClarityAdminMemosTab from './ClarityAdminMemosTab';

const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
const CSS = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const SCOPE = ['html.theme', 'clarity'].join('-');
const rule = sel => CSS.split('\n').find(l => l.trim().startsWith(`${SCOPE} ${sel} {`)) || '';
const noPreview = (container) => {
  const attrs = [...container.querySelectorAll('[aria-label],[title],[alt]')].flatMap(el => ['aria-label', 'title', 'alt'].map(a => el.getAttribute(a) || ''));
  expect(`${container.textContent} ${attrs.join(' ')}`).not.toMatch(/preview/i);
};

afterEach(() => { cleanup(); vi.useRealTimers(); });

// ------------------------------------------------------------- Schedules
describe('1. Schedules: 12-hour times from the same stored values', () => {
  const period = (id, day, start, end) => ({ id, section_id: 'a', subject_id: 'm', teacher_id: 't1', day_of_week: day, start_time: start, end_time: end, room_number: null });
  const ctx = (schedules) => ({
    schoolYear: '2026-2027', settingsSchoolYear: '2026-2027', schoolYearSource: 'settings',
    teachers: [{ id: 't1', name: 'Ana Cruz' }], teachersError: null, teachersLoading: false, fetchTeachers: vi.fn(),
    subjects: [{ id: 'm', name: 'Mathematics', code: 'MATH', is_active: true }], subjectsError: null, subjectsLoading: false, fetchSubjects: vi.fn(),
    sections: [{ id: 'a', name: '7-Rizal', grade_level: 'Grade 7', adviser_id: null }], sectionsError: null, sectionsLoading: false, fetchSections: vi.fn(),
    teachingLoad: [], teachingLoadError: null, teachingLoadLoading: false, fetchTeachingLoad: vi.fn(),
    schedules, schedulesLoading: false, schedulesError: null, fetchSchedules: vi.fn(),
    scheduleOpenSectionId: 'a', setScheduleOpenSectionId: vi.fn(),
    scheduleModal: false, openCreateSchedule: vi.fn(), closeScheduleModal: vi.fn(), saveSchedule: vi.fn(), deleteSchedule: vi.fn(),
    schedTeacher: '', setSchedTeacher: vi.fn(), schedSubject: '', schedSection: '', schedDay: 'Monday', setSchedDay: vi.fn(),
    schedStart: '08:00', setSchedStart: vi.fn(), schedEnd: '09:00', setSchedEnd: vi.fn(), schedRoom: '', setSchedRoom: vi.fn(), schedSaving: false,
    scheduleConflicts: [], scheduleCheckError: '',
  });
  const table = () => screen.getByRole('table', { name: 'Weekly timetable for 7-Rizal' });

  beforeEach(() => {
    h.ctx = ctx([
      period('p1', 'Monday', '00:00:00', '00:45:00'),
      period('p2', 'Monday', '07:30:00', '08:30:00'),
      period('p3', 'Tuesday', '11:15:00', '12:00:00'),
      period('p4', 'Tuesday', '12:00:00', '13:05:00'),
      period('p5', 'Wednesday', '22:00:00', '23:59:00'),
    ]);
  });

  it('visible labels: 12-hour, no leading zero, no AM/PM (midnight and noon are 12)', () => {
    show(ClarityAdminSchedulesTab);
    const visible = within(table()).getAllByRole('rowheader').map(th => th.querySelector('[aria-hidden="true"]').textContent);
    expect(visible).toEqual(['12:00 – 12:45', '7:30 – 8:30', '11:15 – 12:00', '12:00 – 1:05', '10:00 – 11:59']);
    for (const text of visible) expect(text).not.toMatch(/(^|\s)0\d:|AM|PM|1[3-9]:|2\d:/);
  });

  it('the accessible text keeps AM/PM, in the row headers and in every block', () => {
    show(ClarityAdminSchedulesTab);
    const spoken = within(table()).getAllByRole('rowheader').map(th => th.querySelector('.x-sr').textContent);
    expect(spoken).toEqual(['12:00 AM to 12:45 AM', '7:30 AM to 8:30 AM', '11:15 AM to 12:00 PM', '12:00 PM to 1:05 PM', '10:00 PM to 11:59 PM']);
    expect(within(table()).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual([
      'Mathematics, Ana Cruz, Monday 12:00 AM–12:45 AM',
      'Mathematics, Ana Cruz, Monday 7:30 AM–8:30 AM',
      'Mathematics, Ana Cruz, Tuesday 11:15 AM–12:00 PM',
      'Mathematics, Ana Cruz, Tuesday 12:00 PM–1:05 PM',
      'Mathematics, Ana Cruz, Wednesday 10:00 PM–11:59 PM',
    ]);
  });

  it('a stored value that is not HH:MM is shown as stored; no "preview"', () => {
    h.ctx = ctx([period('p1', 'Monday', 'later', '')]);
    const { container } = show(ClarityAdminSchedulesTab);
    expect(within(table()).getAllByRole('rowheader')[0].querySelector('[aria-hidden="true"]').textContent).toBe('later – ');
    noPreview(container);
  });
});

// ------------------------------------------------------------- Calendar
describe('2. Calendar: sentence-case day headers, Today kept', () => {
  const EVENTS = [{ id: 'e1', title: 'Science Fair', event_type: 'Event', event_date: '2026-11-10', end_date: null }];
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 11, 10, 0, 0));
    h.ctx = {
      calError: false, calEvents: EVENTS, calFilter: '', calGrid: Array.from({ length: 30 }, (_, i) => ({ d: i + 1, cur: true })), calLoading: false, calMonth: 10, calYear: 2026,
      closeModal: vi.fn(), deleteEvent: vi.fn(), editEvent: null, evDate: '', evDesc: '', evEnd: '', evSaving: false, evTitle: '',
      evCustomType: '', evType: 'Event', modal: null, nextMonth: vi.fn(), openCreateEvent: vi.fn(),
      openEditEvent: vi.fn(), prevMonth: vi.fn(), saveEvent: vi.fn(), setCalFilter: vi.fn(), setEvCustomType: vi.fn(), setEvDate: vi.fn(),
      setCalYear: vi.fn(), setEvDesc: vi.fn(), setEvEnd: vi.fn(), setEvTitle: vi.fn(), setEvType: vi.fn(), today: new Date(2026, 10, 11, 10, 0, 0),
      typeClass: () => 'ev-blue', typeColor: () => '#60a5fa', upcomingEvents: [], fetchCalEvents: vi.fn(),
    };
  });

  it('the labels read "Wed 11 · Today" and the header style no longer uppercases them', () => {
    const { container } = show(ClarityAdminCalendarTab);
    const heads = screen.getAllByRole('heading', { level: 2 }).map(h2 => h2.textContent);
    expect(heads).toEqual(['Mon 9', 'Tue 10', 'Wed 11 · Today', 'Thu 12', 'Fri 13']);
    const today = screen.getByRole('region', { name: /^Wed 11/ });
    expect(today.getAttribute('aria-current')).toBe('date');
    expect(rule('.x-cal-dayhead')).not.toMatch(/uppercase/);
    expect(rule('.x-cal-day.today .x-cal-dayhead')).toMatch(/color: var\(--cl-ac\)/);
    noPreview(container);
  });
});

// ------------------------------------------------------------- News
describe('3. News: the featured image takes about 55% of the card on desktop', () => {
  it('11fr : 9fr on desktop; one column on phone, unchanged; the no-image art kept', () => {
    expect(rule('.x-news-hero')).toMatch(/grid-template-columns: minmax\(0, 11fr\) minmax\(0, 9fr\);/);
    expect(11 / (11 + 9)).toBeCloseTo(0.55);
    const phone = CSS.split('\n').find(l => l.trim() === `${SCOPE} .x-news-hero { grid-template-columns: minmax(0, 1fr); }`);
    expect(phone).toBeTruthy();
    expect(rule('.x-news-art')).toMatch(/linear-gradient/);
  });
});

// ------------------------------------------------------------- Memos
describe('4. Memos: the column count as a small tinted pill, same value', () => {
  const MEMOS = [
    { id: 'm1', subject: 'Faculty meeting', from_office: 'Principal', recipient: 'All Faculty', content: 'A', created_at: '2026-11-10T03:00:00Z' },
    { id: 'm2', subject: 'Uniform', from_office: '', recipient: 'All Students', content: 'B', created_at: '2026-11-09T03:00:00Z' },
  ];
  const ctx = (extra = {}) => ({
    closeModal: vi.fn(), deleteMemo: vi.fn(), editMemo: null, filteredMemos: MEMOS, mBody: '', mFrom: '', mSaving: false, mSubj: '', mTo: 'All Faculty',
    memoFilter: '', memoSearch: '', memos: MEMOS, fetchMemos: vi.fn(), memosError: '', memosLoading: false, modal: null,
    openCompose: vi.fn(), openEditMemo: vi.fn(), saveMemo: vi.fn(), selMemo: null,
    setMBody: vi.fn(), setMFrom: vi.fn(), setMSubj: vi.fn(), setMTo: vi.fn(), setMemoFilter: vi.fn(), setMemoSearch: vi.fn(),
    setSelMemo: vi.fn(), users: [], ...extra,
  });

  it('the pill shows the same real count with its spoken unit; no pill while loading', () => {
    h.ctx = ctx();
    const { container } = show(ClarityAdminMemosTab);
    const pill = container.querySelector('.x-sec-colhead .x-memo-count');
    expect(pill.textContent).toBe('2 memos');
    expect(pill.querySelector('.x-sr').textContent).toBe(' memos');
    noPreview(container);
    cleanup();
    h.ctx = ctx({ memosLoading: true });
    expect(show(ClarityAdminMemosTab).container.querySelector('.x-memo-count')).toBeNull();
  });

  it('the pill style: tinted background, matching text, 12px bold, fully rounded', () => {
    const css = rule('.x-memo-count');
    for (const part of ['border-radius: 9999px', 'background: var(--cl-ok-s)', 'color: var(--cl-ok)', 'font-size: 12px', 'font-weight: 700']) expect(css).toContain(part);
  });
});

describe('scope', () => {
  it('the changed and new selectors are scoped under the theme class, with no !important or nowrap', () => {
    for (const sel of ['.x-cal-dayhead', '.x-news-hero', '.x-memo-count']) {
      const line = rule(sel);
      expect(line.startsWith(`${SCOPE} `), sel).toBe(true);
      expect(line).not.toMatch(/!important|nowrap/);
    }
  });
});

function show(Tab) { return render(<Tab />); }
