// ============================================
// FILE: src/pages/dashboards/renderSmoke.test.jsx
// A render smoke test: render each dashboard tab once, in its initial
// (loading) state, and assert only that it does not throw.
//
// Why this exists: during Task 9, OverviewTab.jsx used `Loader2` without
// importing it. `loading` starts `true`, so the FIRST render threw
// `ReferenceError: Loader2 is not defined` for every student, every visit —
// a blank dashboard. `npm run build` passed and all existing tests passed,
// because Vite/Rollup do not resolve free identifiers; the undeclared
// global went into the bundle untouched and only failed in a browser. This
// test exists to catch exactly that class of bug — a broken first render
// caused by a missing import or a default-vs-named import mistake — at
// render time, in CI, without a browser.
//
// vitest.config.js runs in a node environment, and src/config/supabase.js
// touches sessionStorage at module scope, so any bare import of a component
// that reaches supabase throws at import time under node. Both
// config/supabase.js and context/AuthContext.jsx are mocked below, before
// anything else is imported, so components never touch the real modules.
//
// renderToString is enough: it exercises the exact "first render, initial
// state" path the Loader2 bug lived on. It does not run effects, so it
// intentionally does not exercise data fetching — the point is catching a
// broken render, not verifying behaviour.
// ============================================

import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';

// ---- Mock config/supabase.js -------------------------------------------
// A permissive stand-in: every chained call (.from().select().eq()...)
// returns itself, and it's also thenable so `await supabase.from(...)...`
// resolves to { data: [], error: null }. Nothing in a first render should
// call this synchronously (data fetching happens in effects, which
// renderToString never runs), but it's built defensively in case some
// module-scope or render-time code path reaches it anyway.
function makeSupabaseStub() {
  const resolved = Promise.resolve({ data: [], error: null });
  const handler = {
    get(_target, prop) {
      if (prop === 'then') return resolved.then.bind(resolved);
      if (prop === 'catch') return resolved.catch.bind(resolved);
      return stub;
    },
    apply() {
      return stub;
    },
  };
  const stub = new Proxy(function stub() {}, handler);
  return stub;
}

vi.mock('../../config/supabase', () => ({
  supabase: makeSupabaseStub(),
  assetUrl: (filename) => `/school-assets/${filename}`,
  default: makeSupabaseStub(),
}));

// ---- Mock context/AuthContext.jsx --------------------------------------
// Tabs call useAuth() directly; mocking the module means we never need a
// real <AuthProvider>, and never touch supabase.channel/session logic.
const mockUserData = {
  uid: 'test-student-uid',
  id: 'test-student-uid',
  email: 'student@example.test',
  name: 'Test Student',
  role: 'student',
  status: 'active',
  profile: null,
  isMainAdmin: false,
  isTeacher: false,
  isFaculty: false,
  isRegistrar: false,
  isStudent: true,
};

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: mockUserData.uid },
    userData: mockUserData,
    loading: false,
    isAuthenticated: true,
    error: null,
    isStudent: () => true,
    isTeacher: () => false,
    isFaculty: () => false,
    isRegistrar: () => false,
    isMainAdmin: () => false,
    logout: vi.fn(),
    updateProfile: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

// ---- Import components AFTER the mocks above ---------------------------
const OverviewTab = (await import('./student/tabs/OverviewTab')).default;
const StudentTasksTab = (await import('./student/tabs/TasksTab')).default;
const AttendanceTab = (await import('./student/tabs/AttendanceTab')).default;
const AnnouncementsTab = (await import('./student/tabs/AnnouncementsTab')).default;
const ProfileTab = (await import('../profile/ProfileTab')).default;
const SubjectCards = (await import('./student/SubjectCards')).default;
const { StudentDataProvider } = await import('./student/StudentDataContext');

const { AdminProvider } = await import('./admin/AdminContext');
const AdminTeachingLoadTab = (await import('./admin/tabs/TeachingLoadTab')).default;

const TeacherOverviewTab = (await import('./teacher/tabs/OverviewTab')).default;
const TeacherAnnouncementsTab = (await import('./teacher/tabs/AnnouncementsTab')).default;
const TeacherAttendanceTab = (await import('./teacher/tabs/AttendanceTab')).default;
const TeacherStudentsTab = (await import('./teacher/tabs/StudentsTab')).default;
const TeacherGradesTab = (await import('./teacher/tabs/GradesTab')).default;
const TeacherLessonPlansTab = (await import('./teacher/tabs/LessonPlansTab')).default;
const TeacherWorksheetsTab = (await import('./teacher/tabs/WorksheetsTab')).default;

const withRouter = (children) => <MemoryRouter>{children}</MemoryRouter>;

// The student's Overview and Tasks tabs read every row from the shared
// graph, so they only render inside the provider — exactly as the dashboard
// shell mounts them. The real provider is used, not a stub: renderToString
// never runs effects, so nothing is fetched, but a consumer that drifts
// from what the provider actually hands back still fails here.
const withStudentData = (children) => withRouter(<StudentDataProvider>{children}</StudentDataProvider>);

// Admin tabs read everything through useAdminContext(), so they only render
// inside the real provider — the same way AdminDashboard mounts them.
// renderToString runs no effects, so no data is fetched; what this catches is
// a tab consuming something the provider does not actually hand back, which
// is a rename away at any time and shows up as a blank dashboard.
const withAdmin = (children) => withRouter(
  <AdminProvider userData={mockUserData}>{children}</AdminProvider>
);

describe('dashboard tab render smoke test', () => {
  it('renders OverviewTab without throwing', () => {
    expect(() => renderToString(withStudentData(<OverviewTab />))).not.toThrow();
  });

  it('renders the student TasksTab without throwing', () => {
    expect(() => renderToString(withStudentData(<StudentTasksTab />))).not.toThrow();
  });

  it('renders AttendanceTab without throwing', () => {
    expect(() => renderToString(withRouter(<AttendanceTab />))).not.toThrow();
  });

  it('renders AnnouncementsTab without throwing', () => {
    expect(() => renderToString(withRouter(<AnnouncementsTab />))).not.toThrow();
  });

  it('renders ProfileTab without throwing', () => {
    expect(() => renderToString(withRouter(<ProfileTab />))).not.toThrow();
  });

  it('renders SubjectCards (loading state) without throwing', () => {
    expect(() => renderToString(
      <SubjectCards
        subjects={[]}
        tasksBySubject={{}}
        loading={true}
        loadError={false}
        onRetry={() => {}}
        onOpen={() => {}}
      />
    )).not.toThrow();
  });

  it('renders SubjectCards (loaded, empty) without throwing', () => {
    expect(() => renderToString(
      <SubjectCards
        subjects={[]}
        tasksBySubject={{}}
        loading={false}
        loadError={false}
        onRetry={() => {}}
        onOpen={() => {}}
      />
    )).not.toThrow();
  });

  // ---- Teacher tabs -----------------------------------------------------
  // Same shape as the student tabs (useAuth + supabase at module scope, a
  // loading-initial-state fetch-on-mount effect), so the same mocks cover
  // them without extra scaffolding.
  it('renders the teacher OverviewTab without throwing', () => {
    expect(() => renderToString(withRouter(<TeacherOverviewTab />))).not.toThrow();
  });

  it('renders the teacher AnnouncementsTab without throwing', () => {
    expect(() => renderToString(withRouter(<TeacherAnnouncementsTab />))).not.toThrow();
  });

  it('renders the teacher AttendanceTab without throwing', () => {
    expect(() => renderToString(withRouter(<TeacherAttendanceTab />))).not.toThrow();
  });

  it('renders the teacher StudentsTab without throwing', () => {
    expect(() => renderToString(withRouter(<TeacherStudentsTab />))).not.toThrow();
  });

  it('renders the teacher GradesTab without throwing', () => {
    expect(() => renderToString(withRouter(<TeacherGradesTab />))).not.toThrow();
  });

  it('renders the teacher LessonPlansTab without throwing', () => {
    expect(() => renderToString(withRouter(<TeacherLessonPlansTab />))).not.toThrow();
  });

  it('renders the teacher WorksheetsTab without throwing', () => {
    expect(() => renderToString(withRouter(<TeacherWorksheetsTab />))).not.toThrow();
  });
  it('renders the admin TeachingLoadTab without throwing', () => {
    expect(() => renderToString(withAdmin(<AdminTeachingLoadTab />))).not.toThrow();
  });
});
