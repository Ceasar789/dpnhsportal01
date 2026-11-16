// @vitest-environment jsdom
// U4: the Teaching Load "Add Subject" error is linked to its select
// (aria-invalid, aria-describedby with an id), as in the Clarity tab. The
// lines changed sit outside the A6 copy ranges (ClarityAdminA6Sources.test.js).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ctx: {} }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));
const TeachingLoadTab = (await import('./TeachingLoadTab')).default;

const ANA = { id: 't-ana', name: 'Ana Cruz', email: 'ana@example.com', department: '', status: 'active' };
const MATH = { id: 'sub-math', name: 'Mathematics', code: 'MATH' };

beforeEach(() => {
  h.ctx = {
    schoolYear: '2026-2027', setSchoolYear: vi.fn(), teachers: [ANA], teachersError: false, teachersLoading: false,
    subjects: [MATH], subjectsError: false, fetchSubjects: vi.fn(), teachingLoad: [], teachingLoadLoading: false,
    teachingLoadError: false, fetchTeachingLoad: vi.fn(), fetchTeachers: vi.fn(), addLoadEntries: vi.fn(),
    removeLoad: vi.fn(), copyLoadFromYear: vi.fn(), showToast: vi.fn(),
  };
});
afterEach(cleanup);

describe('Teaching Load add-subject error', () => {
  it('Add Subject with nothing chosen marks the select and points it at the message', () => {
    render(<TeachingLoadTab />);
    fireEvent.click(screen.getByRole('button', { name: /Ana Cruz/i }));
    const select = screen.getByLabelText('Add Subject');
    expect(select.getAttribute('aria-invalid')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add Subject' }));
    const error = document.getElementById('teaching-subject-error');
    expect(error.textContent).toBe('Choose a subject to add for Grade 7.');
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.getAttribute('aria-describedby')).toBe('teaching-subject-error');
    expect(h.ctx.showToast).not.toHaveBeenCalled();
  });
});
