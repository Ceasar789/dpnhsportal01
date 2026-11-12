// @vitest-environment jsdom
// Clarity A2: the Admin Subjects tab (final design) from real context data,
// with every classic function reachable through the same handlers, and the
// dialog a word-for-word copy of the classic one (parity checked here).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../lib/useMediaQuery', () => ({ useIsNarrow: () => false, useMediaQuery: () => false }));

import SubjectsTab from '../../../pages/dashboards/admin/tabs/SubjectsTab';
import ClarityAdminSubjectsTab from './ClarityAdminSubjectsTab';

const SUBJECTS = [
  { id: 'm', code: 'MATH', name: 'Mathematics', is_active: true },
  { id: 's', code: 'SCI', name: 'Science', is_active: false },
];
const LOAD = [
  { teacher_id: 't1', subject_id: 'm', grade_level: 'Grade 7' },
  { teacher_id: 't1', subject_id: 'm', grade_level: 'Grade 8' },
  { teacher_id: 't2', subject_id: 'm', grade_level: 'Grade 7' },
  { teacher_id: 't3', subject_id: 's', grade_level: 'Grade 10' },
];
const baseCtx = () => ({
  subjects: SUBJECTS, subjectsLoading: false, subjectsError: null, fetchSubjects: vi.fn(),
  subjectModal: false, editingSubject: null,
  sName: '', setSName: vi.fn(), sCode: '', setSCode: vi.fn(), sActive: true, setSActive: vi.fn(), sSaving: false,
  openCreateSubject: vi.fn(), openEditSubject: vi.fn(), closeSubjectModal: vi.fn(), saveSubject: vi.fn(), deleteSubject: vi.fn(),
  teachingLoad: LOAD, teachingLoadLoading: false, teachingLoadError: null,
});
const show = (Tab = ClarityAdminSubjectsTab) => render(<Tab />);
const table = () => screen.getByRole('table');
const headers = () => within(table()).getAllByRole('columnheader').map(th => th.textContent);
const row = name => within(table()).getByText(name).closest('tr');
// useId differs between two trees; everything else must match.
const norm = html => html.replace(/:r[0-9a-z]+:/g, ':id:');

beforeEach(() => { h.ctx = baseCtx(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('layout from real data', () => {
  it('header, the button and one table of subjects (name, code, status)', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Subjects' })).toBeTruthy();
    expect(screen.getByText('Which subjects run in which grade level.')).toBeTruthy();
    expect(within(row('Mathematics')).getByText('MATH')).toBeTruthy();
    expect(within(row('Mathematics')).getByText('Active')).toBeTruthy();
    expect(within(row('Science')).getByText('Inactive')).toBeTruthy();
  });

  it('grade columns G7-G10 from the teaching load; a dot with text where the subject runs, "—" with text where it does not', () => {
    show();
    expect(headers()).toEqual(['Subject', 'G7', 'G8', 'G9', 'G10', 'Teachers', 'Status', 'Actions']);
    const math = row('Mathematics');
    expect(within(math).getByText('Runs in Grade 7')).toBeTruthy();
    expect(within(math).getByText('Runs in Grade 8')).toBeTruthy();
    expect(within(math).getByText('Not in Grade 9')).toBeTruthy();
    expect(within(row('Science')).getByText('Runs in Grade 10')).toBeTruthy();
  });

  it('teacher count is the number of different teachers in the load', () => {
    show();
    const cells = [...row('Mathematics').querySelectorAll('td')].map(td => td.textContent);
    expect(cells[5]).toBe('2');
    expect([...row('Science').querySelectorAll('td')][5].textContent).toBe('1');
  });

  it('a higher grade appears only when the load really uses it', () => {
    h.ctx.teachingLoad = [...LOAD, { teacher_id: 't4', subject_id: 's', grade_level: 'Grade 11' }];
    show();
    expect(headers()).toContain('G11');
    expect(headers()).not.toContain('G12');
  });

  it.each([
    ['the load failed', c => { c.teachingLoadError = 'x'; }],
    ['the load is loading', c => { c.teachingLoadLoading = true; }],
  ])('no grade or teacher columns when %s (no fake "—" or 0)', (_, arrange) => {
    arrange(h.ctx);
    show();
    expect(headers()).toEqual(['Subject', 'Status', 'Actions']);
    expect(table().textContent).not.toMatch(/Runs in|Not in/);
  });

  it('no department column and no invented values', () => {
    show();
    expect(headers().join(' ')).not.toMatch(/Dept/i);
    expect(document.body.textContent).not.toMatch(/Math Dept|preview/i);
  });
});

describe('states (same texts as classic)', () => {
  it.each([
    ['loading', c => { c.subjectsLoading = true; }, 'Loading subjects…'],
    ['error', c => { c.subjectsError = 'x'; }, 'Could not load subjects. Check your connection and try again.'],
    ['empty', c => { c.subjects = []; }, 'No subjects yet. Add the first one.'],
  ])('%s', (_, arrange, text) => {
    arrange(h.ctx);
    show(SubjectsTab); const classic = document.body.textContent; cleanup();
    show();
    expect(classic).toContain(text);
    expect(document.body.textContent).toContain(text);
  });

  it('Retry calls fetchSubjects', () => {
    h.ctx.subjectsError = 'x';
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.ctx.fetchSubjects).toHaveBeenCalled();
  });
});

describe('every classic function, same handlers', () => {
  it('Add subject opens the create dialog', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Add subject' }));
    expect(h.ctx.openCreateSubject).toHaveBeenCalledTimes(1);
  });

  it('Edit and Delete call the same handlers with the same arguments as classic', () => {
    show(SubjectsTab);
    fireEvent.click(screen.getByRole('button', { name: 'Edit MATH' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete MATH' }));
    const classic = [h.ctx.openEditSubject.mock.calls[0], h.ctx.deleteSubject.mock.calls[0][0]];
    cleanup(); h.ctx = baseCtx();
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Edit MATH' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete MATH' }));
    expect([h.ctx.openEditSubject.mock.calls[0], h.ctx.deleteSubject.mock.calls[0][0]]).toEqual(classic);
    expect(classic).toEqual([[SUBJECTS[0]], 'm']);
  });

  it('after a delete, focus moves to the next Delete button, or to the heading', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Delete MATH' }));
    const focusAfter = h.ctx.deleteSubject.mock.calls[0][1];
    focusAfter();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete MATH' }));
    // With no Delete button left, focus goes to the page heading.
    document.querySelectorAll('.archive-action').forEach(el => el.remove());
    focusAfter();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Subjects' }));
  });
});

describe('the dialog is the classic one', () => {
  it.each([['create', null], ['edit', SUBJECTS[0]]])('%s: identical markup to classic', (_, editing) => {
    Object.assign(h.ctx, { subjectModal: true, editingSubject: editing, sName: editing?.name || '', sCode: editing?.code || '' });
    show(SubjectsTab);
    const classic = norm(screen.getByRole('dialog').outerHTML);
    cleanup();
    show();
    expect(norm(screen.getByRole('dialog').outerHTML)).toBe(classic);
  });

  it('validation: Create on empty fields shows the same messages and still calls saveSubject', () => {
    h.ctx.subjectModal = true;
    show();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Subject name is required.')).toBeTruthy();
    expect(screen.getByText('Subject code is required.')).toBeTruthy();
    expect(h.ctx.saveSubject).toHaveBeenCalledTimes(1);
  });

  it('the discard guard is kept: edited fields ask before Cancel closes', () => {
    h.ctx.subjectModal = true;
    show();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const input = screen.getByLabelText(/Subject Name/);
    input.value = 'Changed';
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledWith('Discard changes?');
    expect(h.ctx.closeSubjectModal).not.toHaveBeenCalled();
  });
});

describe('sources', () => {
  const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
  it('new CSS for Sections and Subjects is all scoped under the theme class', () => {
    const css = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const scope = ['html.theme', 'clarity'].join('-');
    const lines = css.split(/\r?\n/).filter(l => /\.x-(sec|sub-|subj)/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(15);
    for (const line of lines) expect(line.trim().startsWith(`${scope} .x-`), line).toBe(true);
  });
  it('flag OFF: the classic shell still renders the classic Subjects and Sections tabs; only the Clarity layout swaps them', () => {
    const dashboard = readFileSync(join(SRC, 'pages', 'dashboards', 'admin', 'AdminDashboard.jsx'), 'utf8');
    expect(dashboard).toMatch(/import SubjectsTab from '\.\/tabs\/SubjectsTab'/);
    expect(dashboard).toMatch(/import SectionsTab from '\.\/tabs\/SectionsTab'/);
    expect(dashboard).toMatch(/page === 'subjects' && <SubjectsTab \/>/);
    expect(dashboard).toMatch(/page === 'sections' && <SectionsTab \/>/);
    const layout = readFileSync(join(SRC, 'components', 'clarity', 'admin', 'ClarityAdminLayout.jsx'), 'utf8');
    expect(layout).toMatch(/page === 'subjects' && <ClarityAdminSubjectsTab \/>/);
    expect(layout).toMatch(/page === 'sections' && <ClarityAdminSectionsTab \/>/);
  });
});
