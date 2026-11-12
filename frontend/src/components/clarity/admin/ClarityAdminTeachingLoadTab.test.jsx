// @vitest-environment jsdom
// Clarity A6: the Admin Teaching Load tab (final design, real data only).
// Every behaviour is checked against the classic tab on the same mocked
// context: the same context calls, toasts, validation, save bar texts, the
// same unsaved-change guard (context guard, route blocker, beforeunload) and
// the same leave dialog markup.
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import {
  TeachingLoadUnsavedChangesProvider,
  useTeachingLoadUnsavedChanges,
} from '../../../context/TeachingLoadUnsavedChangesContext';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../../../pages/dashboards/admin/AdminContext', () => ({ useAdminContext: () => h.ctx }));
vi.mock('../../../pages/dashboards/admin/shared/TeacherProfileSheet', () => ({
  default: ({ teacher, onClose }) => (
    <div role="dialog" aria-label={`Profile of ${teacher.name}`}><button type="button" onClick={onClose}>Close profile</button></div>
  ),
}));

import TeachingLoadTab from '../../../pages/dashboards/admin/tabs/TeachingLoadTab';
import ClarityAdminTeachingLoadTab from './ClarityAdminTeachingLoadTab';

const MATH = { id: 'sub-math', name: 'Mathematics', code: 'MATH' };
const ENG = { id: 'sub-eng', name: 'English', code: 'ENG' };
const SCI = { id: 'sub-sci', name: 'Science', code: 'SCI' };
const OLD = { id: 'sub-old', name: 'Old Subject', code: 'OLD', is_active: false };
const ANA = { id: 't-ana', name: 'Ana Cruz', email: 'ana@example.com', department: '', status: 'active' };
const RAMON = { id: 't-ramon', name: 'Ramon Delgado', email: 'ramon@example.com', department: 'Mathematics', status: 'active' };
const LIZA = { id: 't-liza', name: 'Liza Uy', email: 'liza@example.com', department: 'Arts', status: '' };

const load = (id, teacher, subject, grade = 'Grade 7') => ({ id, teacher_id: teacher.id, subject_id: subject.id, grade_level: grade, school_year: '2026-2027' });

const baseCtx = (over = {}) => ({
  schoolYear: '2026-2027', setSchoolYear: vi.fn(), settingsSchoolYear: '', schoolYearSource: 'settings',
  teachers: [ANA, RAMON, LIZA], teachersError: false, teachersLoading: false,
  subjects: [MATH, ENG, SCI, OLD], subjectsError: false, fetchSubjects: vi.fn(),
  teachingLoad: [], teachingLoadLoading: false, teachingLoadError: false, fetchTeachingLoad: vi.fn(), fetchTeachers: vi.fn(),
  addLoadEntries: vi.fn().mockResolvedValue(1), removeLoad: vi.fn().mockResolvedValue(true), copyLoadFromYear: vi.fn().mockResolvedValue(undefined), showToast: vi.fn(),
  ...over,
});

// The few names that differ between the two tabs; everything else is shared.
const TABS = {
  classic: { Tab: TeachingLoadTab, add: 'Add Subject', save: 'Save Assignment' },
  clarity: { Tab: ClarityAdminTeachingLoadTab, add: 'Add assignment', save: 'Save' },
};
const norm = html => html.replace(/:r[0-9a-z]+:/g, ':id:');
const chooseTeacher = name => fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
const subjectSelect = () => screen.getByLabelText(/^Add subject$/i);
const addSubject = (t, id) => {
  fireEvent.change(subjectSelect(), { target: { value: id } });
  fireEvent.click(screen.getByRole('button', { name: t.add }));
};
const calls = () => Object.fromEntries(['addLoadEntries', 'removeLoad', 'showToast', 'fetchTeachingLoad', 'copyLoadFromYear', 'setSchoolYear', 'fetchSubjects', 'fetchTeachers']
  .map(k => [k, h.ctx[k].mock.calls]));
const saveBar = () => screen.getByText(/Unsaved changes|All changes saved|is not saved for/).closest('[aria-live="polite"]');
const saveCopy = () => saveBar().firstElementChild.textContent.trim();

// Run the same scenario on both tabs and return what each recorded.
const both = async (over, scenario) => {
  const out = {};
  for (const [key, t] of Object.entries(TABS)) {
    h.ctx = baseCtx(over);
    render(<t.Tab />);
    out[key] = await scenario(t);
    cleanup();
  }
  return out;
};

beforeEach(() => { h.ctx = baseCtx(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('layout from real data', () => {
  it('header, school year, grade tabs with the real per-grade counts, and the caption', () => {
    h.ctx = baseCtx({ teachingLoad: [load('l1', ANA, ENG), load('l2', ANA, SCI), load('l3', RAMON, MATH, 'Grade 9')] });
    render(<ClarityAdminTeachingLoadTab />);
    expect(screen.getByRole('heading', { level: 1, name: 'Teaching Load' })).toBeTruthy();
    expect(screen.getByText('Assign subjects with the teacher and grade always in view.')).toBeTruthy();
    expect(screen.getByLabelText('School year').value).toBe('2026-2027');
    const grades = within(screen.getByRole('group', { name: 'Grade level' })).getAllByRole('button');
    expect(grades.map(b => b.getAttribute('aria-label'))).toEqual([
      'Grade 7, 2 teaching assignments', 'Grade 8, 0 teaching assignments', 'Grade 9, 1 teaching assignment',
      'Grade 10, 0 teaching assignments', 'Grade 11, 0 teaching assignments', 'Grade 12, 0 teaching assignments',
    ]);
    expect(grades[0].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Numbers show assignments per grade.')).toBeTruthy();
  });

  it('the grade tab names equal the classic ones', async () => {
    const r = await both({ teachingLoad: [load('l1', ANA, ENG, 'Grade 8')] }, () => (
      [7, 8, 9, 10, 11, 12].map(n => screen.getByRole('button', { name: new RegExp(`^Grade ${n},`) }).getAttribute('aria-label'))));
    expect(r.clarity).toEqual(r.classic);
  });

  it('teachers list: real names and the real assignment count for the grade, nothing else invented', () => {
    h.ctx = baseCtx({ teachingLoad: [load('l1', ANA, ENG), load('l2', ANA, SCI), load('l3', RAMON, MATH, 'Grade 9')] });
    render(<ClarityAdminTeachingLoadTab />);
    const list = screen.getByRole('region', { name: 'Teachers' });
    expect(within(list).getByText('3 of 3 shown')).toBeTruthy();
    const rows = [...list.querySelectorAll('.x-tld-teacher')].map(b => b.textContent);
    expect(rows).toEqual(['ACAna Cruz2 assignments', 'RDRamon Delgado0 assignments', 'LULiza Uy0 assignments']);
    expect(document.body.textContent).not.toMatch(/section|hours?\b|units?\b|capacity|overload|max/i);
  });

  it('no teacher selected: the classic prompt, no save bar', () => {
    render(<ClarityAdminTeachingLoadTab />);
    expect(screen.getByRole('heading', { level: 2, name: 'Select a teacher' })).toBeTruthy();
    expect(screen.getByText('Select a teacher to begin assigning subjects.')).toBeTruthy();
    expect(screen.queryByText(/All changes saved|Unsaved changes/)).toBeNull();
  });

  it('selected teacher: grade · year, name, department and status only when stored, and the assigned subjects table', () => {
    h.ctx = baseCtx({ teachingLoad: [load('l1', ANA, SCI), load('l2', ANA, ENG)] });
    render(<ClarityAdminTeachingLoadTab />);
    chooseTeacher('Ana Cruz');
    const detail = screen.getByRole('region', { name: 'Ana Cruz' });
    expect(within(detail).getByText('Grade 7 · 2026-2027')).toBeTruthy();
    expect(within(detail).getByText('Active')).toBeTruthy();
    expect(detail.textContent).not.toMatch(/not recorded/i);
    const table = within(detail).getByRole('table', { name: 'Subjects assigned to Ana Cruz for Grade 7' });
    expect(within(table).getAllByRole('columnheader').map(th => th.textContent)).toEqual(['Subject', 'Actions']);
    expect([...table.querySelectorAll('tbody tr b')].map(b => b.textContent)).toEqual(['English', 'Science']);
    expect(within(detail).getByText('Assigned subjects (2)')).toBeTruthy();
    cleanup();
    h.ctx = baseCtx();
    render(<ClarityAdminTeachingLoadTab />);
    chooseTeacher('Liza Uy');
    const liza = screen.getByRole('region', { name: 'Liza Uy' });
    expect(liza.querySelector('.x-badge')).toBeNull();
    expect(within(liza).getByText('Arts')).toBeTruthy();
    expect(within(liza).getByText("Department 'Arts' does not match a subject, so no subject is locked.")).toBeTruthy();
  });

  it('only active subjects are offered, as in classic', async () => {
    const r = await both({}, () => { chooseTeacher('Ana Cruz'); return [...subjectSelect().options].map(o => [o.value, o.textContent]); });
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity.map(([v]) => v)).not.toContain('sub-old');
  });

  it('no "preview" anywhere', () => {
    h.ctx = baseCtx({ teachingLoad: [load('l1', ANA, ENG)], settingsSchoolYear: '2025-2026' });
    const { container } = render(<ClarityAdminTeachingLoadTab />);
    chooseTeacher('Ana Cruz');
    const attrs = [...container.querySelectorAll('[aria-label],[title],[alt]')].flatMap(el => ['aria-label', 'title', 'alt'].map(a => el.getAttribute(a) || ''));
    expect(`${container.textContent} ${attrs.join(' ')}`).not.toMatch(/preview/i);
  });
});

describe('selection only selects', () => {
  it('choosing a teacher or a grade calls nothing in the context', () => {
    render(<ClarityAdminTeachingLoadTab />);
    chooseTeacher('Ana Cruz');
    fireEvent.click(screen.getByRole('button', { name: /^Grade 9,/ }));
    fireEvent.change(subjectSelect(), { target: { value: ENG.id } });
    for (const [name, fn] of Object.entries(h.ctx)) if (fn?.mock) expect(fn, name).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Grade 9,/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Ana Cruz/ }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('every classic function, same calls (classic vs Clarity on the same context)', () => {
  it('stage two subjects and save: one addLoadEntries batch with the same rows', async () => {
    const r = await both({}, async (t) => {
      chooseTeacher('Ana Cruz');
      addSubject(t, ENG.id);
      addSubject(t, SCI.id);
      const staged = [saveBar().textContent.includes('2 changes across this teaching load'), screen.getByText(/assignments per grade/).textContent];
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: t.save })); });
      return { staged, calls: calls(), after: saveBar().textContent };
    });
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity.calls.addLoadEntries).toEqual([[[
      { teacher_id: 't-ana', subject_id: 'sub-eng', grade_level: 'Grade 7' },
      { teacher_id: 't-ana', subject_id: 'sub-sci', grade_level: 'Grade 7' },
    ]]]);
    expect(r.clarity.staged).toEqual([true, 'Numbers show assignments per grade, including unsaved changes.']);
  });

  it('a duplicate is refused with the same toast; Add with no subject shows the same message', async () => {
    const r = await both({ teachingLoad: [load('l1', ANA, ENG)] }, (t) => {
      chooseTeacher('Ana Cruz');
      addSubject(t, ENG.id);
      fireEvent.change(subjectSelect(), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: t.add }));
      return { calls: calls(), message: screen.getByText(/Choose a subject to add for/).textContent, invalid: subjectSelect().getAttribute('aria-invalid') };
    });
    expect(r.clarity.calls).toEqual(r.classic.calls);
    expect(r.clarity.message).toBe(r.classic.message);
    expect(r.clarity.calls.showToast).toEqual([['English is already assigned to Ana Cruz for Grade 7.', 'error']]);
    expect(r.clarity.invalid).toBe('true');
  });

  it('removing a saved subject is staged until Save: removeLoad(ids, { refresh: false }) then fetchTeachingLoad', async () => {
    const r = await both({ teachingLoad: [load('l1', ANA, ENG), load('l2', ANA, SCI)] }, async (t) => {
      chooseTeacher('Ana Cruz');
      fireEvent.click(screen.getByRole('button', { name: 'Remove English from Ana Cruz for Grade 7' }));
      const before = calls().removeLoad.length;
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: t.save })); });
      return { before, calls: calls() };
    });
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity.before).toBe(0);
    expect(r.clarity.calls.removeLoad).toEqual([[['l1'], { refresh: false }]]);
    expect(r.clarity.calls.fetchTeachingLoad).toHaveLength(1);
  });

  it('removing a staged (new) subject just drops it; nothing is called', async () => {
    const r = await both({}, (t) => {
      chooseTeacher('Ana Cruz');
      addSubject(t, ENG.id);
      fireEvent.click(screen.getByRole('button', { name: 'Remove English from Ana Cruz for Grade 7' }));
      return { calls: calls(), bar: saveBar().textContent };
    });
    expect(r.clarity).toEqual(r.classic);
  });

  it('the department subject is locked: no Remove button, saved on Save with the same rows', async () => {
    const r = await both({}, async (t) => {
      chooseTeacher('Ramon Delgado');
      const removable = screen.queryByRole('button', { name: /Remove Mathematics/ });
      const bar = saveBar().textContent;
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: t.save })); });
      return { removable, bar, calls: calls() };
    });
    expect(r.clarity.removable).toBeNull();
    expect(r.clarity.calls).toEqual(r.classic.calls);
    expect(r.clarity.bar).toContain('Mathematics (department) is not saved for Grade 7 yet');
    expect(r.clarity.calls.addLoadEntries).toEqual([[[{ teacher_id: 't-ramon', subject_id: 'sub-math', grade_level: 'Grade 7' }]]]);
  });

  it('a failed save keeps the staged changes', async () => {
    const r = await both({ addLoadEntries: vi.fn().mockResolvedValue(null) }, async (t) => {
      chooseTeacher('Ana Cruz');
      addSubject(t, ENG.id);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: t.save })); });
      return saveBar().textContent.includes('Unsaved changes');
    });
    expect(r).toEqual({ classic: true, clarity: true });
  });

  it('Discard drops everything and calls nothing; the save bar shows the same texts as classic', async () => {
    const r = await both({ teachingLoad: [load('l1', ANA, ENG)] }, (t) => {
      chooseTeacher('Ana Cruz');
      const clean = [saveCopy(), Boolean(screen.queryByRole('button', { name: t.save })), Boolean(screen.queryByRole('button', { name: 'Discard' }))];
      addSubject(t, SCI.id);
      const dirty = [saveCopy(), Boolean(screen.queryByRole('button', { name: t.save })), Boolean(screen.queryByRole('button', { name: 'Discard' }))];
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
      return { clean, dirty, after: saveCopy(), calls: calls() };
    });
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity.clean).toEqual(['All changes saved', false, false]);
    expect(r.clarity.dirty).toEqual(['Unsaved changes1 change across this teaching load', true, true]);
  });

  it('school year: the same setSchoolYear, locked while dirty with the same note; Copy from the previous year', async () => {
    const r = await both({ settingsSchoolYear: '2026-2027' }, async (t) => {
      const year = screen.getByLabelText(/^School year$/i);
      fireEvent.change(year, { target: { value: '2027-2028' } });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Copy from 2025-2026/ })); });
      chooseTeacher('Ana Cruz');
      addSubject(t, ENG.id);
      return {
        calls: calls(), disabled: year.disabled, describedBy: year.getAttribute('aria-describedby'),
        notes: [screen.getByText('Save or discard changes before changing the school year.').id, screen.getByText('Teachers currently see 2026-2027.').id],
        copyDisabled: screen.getByRole('button', { name: /Copy from 2025-2026/ }).disabled,
      };
    });
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity.calls.setSchoolYear).toEqual([['2027-2028']]);
    expect(r.clarity.calls.copyLoadFromYear).toEqual([['2025-2026']]);
    expect([r.clarity.disabled, r.clarity.copyDisabled]).toEqual([true, true]);
  });

  it('teacher search filters by name, email or department like classic', async () => {
    const r = await both({}, () => {
      fireEvent.change(document.getElementById('teacher-search'), { target: { value: 'math' } });
      const shown = screen.getByText(/of 3 shown/).textContent;
      const names = [...document.querySelectorAll('[aria-pressed]')].filter(b => /Cruz|Delgado|Uy/.test(b.textContent)).map(b => b.textContent.match(/Ana Cruz|Ramon Delgado|Liza Uy/)[0]);
      fireEvent.change(document.getElementById('teacher-search'), { target: { value: 'zzz' } });
      return { shown, names, none: screen.getByText(/No teacher matches/).textContent };
    });
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity.names).toEqual(['Ramon Delgado']);
  });

  it('View profile opens the shared teacher profile sheet; closing it returns', () => {
    render(<ClarityAdminTeachingLoadTab />);
    chooseTeacher('Ana Cruz');
    fireEvent.click(screen.getByRole('button', { name: 'View profile' }));
    expect(screen.getByRole('dialog', { name: 'Profile of Ana Cruz' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close profile' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('after a removal, focus moves to the next Remove button', async () => {
    h.ctx = baseCtx({ teachingLoad: [load('l1', ANA, ENG), load('l2', ANA, SCI)] });
    render(<ClarityAdminTeachingLoadTab />);
    chooseTeacher('Ana Cruz');
    fireEvent.click(screen.getByRole('button', { name: 'Remove English from Ana Cruz for Grade 7' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove Science from Ana Cruz for Grade 7' })));
  });
});

describe('states (same texts and Retry handlers as classic)', () => {
  it.each([
    ['teaching load error', { teachingLoadError: true }, 'Could not load teaching assignments. Check your connection and try again.', 'fetchTeachingLoad'],
    ['teachers error', { teachersError: true }, 'Could not load teachers.', 'fetchTeachers'],
    ['subjects error', { subjectsError: true }, 'Could not load subjects.', 'fetchSubjects'],
  ])('%s', async (_, over, text, retry) => {
    const r = await both(over, () => {
      if (over.subjectsError) chooseTeacher('Ana Cruz');
      const shown = Boolean(screen.getByText(text, { exact: false }));
      fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]);
      return { shown, calls: h.ctx[retry].mock.calls.length };
    });
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity).toEqual({ shown: true, calls: 1 });
  });

  it('no teachers, and loading the load for a selected teacher', async () => {
    const r = await both({ teachers: [] }, () => screen.getByText('No teachers yet. Create them in User Management first.').textContent);
    expect(r.clarity).toBe(r.classic);
    h.ctx = baseCtx({ teachingLoadLoading: true });
    render(<ClarityAdminTeachingLoadTab />);
    chooseTeacher('Ana Cruz');
    expect(screen.getByText('Loading teaching load…')).toBeTruthy();
  });

  it('a selected teacher with no subjects', () => {
    render(<ClarityAdminTeachingLoadTab />);
    chooseTeacher('Ana Cruz');
    expect(screen.getByText('No subjects assigned yet.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

// ---------------- the unsaved-change guard ----------------
const GuardAction = ({ destination, onNavigate }) => {
  const { requestTeachingLoadNavigation } = useTeachingLoadUnsavedChanges();
  return <button type="button" onClick={() => requestTeachingLoadNavigation(onNavigate, destination)}>Go to {destination}</button>;
};
const GuardHarness = ({ Tab, destination, onNavigate }) => {
  const [mounted, setMounted] = useState(true);
  return (
    <TeachingLoadUnsavedChangesProvider>
      {mounted && <Tab />}
      <GuardAction destination={destination} onNavigate={() => { onNavigate(); setMounted(false); }} />
    </TeachingLoadUnsavedChangesProvider>
  );
};

describe('the unsaved-change guard is the classic one', () => {
  const guarded = async (scenario) => {
    const out = {};
    for (const [key, t] of Object.entries(TABS)) {
      h.ctx = baseCtx();
      const navigate = vi.fn();
      render(<GuardHarness Tab={t.Tab} destination="Settings" onNavigate={navigate} />);
      out[key] = await scenario(t, navigate);
      cleanup();
    }
    return out;
  };

  it('clean: navigation goes straight through, no dialog', async () => {
    const r = await guarded((t, navigate) => {
      chooseTeacher('Ana Cruz');
      fireEvent.click(screen.getByRole('button', { name: 'Go to Settings' }));
      return [navigate.mock.calls.length, screen.queryByRole('dialog')];
    });
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity).toEqual([1, null]);
  });

  it('dirty: the same dialog; Stay keeps the changes; Leave discards without saving and navigates once', async () => {
    const r = await guarded((t, navigate) => {
      chooseTeacher('Ana Cruz');
      addSubject(t, ENG.id);
      fireEvent.click(screen.getByRole('button', { name: 'Go to Settings' }));
      fireEvent.click(screen.getByRole('button', { name: 'Go to Settings' }));
      const dialogs = screen.getAllByRole('dialog').length;
      const markup = norm(screen.getByRole('dialog', { name: 'Leave Teaching Load?' }).outerHTML);
      fireEvent.click(screen.getByRole('button', { name: 'Stay on Teaching Load' }));
      const kept = [navigate.mock.calls.length, saveBar().textContent.includes('Unsaved changes')];
      fireEvent.click(screen.getByRole('button', { name: 'Go to Settings' }));
      fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
      return { dialogs, markup, kept, left: navigate.mock.calls.length, calls: calls() };
    });
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity.dialogs).toBe(1);
    expect(r.clarity.markup).toContain('Leaving for Settings will discard those changes.');
    expect(r.clarity.kept).toEqual([0, true]);
    expect(r.clarity.left).toBe(1);
    expect(r.clarity.calls.addLoadEntries).toEqual([]);
  });

  it('while a save is running: the same "save in progress" dialog, and no way to leave', async () => {
    const r = await guarded(async (t, navigate) => {
      let finish;
      h.ctx.addLoadEntries.mockImplementation(() => new Promise(res => { finish = res; }));
      chooseTeacher('Ana Cruz');
      addSubject(t, ENG.id);
      fireEvent.click(screen.getByRole('button', { name: t.save }));
      fireEvent.click(screen.getByRole('button', { name: 'Go to Settings' }));
      const markup = norm(screen.getByRole('dialog', { name: 'Teaching load save in progress' }).outerHTML);
      const leave = screen.queryByRole('button', { name: 'Leave without saving' });
      await act(async () => { finish(1); });
      return { markup, leave, navigated: navigate.mock.calls.length, open: Boolean(screen.queryByRole('dialog')) };
    });
    expect(r.clarity).toEqual(r.classic);
    expect(r.clarity.leave).toBeNull();
    expect(r.clarity.navigated).toBe(0);
  });

  it('beforeunload is registered only while dirty, and removed after Discard', async () => {
    const r = await both({}, async (t) => {
      const add = vi.spyOn(window, 'addEventListener');
      const remove = vi.spyOn(window, 'removeEventListener');
      chooseTeacher('Ana Cruz');
      const clean = add.mock.calls.some(([type]) => type === 'beforeunload');
      addSubject(t, ENG.id);
      await waitFor(() => expect(add.mock.calls.some(([type]) => type === 'beforeunload')).toBe(true));
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
      await waitFor(() => expect(remove.mock.calls.some(([type]) => type === 'beforeunload')).toBe(true));
      add.mockRestore(); remove.mockRestore();
      return clean;
    });
    expect(r).toEqual({ classic: false, clarity: false });
  });

  it('a router (history) navigation while dirty is blocked by the same route blocker and dialog', async () => {
    // jsdom's AbortSignal is not the one Node's Request accepts; the router
    // only needs a Request object here, so drop the signal for this test.
    const NativeRequest = globalThis.Request;
    vi.stubGlobal('Request', class extends NativeRequest {
      constructor(input, init = {}) { const rest = { ...init }; delete rest.signal; super(input, rest); }
    });
    const out = {};
    for (const [key, t] of Object.entries(TABS)) {
      h.ctx = baseCtx();
      const router = createMemoryRouter([
        { path: '/load', element: <t.Tab /> },
        { path: '/elsewhere', element: <p>Elsewhere page</p> },
      ], { initialEntries: ['/elsewhere', '/load'], initialIndex: 1 });
      render(<RouterProvider router={router} />);
      chooseTeacher('Ana Cruz');
      addSubject(t, ENG.id);
      const cancelled = router.navigate(-1);
      const markup = norm((await screen.findByRole('dialog', { name: 'Leave Teaching Load?' })).outerHTML);
      fireEvent.click(screen.getByRole('button', { name: 'Stay on Teaching Load' }));
      await cancelled;
      const stayed = router.state.location.pathname;
      const confirmed = router.navigate(-1);
      fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
      await confirmed;
      await screen.findByText('Elsewhere page');
      out[key] = { markup, stayed, left: router.state.location.pathname, saved: h.ctx.addLoadEntries.mock.calls.length };
      cleanup();
    }
    expect(out.clarity).toEqual(out.classic);
    expect(out.clarity.markup).toContain('Leaving for /elsewhere will discard those changes.');
    expect(out.clarity).toEqual(expect.objectContaining({ stayed: '/load', left: '/elsewhere', saved: 0 }));
    vi.unstubAllGlobals();
  });
});
