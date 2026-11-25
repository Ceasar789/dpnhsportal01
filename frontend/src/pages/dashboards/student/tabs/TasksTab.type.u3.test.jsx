// @vitest-environment jsdom
// U-S3: a worksheet-type filter beside the All / Pending / Submitted / Graded
// chips. It lists only the types the student's tasks have (with counts), keeps
// the choice in ?type=, and the chip counts follow it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../StudentDataContext', () => ({ useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({ supabase: { from() { throw new Error('no reads expected'); } } }));

import StudentTasksTab from './TasksTab';
import { taskTypeLabel, taskTypeOptions } from '../taskGroups';

const FUTURE = '2099-01-15T23:59:00';
const sheet = (id, extra = {}) => ({ id, title: `Task ${id}`, subject: 'Legacy', subject_id: 'eng', task_type: 'quiz', items: 5, instructions: 'Answer.', ...extra });
const TASKS = [
  { sheet: sheet('q1') },
  { sheet: sheet('q2'), submission: { id: 's', status: 'submitted', released: false } },
  { sheet: sheet('w1', { task_type: 'worksheet', subject_id: 'math' }) },
  { sheet: sheet('act', { task_type: 'worksheet', items: 0, instructions: 'Read chapter 2.' }) },
  { sheet: sheet('up', { task_type: 'worksheet', submission_mode: 'attachment', items: 0 }) },
  { sheet: sheet('p1', { task_type: 'project' }) },
];
beforeEach(() => {
  state.graph = {
    fatalError: null, enrolments: [],
    assignees: TASKS.map(t => ({ task_id: t.sheet.id, section_id: 's1', assigned_at: null, due_at: FUTURE })),
    sheetById: new Map(TASKS.map(t => [t.sheet.id, t.sheet])),
    submissionStates: TASKS.filter(t => t.submission).map(t => ({ worksheet_id: t.sheet.id, ...t.submission })),
    releasedScores: [], subjectsById: new Map([['eng', 'English'], ['math', 'Math']]),
  };
});
afterEach(() => cleanup());

const seen = {};
const Where = () => { const l = useLocation(); useEffect(() => { seen.search = l.search; }); return null; };
const show = (entry = '/') => render(<MemoryRouter initialEntries={[entry]}><StudentTasksTab /><Where /></MemoryRouter>);
const typeSelect = () => screen.getByRole('combobox', { name: 'Type' });
const options = () => [...typeSelect().options].map(o => o.textContent);
const titles = () => screen.queryAllByText(/^Task /).map(el => el.textContent);
const chip = name => screen.getByRole('button', { name: new RegExp(`^${name} \\(`) });

describe('U-S3 type filter', () => {
  it('the label rule is the badge rule (Activity for handouts and file hand-ins)', () => {
    expect(TASKS.map(t => taskTypeLabel(t.sheet))).toEqual(['Quiz', 'Quiz', 'Worksheet', 'Activity', 'Activity', 'Project']);
    expect(taskTypeOptions(TASKS)).toEqual([['Activity', 2], ['Project', 1], ['Quiz', 2], ['Worksheet', 1]]);
  });

  it('lists "All types" and only the types present, with counts', () => {
    show();
    expect(options()).toEqual(['All types (6)', 'Activity (2)', 'Project (1)', 'Quiz (2)', 'Worksheet (1)']);
    expect(typeSelect().value).toBe('');
  });

  it('choosing a type narrows the list and the chip counts, and is kept in ?type=', () => {
    show();
    fireEvent.change(typeSelect(), { target: { value: 'Quiz' } });
    expect(titles()).toEqual(['Task q1', 'Task q2']);
    expect(chip('All').textContent).toBe('All (2)');
    expect(chip('Pending').textContent).toBe('Pending (1)');
    expect(chip('Submitted').textContent).toBe('Submitted (1)');
    expect(seen.search).toContain('type=Quiz');
    fireEvent.change(typeSelect(), { target: { value: '' } });
    expect(titles()).toHaveLength(6);
    expect(seen.search).not.toContain('type=');
  });

  it('works with ?subject= and ?view=; an unknown ?type= falls back to All types', () => {
    show('/?subject=math&type=Worksheet&view=pending');
    expect(titles()).toEqual(['Task w1']);
    cleanup();
    show('/?type=Exam');
    expect(typeSelect().value).toBe('');
    expect(titles()).toHaveLength(6);
  });
});
