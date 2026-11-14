// @vitest-environment jsdom
// X2: a teacher with no teaching load (16 teachers after the Grade 11/12
// archive) sees a friendly sentence, no crash, no raw error and no blank
// screen in Grading, the Dashboard, Learning Materials and Lesson plans.
// Supabase is a fake that answers per table; nothing reaches a real project.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NO_TEACHING_LOAD_MESSAGE } from '../../../lib/academicRules';

const h = vi.hoisted(() => ({ data: {}, assessment: {} }));

vi.mock('../../../config/supabase', () => {
  const query = (table) => {
    const q = new Proxy({}, {
      get: (_, prop) => {
        if (prop === 'then') return (res, rej) => Promise.resolve(h.data[table] || { data: [], count: 0, error: null }).then(res, rej);
        return () => q;
      },
    });
    return q;
  };
  return { supabase: { from: query, storage: { from: () => ({}) } } };
});
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1', name: 'Sample Teacher' } }) }));
vi.mock('../../../pages/dashboards/teacher/hooks', () => ({ useTheme: () => ({ dark: false }), useToast: () => ({ toast: null, showToast: () => {} }) }));
vi.mock('../../../pages/dashboards/teacher/worksheets/useWorksheetAssessment', () => ({ useWorksheetAssessment: () => ({
  mySections: [], postings: [], loadSubmissions: async () => [], loadAssigneeRoster: async () => [], loadItems: () => {},
  loadAnswers: () => {}, saveMarks: () => {}, releaseScore: () => {}, encodeManualScore: () => {}, loadClassList: () => {},
  paperScoreEncodingAvailable: false, ...h.assessment,
}) }));

import ClarityTeacherGradingTab from './ClarityTeacherGradingTab';
import ClarityTeacherOverviewTab from './ClarityTeacherOverviewTab';
import MaterialFormModal from './materials/MaterialFormModal';
import QuickCreateForm from '../../../pages/dashboards/teacher/lessonPlans/QuickCreateForm';

const show = node => render(<MemoryRouter>{node}</MemoryRouter>);
const noRawError = () => expect(document.body.textContent).not.toMatch(/undefined|null|Error:|TypeError|failed to fetch/i);

beforeEach(() => {
  h.data = { school_settings: { data: { school_year: '2026-2027' }, error: null } };
  h.assessment = { mySubjects: [], subjectLoading: false, subjectError: false };
});
afterEach(cleanup);

describe('Grading', () => {
  it('no worksheets and no load: the friendly sentence instead of "create one"', async () => {
    show(<ClarityTeacherGradingTab />);
    expect(await screen.findByText(NO_TEACHING_LOAD_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(/Create one in Worksheets/)).toBeNull();
    noRawError();
  });

  it('a teacher with a load still sees the old "create one" text', async () => {
    h.assessment = { mySubjects: [{ id: 'eng', name: 'English', grades: ['Grade 7'] }], subjectLoading: false, subjectError: false };
    show(<ClarityTeacherGradingTab />);
    expect(await screen.findByText('No worksheets yet. Create one in Worksheets before recording scores.')).toBeTruthy();
    expect(screen.queryByText(NO_TEACHING_LOAD_MESSAGE)).toBeNull();
  });

  it('while the load is still loading, nothing claims there is no load', async () => {
    h.assessment = { mySubjects: [], subjectLoading: true, subjectError: false };
    show(<ClarityTeacherGradingTab />);
    expect(await screen.findByText(/No worksheets yet/)).toBeTruthy();
    expect(screen.queryByText(NO_TEACHING_LOAD_MESSAGE)).toBeNull();
  });
});

describe('Dashboard', () => {
  it('no class scheduled all week: the friendly sentence, and the dashboard still renders', async () => {
    show(<ClarityTeacherOverviewTab />);
    expect(await screen.findByText(NO_TEACHING_LOAD_MESSAGE)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Teaching metrics' })).toBeTruthy();
    expect(screen.getByText('No classes scheduled today.')).toBeTruthy();
    noRawError();
  });

  it('a teacher with classes does not see it', async () => {
    h.data.schedules = { data: [{ id: 'c1', day_of_week: 'Monday', start_time: '07:30:00', end_time: '08:30:00', subject: 'English',
      room_number: 'R1', sections: { name: 'Rizal', grade_level: 'Grade 7' } }], error: null };
    show(<ClarityTeacherOverviewTab />);
    await screen.findByRole('region', { name: 'Teaching metrics' });
    expect(screen.queryByText(NO_TEACHING_LOAD_MESSAGE)).toBeNull();
  });
});

describe('Learning Materials', () => {
  it('the add form explains why no subject can be chosen', () => {
    render(<MaterialFormModal mode="create" teacherId="teacher-1" subjects={[]} subjectsState="ready"
      onRetrySubjects={() => {}} onSaved={() => {}} onDeleted={() => {}} onClose={() => {}} />);
    expect(screen.getByText(NO_TEACHING_LOAD_MESSAGE)).toBeTruthy();
    noRawError();
  });
});

describe('Lesson plans', () => {
  it('only an old Grade 11 load row: treated as no load, with the friendly text', () => {
    render(<QuickCreateForm teacherId="teacher-1" schoolYear="2026-2027" sourceTeacherId="teacher-1" sourceSchoolYear="2026-2027"
      loadState="ready" onRetry={() => {}} onMockCreate={async () => {}}
      assignmentRows={[{ subject_id: 'eng', grade_level: 'Grade 11', subjects: { id: 'eng', name: 'English' } }]} />);
    expect(screen.getByText(/No assigned subject for this school year\. Ask your administrator/)).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Grade 11' })).toBeNull();
    noRawError();
  });
});
