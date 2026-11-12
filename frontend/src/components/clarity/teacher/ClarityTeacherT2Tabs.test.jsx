// @vitest-environment jsdom
// Clarity T2: the Teacher Overview, Students and Announcements tabs. Supabase
// is mocked (a fake query builder that answers per table); nothing reaches a
// real project. Each Clarity tab is checked against the classic tab on the
// same data: the same numbers, rows, texts, states and navigation targets.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({ fail: new Set(), calls: [], data: {} }));

// A chainable fake: records the calls, answers when awaited.
vi.mock('../../../config/supabase', () => {
  const query = (table) => {
    const calls = [];
    const q = new Proxy({}, {
      get: (_, prop) => {
        if (prop === 'then') {
          return (res, rej) => Promise.resolve().then(() => {
            h.calls.push([table, calls]);
            if (h.fail.has(table)) return { data: null, count: null, error: new Error(`synthetic ${table} failure`) };
            return h.data[table](calls);
          }).then(res, rej);
        }
        return (...args) => { calls.push([prop, ...args]); return q; };
      },
    });
    return q;
  };
  return { supabase: { from: (table) => query(table) } };
});
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: (fn) => fn() }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1', name: 'Sample Teacher' } }) }));

import OverviewTab from '../../../pages/dashboards/teacher/tabs/OverviewTab';
import StudentsTab from '../../../pages/dashboards/teacher/tabs/StudentsTab';
import AnnouncementsTab from '../../../pages/dashboards/teacher/tabs/AnnouncementsTab';
import ClarityTeacherOverviewTab from './ClarityTeacherOverviewTab';
import ClarityTeacherStudentsTab from './ClarityTeacherStudentsTab';
import ClarityTeacherAnnouncementsTab from './ClarityTeacherAnnouncementsTab';

const has = (calls, ...wanted) => calls.some(c => wanted.every((w, i) => c[i] === w));
// A non-AI document that is not a valid Manual ILAW: both tabs count it as "other".
const MANUAL_DOC = JSON.stringify({ version: 1 });

const PLANS = [
  { id: 'p1', title: 'Photosynthesis', subject: 'Science', grade_level: 'Grade 8', status: 'published', ai_generated: true, created_at: '2026-11-09T02:00:00Z', updated_at: '2026-11-09T02:00:00Z' },
  { id: 'p2', title: 'Cell Structure', subject: 'Science', grade_level: 'Grade 8', status: 'draft', ai_generated: false, objectives: 'plain text', created_at: '2026-11-04T02:00:00Z', updated_at: '2026-11-05T02:00:00Z' },
  { id: 'p3', title: '', subject: '', grade_level: '', status: 'archived', ai_generated: true, created_at: '2026-10-28T02:00:00Z' },
];
const SCHEDULES = [
  { id: 'c1', day_of_week: 'Wednesday', start_time: '07:30:00', end_time: '08:30:00', subject: 'Science', room_number: 'R1', sections: { name: 'Mabini', grade_level: 'Grade 8' } },
  { id: 'c2', day_of_week: 'wednesday', start_time: '10:00:00', end_time: '11:00:00', subject: 'Science', room_number: null, sections: { name: 'Aguinaldo', grade_level: 'Grade 8' } },
  { id: 'c3', day_of_week: 'Wednesday', start_time: '13:00:00', end_time: '14:00:00', subject: 'Science', room_number: 'R3', sections: { name: 'Rizal', grade_level: 'Grade 7' } },
  { id: 'c4', day_of_week: 'Tuesday', start_time: '09:00:00', end_time: '10:00:00', subject: 'Science', room_number: 'R1', sections: { name: 'Rizal', grade_level: 'Grade 7' } },
];

const overviewData = () => ({
  school_settings: () => ({ data: { school_year: '2026-2027' }, error: null }),
  lesson_plans: (calls) => {
    if (has(calls, 'eq', 'ai_generated', true)) return { data: [PLANS[0]], count: 2, error: null };
    if (calls.some(c => c[0] === 'or')) return { data: [{ id: 'm1', teacher_id: 'teacher-1', ai_generated: false, objectives: MANUAL_DOC }, PLANS[1]], error: null };
    return { data: PLANS, count: 5, error: null };
  },
  worksheets: () => ({ count: 7, error: null }),
  schedules: () => ({ data: SCHEDULES, error: null }),
});

const studentsData = () => ({
  sections: () => ({ data: [{ id: 's-adv', name: 'Mabini', grade_level: 'Grade 8' }], error: null }),
  section_students: (calls) => {
    const ids = calls.find(c => c[0] === 'in')[2];
    const rows = [
      { student_id: 'st1', section_id: 's-adv', status: 'active' },
      { student_id: 'st2', section_id: 's-adv', status: 'active' },
      { student_id: 'st3', section_id: 's-agu', status: 'active' },
    ];
    return { data: rows.filter(r => ids.includes(r.section_id)), error: null };
  },
  students: () => ({ data: [{ id: 'st1', lrn: '136482910027' }, { id: 'st2', lrn: '136482910031' }, { id: 'st3', lrn: '136482910045' }], error: null }),
  profiles: () => ({ data: [
    { id: 'st1', name: 'Dela Cruz, Angelo', email: 'angelo@school.test', status: 'Active' },
    { id: 'st2', name: 'Bautista, Kristine', email: 'kristine@school.test', status: 'suspended' },
    { id: 'st3', name: 'Flores, Mark', email: 'mark@school.test', status: null },
  ], error: null }),
  schedules: () => ({ data: [
    { section_id: 's-agu', subject: null, subject_id: 'sub-sci', sections: { name: 'Aguinaldo', grade_level: 'Grade 8' } },
    { section_id: 's-agu', subject: null, subject_id: 'sub-sci', sections: { name: 'Aguinaldo', grade_level: 'Grade 8' } },
    { section_id: 's-adv', subject: null, subject_id: 'sub-sci', sections: { name: 'Mabini', grade_level: 'Grade 8' } },
    { section_id: 's-riz', subject: 'Legacy Science', subject_id: null, sections: { name: 'Rizal', grade_level: 'Grade 7' } },
  ], error: null }),
  subjects: () => ({ data: [{ id: 'sub-sci', name: 'Science', code: 'SCI' }], error: null }),
});

const NEWS = [
  { id: 'n1', title: 'Faculty meeting', content: 'Room 3 at 3 PM.', priority: 'High', target_roles: 'teacher', author_name: 'Principal', created_at: '2026-11-10T01:15:00Z' },
  { id: 'n2', title: 'Exam schedule', content: 'Exams run Nov 18.', priority: 'High', target_roles: 'all', author_name: null, created_at: '2026-11-07T00:00:00Z' },
  { id: 'n3', title: 'Brigada Eskwela', content: 'Sign up by Nov 14.', priority: 'Normal', target_roles: 'all, teacher', author_name: 'Office', created_at: '2026-11-03T05:30:00Z' },
  { id: 'n4', title: 'Student only', content: 'Not for teachers.', priority: 'Normal', target_roles: 'student', created_at: '2026-11-02T00:00:00Z' },
];
const newsData = () => ({ news: () => ({ data: NEWS, error: null }) });

const Where = () => <output data-testid="where">{useLocation().pathname}</output>;
const show = (Tab) => render(
  <MemoryRouter initialEntries={['/teacher-dashboard']}>
    <Routes><Route path="*" element={<><Tab /><Where /></>} /></Routes>
  </MemoryRouter>,
);
const where = () => screen.getByTestId('where').textContent;
const noPreview = (container) => {
  const attrs = [...container.querySelectorAll('[aria-label],[title],[alt]')].flatMap(el => ['aria-label', 'title', 'alt'].map(a => el.getAttribute(a) || ''));
  expect(`${container.textContent} ${attrs.join(' ')}`).not.toMatch(/preview/i);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 10, 30)); // a Wednesday, 10:30
  h.fail = new Set(); h.calls = [];
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

// ------------------------------------------------------------------ Overview
describe('Overview', () => {
  beforeEach(() => { h.data = overviewData(); });
  const ready = () => screen.findByRole('region', { name: 'Teaching metrics' });

  it('the same numbers as the classic tab, from the same reads', async () => {
    show(OverviewTab);
    await screen.findByText('Academic Year 2026-2027');
    const classic = [/Total Lesson Plans/, /Total Worksheets/, /AI-Generated Plans/, /Classes Remaining Today/]
      .map(name => screen.getByRole('button', { name }).textContent);
    const classicReads = h.calls.map(([t]) => t);
    cleanup(); h.calls = [];
    show(ClarityTeacherOverviewTab);
    const kpis = within(await ready()).getAllByRole('button').map(b => b.textContent);
    expect(h.calls.map(([t]) => t)).toEqual(classicReads);
    expect(classic).toEqual([
      'Total Lesson Plans5Created and updated', 'Total Worksheets7Created or uploaded',
      'AI-Generated Plans20 Manual ILAW · 3 other saved', 'Classes Remaining Today24 scheduled in total',
    ]);
    expect(kpis[0]).toContain('Lesson plans5Created and updated');
    expect(kpis[1]).toContain('Worksheets7Created or uploaded');
    expect(kpis[2]).toContain('AI-generated plans20 Manual ILAW · 3 other saved');
    expect(kpis[3]).toContain('Classes left today24 scheduled in total');
    expect(screen.getByText(/Academic Year 2026-2027/)).toBeTruthy();
  });

  it('rings only from real denominators: AI share of all lesson plans, and classes done of today\'s classes', async () => {
    show(ClarityTeacherOverviewTab);
    await ready();
    expect(screen.getByRole('img', { name: /^AI-generated share of lesson plans: 40 percent, 2 of 5 lesson plans/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /^Classes finished today: 33(\.3)? percent, 1 of 3 done/ })).toBeTruthy();
  });

  it('today\'s classes: the real schedule rows for today, in order, with the classic states; the remaining count', async () => {
    show(ClarityTeacherOverviewTab);
    await ready();
    const today = screen.getByRole('region', { name: "Today's classes" });
    expect(within(today).getByText('Wednesday, November 11')).toBeTruthy();
    expect(within(today).getByText('2 remaining')).toBeTruthy();
    expect([...today.querySelectorAll('li')].map(li => li.textContent)).toEqual([
      '7:30 AM – 8:30 AM · Science · Grade 8 — MabiniFinished · R1',
      '10:00 AM – 11:00 AM · Science · Grade 8 — AguinaldoIn progress · No room set',
      '1:00 PM – 2:00 PM · Science · Grade 7 — RizalUpcoming · R3',
    ]);
  });

  it('no classes today: a clean empty state, no ring, no remaining pill', async () => {
    h.data.schedules = () => ({ data: [SCHEDULES[3]], error: null });
    show(ClarityTeacherOverviewTab);
    await ready();
    expect(within(screen.getByRole('region', { name: "Today's classes" })).getByText('No classes scheduled today.')).toBeTruthy();
    expect(screen.queryByText(/remaining/)).toBeNull();
    expect(screen.queryByRole('img', { name: /Classes finished today/ })).toBeNull();
  });

  it('recent lesson plans: the classic rows (title, subject, grade, dates, non-draft status) and the saved plan type', async () => {
    show(OverviewTab);
    await screen.findByText('Academic Year 2026-2027');
    const classic = screen.getByText('Recent Lesson Plans').closest('div').parentElement;
    const classicStatuses = within(classic).queryAllByText(/^(Published|Archived|Draft)$/).map(e => e.textContent);
    cleanup();
    show(ClarityTeacherOverviewTab);
    await ready();
    const recent = screen.getByRole('region', { name: 'Recent lesson plans' });
    const rows = [...recent.querySelectorAll('li')];
    expect(rows.map(li => li.querySelector('b').textContent)).toEqual(['Photosynthesis', 'Cell Structure', 'Untitled lesson plan']);
    expect(rows[1].textContent).toContain('Science · Grade 8 · Created');
    expect(rows[1].textContent).toContain('· Updated');
    expect(rows[2].textContent).toContain('Subject unavailable');
    expect(within(recent).queryAllByText(/^(Published|Archived|Draft)$/).map(e => e.textContent)).toEqual(classicStatuses);
    expect(rows.map(li => li.querySelector('.x-news-pills .x-badge').textContent)).toEqual(['AI-Generated', 'Other saved plan', 'AI-Generated']);
  });

  it('lesson planning activity: the classic figures (no chart without monthly data)', async () => {
    show(ClarityTeacherOverviewTab);
    await ready();
    const card = screen.getByRole('region', { name: 'Lesson planning activity' });
    expect(card.textContent).toContain('AI-generated plans2');
    expect(card.textContent).toContain('Last AI-generated lessonPhotosynthesis');
    expect(card.textContent).toContain('Plan types2 AI · 0 Manual ILAW · 3 other');
    expect(card.querySelector('svg')).toBeNull();
  });

  it('every navigation target is the classic one', async () => {
    const clicks = async (Tab, names) => {
      const out = [];
      for (const name of names) {
        show(Tab);
        await screen.findByText(/Academic Year 2026-2027/);
        fireEvent.click(screen.getAllByRole('button', { name })[0]);
        out.push(where());
        cleanup();
      }
      return out;
    };
    const classic = await clicks(OverviewTab, [/Total Lesson Plans/, /Total Worksheets/, /AI-Generated Plans/, /Classes Remaining Today/,
      /^Create Lesson Plan$/, /^Upload Resource$/, /^Grading$/, /^Announcements$/, /View all lesson plans/]);
    const clarity = await clicks(ClarityTeacherOverviewTab, [/^Lesson plans/, /^Worksheets/, /^AI-generated plans/, /^Classes left today/,
      /^Create lesson plan$/, /^Upload resource$/, /^Grading$/, /^Announcements$/, /View all lesson plans/]);
    expect(clarity).toEqual(classic);
    expect(clarity).toEqual(['/teacher-dashboard/lesson-plans', '/teacher-dashboard/worksheets', '/teacher-dashboard/lesson-plans',
      '/teacher-dashboard/attendance', '/teacher-dashboard/lesson-plans', '/teacher-dashboard/worksheets', '/teacher-dashboard/grades',
      '/teacher-dashboard/announcements', '/teacher-dashboard/lesson-plans']);
  });

  it('error: the classic message and Retry re-reads; Quick actions stay', async () => {
    h.fail.add('school_settings');
    const { container } = show(ClarityTeacherOverviewTab);
    expect((await screen.findByRole('alert')).textContent).toContain('Dashboard data could not be loaded. Check your connection and try again.');
    expect(screen.getByText(/Academic Year Unavailable/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Teaching metrics' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Quick actions' })).toBeTruthy();
    h.fail.clear();
    const before = h.calls.length;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' })); });
    await ready();
    expect(h.calls.length).toBeGreaterThan(before);
    noPreview(container);
  });

  it('loading: the classic status line, no placeholder numbers', async () => {
    let release;
    h.data.school_settings = () => new Promise(res => { release = () => res({ data: { school_year: '2026-2027' }, error: null }); });
    show(ClarityTeacherOverviewTab);
    expect(screen.getByText('Loading dashboard data…').getAttribute('role')).toBe('status');
    expect(screen.queryByRole('region', { name: 'Teaching metrics' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/—/);
    await waitFor(() => expect(release).toBeTypeOf('function'));
    await act(async () => { release(); });
    await ready();
  });

  it('nothing invented: no "this month", "distributed", "to check", chart toggle or search box', async () => {
    const { container } = show(ClarityTeacherOverviewTab);
    await ready();
    expect(container.textContent).not.toMatch(/this month|distributed|to check|busiest|Area|Bars/);
    expect(container.querySelector('input')).toBeNull();
    noPreview(container);
  });
});

// ------------------------------------------------------------------ Students
describe('Students', () => {
  beforeEach(() => { h.data = studentsData(); });
  const rosters = (container) => [...container.querySelectorAll('table')].map(t => [t.getAttribute('aria-label') || '',
    [...t.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(c => c.textContent.replace(/^\d+\. /, '')))]);

  it('the same rosters, rows and counts as the classic tab, from the same reads', async () => {
    const classicView = show(StudentsTab);
    await screen.findByText(/roster entries across your sections/);
    const classicRows = rosters(classicView.container).map(([, rows]) => rows.map(r => [r[0], r[1], r[2], r[3]]));
    const classicCount = screen.getByText(/roster entries across your sections/).textContent;
    const classicReads = h.calls.map(([t]) => t).sort();
    cleanup(); h.calls = [];
    const { container } = show(ClarityTeacherStudentsTab);
    await screen.findByText(/roster entries across your sections/);
    expect(h.calls.map(([t]) => t).sort()).toEqual(classicReads);
    expect(screen.getByText(/roster entries across your sections/).textContent).toBe(classicCount);
    const rows = rosters(container).map(([, r]) => r.map(([name, lrn, email, status]) => [name.replace(/^[A-Z]{1,2}(?=[A-Z][a-z]|[A-Z],)/, ''), lrn, email, status]));
    expect(rows).toEqual(classicRows);
    expect(rosters(container).map(([label]) => label)).toEqual(['My advisory students', 'Science, Grade 8 — Aguinaldo students']); // Rizal has no students: the empty message, as classic;
  });

  it('tiles: the advisory (real label and count) and the sections taught; no pending invitations', async () => {
    show(ClarityTeacherStudentsTab);
    const tiles = [...(await screen.findByRole('region', { name: 'Your classes' })).querySelectorAll('.x-kpi')];
    expect(tiles.map(t => t.textContent)).toEqual(['Advisory · Grade 8 — Mabini2students', 'Sections I teach2besides my advisory']);
    expect(document.body.textContent).not.toMatch(/invitation/i);
  });

  it('accounts show the stored status as text (classic labels); the side list has the real per-section counts', async () => {
    show(ClarityTeacherStudentsTab);
    await screen.findByText(/roster entries across your sections/);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByText('Suspended')).toBeTruthy();
    expect(screen.getByText('Status unavailable')).toBeTruthy();
    const side = screen.getByRole('region', { name: 'Subjects I handle' });
    expect([...side.querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Science · Grade 8 — Aguinaldo1 student', '#x-tst-g-s-agu-sub-sci'],
      ['Legacy Science · Grade 7 — Rizal0 students', '#x-tst-g-s-riz-Legacy-Science'],
    ]);
    expect(document.getElementById('x-tst-g-s-agu-sub-sci')).toBeTruthy();
  });

  it('search: the same matches and messages as classic (name or LRN)', async () => {
    const run = async (Tab, q) => {
      const { container } = show(Tab);
      await screen.findByText(/roster entries across your sections/);
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search students by name or LRN' }), { target: { value: q } });
      const out = [screen.queryByText(/across your sections/)?.textContent ?? '', container.textContent.includes('No students match your search.'),
        [...container.querySelectorAll('tbody tr')].length];
      cleanup();
      return out;
    };
    for (const q of ['bautista', '910045', 'nobody']) expect(await run(ClarityTeacherStudentsTab, q)).toEqual(await run(StudentsTab, q));
  });

  it('not an adviser, and no other sections: the classic empty states', async () => {
    h.data.sections = () => ({ data: [], error: null });
    h.data.schedules = () => ({ data: [], error: null });
    show(ClarityTeacherStudentsTab);
    await screen.findByText(/roster entries across your sections/);
    expect(screen.getByText('You are not assigned as an adviser yet')).toBeTruthy();
    expect(screen.getByText('No other sections assigned yet')).toBeTruthy();
    expect(screen.getByText('Advisory').closest('.x-kpi').textContent).toBe('AdvisoryNot assigned');
  });

  it('error: the classic toast and message, and Retry re-reads', async () => {
    h.fail.add('sections');
    const { container } = show(ClarityTeacherStudentsTab);
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map(a => a.textContent).join(' ')).toContain('Could not load student rosters.');
    await waitFor(() => expect(document.body.textContent).toContain('Could not load student rosters. Please retry.'));
    h.fail.clear();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    expect(await screen.findByText(/roster entries across your sections/)).toBeTruthy();
    noPreview(container);
  });
});

// ------------------------------------------------------------------ Announcements
describe('Announcements', () => {
  beforeEach(() => { h.data = newsData(); });
  const titles = (container) => [...container.querySelectorAll('h2, h3')].map(e => e.textContent).filter(t => NEWS.some(n => n.title === t));

  it('the same read: published, not expired, newest first; only items addressed to teachers', async () => {
    const { container } = show(ClarityTeacherAnnouncementsTab);
    await screen.findByText('Faculty meeting');
    const [, calls] = h.calls[0];
    expect(calls).toEqual(expect.arrayContaining([['select', '*'], ['eq', 'status', 'Published'], ['order', 'created_at', { ascending: false }]]));
    expect(calls.find(c => c[0] === 'or')[1]).toMatch(/^expires_at\.is\.null,expires_at\.gt\./);
    expect(titles(container)).toEqual(['Faculty meeting', 'Exam schedule', 'Brigada Eskwela']);
  });

  it('filters and search give the same items as classic', async () => {
    const run = async (Tab, filter, q) => {
      const { container } = show(Tab);
      await screen.findByText('Faculty meeting');
      fireEvent.click(screen.getByRole('button', { name: filter }));
      fireEvent.change(screen.getByPlaceholderText('Search announcements...'), { target: { value: q } });
      const out = [titles(container), container.textContent.includes('No announcements match your search or filter.')];
      cleanup();
      return out;
    };
    for (const [f, q] of [['All', ''], ['Important', ''], ['General', ''], ['All', 'nov 1'], ['Important', 'brigada']]) {
      expect(await run(ClarityTeacherAnnouncementsTab, f, q)).toEqual(await run(AnnouncementsTab, f, q));
    }
  });

  it('items: Important as text, the content, date, time, author (or Admin) and the stored audience', async () => {
    show(ClarityTeacherAnnouncementsTab);
    await screen.findByText('Faculty meeting');
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('Important')).toBeTruthy();
    expect(within(items[2]).queryByText('Important')).toBeNull();
    expect(items[1].textContent).toContain('By Admin');
    expect(items[2].textContent).toContain('all, teacher');
    expect(items[0].textContent).toContain(new Date(NEWS[0].created_at).toLocaleTimeString());
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('error with Retry, and the empty message', async () => {
    h.fail.add('news');
    const { container } = show(ClarityTeacherAnnouncementsTab);
    expect((await screen.findByRole('alert')).textContent).toBe('Announcements could not be loaded. Check your connection and try again.');
    h.fail.clear();
    h.data.news = () => ({ data: [], error: null });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry announcements' })); });
    expect(await screen.findByText('No announcements have been published yet.')).toBeTruthy();
    noPreview(container);
  });
});
