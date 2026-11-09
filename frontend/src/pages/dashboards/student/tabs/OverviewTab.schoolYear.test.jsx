// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../StudentDataContext', () => ({ useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }) }));

import OverviewTab from './OverviewTab';

const setGraph = (enrolments) => {
  state.graph = { fatalError: null, scheduleError: null, enrolments, studentRecord: null, attendance: [], releasedScores: [],
    subjects: [], cardSubjectIds: new Set(), subjectsById: new Map(), submissionStates: [], assignees: [], sheetById: new Map() };
};
const show = () => render(<MemoryRouter><OverviewTab /></MemoryRouter>);

afterEach(() => cleanup());

describe('Overview school year', () => {
  it("shows the newest school year from the student's own sections", () => {
    setGraph([
      { section_id: 'a', sections: { name: 'Rizal', grade_level: '7', school_year: '2025-2026' } },
      { section_id: 'b', sections: { name: 'Mabini', grade_level: '8', school_year: '2026-2027' } },
    ]);
    show();
    expect(screen.getByText('School Year')).toBeTruthy();
    expect(screen.getByText('2026-2027')).toBeTruthy();
    expect(screen.queryByText('2025–2026')).toBeNull();
  });

  it('hides the pill when no year is known', () => {
    setGraph([{ section_id: 'a', sections: { name: 'Rizal', grade_level: '7', school_year: null } }]);
    show();
    expect(screen.queryByText('School Year')).toBeNull();
  });

  it('has a plain h1 and a 44px Refresh button', () => {
    setGraph([]);
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh overview' }).className).toContain('w-11 h-11');
  });
});
