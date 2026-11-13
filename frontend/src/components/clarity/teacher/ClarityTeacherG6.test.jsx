// @vitest-environment jsdom
// Clarity G6: Teacher Grading closer to the final design (Teacher PDF p5).
// The header carries the worksheet and section pickers, a Filters button and
// Encode paper scores; Subject, Grade, the status chips and the summary sit
// behind Filters (closed by default) and keep working whether it is open or
// not. "Check submissions" stays the entry point to the checking dialog.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const fixture = vi.hoisted(() => ({
  uid: 'teacher-a', rows: [], submissions: [], roster: [], paperScores: false, modal: { check: null, encode: null },
  loadSubmissions: null, loadAssigneeRoster: null,
}));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: fixture.uid } }) }));
vi.mock('../../../config/supabase', () => ({ supabase: {
  from() {
    const query = { select: () => query, eq: () => query, order: () => Promise.resolve({ data: fixture.rows, error: null }) };
    return query;
  },
} }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../../../pages/dashboards/teacher/hooks', () => ({ useTheme: () => ({ dark: false }), useToast: () => ({ toast: null, showToast: () => {} }) }));
vi.mock('../../../pages/dashboards/teacher/worksheets/useWorksheetAssessment', () => ({ useWorksheetAssessment: () => ({
  mySections: [{ id: 'section-1', name: 'Mabini', grade_level: 'Grade 8' }], postings: [],
  loadSubmissions: fixture.loadSubmissions, loadAssigneeRoster: fixture.loadAssigneeRoster, loadItems: () => {}, loadAnswers: () => {},
  saveMarks: () => {}, releaseScore: () => {}, encodeManualScore: () => {}, loadClassList: () => {},
  paperScoreEncodingAvailable: fixture.paperScores,
}) }));
vi.mock('../../../pages/dashboards/teacher/worksheets/CheckSubmissionsModal', () => ({ default: (props) => { fixture.modal.check = props; return <div role="dialog" aria-label="Existing checking workflow" />; } }));
vi.mock('../../../pages/dashboards/teacher/worksheets/EncodeScoresModal', () => ({ default: (props) => { fixture.modal.encode = props; return <div role="dialog" aria-label="Existing paper scoring workflow" />; } }));

import ClarityTeacherGradingTab from './ClarityTeacherGradingTab';

const sheetA = { id: 'sheet-a', title: 'Photosynthesis worksheet', subject: 'Science', grade_level: 'Grade 8', teacher_id: 'teacher-a' };
const sheetB = { id: 'sheet-b', title: 'Essay', subject: 'English', grade_level: 'Grade 7', teacher_id: 'teacher-a' };
const ROWS = [
  { id: 'r1', student_id: 's1', name: 'Dela Cruz, Angelo', section_id: 'section-1', source: 'online', status: 'submitted', released: false, score: null, total_points: null, submitted_at: '2026-11-10T03:00:00Z' },
  { id: 'r2', student_id: 's2', name: 'Flores, Mark Daniel', section_id: 'section-1', source: 'online', status: 'checked', released: true, score: 13, total_points: 15 },
];

const show = () => render(<MemoryRouter><ClarityTeacherGradingTab /></MemoryRouter>);
const ready = () => screen.findByRole('list', { name: 'Worksheet submissions' });
const filtersButton = () => screen.getByRole('button', { name: 'Filters' });
const names = () => [...screen.getByRole('list', { name: 'Worksheet submissions' }).querySelectorAll('li b')].map(b => b.textContent);

beforeEach(() => {
  Object.assign(fixture, { rows: [sheetA, sheetB], submissions: ROWS, roster: [], paperScores: false });
  fixture.modal.check = null; fixture.modal.encode = null;
  fixture.loadSubmissions = vi.fn(async () => fixture.submissions);
  fixture.loadAssigneeRoster = vi.fn(async () => fixture.roster);
});
afterEach(cleanup);

describe('header (p5)', () => {
  it('worksheet and section pickers and a Filters button sit in the header, beside the title', async () => {
    const { container } = show(); await ready();
    const head = container.querySelector('.x-head');
    expect(within(head).getByRole('heading', { level: 1, name: 'Grading' })).toBeTruthy();
    expect(within(head).getByLabelText('Worksheet').value).toBe('sheet-a');
    expect([...within(head).getByLabelText('Section').options].map(o => o.textContent)).toEqual(['All sections', 'Grade 8 · Mabini']);
    expect(filtersButton().getAttribute('aria-expanded')).toBe('false');
    expect(head.contains(filtersButton())).toBe(true);
  });

  it('Encode paper scores sits in the header only when available, and opens the same dialog', async () => {
    show(); await ready();
    expect(screen.queryByRole('button', { name: 'Encode paper scores' })).toBeNull();
    cleanup();
    fixture.paperScores = true;
    const { container } = show(); await ready();
    const encode = within(container.querySelector('.x-head')).getByRole('button', { name: 'Encode paper scores' });
    fireEvent.click(encode);
    expect(fixture.modal.encode.worksheet).toBe(sheetA);
  });

  it('there is no separate worksheet title row any more; the picker names the worksheet', async () => {
    const { container } = show(); await ready();
    expect(container.querySelector('.x-tgr-ws')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['Dela Cruz, Angelo']);
  });
});

describe('Filters (not in p5): closed by default, nothing removed', () => {
  it('closed: no Subject, Grade, status chips or summary on screen', async () => {
    show(); await ready();
    expect(screen.queryByLabelText('Subject')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Filter by status' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Summary' })).toBeNull();
  });

  it('open: Subject, Grade, the chips with counts and the summary, in one compact panel', async () => {
    show(); await ready();
    fireEvent.click(filtersButton());
    expect(filtersButton().getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('region', { name: 'Filters' });
    expect(within(panel).getByLabelText('Subject')).toBeTruthy();
    expect(within(panel).getByLabelText('Grade')).toBeTruthy();
    expect(within(within(panel).getByRole('group', { name: 'Filter by status' })).getAllByRole('button').map(b => b.textContent.replace(/\s+/g, ' ')))
      .toEqual(['All (2)', 'Needs checking (1)', 'Released (1)', 'In progress (0)', 'Not started (0)']);
    expect([...within(panel).getByRole('region', { name: 'Summary' }).querySelectorAll('dt')].map(dt => dt.textContent))
      .toEqual(['Assigned', 'Submitted', 'Needs checking', 'Released', 'Not started', 'Average (released)']);
  });

  it('a filter chosen in the panel keeps working after the panel is closed', async () => {
    show(); await ready();
    fireEvent.click(filtersButton());
    fireEvent.click(screen.getByRole('button', { name: /^Released/ }));
    fireEvent.click(filtersButton());
    expect(screen.queryByRole('region', { name: 'Filters' })).toBeNull();
    expect(names()).toEqual(['Flores, Mark Daniel']);
  });

  it('a Subject that matches no worksheet can still be undone from the panel (the button stays in the header)', async () => {
    fixture.rows = [sheetA];
    show(); await ready();
    fireEvent.click(filtersButton());
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Science' } });
    expect(screen.getByLabelText('Subject').value).toBe('Science');
    expect(filtersButton()).toBeTruthy();
  });
});

describe('list and detail pane (p5)', () => {
  it('rows: name, the submitted day or the score, and the status pill; the first row is reviewed', async () => {
    show(); await ready();
    const rows = within(screen.getByRole('list', { name: 'Worksheet submissions' })).getAllByRole('button');
    expect(rows.map(r => r.textContent)).toEqual(['Dela Cruz, AngeloSubmitted Nov 10Needs checking', 'Flores, Mark Daniel13 / 15Released']);
    const pane = screen.getByRole('region', { name: 'Selected student' });
    expect(within(pane).getByText('Reviewing')).toBeTruthy();
    expect(within(pane).getByRole('heading', { level: 2 }).className).toBe('x-ct x-tgr-name');
  });

  it('Check submissions opens the existing dialog; Next student only selects', async () => {
    show(); await ready();
    const pane = screen.getByRole('region', { name: 'Selected student' });
    fireEvent.click(within(pane).getByRole('button', { name: 'Next student' }));
    expect(within(pane).getByRole('heading', { level: 2 }).textContent).toBe('Flores, Mark Daniel');
    fireEvent.click(within(pane).getByRole('button', { name: 'Check submissions' }));
    expect(fixture.modal.check.worksheet).toBe(sheetA);
  });

  it('no per-question scores and no "Save and release" in the pane (they exist only inside the dialog)', async () => {
    show(); await ready();
    const pane = screen.getByRole('region', { name: 'Selected student' });
    expect(within(pane).queryByRole('button', { name: /Save and release/i })).toBeNull();
    expect(pane.querySelectorAll('ol, .x-tgr-q')).toHaveLength(0);
  });

  it('a worksheet with no submissions: the pane still offers Check submissions', async () => {
    fixture.submissions = [];
    show();
    await screen.findByText('No submissions for this worksheet yet.');
    const pane = screen.getByRole('region', { name: 'Selected student' });
    fireEvent.click(within(pane).getByRole('button', { name: 'Check submissions' }));
    expect(fixture.modal.check.worksheet).toBe(sheetA);
  });
});

describe('layout rules', () => {
  const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
  const css = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n');
  const P = `html.${['theme', 'clarity'].join('-')} `;
  it('p5 sizes: an 88px ring, a 22px reviewing name, 600-weight row names; the Filters panel is a compact card', () => {
    expect(css).toContain(`${P}.x-tgr-ring { width: 88px; margin: 20px 0; }`);
    expect(css).toContain(`${P}.x-tgr-detail .x-tgr-name { margin: 2px 0 0; font-size: 22px; font-weight: 700;`);
    expect(css).toContain(`${P}.x-tgr-who b { font-weight: 600; }`);
    expect(css).toContain(`${P}.x-tgr-panel { display: grid; gap: 12px; margin-bottom: 16px; }`);
  });
});
