// Isolated browser mocks for the teacher's file/link review (S4). Installs on
// top of installProfileMocks(page, { role: 'teacher', worksheetScenario: true }):
// routes registered later win, and anything not handled here falls back to it.
// The tasks, the roster, every submission state, the attachments, the signed
// URL and the grade RPC are synthetic and live only in this page.
import { PROFILE_E2E_ORIGIN, syntheticProfile } from './profile-mock-fixture.js';

export const FILE_TASK_ID = '0e2e0000-0000-4000-8000-0000000f0001';
export const ASSIGNMENT_TASK_ID = '0e2e0000-0000-4000-8000-0000000f0002';
export const QUIZ_TASK_ID = '0e2e0000-0000-4000-8000-0000000f0003';
export const STUDENT_LINK = 'https://docs.example.org/water-cycle-poster';
export const SIGNED_PREFIX = `${PROFILE_E2E_ORIGIN}/storage/v1/object/sign/task-submissions/`;

const SECTION_ID = 'section-qa-1';
const sid = n => `0e2e0000-0000-4000-8000-0000000c00${String(n).padStart(2, '0')}`;
export const STUDENTS = [
  [sid(1), 'Ana Reyes'], [sid(2), 'Ben Cruz'], [sid(3), 'Cris Santos'], [sid(4), 'Dina Lopez'],
  [sid(5), 'Emil Garcia'], [sid(6), 'Fe Ramos'], [sid(7), 'Gelo Tan'],
];

// rpc: 'ok' (default) or one of the error codes. review: 'ready' | 'error' | 'empty'
// (nobody assigned) | 'hold' (the reads never answer: the loading state). Both
// can be changed while the page runs through the returned `state`.
export async function installTeacherSubmissionMocks(page, { rpc = 'ok', review = 'ready' } = {}) {
  const teacher = syntheticProfile('teacher');
  const subjectFields = { subject: 'Mathematics', subject_id: 'subject-qa-1', grade_level: 'Grade 7', teacher_id: teacher.id,
    origin: 'manual', items: 0, created_at: '2026-11-10T08:00:00.000Z', collection_id: null, source_lesson_plan_id: null };
  const tasks = [
    { id: FILE_TASK_ID, title: 'Water cycle poster', task_type: 'worksheet', instructions: 'Draw the water cycle on one page.',
      submission_mode: 'attachment', max_points: 10, checking_mode: 'manual', ...subjectFields },
    { id: ASSIGNMENT_TASK_ID, title: 'Lab report', task_type: 'assignment', instructions: 'Upload your lab report.',
      submission_mode: 'attachment', max_points: 25, checking_mode: 'manual', ...subjectFields },
    { id: QUIZ_TASK_ID, title: 'Fractions check', task_type: 'quiz', instructions: null, submission_mode: 'answers',
      max_points: null, checking_mode: 'manual', ...subjectFields, items: 1 },
  ];
  const sub = (n, status, over = {}) => ({ id: `0e2e0000-0000-4000-8000-0000000d00${String(n).padStart(2, '0')}`, worksheet_id: FILE_TASK_ID,
    student_id: sid(n), section_id: SECTION_ID, status, released: false, is_late: false, source: 'online',
    submitted_at: status === 'in_progress' ? null : '2026-11-13 16:45:00', score: null, total_points: null, remarks: null, ...over });
  const state = {
    rpc,
    review,
    rpcCalls: [],
    submissions: [
      sub(2, 'in_progress'),
      sub(3, 'submitted'),
      sub(4, 'submitted', { is_late: true, submitted_at: '2026-11-16 08:10:00' }),
      sub(5, 'checked', { score: 8, total_points: 10, remarks: 'Neat labels.' }),
      sub(6, 'checked', { released: true, score: 9, total_points: 10, remarks: 'Clear diagram. Add your sources next time.' }),
      sub(7, 'submitted'),
    ],
    attachments: [
      { id: 'att-2', submission_id: sub(2).id, kind: 'file', file_path: `${sid(2)}/${FILE_TASK_ID}/draft-secret.pdf`, file_name: 'secret-draft.pdf', mime_type: 'application/pdf', size_bytes: 100, link_url: null, note: null },
      { id: 'att-3', submission_id: sub(3).id, kind: 'file', file_path: `${sid(3)}/${FILE_TASK_ID}/f3-water-cycle.pdf`, file_name: 'water-cycle.pdf', mime_type: 'application/pdf', size_bytes: 482304, link_url: null, note: 'The diagram is on page 2.' },
      { id: 'att-4', submission_id: sub(4).id, kind: 'link', file_path: null, file_name: null, mime_type: null, size_bytes: null, link_url: STUDENT_LINK, note: null },
      { id: 'att-5', submission_id: sub(5).id, kind: 'file', file_path: `${sid(5)}/${FILE_TASK_ID}/f5-poster.png`, file_name: 'poster.png', mime_type: 'image/png', size_bytes: 1200000, link_url: null, note: null },
      { id: 'att-6', submission_id: sub(6).id, kind: 'file', file_path: `${sid(6)}/${FILE_TASK_ID}/f6-poster.pdf`, file_name: 'final-poster.pdf', mime_type: 'application/pdf', size_bytes: 92000, link_url: null, note: 'Second try.' },
      { id: 'att-7', submission_id: sub(7).id, kind: 'file', file_path: `${sid(7)}/${FILE_TASK_ID}/f7-cycle.docx`, file_name: 'Gelo water cycle (final version for submission).docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size_bytes: 33000, link_url: null, note: null },
    ],
  };
  const assignees = STUDENTS.map(([id]) => ({ task_id: FILE_TASK_ID, student_id: id, section_id: SECTION_ID,
    due_at: '2026-11-15 23:59:00', assigned_at: '2026-11-10T08:00:00.000Z' }));

  const respond = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range',
      'content-range': Array.isArray(body) ? `0-${Math.max(body.length - 1, 0)}/${body.length}` : '0-0/1' },
    body: JSON.stringify(body) });
  const rows = async (route, list) => {
    const wantsObject = (route.request().headers().accept || '').includes('vnd.pgrst.object');
    if (!wantsObject) return respond(route, list);
    if (list.length !== 1) return respond(route, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 406);
    return respond(route, list[0]);
  };
  const inList = (url, name) => (url.searchParams.get(name) || '').replace(/^in\.\(|\)$/g, '').split(',').map(s => s.replace(/"/g, '')).filter(Boolean);

  await page.route(`${PROFILE_E2E_ORIGIN}/rest/v1/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.slice('/rest/v1/'.length);
    const method = request.method();
    const eq = name => url.searchParams.get(name)?.replace(/^eq\./, '');

    if (table === 'rpc/eduscribe_task_attachment_grade_v1' && method === 'POST') {
      const args = request.postDataJSON();
      state.rpcCalls.push(args);
      if (state.rpc !== 'ok') return respond(route, { code: 'P0001', message: state.rpc, details: null, hint: null }, 400);
      const s = state.submissions.find(x => x.id === args.p_submission_id);
      Object.assign(s, { status: 'checked', score: args.p_score, total_points: 10, remarks: args.p_feedback, released: s.released || args.p_release });
      return respond(route, { ok: true, submissionId: s.id, score: s.score, totalPoints: 10, released: s.released });
    }
    if (method !== 'GET') return route.fallback();
    if (table === 'worksheets') return rows(route, eq('id') ? tasks.filter(t => t.id === eq('id')) : tasks);
    if (table === 'task_assignees') {
      if (state.review === 'hold' && eq('task_id') === FILE_TASK_ID) return new Promise(() => {});
      const task = eq('task_id');
      const list = (task && task !== FILE_TASK_ID) || state.review === 'empty' ? [] : assignees;
      return rows(route, list);
    }
    if (table === 'worksheet_submissions') {
      if (state.review === 'error' && eq('worksheet_id') === FILE_TASK_ID) return respond(route, { code: 'QA', message: 'synthetic outage' }, 503);
      return rows(route, eq('worksheet_id') === FILE_TASK_ID && state.review !== 'empty' ? state.submissions : []);
    }
    if (table === 'worksheet_submission_attachments') {
      const wanted = inList(url, 'submission_id');
      return rows(route, state.attachments.filter(a => wanted.includes(a.submission_id)));
    }
    if (table === 'worksheet_answers' || table === 'worksheet_items') return rows(route, []);
    if (table === 'profiles' && (url.searchParams.get('id') || '').startsWith('in.')) {
      const wanted = inList(url, 'id');
      return rows(route, STUDENTS.filter(([id]) => wanted.includes(id)).map(([id, name]) => ({ id, name })));
    }
    return route.fallback();
  });

  await page.route(`${PROFILE_E2E_ORIGIN}/storage/v1/object/sign/task-submissions/**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.replace('/storage/v1/object/sign/task-submissions/', ''));
    return respond(route, { signedURL: `/object/sign/task-submissions/${path}?token=e2e-synthetic` });
  });
  await page.context().route(`${SIGNED_PREFIX}**`, route => route.fulfill({ status: 200, contentType: 'text/plain', body: 'Synthetic student file' }));
  await page.context().route(`${STUDENT_LINK}**`, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Student link</title><p>Synthetic</p>' }));

  return { state, tasks };
}
