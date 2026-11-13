// @vitest-environment jsdom
// Clarity T3: the Teacher Grading tab (master-detail). Every data source is
// mocked (Supabase, withRetry, auth, the toast hook, useWorksheetAssessment
// and both dialogs); each behaviour is compared with the classic GradesTab
// on the same data.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const fixture = vi.hoisted(() => ({
  uid: 'teacher-a', rows: [], error: null, reads: [], submissions: [], loadSubmissions: null, loadAssigneeRoster: null, roster: [],
  paperScores: false, modal: { check: null, encode: null },
}));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: fixture.uid } }) }));
vi.mock('../../../config/supabase', () => ({ supabase: {
  from(table) {
    fixture.reads.push(table);
    if (table !== 'worksheets') throw new Error(`Unexpected ${table} request`);
    const query = { select: () => query, eq: () => query, order: () => Promise.resolve({ data: fixture.rows, error: fixture.error }) };
    return query;
  },
} }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../../../pages/dashboards/teacher/hooks', () => ({ useTheme: () => ({ dark: false }), useToast: () => ({ toast: null, showToast: () => {} }) }));
vi.mock('../../../pages/dashboards/teacher/worksheets/useWorksheetAssessment', () => ({ useWorksheetAssessment: () => ({
  mySections: [{ id: 'section-1', name: 'A', grade_level: 'Grade 7' }], postings: [],
  loadSubmissions: fixture.loadSubmissions, loadAssigneeRoster: fixture.loadAssigneeRoster, loadItems: () => {}, loadAnswers: () => {},
  saveMarks: () => {}, releaseScore: () => {}, encodeManualScore: () => {}, loadClassList: () => {},
  paperScoreEncodingAvailable: fixture.paperScores,
}) }));
vi.mock('../../../pages/dashboards/teacher/worksheets/CheckSubmissionsModal', () => ({ default: (props) => { fixture.modal.check = props; return (
  <div role="dialog" aria-label="Existing checking workflow"><button onClick={props.onClose}>Close checking</button></div>); } }));
vi.mock('../../../pages/dashboards/teacher/worksheets/EncodeScoresModal', () => ({ default: (props) => { fixture.modal.encode = props; return (
  <div role="dialog" aria-label="Existing paper scoring workflow"><button onClick={props.onClose}>Close encoding</button></div>); } }));

import GradesTab from '../../../pages/dashboards/teacher/tabs/GradesTab';
import ClarityTeacherGradingTab from './ClarityTeacherGradingTab';

const worksheetA = { id: 'sheet-a', title: 'Current English', subject: 'English', grade_level: 'Grade 7', teacher_id: 'teacher-a' };
const worksheetB = { id: 'sheet-b', title: 'Prior Science', subject: 'Science', grade_level: 'Grade 8', teacher_id: 'teacher-a' };
const online = { id: 'sub-a', student_id: 'student-a', name: 'Learner A', section_id: 'section-1', source: 'online', status: 'submitted', released: false, score: null, total_points: null };
const paper = { id: 'sub-b', student_id: 'student-b', name: 'Learner B', section_id: 'old-section', source: 'manual', status: 'checked', released: true, score: 15, total_points: 20 };
const late = { id: 'sub-c', student_id: 'student-c', name: 'Learner C', section_id: 'section-1', source: 'online', status: 'submitted', released: false, score: 4, total_points: 10, is_late: true, submitted_at: '2026-11-10T03:00:00Z' };

const show = Tab => render(<MemoryRouter><Tab /></MemoryRouter>);
const ready = () => screen.findByRole('list', { name: 'Worksheet submissions' });
const names = () => [...screen.getByRole('list', { name: 'Worksheet submissions' }).querySelectorAll('li')]
  .map(li => li.querySelector('b, p').textContent);
const statusOf = (name) => {
  const li = within(screen.getByRole('list', { name: 'Worksheet submissions' })).getByText(name).closest('li');
  return [...li.querySelectorAll('span')].filter(e => e.children.length === 0).map(e => e.textContent).filter(t => /^(Needs checking|Released|In progress|Not started|Late)$/.test(t));
};
const summary = () => { openFilters(); return [...screen.getByRole('region', { name: 'Summary' }).querySelectorAll('dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent]); };
const chips = () => { openFilters(); return within(screen.getByRole('group', { name: 'Filter by status' })).getAllByRole('button').map(b => b.textContent.replace(/\s+/g, ' ').trim()); };
const openFilters = () => { const b = screen.queryByRole('button', { name: 'Filters' }); if (b?.getAttribute('aria-expanded') === 'false') fireEvent.click(b); };

beforeEach(() => {
  Object.assign(fixture, { uid: 'teacher-a', rows: [worksheetA, worksheetB], error: null, submissions: [online, paper, late], roster: [], paperScores: false });
  fixture.reads.length = 0;
  fixture.modal.check = null; fixture.modal.encode = null;
  fixture.loadSubmissions = vi.fn(async () => fixture.submissions);
  fixture.loadAssigneeRoster = vi.fn(async () => fixture.roster);
});
afterEach(cleanup);

describe('same data as the classic tab', () => {
  it('the same reads, summary, chips, rows and statuses', async () => {
    show(GradesTab); await ready();
    const classic = { reads: [...fixture.reads], summary: summary(), chips: chips(), names: names(),
      status: ['Learner A', 'Learner B', 'Learner C'].map(statusOf), count: screen.getByText(/of \d+ students$/).textContent };
    cleanup(); fixture.reads.length = 0;
    show(ClarityTeacherGradingTab); await ready();
    expect({ reads: [...fixture.reads], summary: summary(), chips: chips(), names: names(),
      status: ['Learner A', 'Learner B', 'Learner C'].map(statusOf), count: screen.getByText(/of \d+ students$/).textContent }).toEqual(classic);
    expect(classic.summary).toEqual([['Assigned', '3'], ['Submitted', '3'], ['Needs checking', '2'], ['Released', '1'], ['Not started', '0'], ['Average (released)', '75%']]);
  });

  it('roster: "Not started" rows and the Assigned / Not started summary, as classic', async () => {
    fixture.roster = [{ student_id: 'student-d', section_id: 'section-1', name: 'Learner D' }, { student_id: 'student-a', section_id: 'section-1', name: 'Learner A' }];
    show(GradesTab); await ready();
    const classic = [summary(), names(), statusOf('Learner D')];
    cleanup();
    show(ClarityTeacherGradingTab); await ready();
    expect([summary(), names(), statusOf('Learner D')]).toEqual(classic);
    expect(within(screen.getByRole('list', { name: 'Worksheet submissions' })).getByText('Learner D').closest('li').textContent).toContain('No submission yet');
  });

  it('chips and search filter the same rows as classic; Clear filters', async () => {
    const run = async (Tab) => {
      show(Tab); await ready();
      openFilters();
      const out = [];
      fireEvent.click(within(screen.getByRole('group', { name: 'Filter by status' })).getByRole('button', { name: /^Released/ }));
      out.push(names());
      fireEvent.click(within(screen.getByRole('group', { name: 'Filter by status' })).getByRole('button', { name: /^All/ }));
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: 'learner c' } });
      out.push(names());
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: 'nobody' } });
      out.push(screen.getByText('No students match these filters.') !== null);
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      out.push(names());
      cleanup();
      return out;
    };
    expect(await run(ClarityTeacherGradingTab)).toEqual(await run(GradesTab));
  });

  it('subject, grade, worksheet and section filters: same options and the same worksheet loads', async () => {
    const run = async (Tab) => {
      fixture.loadSubmissions.mockClear();
      show(Tab); await ready();
      openFilters();
      const opts = ['Subject', 'Grade', 'Worksheet', 'Section'].map(l => [...screen.getByLabelText(l).options].map(o => o.textContent));
      fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Science' } });
      await ready();
      const calls = fixture.loadSubmissions.mock.calls.map(c => c[0]);
      cleanup();
      return { opts, calls };
    };
    expect(await run(ClarityTeacherGradingTab)).toEqual(await run(GradesTab));
  });
});

describe('master-detail: selection only selects', () => {
  it('the first row is shown; picking a row or Next student only selects; nothing is read again', async () => {
    show(ClarityTeacherGradingTab); await ready();
    const before = fixture.loadSubmissions.mock.calls.length;
    const detail = () => screen.getByRole('region', { name: 'Selected student' });
    expect(within(detail()).getByRole('heading', { level: 2 }).textContent).toBe('Learner A');
    expect(detail().textContent).toContain('Needs checking');
    fireEvent.click(screen.getByRole('button', { name: 'Next student' }));
    expect(within(detail()).getByRole('heading', { level: 2 }).textContent).toBe('Learner B');
    expect(screen.getByRole('img', { name: 'Score: 75 percent, 15 / 20' })).toBeTruthy();
    expect(detail().textContent).toContain('Paper score');
    fireEvent.click(within(screen.getByRole('list', { name: 'Worksheet submissions' })).getByText('Learner C').closest('button'));
    expect(detail().textContent).toContain('Late');
    expect(detail().textContent).toContain('Submitted');
    expect(screen.getByRole('button', { name: 'Next student' }).disabled).toBe(true);
    expect(fixture.loadSubmissions.mock.calls.length).toBe(before);
    expect(fixture.modal.check).toBeNull();
  });

  it('an unscored row shows "Not scored" as text, never a ring at 0', async () => {
    show(ClarityTeacherGradingTab); await ready();
    expect(screen.getByRole('region', { name: 'Selected student' }).textContent).toContain('Not scored');
    expect(screen.queryByRole('img', { name: /^Score:/ })).toBeNull();
  });
});

describe('the same dialogs', () => {
  it('Check submissions opens the existing workflow for the selected worksheet; closing reloads, as classic', async () => {
    const run = async (Tab) => {
      show(Tab); await ready();
      fireEvent.click(screen.getAllByRole('button', { name: 'Check submissions' })[0]);
      const worksheet = fixture.modal.check.worksheet.id;
      const before = fixture.loadSubmissions.mock.calls.length;
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Close checking' })); });
      await ready();
      const reloaded = fixture.loadSubmissions.mock.calls.length > before;
      cleanup();
      return { worksheet, reloaded, paper: 'paperScoresAvailable' in (fixture.modal.check || {}) };
    };
    expect(await run(ClarityTeacherGradingTab)).toEqual(await run(GradesTab));
  });

  it('Encode paper scores: only when available, the same dialog and props', async () => {
    show(ClarityTeacherGradingTab); await ready();
    expect(screen.queryByRole('button', { name: 'Encode paper scores' })).toBeNull();
    cleanup();
    fixture.paperScores = true;
    const run = async (Tab) => {
      show(Tab); await ready();
      fireEvent.click(screen.getByRole('button', { name: 'Encode paper scores' }));
      const props = Object.keys(fixture.modal.encode).sort();
      const worksheet = fixture.modal.encode.worksheet.id;
      cleanup();
      return { props, worksheet };
    };
    expect(await run(ClarityTeacherGradingTab)).toEqual(await run(GradesTab));
  });
});

describe('states (same texts as classic)', () => {
  it('worksheet read failure with Retry, and no worksheets', async () => {
    fixture.error = new Error('synthetic');
    show(ClarityTeacherGradingTab);
    expect(await screen.findByText('Could not load your worksheets.')).toBeTruthy();
    fixture.error = null;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry worksheets' })); });
    await ready();
    cleanup();
    fixture.rows = [];
    show(ClarityTeacherGradingTab);
    expect(await screen.findByText('No worksheets yet. Create one in Worksheets before recording scores.')).toBeTruthy();
  });

  it('submissions failure with Retry; roster failure with Retry; no submissions', async () => {
    fixture.loadSubmissions = vi.fn(async () => null);
    show(ClarityTeacherGradingTab);
    expect(await screen.findByText(/^Could not load worksheet submissions./)).toBeTruthy();
    cleanup();
    fixture.loadSubmissions = vi.fn(async () => fixture.submissions);
    fixture.loadAssigneeRoster = vi.fn(async () => { throw new Error('synthetic'); });
    show(ClarityTeacherGradingTab); await ready();
    expect(screen.getByText(/Couldn't load students who haven't started./)).toBeTruthy();
    cleanup();
    fixture.loadAssigneeRoster = vi.fn(async () => []);
    fixture.submissions = [];
    show(ClarityTeacherGradingTab);
    await waitFor(() => expect(screen.getByText('No submissions for this worksheet yet.')).toBeTruthy());
  });

  it('no "preview" anywhere', async () => {
    const { container } = show(ClarityTeacherGradingTab); await ready();
    const attrs = [...container.querySelectorAll('[aria-label],[title],[alt]')].flatMap(el => ['aria-label', 'title', 'alt'].map(a => el.getAttribute(a) || ''));
    expect(`${container.textContent} ${attrs.join(' ')}`).not.toMatch(/preview/i);
  });
});
