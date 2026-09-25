// @vitest-environment jsdom
// ============================================
// FILE: src/pages/dashboards/admin/tabs/TeachingLoadTab.test.jsx
// Interaction tests for the Teaching Load screen.
//
// The render smoke test only proves a tab does not throw on first paint. It
// cannot tell you whether pressing a button does anything, and every rule
// this screen enforces — one teacher per subject per grade, the draft, the
// red fields — lives in exactly that gap. None of it is in the database, so
// if it breaks here it breaks silently.
//
// The environment docblock above is per-file on purpose: vitest.config.js
// runs in node so the pure-logic suites stay fast, and only the handful of
// files that need a DOM pay for one.
//
// useAdminContext is mocked rather than wrapped in a real AdminProvider:
// the provider would fetch, and what is under test is this component's own
// logic, not Supabase.
// ============================================

import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));

const TeachingLoadTab = (await import('./TeachingLoadTab')).default;

const MATH = { id: 'sub-math', name: 'Mathematics', code: 'MATH' };
const ENG = { id: 'sub-eng', name: 'English', code: 'ENG' };

const ANA = { id: 't-ana', name: 'Ana Cruz', email: 'ana@example.com', department: 'English' };
const RAMON = { id: 't-ramon', name: 'Ramon Delgado', email: 'ramon@example.com', department: 'Mathematics' };

const baseCtx = (over = {}) => ({
  schoolYear: '2026-2027',
  setSchoolYear: vi.fn(),
  teachers: [ANA, RAMON],
  teachersError: false,
  subjects: [MATH, ENG],
  teachingLoad: [],
  teachingLoadLoading: false,
  teachingLoadError: false,
  fetchTeachingLoad: vi.fn(),
  fetchTeachers: vi.fn(),
  addLoadEntries: vi.fn().mockResolvedValue(1),
  removeLoad: vi.fn(),
  copyLoadFromYear: vi.fn(),
  showToast: vi.fn(),
  ...over,
});

const addButton = () => screen.getByRole('button', { name: /add to list/i });

beforeEach(() => { h.ctx = baseCtx(); });
afterEach(cleanup);

describe('TeachingLoadTab', () => {
  it('opens on Grade 7 and scopes the subject label to it', () => {
    render(<TeachingLoadTab />);
    expect(screen.getByText('Subject for Grade 7')).toBeTruthy();
  });

  // The whole point of enabling the button while incomplete: a disabled
  // button cannot say what it is waiting for.
  it('names both missing fields when Add is pressed with nothing chosen', () => {
    render(<TeachingLoadTab />);
    expect(screen.queryByText(/pick a teacher from the list/i)).toBeNull();

    fireEvent.click(addButton());

    expect(screen.getByText(/pick a teacher from the list/i)).toBeTruthy();
    expect(screen.getByText(/choose a subject for grade 7/i)).toBeTruthy();
  });

  it('stages an entry instead of writing it', async () => {
    const { container } = render(<TeachingLoadTab />);

    fireEvent.click(screen.getByLabelText(/Ana Cruz/));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: ENG.id } });
    fireEvent.click(addButton());

    // In the draft, under its grade, and NOT sent anywhere. Scoped to the
    // draft's own row: the name is also still in the picker, and getByText
    // would match both.
    expect(screen.getByText('To be assigned')).toBeTruthy();
    expect(container.querySelector('.draft-grade').textContent).toBe('Grade 7');
    expect(container.querySelector('.draft-teacher').textContent).toBe('Ana Cruz');
    expect(container.querySelector('.draft-subject').textContent).toBe('English');
    expect(h.ctx.addLoadEntries).not.toHaveBeenCalled();
  });

  it('writes the whole draft on Assign, once', async () => {
    render(<TeachingLoadTab />);

    fireEvent.click(screen.getByLabelText(/Ana Cruz/));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: ENG.id } });
    fireEvent.click(addButton());
    fireEvent.click(screen.getByRole('button', { name: /assign 1 entry/i }));

    expect(h.ctx.addLoadEntries).toHaveBeenCalledTimes(1);
    expect(h.ctx.addLoadEntries).toHaveBeenCalledWith([
      { teacher_id: ANA.id, grade_level: 'Grade 7', subject_id: ENG.id },
    ]);
  });

  // A failed write must not empty the draft — rebuilding eight lines before
  // you can retry is worse than the failure.
  it('keeps the draft when the write fails', async () => {
    h.ctx = baseCtx({ addLoadEntries: vi.fn().mockResolvedValue(null) });
    render(<TeachingLoadTab />);

    fireEvent.click(screen.getByLabelText(/Ana Cruz/));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: ENG.id } });
    fireEvent.click(addButton());
    await screen.findByText('To be assigned');
    fireEvent.click(screen.getByRole('button', { name: /assign 1 entry/i }));

    expect(await screen.findByText('To be assigned')).toBeTruthy();
  });

  // Rule the database cannot enforce: teacher_subjects is UNIQUE on
  // (teacher, subject, grade, year), so it would take a second teacher on
  // the same subject and grade without complaint.
  it('disables a teacher who already holds something at this grade', () => {
    h.ctx = baseCtx({
      teachingLoad: [{
        id: 'l1', teacher_id: RAMON.id, subject_id: MATH.id,
        grade_level: 'Grade 7', school_year: '2026-2027',
      }],
    });
    render(<TeachingLoadTab />);

    expect(screen.getByLabelText(/Ramon Delgado/).disabled).toBe(true);
    expect(screen.getByLabelText(/Ana Cruz/).disabled).toBe(false);
  });

  it('disables a subject already taken at this grade', () => {
    h.ctx = baseCtx({
      teachingLoad: [{
        id: 'l1', teacher_id: RAMON.id, subject_id: MATH.id,
        grade_level: 'Grade 7', school_year: '2026-2027',
      }],
    });
    render(<TeachingLoadTab />);

    const taken = screen.getByRole('option', { name: /Mathematics — Ramon Delgado/ });
    expect(taken.disabled).toBe(true);
  });

  // Grade 7's load must not follow you to Grade 8.
  it('scopes the picker and the saved list to the grade tab', () => {
    h.ctx = baseCtx({
      teachingLoad: [{
        id: 'l1', teacher_id: RAMON.id, subject_id: MATH.id,
        grade_level: 'Grade 7', school_year: '2026-2027',
      }],
    });
    render(<TeachingLoadTab />);
    expect(screen.getByLabelText(/Ramon Delgado/).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /^Grade 8/ }));

    expect(screen.getByLabelText(/Ramon Delgado/).disabled).toBe(false);
    expect(screen.getByText('Nothing assigned for Grade 8 yet.')).toBeTruthy();
  });

  it('searches teachers by department, not just by name', () => {
    render(<TeachingLoadTab />);
    fireEvent.change(screen.getByPlaceholderText(/search by name/i), {
      target: { value: 'mathemat' },
    });

    expect(screen.getByLabelText(/Ramon Delgado/)).toBeTruthy();
    expect(screen.queryByLabelText(/Ana Cruz/)).toBeNull();
  });

  // A failed read must never render as an empty school.
  it('offers a retry when the load could not be read', () => {
    h.ctx = baseCtx({ teachingLoadError: true });
    render(<TeachingLoadTab />);

    expect(screen.getByText(/could not load/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });
});
