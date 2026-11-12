// @vitest-environment jsdom
// Clarity G3: Schedules, Teaching Load and Memos against the final design
// (Admin PDF pages 6, 4 and 9). Schedules opens the first real section on
// load; Teaching Load keeps the school year and its tools in the header;
// Memos leaves out a missing sender or audience instead of printing a dash.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../pages/dashboards/admin/shared/TeacherProfileSheet', () => ({ default: () => null }));

import ClarityAdminSchedulesTab from './ClarityAdminSchedulesTab';
import ClarityAdminTeachingLoadTab from './ClarityAdminTeachingLoadTab';
import ClarityAdminMemosTab from './ClarityAdminMemosTab';

afterEach(() => cleanup());

// ---------- Schedules ----------
const SECTIONS = [
  { id: 's8', name: 'Luna', grade_level: 'Grade 8' },
  { id: 's7b', name: 'Mabini', grade_level: '7' },
  { id: 's7a', name: 'Rizal', grade_level: 'Grade 7' },
];
const schedCtx = (extra = {}) => ({
  schoolYear: '2026-2027', settingsSchoolYear: '2026-2027', schoolYearSource: 'settings',
  teachers: [{ id: 't1', name: 'Ana Cruz' }], teachersError: null, teachersLoading: false, fetchTeachers: vi.fn(),
  subjects: [{ id: 'm', name: 'Mathematics', code: 'MATH', is_active: true }], subjectsError: null, subjectsLoading: false, fetchSubjects: vi.fn(),
  sections: SECTIONS, sectionsError: null, sectionsLoading: false, fetchSections: vi.fn(),
  teachingLoad: [], teachingLoadError: null, teachingLoadLoading: false, fetchTeachingLoad: vi.fn(),
  schedules: [{ id: 'p1', section_id: 's7b', subject_id: 'm', teacher_id: 't1', day_of_week: 'Monday', start_time: '07:30:00', end_time: '08:30:00', room_number: null }],
  schedulesLoading: false, schedulesError: null, fetchSchedules: vi.fn(),
  scheduleOpenSectionId: null, setScheduleOpenSectionId: vi.fn(),
  scheduleModal: false, openCreateSchedule: vi.fn(), closeScheduleModal: vi.fn(), saveSchedule: vi.fn(), deleteSchedule: vi.fn(),
  schedTeacher: '', setSchedTeacher: vi.fn(), schedSubject: '', schedSection: '', schedDay: 'Monday', setSchedDay: vi.fn(),
  schedStart: '08:00', setSchedStart: vi.fn(), schedEnd: '09:00', setSchedEnd: vi.fn(), schedRoom: '', setSchedRoom: vi.fn(), schedSaving: false,
  scheduleConflicts: [], scheduleCheckError: '',
  ...extra,
});

describe('Schedules (PDF p6)', () => {
  it('opens the first section of the picker on load: lowest grade first, then list order', () => {
    h.ctx = schedCtx();
    render(<ClarityAdminSchedulesTab />);
    expect(h.ctx.setScheduleOpenSectionId).toHaveBeenCalledWith('s7b');
    const options = [...screen.getByLabelText('Section').querySelectorAll('option')].map(o => o.value);
    expect(options.filter(Boolean)[0]).toBe('s7b');
  });

  it('works the same without the shared open-section state (local state): the timetable shows', () => {
    h.ctx = schedCtx({ setScheduleOpenSectionId: undefined, scheduleOpenSectionId: undefined });
    render(<ClarityAdminSchedulesTab />);
    expect(screen.getByRole('table', { name: 'Weekly timetable for Mabini' })).toBeTruthy();
    expect(screen.queryByText('Pick a section above to set its schedule.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add class' })).toBeTruthy();
  });

  it('leaves an open section alone, and does nothing while loading, on error, or with no sections', () => {
    for (const extra of [
      { scheduleOpenSectionId: 's8' },
      { sectionsLoading: true },
      { sectionsError: 'boom' },
      { sections: [] },
    ]) {
      h.ctx = schedCtx(extra);
      render(<ClarityAdminSchedulesTab />);
      expect(h.ctx.setScheduleOpenSectionId, JSON.stringify(extra)).not.toHaveBeenCalled();
      cleanup();
    }
    h.ctx = schedCtx({ sections: [] });
    render(<ClarityAdminSchedulesTab />);
    expect(screen.getByText('No sections for 2026-2027. Create them in Sections first.')).toBeTruthy();
  });

  it('an open section that no longer exists is replaced by the first one', () => {
    h.ctx = schedCtx({ scheduleOpenSectionId: 'gone' });
    render(<ClarityAdminSchedulesTab />);
    expect(h.ctx.setScheduleOpenSectionId).toHaveBeenCalledWith('s7b');
  });

  it('the timetable card comes right under the header; class setup and subjects follow', () => {
    h.ctx = schedCtx({ scheduleOpenSectionId: 's7b' });
    const { container } = render(<ClarityAdminSchedulesTab />);
    const cards = [...container.querySelectorAll('.x-sch > section')].map(s => s.getAttribute('aria-label') || s.getAttribute('aria-labelledby'));
    expect(cards).toEqual(['Weekly timetable for Mabini', 'Class setup for Mabini', 'x-sch-subjects']);
  });

  it('Add class still leads to the existing per-subject Add (openCreateSchedule with section and subject)', () => {
    h.ctx = schedCtx({ scheduleOpenSectionId: 's7b' });
    render(<ClarityAdminSchedulesTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Add class' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Mathematics schedule' }));
    fireEvent.click(document.activeElement);
    expect(h.ctx.openCreateSchedule).toHaveBeenCalledWith({ sectionId: 's7b', subjectId: 'm' });
  });
});

// ---------- Teaching Load ----------
const tlCtx = (extra = {}) => ({
  schoolYear: '2026-2027', setSchoolYear: vi.fn(), settingsSchoolYear: '2026-2027', schoolYearSource: 'settings',
  teachers: [{ id: 't1', name: 'Ana Cruz', email: 'ana@x.test', status: 'active' }], teachersError: false, teachersLoading: false,
  subjects: [{ id: 'm', name: 'Mathematics', code: 'MATH' }], subjectsError: false, fetchSubjects: vi.fn(),
  teachingLoad: [], teachingLoadLoading: false, teachingLoadError: false, fetchTeachingLoad: vi.fn(), fetchTeachers: vi.fn(),
  addLoadEntries: vi.fn().mockResolvedValue(1), removeLoad: vi.fn().mockResolvedValue(true), copyLoadFromYear: vi.fn().mockResolvedValue(undefined), showToast: vi.fn(),
  ...extra,
});

describe('Teaching Load (PDF p4)', () => {
  it('the school year, the "Teachers currently see" note and Copy from the previous year sit in the header, top right', () => {
    h.ctx = tlCtx();
    const { container } = render(<ClarityAdminTeachingLoadTab />);
    const head = container.querySelector('.x-head');
    const right = head.querySelector('.x-tld-headact');
    expect(within(right).getByLabelText('School year').value).toBe('2026-2027');
    expect(within(right).getByText('Teachers currently see 2026-2027.')).toBeTruthy();
    fireEvent.click(within(right).getByRole('button', { name: 'Copy from 2025-2026' }));
    expect(h.ctx.copyLoadFromYear).toHaveBeenCalledWith('2025-2026');
    // Nothing sits between the header and the grade tabs any more.
    const grades = container.querySelector('.x-tld-grades');
    expect(container.querySelector('.x-tld > .x-tld-tools')).toBeNull();
    expect(head.compareDocumentPosition(grades) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('no Section column: an assignment has no section', () => {
    h.ctx = tlCtx({ teachingLoad: [{ id: 'l1', teacher_id: 't1', subject_id: 'm', grade_level: 'Grade 7', school_year: '2026-2027' }] });
    render(<ClarityAdminTeachingLoadTab />);
    fireEvent.click(screen.getByRole('button', { name: /Ana Cruz/ }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(th => th.textContent)).toEqual(['Subject', 'Actions']);
  });
});

// ---------- Memos ----------
const MEMOS = [
  { id: 'm1', subject: 'Both', from_office: "Principal's Office", recipient: 'All Faculty', content: 'x', created_at: '2026-11-10T03:00:00Z' },
  { id: 'm2', subject: 'No sender', from_office: '', recipient: 'All Students', content: 'y', created_at: '2026-11-09T03:00:00Z' },
  { id: 'm3', subject: 'No recipient', from_office: 'Guidance', recipient: null, content: 'z', created_at: '2026-11-08T03:00:00Z' },
  { id: 'm4', subject: 'Neither', from_office: '  ', recipient: '', content: 'w', created_at: '2026-11-07T03:00:00Z' },
];
const memoCtx = (extra = {}) => ({
  closeModal: vi.fn(), deleteMemo: vi.fn(), editMemo: null, filteredMemos: MEMOS, mBody: '', mFrom: '', mSaving: false, mSubj: '', mTo: 'All Faculty',
  memoFilter: '', memoSearch: '', memos: MEMOS, fetchMemos: vi.fn(), memosError: '', memosLoading: false, modal: null,
  openCompose: vi.fn(), openEditMemo: vi.fn(), saveMemo: vi.fn(), selMemo: null,
  setMBody: vi.fn(), setMFrom: vi.fn(), setMSubj: vi.fn(), setMTo: vi.fn(), setMemoFilter: vi.fn(), setMemoSearch: vi.fn(), setSelMemo: vi.fn(), users: [],
  ...extra,
});

describe('Memos (PDF p9)', () => {
  it('cards show sender and audience only as stored: no dash, no assumed "All"', () => {
    h.ctx = memoCtx();
    const { container } = render(<ClarityAdminMemosTab />);
    const lines = [...container.querySelectorAll('.x-memo-card')].map(c => c.querySelector('.x-memo-aud')?.textContent ?? null);
    expect(lines).toEqual(["Principal's Office → All Faculty", 'All Students', 'Guidance', null]);
    expect(container.querySelector('.x-memo-layout').textContent).not.toMatch(/—/);
  });

  it('the selected memo lists From and To only when stored; Edit and Delete stay', () => {
    h.ctx = memoCtx({ selMemo: MEMOS[3] });
    render(<ClarityAdminMemosTab />);
    const detail = screen.getByRole('region', { name: 'Selected memo' });
    expect([...detail.querySelectorAll('dt')].map(dt => dt.textContent)).toEqual(['Date']);
    expect(detail.querySelector('dl').textContent).not.toMatch(/—|All Faculty/);
    fireEvent.click(within(detail).getByRole('button', { name: 'Edit' }));
    expect(h.ctx.openEditMemo).toHaveBeenCalledWith(MEMOS[3]);
    fireEvent.click(within(detail).getByRole('button', { name: 'Delete' }));
    expect(h.ctx.deleteMemo.mock.calls[0][0]).toBe('m4');
  });

  it('one real "Sent" column (no Drafts or Acknowledged: no memo field backs them) and New memo in the header', () => {
    h.ctx = memoCtx();
    render(<ClarityAdminMemosTab />);
    expect(screen.getAllByRole('heading', { level: 2 }).map(x => x.textContent)).toEqual(['Sent']);
    fireEvent.click(screen.getByRole('button', { name: 'New memo' }));
    expect(h.ctx.openCompose).toHaveBeenCalled();
  });
});

describe('layout rules', () => {
  const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
  const css = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n');
  const P = `html.${['theme', 'clarity'].join('-')} `;
  it('the Teaching Load header tools stack under the school year, right aligned; full width on phones', () => {
    expect(css).toContain(`${P}.x-tld > .x-head { align-items: flex-start; }`);
    expect(css).toContain(`${P}.x-tld-headact { display: grid; justify-items: end; gap: 8px; }`);
    expect(css).toContain(`${P}.x-tld-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 12px; }`);
    expect(css).toContain(`  ${P}.x-tld-headact { width: 100%; justify-items: stretch; }`);
  });
});
