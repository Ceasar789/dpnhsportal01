// @vitest-environment jsdom
// Clarity F1: the Student brand subtitle shows the real grade from the
// already-loaded enrolment ("Student · Grade 8"), and keeps "Student
// Dashboard" when there is no usable grade.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null }));
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ userData: { uid: 's1', name: 'Sample Student', profile: {} }, logout: vi.fn() }),
}));
vi.mock('../../../context/ProfileUnsavedChangesContext', () => ({
  useProfileUnsavedChanges: () => ({ requestProfileNavigation: (go) => { go(); return true; } }),
}));
vi.mock('../../../pages/dashboards/student/hooks', () => ({ useTheme: () => ({ dark: false, toggleDark: vi.fn() }) }));
vi.mock('../../../lib/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('../../../hooks/useSignedPhotoUrl', () => ({ useSignedPhotoUrl: () => '' }));
vi.mock('../../NotificationBell', () => ({ default: () => <button type="button">Notifications</button> }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({ useStudentData: () => ({ graph: state.graph }) }));

import ClarityStudentLayout from './ClarityStudentLayout';

const graphWith = (enrolments, extra = {}) => ({ fatalError: null, enrolments, ...extra });
const subtitle = () => document.querySelector('.x-brand span').textContent;
const show = () => render(<MemoryRouter><ClarityStudentLayout onClassicView={() => {}}><p>content</p></ClarityStudentLayout></MemoryRouter>);

afterEach(() => { cleanup(); state.graph = null; });

describe('Clarity Student brand subtitle', () => {
  it.each([
    ['Grade 8', 'Student · Grade 8'],
    ['8', 'Student · Grade 8'],
    ['grade 10', 'Student · Grade 10'],
  ])('a real grade_level of "%s" shows "%s"', (gradeLevel, expected) => {
    state.graph = graphWith([{ section_id: 's', sections: { name: 'Mabini', grade_level: gradeLevel, school_year: '2026-2027' } }]);
    show();
    expect(subtitle()).toBe(expected);
  });

  it.each([
    ['no graph yet', null],
    ['no enrolment', graphWith([])],
    ['no grade_level', graphWith([{ section_id: 's', sections: { name: 'Mabini', grade_level: null } }])],
    ['no section row', graphWith([{ section_id: 's', sections: null }])],
    ['a grade outside the school list', graphWith([{ section_id: 's', sections: { name: 'X', grade_level: 'Grade 13' } }])],
    ['a value with no number', graphWith([{ section_id: 's', sections: { name: 'X', grade_level: 'Senior' } }])],
    ['a failed load', graphWith([{ section_id: 's', sections: { name: 'X', grade_level: 'Grade 8' } }], { fatalError: new Error('x') })],
  ])('%s: keeps "Student Dashboard"', (_, graph) => {
    state.graph = graph;
    show();
    expect(subtitle()).toBe('Student Dashboard');
    expect(document.body.innerHTML).not.toMatch(/undefined|null|NaN/);
  });
});
