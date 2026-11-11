import { expect } from '@playwright/test';

export const PROFILE_E2E_ORIGIN = 'https://profile-e2e.supabase.invalid';
export const PROFILE_E2E_BASE_URL = 'http://127.0.0.1:4174';

const SESSION_TAB_ID = 'profile-e2e-tab';
const SESSION_KEY = `smartedu-auth-${SESSION_TAB_ID}`;
const NOW_ISO = '2026-10-09T08:00:00.000Z';
const QA_WORKSHEET_ID = 'worksheet-qa-1';
const QA_SECTION_ID = 'section-qa-1';
const QA_STUDENT_ID = 'student-qa-1';

const worksheetRows = (profile, withSubmission, withFile, extraStudent = false, fileUrl) => ({
  worksheets: [{ id: QA_WORKSHEET_ID, teacher_id: profile.id, title: 'Synthetic worksheet',
    subject: 'Mathematics', subject_id: 'subject-qa-1', grade_level: 'Grade 7', task_type: 'worksheet',
    checking_mode: 'manual', items: 1, created_at: NOW_ISO,
    ...(withFile ? { file_url: fileUrl ?? 'https://profile-e2e.supabase.invalid/storage/v1/object/public/worksheets/synthetic.pdf', file_name: 'synthetic.pdf' } : {}) }],
  schedules: [{ section_id: QA_SECTION_ID }],
  sections: [{ id: QA_SECTION_ID, name: 'Synthetic Section', grade_level: '7' }],
  teacher_subjects: [{ subject_id: 'subject-qa-1', grade_level: 'Grade 7', subjects: { id: 'subject-qa-1', name: 'Mathematics' } }],
  worksheet_sections: [{ id: 'posting-qa-1', worksheet_id: QA_WORKSHEET_ID,
    section_id: QA_SECTION_ID, due_at: '2026-10-20T08:00:00.000Z' }],
  task_assignees: [],
  notifications: [],
  worksheet_items: [{ id: 'item-qa-1', worksheet_id: QA_WORKSHEET_ID, position: 1,
    question: 'What is two plus two?', item_type: 'multiple_choice',
    options: ['3', '4', '5', '6'], points: 1 }],
  worksheet_item_keys: [{ item_id: 'item-qa-1', correct_answer: '4' }],
  worksheet_submissions: withSubmission ? [{ id: 'submission-qa-1', student_id: QA_STUDENT_ID,
    section_id: QA_SECTION_ID, status: 'submitted', released: false,
    score: null, total_points: 1, source: 'online' }] : [],
  worksheet_answers: withSubmission ? [{ id: 'answer-qa-1', submission_id: 'submission-qa-1',
    item_id: 'item-qa-1', answer: '4', points_earned: null, is_correct: null }] : [],
  section_students: [
    { student_id: QA_STUDENT_ID },
    ...(extraStudent ? [{ student_id: 'student-qa-2' }] : []),
  ],
});

const teacherOverviewRows = (profile, empty, longTitle) => {
  if (empty) return { lesson_plans: [], schedules: [] };
  const today = 'Monday'; // Browser cases pin the clock to Monday, 12 October 2026.
  return {
    lesson_plans: [
      { id: 'plan-qa-1', teacher_id: profile.id,
        title: longTitle || 'Synthetic science lesson',
        subject: 'Science', grade_level: 'Grade 7', status: 'published', ai_generated: true,
        objectives: '<p>Original science objectives</p>',
        created_at: NOW_ISO, updated_at: NOW_ISO },
      { id: 'plan-qa-2', teacher_id: profile.id, title: 'Synthetic mathematics lesson',
        subject: 'Mathematics', grade_level: 'Grade 8', status: 'draft', ai_generated: false,
        created_at: NOW_ISO, updated_at: NOW_ISO },
    ],
    schedules: [{ id: 'schedule-qa-1', teacher_id: profile.id, subject: 'Science',
      day_of_week: today, start_time: '00:00:00', end_time: '23:59:00', room_number: 'Room 2',
      sections: { name: 'Orchid', grade_level: 'Grade 7' } }],
  };
};

const ROLE_PATHS = {
  main_admin: '/admin-dashboard',
  teacher: '/teacher-dashboard/profile',
  student: '/student-dashboard/profile',
};

const svgPhotoMarkup = `
  <svg xmlns="http://www.w3.org/2000/svg" width="112" height="112">
    <rect width="112" height="112" fill="#1908df"/>
    <circle cx="56" cy="43" r="22" fill="#ffffff"/>
    <path d="M20 106c3-25 19-37 36-37s33 12 36 37" fill="#ffffff"/>
  </svg>
`;

export const MOCK_SIGNED_PHOTO = `${PROFILE_E2E_ORIGIN}/storage/v1/object/sign/profile-photos/synthetic?token=profile-e2e`;

const encodeJwtPart = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const syntheticToken = (user) => [
  encodeJwtPart({ alg: 'none', typ: 'JWT' }),
  encodeJwtPart({
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    role: 'authenticated',
    sub: user.id,
    email: user.email,
  }),
  'profile-e2e-signature',
].join('.');

export const syntheticProfile = (role = 'teacher', overrides = {}) => {
  const slug = role.replace('_', '-');
  const id = `00000000-0000-4000-8000-${String(Object.keys(ROLE_PATHS).indexOf(role) + 1).padStart(12, '0')}`;
  return {
    id,
    role,
    name: `Synthetic ${role === 'main_admin' ? 'Administrator' : role[0].toUpperCase() + role.slice(1)}`,
    email: `${slug}.profile@example.test`,
    phone: '09170000000',
    date_of_birth: '1990-01-15',
    address: '123 Test Harness Street',
    bio: 'Synthetic Profile data used only by isolated browser tests.',
    photo_url: `${id}/1700000000000-profile.png`,
    photo_change_count: 1,
    photo_change_window_start: '2026-10-06T08:00:00.000Z',
    status: 'active',
    department: role === 'student' ? null : 'Test Department',
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
    ...overrides,
  };
};

const syntheticSession = (profile) => {
  const user = {
    id: profile.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: profile.email,
    email_confirmed_at: NOW_ISO,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: profile.name },
    identities: [],
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
  };
  return {
    access_token: syntheticToken(user),
    refresh_token: 'synthetic-profile-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };
};

const json = (route, data, status = 200, headers = {}) => route.fulfill({
  status,
  contentType: 'application/json',
  headers,
  body: JSON.stringify(data),
});

const isObjectResponse = (request) => (
  request.headers().accept || ''
).includes('application/vnd.pgrst.object+json');

export const assertLocalProfileBaseURL = (value) => {
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:') {
    throw new Error(`Profile browser QA refuses non-local base URL: ${url.origin}`);
  }
  return true;
};

export async function installProfileMocks(page, options = {}) {
  assertLocalProfileBaseURL(PROFILE_E2E_BASE_URL);
  const profile = syntheticProfile(options.role || 'teacher', options.profile);
  const state = {
    profile,
    profileReads: 0,
    profileWrites: 0,
    storageSigns: 0,
    storageUploads: 0,
    storageDeletes: 0,
    teacherStorageUploads: 0,
    releaseTeacherUpload: null,
    teacherAiCalls: 0,
    teacherWeeklyCalls: 0,
    teacherWeeklyPayloads: [],
    releaseTeacherWeekly: null,
    authLogouts: 0,
    backendWrites: 0,
    blockedRequests: [],
    missingMocks: [],
    remoteRequests: [],
    websocketRequests: [],
    profileWriteMode: options.profileWriteMode || 'success',
    uploadMode: options.uploadMode || 'success',
    deleteMode: options.deleteMode || 'success',
    profileReadMode: options.profileReadMode || 'success',
    releaseProfileRead: null,
    releaseSlowWrite: null,
    worksheetWrites: [],
    worksheetAnswerReadMode: options.worksheetAnswerReadMode || 'success',
    worksheetSubmissionReadMode: options.worksheetSubmissionReadMode || 'success',
    worksheetClassReadMode: options.worksheetClassReadMode || 'success',
    releaseWorksheetWrite: null,
    worksheetSlowUsed: false,
    overviewReadMode: options.overviewReadMode || 'success',
    releaseOverviewRead: null,
    lessonPlanReadMode: options.lessonPlanReadMode || 'success',
    releaseLessonPlanRead: null,
    lessonPlanWriteMode: options.lessonPlanWriteMode || 'success',
    releaseLessonPlanWrite: null,
    lessonPlanRows: teacherOverviewRows(profile, options.lessonPlanEmpty, options.lessonPlanLongTitle).lesson_plans,
    overviewPlanRows: options.overviewPlanRows ?? teacherOverviewRows(profile, options.overviewEmpty, options.overviewLongTitle).lesson_plans,
    lessonPlanReads: 0,
    lessonPlanWrites: [],
    lessonPlanWriteRequests: [],
    officialSchoolYear: options.officialSchoolYear === undefined ? '2026-2027' : options.officialSchoolYear,
    teacherAssignmentReads: [],
    teacherAssignmentReadMode: options.teacherAssignmentReadMode || 'success',
    teacherAssignmentRows: options.teacherAssignmentRows ?? [
      { subject_id: 'subject-qa-math', grade_level: 'Grade 7', subjects: { id: 'subject-qa-math', name: 'Mathematics' } },
      { subject_id: 'subject-qa-math', grade_level: 'Grade 8', subjects: { id: 'subject-qa-math', name: 'Mathematics' } },
      { subject_id: 'subject-qa-english', grade_level: 'Grade 7', subjects: { id: 'subject-qa-english', name: 'English' } },
    ],
    releaseTeacherAssignmentRead: null,
    announcementReadMode: options.announcementReadMode || 'success',
    announcementReads: 0,
    releaseAnnouncementRead: null,
    studentRosterReadMode: options.studentRosterReadMode || 'success',
    studentRosterReads: [],
    attendanceReadMode: options.attendanceReadMode || 'success',
    attendanceWriteMode: options.attendanceWriteMode || 'success',
    attendanceRows: options.attendanceRows ?? (options.attendanceExisting ? [{ student_id: 'student-qa-1', section_id: QA_SECTION_ID,
      date: new Date().toISOString().slice(0, 10), status: 'Present' }] : []),
    attendanceWrites: [],
    releaseAttendanceWrite: null,
  };

  await page.addInitScript(({ tabId, key, session, theme }) => {
    sessionStorage.setItem('smartedu-auth-tab-id', tabId);
    sessionStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem('smartedu-theme', theme);
  }, {
    tabId: SESSION_TAB_ID,
    key: SESSION_KEY,
    session: syntheticSession(profile),
    theme: options.theme || 'light',
  });

  await page.routeWebSocket('wss://profile-e2e.supabase.invalid/**', (socket) => {
    state.websocketRequests.push(socket.url());
    socket.close();
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (options.teacherWeeklyScenario && ['127.0.0.1', 'localhost'].includes(url.hostname)
        && url.port === '3001' && url.pathname === '/api/ai/weekly-worksheets' && method === 'POST') {
      state.teacherWeeklyCalls += 1;
      const body = request.postDataJSON();
      state.teacherWeeklyPayloads.push(body);
      if (options.teacherWeeklyHold) await new Promise(resolve => { state.releaseTeacherWeekly = resolve; });
      if (options.teacherWeeklyFailure) {
        await json(route, options.teacherWeeklyFailure.body, options.teacherWeeklyFailure.status);
        return;
      }
      const worksheets = body.days.map(({ day }, index) => ({ status: 'generated-draft', saved: false,
        day, title: `${day} ${options.teacherWeeklyFilipino ? 'Pandiwa' : 'Grammar'} Practice`, instructions: `Answer the ${day} questions.`,
        sourceLessonPlan: { id: body.lessonPlanId, title: 'Synthetic weekly English plan' },
        sections: [{ id: 'questions', title: 'Questions', directions: `Review ${day} learning.` }],
        questions: Array.from({ length: body.questionCount }, (_, questionIndex) => {
          const type = ['multiple_choice', 'true_false', 'enumeration', 'essay'][questionIndex % 4];
          return { localId: `question-${questionIndex + 1}`, sectionId: 'questions',
            question: `${day} question ${questionIndex + 1}: ${body.days[index].objective}`,
            item_type: type, options: type === 'multiple_choice' ? ['Pandiwa', 'Pangngalan', 'Pang-uri'] : [],
            points: type === 'essay' ? 4 : 1,
            ...(type === 'essay' ? { essay: { referenceAnswer: `Private ${day} reference answer.`,
              minWords: 20, maxWords: 100, rubric: [{ criterion: 'Accurate explanation', points: 4 }] } } : {}) };
        }),
        answerKey: Array.from({ length: body.questionCount }, (_, questionIndex) => questionIndex % 4 === 3 ? null
          : { localId: `question-${questionIndex + 1}`,
            correct_answer: questionIndex % 4 === 0 ? 'Pandiwa' : questionIndex % 4 === 1 ? 'True' : `${day} learning, ${day} practice` }).filter(Boolean),
      }));
      await json(route, { status: 'generated-weekly-drafts', saved: false, questionCount: body.questionCount,
        sourceLessonPlanId: body.lessonPlanId, worksheets });
      return;
    }

    if (options.teacherAiScenario && ['127.0.0.1', 'localhost'].includes(url.hostname)
        && url.port === '3001' && url.pathname === '/api/ai/lesson-plan' && method === 'POST') {
      state.teacherAiCalls += 1;
      if (options.teacherAiScenario === 'failure') {
        await json(route, { error: 'Synthetic AI generation failure' }, 503);
      } else {
        await json(route, { html: options.teacherAiHtml ?? '<div class="ilaw-lesson-plan"><p>Synthetic generated plan</p></div>', truncated: false });
      }
      return;
    }

    if (url.origin === PROFILE_E2E_BASE_URL) {
      if (/^\/(?:api|auth|rest|storage|functions)(?:\/|$)/.test(url.pathname)) {
        if (method !== 'GET' && method !== 'HEAD') state.backendWrites += 1;
        state.blockedRequests.push(`${method} ${url.pathname}`);
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
      return;
    }

    if (url.origin === 'https://fonts.googleapis.com') {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return;
    }

    if (url.origin === PROFILE_E2E_ORIGIN) {
      state.remoteRequests.push(`${method} ${url.pathname}`);

      if (options.teacherAnnouncementsScenario && url.pathname === '/rest/v1/news' && method === 'GET') {
        state.announcementReads += 1;
        if (state.announcementReadMode === 'slow') {
          await new Promise(resolve => { state.releaseAnnouncementRead = resolve; });
        }
        if (state.announcementReadMode === 'failure') {
          await json(route, { code: 'QA_FAILURE', message: 'Synthetic announcements read failure' }, 400);
        } else {
          await json(route, options.announcementRows ?? [{
            id: 'news-qa-1', title: 'Synthetic school assembly', content: 'Monday morning',
            status: 'Published', priority: 'High', target_roles: 'teacher',
            created_at: NOW_ISO, author_name: 'Synthetic Admin',
          }]);
        }
        return;
      }

      if (url.pathname.startsWith('/rest/v1/') && method === 'HEAD') {
        const count = options.teacherOverviewScenario && url.pathname === '/rest/v1/worksheets' && !options.overviewEmpty ? 1 : 0;
        await route.fulfill({ status: 200, headers: {
          'content-range': `*/${count}`, 'access-control-expose-headers': 'content-range',
        }, body: '' });
        return;
      }

      if (url.pathname === '/rest/v1/profiles') {
        if (method === 'GET') {
          if (options.teacherAttendanceScenario && url.searchParams.get('id')?.startsWith('in.')) {
            await json(route, options.attendanceEmpty ? [] : [
              { id: 'student-qa-1', name: 'Alexandria Verylongname-Santos' },
              { id: 'student-qa-2', name: 'Bianca Cruz' },
            ]);
            return;
          }
          if (options.teacherStudentsScenario && url.searchParams.get('id')?.startsWith('in.')) {
            await json(route, options.studentRosterEmpty ? [] : [
              { id: 'student-qa-1', name: 'Alexandria Verylongname-Santos', email: 'alexandria@example.test', status: 'active' },
              { id: 'student-qa-2', name: 'Bianca Cruz', email: 'bianca@example.test', status: 'suspended' },
              { id: 'student-qa-3', name: 'Carlo Reyes', email: 'carlo@example.test', status: null },
            ]);
            return;
          }
          if (options.worksheetScenario && url.searchParams.get('id')?.startsWith('in.')) {
            await json(route, [
              { id: QA_STUDENT_ID, name: 'Synthetic Student' },
              ...(options.worksheetExtraStudent ? [{ id: 'student-qa-2', name: 'Bianca Verylongname-Santos' }] : []),
            ]);
            return;
          }
          state.profileReads += 1;
          if (options.omitProfileMock) {
            state.missingMocks.push('profiles GET');
            await json(route, { message: 'Profile mock intentionally missing' }, 503);
            return;
          }
          if (state.profileReadMode === 'slow') {
            await new Promise((resolve) => { state.releaseProfileRead = resolve; });
          }
          if (state.profileReadMode === 'failure') {
            await json(route, { code: 'PROFILE_E2E_READ_FAILED', message: 'Synthetic Profile read failure' }, 503);
            return;
          }
          await json(route, isObjectResponse(request) ? state.profile : [state.profile], 200, { 'content-range': '0-0/1' });
          return;
        }
        if (method === 'PATCH') {
          state.profileWrites += 1;
          let updates = {};
          try { updates = request.postDataJSON(); } catch { /* malformed input is handled as an empty patch */ }
          if (state.profileWriteMode === 'slow') {
            await new Promise((resolve) => { state.releaseSlowWrite = resolve; });
          }
          if (state.profileWriteMode === 'failure') {
            await json(route, { message: 'Synthetic Profile update failure' }, 500);
            return;
          }
          if (state.profileWriteMode === 'expired') {
            await json(route, { message: 'JWT expired' }, 401);
            return;
          }
          if (state.profileWriteMode === 'photo-limit') {
            await json(route, { message: 'Photo change limit exceeded' }, 400);
            return;
          }
          state.profile = { ...state.profile, ...updates, updated_at: NOW_ISO };
          await json(route, state.profile);
          return;
        }
      }

      if (url.pathname === '/rest/v1/school_settings' && method === 'GET') {
        if (options.overviewYearFailure && url.searchParams.get('select') === 'school_year') {
          await json(route, { code: 'QA_FAILURE', message: 'Synthetic academic year read failure' }, 400);
          return;
        }
        await json(route, { id: 1, session_timeout: '30 minutes', school_year: state.officialSchoolYear });
        return;
      }

      if (options.teacherAttendanceScenario && url.pathname.startsWith('/rest/v1/')) {
        const table = url.pathname.slice('/rest/v1/'.length);
        if (method === 'GET' && ['sections', 'section_students', 'students', 'attendance'].includes(table)) {
          if (state.attendanceReadMode === 'failure' && table === 'sections') {
            await json(route, { code: 'QA_FAILURE', message: 'Synthetic attendance read failure' }, 400);
            return;
          }
          if (state.attendanceReadMode === 'records-failure' && table === 'attendance') {
            await json(route, { code: 'QA_FAILURE', message: 'Synthetic attendance records read failure' }, 400);
            return;
          }
          const rows = {
            sections: options.attendanceNoSection ? [] : (options.attendanceSections ?? [{ id: QA_SECTION_ID }]),
            section_students: options.attendanceEmpty ? [] : (options.attendanceLinks ?? [
              { student_id: 'student-qa-1', section_id: QA_SECTION_ID },
              { student_id: 'student-qa-2', section_id: QA_SECTION_ID },
            ]),
            students: options.attendanceEmpty ? [] : [
              { id: 'student-qa-1', lrn: '100000000001' },
              { id: 'student-qa-2', lrn: '100000000002' },
            ],
            attendance: state.attendanceRows.filter(row => row.date === url.searchParams.get('date')?.replace('eq.', '')),
          }[table];
          await json(route, rows);
          return;
        }
        if (table === 'attendance' && ['POST', 'PATCH'].includes(method)) {
          const payload = request.postDataJSON();
          state.attendanceWrites.push({ method, payload, search: url.search });
          if (state.attendanceWriteMode === 'slow') {
            await new Promise(resolve => { state.releaseAttendanceWrite = resolve; });
          }
          if (state.attendanceWriteMode === 'failure') {
            await json(route, { code: 'QA_FAILURE', message: 'Synthetic attendance save failure' }, 400);
            return;
          }
          if (state.attendanceWriteMode === 'no-match') {
            await json(route, []);
            return;
          }
          const row = method === 'POST' ? payload[0] : { ...state.attendanceRows[0], ...payload };
          state.attendanceRows = state.attendanceRows.filter(item => item.student_id !== row.student_id).concat(row);
          await json(route, []);
          return;
        }
      }

      if (options.teacherStudentsScenario && method === 'GET' && url.pathname.startsWith('/rest/v1/')) {
        const table = url.pathname.slice('/rest/v1/'.length);
        const rows = {
          sections: [{ id: 'section-qa-advisory', name: 'Orchid', grade_level: 'Grade 7' }],
          section_students: options.studentRosterEmpty ? [] : [
            { student_id: 'student-qa-1', section_id: 'section-qa-advisory', status: 'active' },
            { student_id: 'student-qa-2', section_id: 'section-qa-handled', status: 'active' },
            { student_id: 'student-qa-3', section_id: 'section-qa-handled', status: 'active' },
          ],
          students: options.studentRosterEmpty ? [] : [
            { id: 'student-qa-1', lrn: '100000000001' },
            { id: 'student-qa-2', lrn: '100000000002' },
            { id: 'student-qa-3', lrn: '100000000003' },
          ],
          schedules: [{ section_id: 'section-qa-handled', subject: 'Science', subject_id: 'subject-qa-science', sections: { name: 'Jasmine', grade_level: 'Grade 8' } }],
          subjects: [{ id: 'subject-qa-science', name: 'Science', code: 'SCI' }],
        }[table];
        if (rows) {
          state.studentRosterReads.push(`${table} ${url.search}`);
          if (table === 'sections' && state.studentRosterReadMode === 'failure') {
            await json(route, { code: 'QA_FAILURE', message: 'Synthetic roster read failure' }, 400);
            return;
          }
          const filtered = table === 'section_students'
            ? rows.filter((row) => url.searchParams.get('section_id')?.includes(row.section_id))
            : rows;
          await json(route, filtered);
          return;
        }
      }

      if (options.teacherLessonPlanScenario && url.pathname === '/rest/v1/teacher_subjects' && method === 'GET') {
        state.teacherAssignmentReads.push(url.search);
        const scopedTeacher = url.searchParams.get('teacher_id') === `eq.${profile.id}`;
        const scopedYear = url.searchParams.get('school_year') === `eq.${state.officialSchoolYear}`;
        if (!scopedTeacher || !scopedYear) {
          state.missingMocks.push('teacher_subjects scope');
          await json(route, { message: 'Teaching-load query lacked Teacher or current-year scope' }, 400);
          return;
        }
        if (state.teacherAssignmentReadMode === 'slow') {
          await new Promise(resolve => { state.releaseTeacherAssignmentRead = resolve; });
        }
        if (state.teacherAssignmentReadMode === 'failure') {
          await json(route, { code: 'QA_FAILURE', message: 'Synthetic teaching-load read failure' }, 400);
        } else {
          await json(route, state.teacherAssignmentRows.map((row, index) => ({
            id: row.id || `load-qa-${index}`, school_year: row.school_year || '2026-2027', ...row,
          })));
        }
        return;
      }

      if (options.teacherLessonPlanScenario && url.pathname === '/rest/v1/lesson_plans') {
        if (method === 'GET') {
          state.lessonPlanReads += 1;
          const rowsAtStart = state.lessonPlanRows.map(row => ({ ...row }));
          if (state.lessonPlanReadMode === 'slow') {
            await new Promise(resolve => { state.releaseLessonPlanRead = resolve; });
          }
          if (state.lessonPlanReadMode === 'failure') {
            await json(route, { code: 'QA_FAILURE', message: 'Synthetic lesson plans read failure' }, 400);
            return;
          }
          const teacherId = url.searchParams.get('teacher_id')?.replace('eq.', '');
          const rows = (state.lessonPlanReadMode === 'slow' ? rowsAtStart : state.lessonPlanRows)
            .filter(row => !teacherId || row.teacher_id === teacherId);
          await json(route, rows, 200, {
            'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
            'access-control-expose-headers': 'content-range',
          });
          return;
        }
        state.lessonPlanWrites.push(method);
        state.lessonPlanWriteRequests.push({ method, url: url.toString(), payload: request.postDataJSON() });
        if (state.lessonPlanWriteMode === 'slow') {
          await new Promise(resolve => { state.releaseLessonPlanWrite = resolve; });
        }
        if (state.lessonPlanWriteMode === 'failure') {
          await json(route, { code: 'QA_FAILURE', message: 'Synthetic lesson plan write failure' }, 400);
          return;
        }
        if (method === 'POST') {
          const payload = request.postDataJSON()?.[0] || {};
          const row = { ...payload, id: 'new-plan-qa', status: payload.status || 'draft' };
          state.lessonPlanRows.unshift(row);
          await json(route, [row], 201);
          return;
        }
        if (method === 'PATCH') {
          const id = url.searchParams.get('id')?.replace('eq.', '');
          if (state.lessonPlanWriteMode === 'zero') { await json(route, []); return; }
          const teacherId = url.searchParams.get('teacher_id')?.replace('eq.', '');
          const updatedAt = url.searchParams.get('updated_at')?.replace('eq.', '');
          const row = state.lessonPlanRows.find(plan => plan.id === id && plan.teacher_id === teacherId
            && (!updatedAt || plan.updated_at === updatedAt));
          if (!row) { await json(route, []); return; }
          const updated = { ...row, ...request.postDataJSON() };
          if (state.lessonPlanWriteMode === 'mismatch') {
            await json(route, [{ ...updated, teacher_id: 'another-teacher' }]);
            return;
          }
          if (state.lessonPlanWriteMode === 'multiple') {
            await json(route, [updated, updated]);
            return;
          }
          state.lessonPlanRows = state.lessonPlanRows.map(plan => plan.id === id ? updated : plan);
          await json(route, [updated]);
          return;
        }
        if (method === 'DELETE') {
          const id = url.searchParams.get('id')?.replace('eq.', '');
          state.lessonPlanRows = state.lessonPlanRows.filter(row => row.id !== id);
          await json(route, []);
          return;
        }
      }

      if (options.teacherOverviewScenario && url.pathname.startsWith('/rest/v1/')) {
        const table = url.pathname.slice('/rest/v1/'.length);
        const rows = table === 'lesson_plans' ? state.overviewPlanRows
          : teacherOverviewRows(profile, options.overviewEmpty, options.overviewLongTitle)[table];
        if (rows && method === 'GET') {
          if (table === 'lesson_plans' && state.overviewReadMode === 'slow') {
            await new Promise(resolve => { state.releaseOverviewRead = resolve; });
          }
          if (table === 'lesson_plans' && state.overviewReadMode === 'failure') {
            await json(route, { code: 'QA_FAILURE', message: 'Synthetic overview read failure' }, 400);
            return;
          }
          const filtered = table === 'lesson_plans' && url.searchParams.get('ai_generated') === 'eq.true'
            ? rows.filter(row => row.ai_generated === true)
            : table === 'lesson_plans' && url.searchParams.has('or')
              ? rows.filter(row => row.ai_generated !== true) : rows;
          const offset = Number(url.searchParams.get('offset') || 0);
          const limit = Number(url.searchParams.get('limit') || filtered.length);
          const page = filtered.slice(offset, offset + limit);
          await json(route, page, 200, {
            'content-range': filtered.length ? `0-${filtered.length - 1}/${filtered.length}` : '*/0',
            'access-control-expose-headers': 'content-range',
          });
          return;
        }
      }

      if (options.worksheetScenario && url.pathname.startsWith('/rest/v1/')) {
        const table = url.pathname.slice('/rest/v1/'.length);
        const rows = worksheetRows(profile, options.worksheetHasSubmission, options.worksheetHasFile, options.worksheetExtraStudent, options.worksheetFileUrl)[table];
        if (rows) {
          if (method === 'GET') {
            if (table === 'worksheet_submissions' && state.worksheetSubmissionReadMode === 'error') {
              await json(route, { code: 'QA_READ_FAILURE', message: 'Synthetic submissions read failure' }, 400);
              return;
            }
            if (table === 'section_students' && state.worksheetClassReadMode === 'error') {
              await json(route, { code: 'QA_READ_FAILURE', message: 'Synthetic class list read failure' }, 400);
              return;
            }
            if (table === 'worksheet_answers' && url.searchParams.get('submission_id')?.startsWith('eq.')
                && state.worksheetAnswerReadMode === 'error') {
              await json(route, { code: 'QA_READ_FAILURE', message: 'Synthetic answers read failure' }, 400);
              return;
            }
            if (table === 'worksheets' && options.worksheetReadMode === 'error') {
              await json(route, { code: 'QA_READ_FAILURE', message: 'Synthetic worksheet read failure' }, 503);
              return;
            }
            const filtered = table === 'worksheets' && options.worksheetReadMode === 'empty' ? []
              : table === 'worksheet_answers' && url.searchParams.has('submission_id')
                ? rows.filter(row => row.submission_id === 'submission-qa-1') : rows;
            await json(route, isObjectResponse(request) ? (filtered[0] || null) : filtered,
              200, { 'content-range': `0-${Math.max(filtered.length - 1, 0)}/${filtered.length}` });
            return;
          }
          state.worksheetWrites.push(`${method} ${table}`);
          if (table === 'worksheet_submissions' && method === 'POST' && options.worksheetPartialStudentId
              && request.postDataJSON()?.[0]?.student_id === options.worksheetPartialStudentId) {
            await json(route, { code: 'QA_FAILURE', message: 'Synthetic row write failure' }, 400);
            return;
          }
          if (options.worksheetWriteMode === 'slow' && table === options.worksheetSlowTable
              && !state.worksheetSlowUsed) {
            state.worksheetSlowUsed = true;
            await new Promise(resolve => { state.releaseWorksheetWrite = resolve; });
          }
          if (options.worksheetWriteMode === 'error' && table === options.worksheetErrorTable) {
            await json(route, { code: 'QA_FAILURE', message: 'Synthetic worksheet write failure' }, 500);
            return;
          }
          if (table === 'worksheet_items' && method === 'POST') {
            await json(route, [{ id: 'new-item-qa-1', position: 1 }]);
            return;
          }
          await json(route, isObjectResponse(request) ? { id: 'synthetic-write' } : [{ id: 'synthetic-write' }]);
          return;
        }
      }

      if (url.pathname.startsWith('/rest/v1/') && method === 'GET') {
        await json(route, isObjectResponse(request) ? {} : [], 200, { 'content-range': '*/0' });
        return;
      }

      if (url.pathname.startsWith('/storage/v1/object/sign/profile-photos/') && method === 'POST') {
        state.storageSigns += 1;
        if (options.omitStorageMock) {
          state.missingMocks.push('profile photo signed URL');
          await json(route, { message: 'Storage mock intentionally missing' }, 503);
          return;
        }
        await json(route, { signedURL: '/object/sign/profile-photos/synthetic?token=profile-e2e' });
        return;
      }

      if (url.pathname.startsWith('/storage/v1/object/sign/profile-photos/') && method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svgPhotoMarkup });
        return;
      }

      if (url.pathname.startsWith('/storage/v1/object/profile-photos/') && method === 'POST') {
        state.storageUploads += 1;
        if (state.uploadMode === 'failure') {
          await json(route, { message: 'Synthetic upload failure' }, 500);
          return;
        }
        await json(route, { Key: url.pathname.replace('/storage/v1/object/', '') });
        return;
      }

      if (options.teacherUploadMode && /^\/storage\/v1\/object\/(worksheets|lesson-pdfs)\//.test(url.pathname)
          && method === 'POST') {
        state.teacherStorageUploads += 1;
        if (options.teacherUploadMode === 'slow') {
          await new Promise(resolve => { state.releaseTeacherUpload = resolve; });
        }
        if (options.teacherUploadMode === 'failure') {
          await json(route, { message: 'Synthetic teacher upload failure' }, 503);
        } else {
          await json(route, { Key: url.pathname.replace('/storage/v1/object/', '') });
        }
        return;
      }

      if (url.pathname === '/storage/v1/object/profile-photos' && method === 'DELETE') {
        state.storageDeletes += 1;
        if (state.deleteMode === 'failure') {
          await json(route, { message: 'Synthetic cleanup failure' }, 500);
          return;
        }
        await json(route, { message: 'Synthetic object deleted' });
        return;
      }

      if (url.pathname === '/auth/v1/logout' && method === 'POST') {
        state.authLogouts += 1;
        await route.fulfill({ status: 204, body: '' });
        return;
      }

      state.missingMocks.push(`${method} ${url.pathname}`);
      await json(route, { message: 'No isolated mock registered' }, 503);
      return;
    }

    state.blockedRequests.push(`${method} ${url.origin}${url.pathname}`);
    await route.abort('blockedbyclient');
  });

  const assertHealthy = () => {
    expect(state.missingMocks, 'every Supabase operation must have an explicit isolated mock').toEqual([]);
    expect(
      state.remoteRequests.every((entry) => !entry.includes('.supabase.co')),
      'no request may reach a real Supabase host',
    ).toBe(true);
  };

  return {
    profile,
    state,
    assertHealthy,
    releaseSlowWrite() {
      state.releaseSlowWrite?.();
      state.releaseSlowWrite = null;
    },
    releaseWorksheetWrite() {
      state.releaseWorksheetWrite?.();
      state.releaseWorksheetWrite = null;
    },
    releaseOverviewRead() {
      state.releaseOverviewRead?.();
      state.releaseOverviewRead = null;
    },
    releaseLessonPlanRead() {
      state.releaseLessonPlanRead?.();
      state.releaseLessonPlanRead = null;
    },
    releaseLessonPlanWrite() {
      state.releaseLessonPlanWrite?.();
      state.releaseLessonPlanWrite = null;
    },
    releaseTeacherUpload() {
      state.releaseTeacherUpload?.();
      state.releaseTeacherUpload = null;
    },
    releaseAttendanceWrite() {
      state.releaseAttendanceWrite?.();
      state.releaseAttendanceWrite = null;
    },
  };
}

export async function openSyntheticProfile(page, role = 'teacher') {
  const route = ROLE_PATHS[role];
  if (!route) throw new Error(`Unsupported synthetic Profile role: ${role}`);
  await page.goto(route);

  if (role === 'main_admin') {
    await page.getByRole('button', { name: 'Toggle profile menu' }).click();
    await page.getByRole('button', { name: 'Profile Settings' }).click();
  }

  await expect(role === 'teacher'
    ? page.getByRole('heading', { name: 'Profile Settings', exact: true })
    : page.getByText('Profile Settings', { exact: true })).toBeVisible();
  await expect(page.getByLabel('FULL NAME')).toBeVisible();
}

export async function openDashboardNavigation(page, role = 'teacher') {
  const opener = page.getByRole('button', { name: /Open navigation/ });
  if (await opener.isVisible()) await opener.click();
  if (role === 'main_admin') return page.locator('.sidebar-item', { hasText: 'Overview' }).first();
  return page.getByRole('link', { name: 'Overview', exact: true });
}
