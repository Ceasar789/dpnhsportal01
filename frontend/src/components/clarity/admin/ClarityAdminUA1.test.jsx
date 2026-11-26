// @vitest-environment jsdom
// U-A-1: (A2) the admin Overview header has no "Create user" (the Users page
// has its own); the empty state keeps "Create the first user". (A4) Subjects:
// "Offered" / "Not offered" in each grade cell instead of the dot and dash, and
// one card per subject on phones (rules in the G10 phone block, Subjects only).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../lib/useMediaQuery', () => ({ useIsNarrow: () => false, useMediaQuery: () => false }));

import ClarityAdminOverviewTab from './ClarityAdminOverviewTab';
import ClarityAdminSubjectsTab from './ClarityAdminSubjectsTab';

const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
const raw = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n');
const P = `html.${['theme', 'clarity'].join('-')}`;
const g10 = raw.indexOf('/* G10: phones first');
const phone = raw.slice(raw.indexOf('@media (max-width: 767px) {', g10), raw.indexOf('/* G10: phones in landscape', g10));
const landscape = raw.slice(raw.indexOf('/* G10: phones in landscape', g10), raw.indexOf('@media (max-width: 520px)', g10));
const desktop = raw.slice(0, raw.indexOf('/* G10: phones first'));

afterEach(() => cleanup());

const overview = (extra = {}) => {
  h.ctx = {
    stats: { users: 2, news: 0, events: 0, memos: 0 }, statsErrors: {}, overviewLoading: false,
    settings: {}, settingsStatus: 'ready', users: [], usersLoading: false, usersError: null,
    newsItems: [], calEvents: [], memos: [], activityLogs: [],
    setPage: vi.fn(), openCreateUser: vi.fn(), ...extra,
  };
  return render(<MemoryRouter><ClarityAdminOverviewTab /></MemoryRouter>);
};

describe('A2: Overview header', () => {
  it('has no "Create user" button anywhere in the header', () => {
    const { container } = overview({ users: [{ id: 'a', role: 'student', status: 'active', created_at: '2026-01-05T00:00:00Z' }] });
    const head = container.querySelector('.x-ov-head');
    expect(within(head).getByRole('heading', { level: 1, name: 'Dashboard Overview' })).toBeTruthy();
    expect(within(head).queryAllByRole('button')).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Create user' })).toBeNull();
  });

  it('keeps the empty-state "Create the first user": it opens Users and its create dialog', () => {
    overview();
    const empty = screen.getByText('No accounts yet').closest('.x-empty');
    fireEvent.click(within(empty).getByRole('button', { name: 'Create the first user' }));
    expect(h.ctx.setPage).toHaveBeenCalledWith('users');
    expect(h.ctx.openCreateUser).toHaveBeenCalledTimes(1);
  });
});

const subjects = () => {
  h.ctx = {
    subjects: [{ id: 'm', code: 'MATH', name: 'Mathematics', is_active: true }],
    subjectsLoading: false, subjectsError: null, fetchSubjects: vi.fn(),
    subjectModal: false, editingSubject: null,
    sName: '', setSName: vi.fn(), sCode: '', setSCode: vi.fn(), sActive: true, setSActive: vi.fn(), sSaving: false,
    openCreateSubject: vi.fn(), openEditSubject: vi.fn(), closeSubjectModal: vi.fn(), saveSubject: vi.fn(), deleteSubject: vi.fn(),
    teachingLoad: [
      { teacher_id: 't1', subject_id: 'm', grade_level: 'Grade 7' },
      { teacher_id: 't2', subject_id: 'm', grade_level: 'Grade 8' },
    ],
    teachingLoadLoading: false, teachingLoadError: null,
  };
  render(<ClarityAdminSubjectsTab />);
  return screen.getByText('Mathematics').closest('tr');
};

describe('A4: Subjects grade cells', () => {
  it('say "Offered" / "Not offered" (with the grade name for the phone chip), never a dot or a dash', () => {
    const row = subjects();
    const cells = [...row.querySelectorAll('td.x-sub-g')];
    expect(cells.map(td => td.querySelector('[aria-hidden="true"]').textContent))
      .toEqual(['Grade 7 Offered', 'Grade 8 Offered', 'Grade 9 Not offered', 'Grade 10 Not offered']);
    expect(cells.map(td => td.querySelector('.x-sr').textContent))
      .toEqual(['Offered in Grade 7', 'Offered in Grade 8', 'Not offered in Grade 9', 'Not offered in Grade 10']);
    expect(cells.map(td => td.querySelector('.x-sub-cell').className))
      .toEqual(['x-sub-cell on', 'x-sub-cell on', 'x-sub-cell', 'x-sub-cell']);
    expect(row.textContent).not.toContain('—');
    expect(row.querySelector('.x-sub-dot')).toBeNull();
  });

  it('the table carries the Subjects class and the teacher cell its phone label (text stays the number)', () => {
    const row = subjects();
    expect(row.closest('table').className).toBe('x-table x-subj-table');
    const teachers = row.querySelector('td[data-label]');
    expect(teachers.getAttribute('data-label')).toBe('Teachers');
    expect(teachers.textContent).toBe('2');
  });
});

describe('A4: Subjects styles', () => {
  it('desktop: a word pill (no fixed 28px box), the grade name hidden; no dot rule left', () => {
    expect(desktop).toContain(`${P} .x-sub-cell { display: inline-flex; align-items: center; justify-content: center; min-height: 22px; padding: 2px 8px;`);
    expect(desktop).toContain(`${P} .x-sub-gl { display: none; }`);
    expect(raw).not.toContain('.x-sub-dot');
    // Pills, badge and code never break inside a word (the shared cells use overflow-wrap: anywhere); 8px sides from 768px.
    const T = `${P} .x-table.x-subj-table`;
    expect(desktop).toContain(`${T} .x-sub-cell, ${T} .x-badge, ${T} .nm span { overflow-wrap: normal; }`);
    expect(desktop).toContain(`@media (min-width: 768px) {\n  ${T} th, ${T} td { padding-left: 8px; padding-right: 8px; }\n}`);
  });

  it('phones (767px): one card per subject, labelled teachers, grade chips, 44px actions', () => {
    for (const line of [
      `${P} .x-table.x-subj-table { min-width: 0; }`,
      `${P} .x-subj-table thead th { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); }`,
      `${P} .x-subj-table tbody tr { display: flex; flex-wrap: wrap;`,
      // The name keeps 7rem; on a 320 screen the badge and buttons move under it.
      `${P} .x-subj-table tbody td:first-child { flex: 1 1 7rem; }`,
      `${P} .x-subj-table tbody td[data-label]::before { content: attr(data-label) ": ";`,
      `${P} .x-subj-table .x-sub-gl { display: inline; }`,
      `${P} .x-subj-table .x-iconbtn { width: 44px; height: 44px; }`,
      `${P} .x-subj-table tbody tr:hover { background: var(--cl-table-hover); }`,
      `${P} .x-subj-table tbody tr:hover td { background: transparent; }`,
    ]) expect(phone).toContain(line);
  });

  it('scoped to the Subjects table only, no motion; landscape phones keep the table', () => {
    const lines = phone.split('\n').filter(l => l.includes('x-subj-table'));
    expect(lines.length).toBe(14);
    for (const l of lines) {
      expect(l.trim().startsWith(`${P} .x-`), l).toBe(true);
      expect(l).not.toMatch(/transition|animation|!important|nowrap/);
    }
    expect(landscape).not.toContain('x-subj-table');
  });
});
