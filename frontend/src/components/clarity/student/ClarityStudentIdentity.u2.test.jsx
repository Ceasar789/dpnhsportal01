// @vitest-environment jsdom
// U-S2: grade, section, school year and the LRN are shown clearly (design p8),
// only from real data: no LRN means no LRN chip or line, never a placeholder.
// U-S6: the sidebar card is the profile entry; no "Profile & password" item.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null }));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ userData: { uid: 's1', name: 'Juan Dela Cruz', role: 'student', profile: {} }, logout: vi.fn() }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; } }),
}));
vi.mock('../../../pages/dashboards/student/hooks', () => ({ useTheme: () => ({ dark: false, toggleDark: vi.fn() }) }));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../NotificationBell', () => ({ default: () => <span /> }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({
  useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }),
}));

import ClarityStudentLayout from './ClarityStudentLayout';
import ClarityStudentOverviewTab from './ClarityStudentOverviewTab';

const graphOf = (studentRecord, extra = {}) => ({
  fatalError: null, scheduleError: null, studentRecord, attendance: [], releasedScores: [], subjects: [],
  subjectsById: new Map(), submissionStates: [], assignees: [], sheetById: new Map(),
  enrolments: [{ section_id: 's', sections: { name: 'Rizal', grade_level: 'Grade 8', school_year: '2026-2027' } }],
  ...extra,
});
const showLayout = () => render(
  <MemoryRouter initialEntries={['/student-dashboard']}>
    <Routes><Route path="/student-dashboard/*" element={<ClarityStudentLayout><p>content</p></ClarityStudentLayout>} /></Routes>
  </MemoryRouter>,
);
const showOverview = () => render(<MemoryRouter><ClarityStudentOverviewTab /></MemoryRouter>);
const foot = () => document.querySelector('.x-side-foot');

beforeEach(() => { state.graph = graphOf({ lrn: '136482100123', student_number: 'S-9' }); });
afterEach(() => cleanup());

describe('U-S2 Overview identity line', () => {
  it('grade, section and school year as one line, and the LRN as its own chip', () => {
    showOverview();
    expect(screen.getByText('Grade 8 · Rizal · School Year 2026-2027').tagName).toBe('B');
    expect(screen.getByText('LRN 136482100123').className).toContain('x-badge');
    expect(document.body.textContent).not.toContain('ID:');
  });
  it('no LRN: no chip, and the student number is not shown as if it were one', () => {
    state.graph = graphOf({ lrn: '  ', student_number: 'S-9' });
    showOverview();
    expect(screen.getByText('Grade 8 · Rizal · School Year 2026-2027')).toBeTruthy();
    expect(screen.queryByText(/LRN/)).toBeNull();
    expect(document.body.textContent).not.toContain('S-9');
  });
  it('a failed load shows no identity line and no LRN', () => {
    state.graph = graphOf({ lrn: '136482100123' }, { fatalError: new Error('x') });
    showOverview();
    expect(screen.queryByText(/LRN/)).toBeNull();
    expect(screen.getByText('Could not load your enrolment')).toBeTruthy();
  });
});

describe('U-S2 / U-S6 sidebar card', () => {
  it('shows "Grade 8 · Rizal" and the LRN, and links to Profile Settings', () => {
    showLayout();
    const card = within(foot()).getByRole('link', { name: /\(Profile settings\)$/ });
    expect(within(card).getByText('Grade 8 · Rizal')).toBeTruthy();
    expect(within(card).getByText('LRN 136482100123')).toBeTruthy();
    expect(card.getAttribute('href')).toBe('/student-dashboard/profile');
    expect(card.className).toBe('x-user');
  });
  it('no LRN: no LRN line in the card', () => {
    state.graph = graphOf(null);
    showLayout();
    expect(within(foot()).queryByText(/LRN/)).toBeNull();
  });
  it('the sidebar has no "Profile & password" or "Profile Settings" item', () => {
    showLayout();
    const side = document.querySelector('#student-sidebar');
    expect(within(side).queryByText('Profile & password')).toBeNull();
    expect(within(side).queryByText('Profile Settings')).toBeNull();
    expect(within(side).queryByRole('button', { name: 'Toggle profile menu' })).toBeNull();
  });
});
