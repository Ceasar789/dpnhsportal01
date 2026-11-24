// @vitest-environment jsdom
// 4m: a hidden attendance table shows "Unavailable" on its tile only; the rest of the Overview stays.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({
  useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }),
}));

import ClarityStudentOverviewTab from './ClarityStudentOverviewTab';

const graph = extra => ({
  fatalError: null, scheduleError: null, studentRecordError: null, attendanceError: null,
  enrolments: [{ sections: { grade_level: 'Grade 8', name: 'Mabini', school_year: '2026-2027' } }],
  studentRecord: null, attendance: [], releasedScores: [], subjects: [], subjectsById: new Map(),
  submissionStates: [], assignees: [], sheetById: new Map(), ...extra,
});
const tile = () => screen.getByText('Attendance').closest('.x-kpi').textContent;
afterEach(cleanup);

describe('Overview attendance tile (4m)', () => {
  it('unreadable attendance reads Unavailable, never "No data yet"', () => {
    state.graph = graph({ attendanceError: { message: 'permission denied' } });
    render(<MemoryRouter><ClarityStudentOverviewTab /></MemoryRouter>);
    expect(tile()).toContain('Unavailable');
    expect(tile()).toContain('Could not load attendance right now.');
    expect(screen.queryByText(/could not load your overview/i)).toBeNull();
  });
  it('no records at all still reads No data yet', () => {
    state.graph = graph();
    render(<MemoryRouter><ClarityStudentOverviewTab /></MemoryRouter>);
    expect(tile()).toContain('No data yet');
  });
});
