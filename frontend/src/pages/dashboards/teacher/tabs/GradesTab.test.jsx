// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GradesTab from './GradesTab';
import { formatDateTime } from '../../../../lib/formatDate';

const fixture = vi.hoisted(() => ({
  uid: 'teacher-a', rows: [], error: null, reads: [], submissions: [], loadSubmissions: vi.fn(), loadAssigneeRoster: vi.fn(),
}));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: fixture.uid } }) }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  from(table) {
    fixture.reads.push(table);
    if (table !== 'worksheets') throw new Error(`Unexpected ${table} request`);
    const query = {
      select: () => query,
      eq(column, value) { expect(column).toBe('teacher_id'); expect(value).toBe(fixture.uid); return query; },
      order: () => Promise.resolve({ data: fixture.rows, error: fixture.error }),
    };
    return query;
  },
} }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../hooks', () => ({
  useTheme: () => ({ dark: false }),
  useToast: () => ({ toast: null, showToast: vi.fn() }),
}));
vi.mock('../worksheets/useWorksheetAssessment', () => ({ useWorksheetAssessment: () => ({
  mySections: [{ id: 'section-1', name: 'A', grade_level: 'Grade 7' }], postings: [],
  loadSubmissions: fixture.loadSubmissions, loadAssigneeRoster: fixture.loadAssigneeRoster, loadItems: vi.fn(), loadAnswers: vi.fn(),
  releaseScore: vi.fn(), encodeManualScore: vi.fn(), loadClassList: vi.fn(),
}) }));
const modalProps = vi.hoisted(() => ({ check: null, encode: null }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: (props) => { modalProps.check = props; return (
  <div role="dialog" aria-label="Existing checking workflow"><button onClick={props.onClose}>Close checking</button></div>); } }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: (props) => { modalProps.encode = props; return (
  <div role="dialog" aria-label="Existing paper scoring workflow"><button onClick={props.onClose}>Close encoding</button></div>); } }));

const worksheetA = { id: 'sheet-a', title: 'Current English', subject: 'English', grade_level: 'Grade 7', teacher_id: 'teacher-a' };
const worksheetB = { id: 'sheet-b', title: 'Prior Science', subject: 'Science', grade_level: 'Grade 8', teacher_id: 'teacher-a' };
const online = { id: 'sub-a', student_id: 'student-a', name: 'Learner A', section_id: 'section-1', source: 'online', status: 'submitted', released: false, score: null, total_points: null };
const paper = { id: 'sub-b', student_id: 'student-b', name: 'Learner B', section_id: 'old-section', source: 'manual', status: 'checked', released: true, score: 0, total_points: 20 };

beforeEach(() => {
  fixture.uid = 'teacher-a'; fixture.rows = [worksheetA, worksheetB]; fixture.error = null;
  fixture.reads.length = 0; fixture.submissions = [online, paper];
  fixture.loadSubmissions.mockReset().mockImplementation(async () => fixture.submissions);
  fixture.roster = [];
  fixture.loadAssigneeRoster.mockReset().mockImplementation(async () => fixture.roster);
});
afterEach(cleanup);
const renderTab = () => render(<MemoryRouter><GradesTab /></MemoryRouter>);
const list = () => screen.getByRole('list', { name: 'Worksheet submissions' });
const row = name => within(list()).getByText(name).closest('li');
const chip = name => within(screen.getByRole('group', { name: 'Filter by status' })).getByRole('button', { name: new RegExp(`^${name} \\(`) });
const summary = () => screen.queryByRole('region', { name: 'Summary' });
const stat = label => within(summary()).getByText(label, { selector: 'dt' }).nextElementSibling.textContent;

describe('Teacher Worksheet Scores destination', () => {
  it('uses owned worksheets and existing submission reads without general-grade requests', async () => {
    renderTab();
    expect(await screen.findByRole('heading', { name: 'Grading' })).toBeTruthy();
    expect(await screen.findByText('Learner A')).toBeTruthy();
    expect(screen.getByText('Not scored')).toBeTruthy();
    expect(row('Learner A').textContent).toContain('Needs checking');
    expect(screen.getByText('0 / 20')).toBeTruthy();
    expect(row('Learner B').textContent).toContain('Released');
    expect(screen.queryByText(/Submitted · Not released|Reviewed · Released/)).toBeNull();
    expect(fixture.loadSubmissions).toHaveBeenCalledWith('sheet-a');
    expect(fixture.reads).toEqual(['worksheets']);
    expect(screen.queryByText(/GWA|Q3 Report|Passed|Failed/)).toBeNull();
  });

  it('keeps older worksheets and filters by subject, grade, section and release', async () => {
    renderTab();
    await screen.findByText('Learner A');
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Science' } });
    await waitFor(() => expect(fixture.loadSubmissions).toHaveBeenCalledWith('sheet-b'));
    expect(screen.getByRole('heading', { name: 'Prior Science' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: 'Grade 8' } });
    expect(screen.getByRole('heading', { name: 'Prior Science' })).toBeTruthy();
    await screen.findByText('Learner B');
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'old-section' } });
    fireEvent.click(chip('Released'));
    expect(screen.getByText('Learner B')).toBeTruthy();
    expect(screen.queryByText('Learner A')).toBeNull();
  });

  it('distinguishes empty reads and read failures with Retry', async () => {
    fixture.loadSubmissions.mockResolvedValueOnce(null).mockResolvedValueOnce([]);
    renderTab();
    expect(await screen.findByText(/Could not load worksheet submissions/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry submissions' }));
    expect(await screen.findByText('No submissions for this worksheet yet.')).toBeTruthy();
  });

  it('clears a stale section filter when selecting another worksheet', async () => {
    fixture.loadSubmissions.mockImplementation(async id => id === 'sheet-a' ? [online] : [paper]);
    renderTab();
    await screen.findByText('Learner A');
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'section-1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Worksheet' }), { target: { value: 'sheet-b' } });
    expect(await screen.findByText('Learner B')).toBeTruthy();
    expect(screen.getByLabelText('Section').value).toBe('');
    expect(screen.queryByText('Learner A')).toBeNull();
  });

  it('keeps the score actions in the existing checking and encoding dialogs', async () => {
    renderTab();
    await screen.findByText('Learner A');
    fireEvent.click(screen.getByRole('button', { name: 'Check submissions' }));
    expect(within(screen.getByRole('dialog')).getByText('Close checking')).toBeTruthy();
    fireEvent.click(screen.getByText('Close checking'));
    fireEvent.click(screen.getByRole('button', { name: 'Encode paper scores' }));
    expect(within(screen.getByRole('dialog')).getByText('Close encoding')).toBeTruthy();
    expect(fixture.reads.every(table => table === 'worksheets')).toBe(true);
  });

  it('fails closed when the owned worksheet list cannot be read', async () => {
    fixture.error = { message: 'Synthetic failure' };
    renderTab();
    expect(await screen.findByText('Could not load your worksheets.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check submissions' })).toBeNull();
  });

  it('hides an open scoring dialog when the Teacher identity changes', async () => {
    const view = renderTab();
    await screen.findByText('Learner A');
    fireEvent.click(screen.getByRole('button', { name: 'Check submissions' }));
    expect(screen.getByRole('dialog', { name: 'Existing checking workflow' })).toBeTruthy();
    fixture.uid = 'teacher-b';
    fixture.rows = [];
    view.rerender(<MemoryRouter><GradesTab /></MemoryRouter>);
    expect(screen.queryByRole('dialog', { name: 'Existing checking workflow' })).toBeNull();
    expect(screen.queryByText('Learner A')).toBeNull();
  });
});

const make = (id, name, fields) => ({ id, student_id: `st-${id}`, name, section_id: 'section-1', source: 'online',
  status: 'submitted', released: false, score: null, total_points: null, ...fields });
const mixed = [
  make('r1', 'Ana Cruz', { status: 'checked', released: true, score: 8, total_points: 10 }),
  make('r2', 'Ben Reyes', { status: 'checked', released: true, score: 5, total_points: 20 }),
  make('r3', 'Cara Lim', { status: 'checked', released: true, score: 3, total_points: 0 }),
  make('r4', 'Dan Uy', { status: 'submitted', score: 9, total_points: 9 }),
  make('r5', 'Eve Tan', { status: 'in_progress' }),
  make('r6', 'Finn Go', { status: 'submitted', section_id: 'old-section' }),
];
const names = () => within(list()).getAllByRole('listitem').map(item => item.querySelector('p').textContent);

describe('Grading: status badges', () => {
  it('shows one status per row, always as text', async () => {
    fixture.submissions = mixed;
    renderTab();
    await screen.findByText('Ana Cruz');
    expect(within(row('Ana Cruz')).getByText('Released')).toBeTruthy();
    expect(within(row('Dan Uy')).getByText('Needs checking')).toBeTruthy();
    expect(within(row('Eve Tan')).getByText('In progress')).toBeTruthy();
    expect(within(row('Dan Uy')).queryByText('Released')).toBeNull();
    expect(row('Dan Uy').textContent).toContain('9 / 9');
    expect(row('Dan Uy').textContent).toContain('Online submission');
  });
});

describe('Grading: release decides Released', () => {
  it('a checked row that is not released still needs checking', async () => {
    fixture.submissions = [make('c1', 'Gil Ong', { status: 'checked', released: false, score: 4, total_points: 5 })];
    renderTab();
    await screen.findByText('Gil Ong');
    expect(within(row('Gil Ong')).getByText('Needs checking')).toBeTruthy();
    expect(stat('Released')).toBe('0');
    expect(stat('Average (released)')).toBe('-');
  });
});

describe('Grading: status chips', () => {
  it('counts and filters, and the counts follow the Section filter', async () => {
    fixture.submissions = mixed;
    renderTab();
    await screen.findByText('Ana Cruz');
    expect(['All', 'Needs checking', 'Released', 'In progress'].map(name => chip(name).textContent))
      .toEqual(['All (6)', 'Needs checking (2)', 'Released (3)', 'In progress (1)']);
    expect(chip('All').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip('Needs checking'));
    expect(chip('Needs checking').getAttribute('aria-pressed')).toBe('true');
    expect(names()).toEqual(['Dan Uy', 'Finn Go']);
    fireEvent.click(chip('All'));
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'section-1' } });
    expect(chip('All').textContent).toBe('All (5)');
    expect(chip('Needs checking').textContent).toBe('Needs checking (1)');
    expect(names()).not.toContain('Finn Go');
  });

  it('a section change resets the chip to All', async () => {
    fixture.submissions = mixed;
    renderTab();
    await screen.findByText('Ana Cruz');
    fireEvent.click(chip('Released'));
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'section-1' } });
    expect(chip('All').getAttribute('aria-pressed')).toBe('true');
    expect(names()).toContain('Dan Uy');
  });

  it('a worksheet change resets the chip to All', async () => {
    fixture.loadSubmissions.mockImplementation(async id => (id === 'sheet-a' ? mixed : [paper]));
    renderTab();
    await screen.findByText('Ana Cruz');
    fireEvent.click(chip('In progress'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Worksheet' }), { target: { value: 'sheet-b' } });
    expect(await screen.findByText('Learner B')).toBeTruthy();
    expect(chip('All').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Grading: search', () => {
  it('filters by name, ignoring case and outer spaces', async () => {
    fixture.submissions = mixed;
    renderTab();
    await screen.findByText('Ana Cruz');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: '  cRuZ  ' } });
    expect(names()).toEqual(['Ana Cruz']);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: '   ' } });
    expect(names()).toHaveLength(6);
  });

  it('no match shows the filter empty state with Clear filters; the true empty state is separate', async () => {
    fixture.submissions = mixed;
    renderTab();
    await screen.findByText('Ana Cruz');
    fireEvent.click(chip('In progress'));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: 'ana' } });
    expect(screen.getByText('No students match these filters.')).toBeTruthy();
    expect(screen.queryByText('No submissions for this worksheet yet.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(names()).toHaveLength(6);
    expect(screen.getByRole('searchbox', { name: 'Search students' }).value).toBe('');
    expect(chip('All').getAttribute('aria-pressed')).toBe('true');
  });

  it('a worksheet with no submissions keeps its own message and no Clear filters', async () => {
    fixture.submissions = [];
    renderTab();
    expect(await screen.findByText('No submissions for this worksheet yet.')).toBeTruthy();
    expect(screen.queryByText('No students match these filters.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });
});

describe('Grading: summary strip', () => {
  it('counts submitted, needs checking and released, and averages released percentages', async () => {
    fixture.submissions = mixed;
    renderTab();
    await screen.findByText('Ana Cruz');
    expect(stat('Submitted')).toBe('5');
    expect(stat('Needs checking')).toBe('2');
    expect(stat('Released')).toBe('3');
    // (80% + 25%) / 2; the zero-total row and unreleased 9/9 are left out.
    expect(stat('Average (released)')).toBe('53%');
  });

  it('follows the Section filter but not the search', async () => {
    fixture.submissions = mixed;
    renderTab();
    await screen.findByText('Ana Cruz');
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'section-1' } });
    expect(stat('Needs checking')).toBe('1');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: 'ana' } });
    expect(stat('Submitted')).toBe('4');
  });

  it('shows "-" as the average when nothing usable is released', async () => {
    fixture.submissions = [make('x1', 'Only One', { status: 'submitted', score: 4, total_points: 5 }),
      make('x2', 'Zero Total', { status: 'checked', released: true, score: 0, total_points: 0 })];
    renderTab();
    await screen.findByText('Only One');
    expect(stat('Average (released)')).toBe('-');
  });

  it('is hidden while loading and when the read fails, which still fails closed with Retry', async () => {
    let finish;
    fixture.loadSubmissions.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    renderTab();
    expect(await screen.findByText('Loading worksheet submissions…')).toBeTruthy();
    expect(summary()).toBeNull();
    await act(async () => { finish(null); });
    expect(await screen.findByText(/Could not load worksheet submissions/)).toBeTruthy();
    expect(summary()).toBeNull();
    expect(screen.queryByRole('group', { name: 'Filter by status' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry submissions' })).toBeTruthy();
  });
});

describe('Grading: the modals keep their props', () => {
  it('Check submissions and Encode paper scores get the same props as before', async () => {
    renderTab();
    await screen.findByText('Learner A');
    fireEvent.click(screen.getByRole('button', { name: 'Check submissions' }));
    expect(Object.keys(modalProps.check).sort()).toEqual(['loadAnswers', 'loadItems', 'loadSubmissions', 'onClose', 'releaseScore', 'saveMarks', 'worksheet']);
    expect(modalProps.check.worksheet.id).toBe('sheet-a');
    fireEvent.click(screen.getByText('Close checking'));
    fireEvent.click(screen.getByRole('button', { name: 'Encode paper scores' }));
    expect(Object.keys(modalProps.encode).sort()).toEqual(['encodeManualScore', 'loadClassList', 'loadSubmissions', 'onClose', 'onSaved', 'postings', 'sections', 'worksheet']);
  });
});

const assignee = (studentId, name, sectionId = 'section-1') => ({ student_id: studentId, section_id: sectionId, due_at: null, name });

describe('Grading: students who have not started', () => {
  it('merges by student: a submission wins, an assignee with none is Not started, no duplicates', async () => {
    fixture.roster = [assignee('student-a', 'Learner A'), assignee('student-c', 'Learner C'), assignee('student-c', 'Learner C'),
      assignee('student-d', 'Learner D', 'old-section')];
    renderTab();
    expect(await screen.findByText('Learner C')).toBeTruthy();
    expect(names()).toEqual(['Learner A', 'Learner B', 'Learner C', 'Learner D']);
    expect(within(row('Learner A')).getByText('Needs checking')).toBeTruthy();
    expect(within(row('Learner C')).getByText('Not started')).toBeTruthy();
    expect(row('Learner C').textContent).toContain('-');
    expect(row('Learner C').textContent).not.toContain('Online submission');
    expect(within(row('Learner C')).queryByRole('button')).toBeNull();
    expect(fixture.loadAssigneeRoster).toHaveBeenCalledWith('sheet-a');
    expect(fixture.reads).toEqual(['worksheets']);
  });

  it('has a Not started chip with its count; it filters, follows the section, and search finds those names', async () => {
    fixture.roster = [assignee('student-c', 'Learner C'), assignee('student-d', 'Learner D', 'old-section')];
    renderTab();
    await screen.findByText('Learner C');
    expect(chip('Not started').textContent).toBe('Not started (2)');
    expect(chip('All').textContent).toBe('All (4)');
    fireEvent.click(chip('Not started'));
    expect(names()).toEqual(['Learner C', 'Learner D']);
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'section-1' } });
    expect(chip('Not started').textContent).toBe('Not started (1)');
    fireEvent.click(chip('All'));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: ' learner c ' } });
    expect(names()).toEqual(['Learner C']);
  });

  it('the summary shows Assigned and Not started', async () => {
    fixture.roster = [assignee('student-a', 'Learner A'), assignee('student-c', 'Learner C')];
    renderTab();
    await screen.findByText('Learner C');
    expect(stat('Assigned')).toBe('3');
    expect(stat('Not started')).toBe('1');
    expect(stat('Submitted')).toBe('2');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: 'learner a' } });
    expect(stat('Assigned')).toBe('3');
  });

  it('Not started rows never reach the modals: they get the hook functions, and its reads have no such rows', async () => {
    fixture.roster = [assignee('student-c', 'Learner C')];
    renderTab();
    await screen.findByText('Learner C');
    fireEvent.click(screen.getByRole('button', { name: 'Check submissions' }));
    expect(modalProps.check.loadSubmissions).toBe(fixture.loadSubmissions);
    expect(Object.values(modalProps.check).some(Array.isArray)).toBe(false);
    const rowsForReleaseAll = await modalProps.check.loadSubmissions('sheet-a');
    expect(rowsForReleaseAll.map(r => r.name)).toEqual(['Learner A', 'Learner B']);
    fireEvent.click(screen.getByText('Close checking'));
    fireEvent.click(screen.getByRole('button', { name: 'Encode paper scores' }));
    expect(modalProps.encode.loadSubmissions).toBe(fixture.loadSubmissions);
  });
});

describe('Grading: roster failure fails closed', () => {
  it('keeps the submissions, hides the Not started parts, and Retry re-reads only the roster', async () => {
    fixture.loadAssigneeRoster.mockRejectedValueOnce(new Error('assignee_roster_failed'));
    fixture.roster = [assignee('student-c', 'Learner C')];
    renderTab();
    expect(await screen.findByText("Couldn't load students who haven't started.")).toBeTruthy();
    expect(names()).toEqual(['Learner A', 'Learner B']);
    expect(within(screen.getByRole('group', { name: 'Filter by status' })).queryByRole('button', { name: /^Not started/ })).toBeNull();
    expect(within(summary()).queryByText('Assigned')).toBeNull();
    expect(within(summary()).queryByText('Not started')).toBeNull();
    expect(stat('Submitted')).toBe('2');
    const submissionReads = fixture.loadSubmissions.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Learner C')).toBeTruthy();
    expect(screen.queryByText("Couldn't load students who haven't started.")).toBeNull();
    expect(fixture.loadSubmissions.mock.calls.length).toBe(submissionReads);
    expect(fixture.loadAssigneeRoster).toHaveBeenCalledTimes(2);
  });

  it('a roster answer for a worksheet no longer selected is ignored', async () => {
    let finishA;
    fixture.loadAssigneeRoster.mockImplementation(id => (id === 'sheet-a'
      ? new Promise(resolve => { finishA = resolve; }) : Promise.resolve([assignee('student-z', 'Learner Z')])));
    fixture.loadSubmissions.mockImplementation(async id => (id === 'sheet-a' ? [online] : [paper]));
    renderTab();
    await screen.findByText('Learner A');
    fireEvent.change(screen.getByRole('combobox', { name: 'Worksheet' }), { target: { value: 'sheet-b' } });
    expect(await screen.findByText('Learner Z')).toBeTruthy();
    await act(async () => { finishA([assignee('student-x', 'Stale Student')]); });
    expect(screen.queryByText('Stale Student')).toBeNull();
    expect(names()).toEqual(['Learner B', 'Learner Z']);
  });
});

describe('Grading: Late', () => {
  it('shows Late with the Manila submission time; only Late when the time is missing; nothing otherwise', async () => {
    fixture.submissions = [
      make('l1', 'Late Lia', { status: 'submitted', is_late: true, submitted_at: '2030-03-10T14:05:00' }),
      make('l2', 'Late NoTime', { status: 'checked', released: true, score: 1, total_points: 2, is_late: true, submitted_at: null }),
      make('l3', 'On Time', { status: 'submitted', is_late: false, submitted_at: '2030-03-09T08:00:00' }),
      make('l4', 'No Flag', { status: 'submitted', submitted_at: '2030-03-09T08:00:00' }),
      make('l5', 'Still Working', { status: 'in_progress', is_late: true }),
    ];
    renderTab();
    await screen.findByText('Late Lia');
    expect(within(row('Late Lia')).getByText('Late')).toBeTruthy();
    expect(within(row('Late Lia')).getByText(`Submitted ${formatDateTime('2030-03-10T14:05:00')}`)).toBeTruthy();
    expect(row('Late Lia').textContent).toContain('2:05');
    expect(within(row('Late NoTime')).getByText('Late')).toBeTruthy();
    expect(row('Late NoTime').textContent).not.toMatch(/Submitted /);
    for (const name of ['On Time', 'No Flag', 'Still Working']) {
      expect(within(row(name)).queryByText('Late')).toBeNull();
      expect(row(name).textContent).not.toMatch(/Submitted /);
    }
  });
});
