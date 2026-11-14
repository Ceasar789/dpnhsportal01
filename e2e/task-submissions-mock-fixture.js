// Isolated browser mocks for the student's file/link submissions (S3).
// Installs on top of installProfileMocks(page, { role: 'student' }): routes
// registered later win, and anything not handled here falls back to it. No
// teacher UI exists yet to create a submission_mode = 'attachment' task, so
// the task, the student's submission, the attachments table and the
// task-submissions bucket are all synthetic and live only in this page.
import { PROFILE_E2E_ORIGIN, syntheticProfile } from './profile-mock-fixture.js';

export const SUBMISSION_TASK_ID = '0e2e0000-0000-4000-8000-00000000a001';
export const SUBMISSION_ASSIGNMENT_ID = '0e2e0000-0000-4000-8000-00000000a002';
export const ANSWERS_TASK_ID = '0e2e0000-0000-4000-8000-00000000a003';
const SECTION_ID = '0e2e0000-0000-4000-8000-00000000c001';
const SUBMISSION_ID = '0e2e0000-0000-4000-8000-00000000b001';
const ATTACHMENT_ID = '0e2e0000-0000-4000-8000-00000000d001';
export const SIGNED_FILE_URL_PREFIX = `${PROFILE_E2E_ORIGIN}/storage/v1/object/sign/task-submissions/`;
export const SUBMITTED_LINK = 'https://docs.example.org/water-cycle-poster';

const NOW = '2026-11-14T08:00:00.000Z';
const FUTURE_DUE = '2099-01-15T23:59:00';
const PAST_DUE = '2000-01-15T23:59:00';

// Every scenario not named here has the file attached.
const ATTACHMENT_BY_SCENARIO = linkRow => ({ none: null, attachedLink: linkRow, loadError: null });

// Scenarios: none | attachedFile | attachedLink | turnedIn | turnedInLate | graded | returned | returnedNoFeedback | loadError
export async function installSubmissionMocks(page, { scenario = 'none', due = 'future', assignment = false } = {}) {
  const studentId = syntheticProfile('student').id;
  const filePath = `${studentId}/${SUBMISSION_TASK_ID}/0e2e0000-0000-4000-8000-00000000f001-water-cycle-poster.pdf`;
  const fileRow = { id: ATTACHMENT_ID, submission_id: SUBMISSION_ID, kind: 'file', file_path: filePath, file_name: 'water-cycle-poster.pdf',
    mime_type: 'application/pdf', size_bytes: 482304, link_url: null, note: 'The diagram is on page 2.' };
  const linkRow = { id: ATTACHMENT_ID, submission_id: SUBMISSION_ID, kind: 'link', file_path: null, file_name: null, mime_type: null,
    size_bytes: null, link_url: SUBMITTED_LINK, note: null };
  const sub = (status, over = {}) => ({ id: SUBMISSION_ID, worksheet_id: SUBMISSION_TASK_ID, status, released: false, is_late: false,
    submitted_at: status === 'in_progress' ? null : '2026-11-13 16:45:00', score: null, total_points: null, remarks: null, ...over });

  const state = {
    studentId,
    scenario,
    submission: {
      none: null,
      attachedFile: sub('in_progress'),
      attachedLink: sub('in_progress'),
      turnedIn: sub('submitted'),
      turnedInLate: sub('submitted', { is_late: true }),
      graded: sub('checked', { score: 8, total_points: 10 }),
      returned: sub('checked', { released: true, score: 9, total_points: 10, remarks: 'Clear diagram and neat labels. Add the sources next time.' }),
      returnedNoFeedback: sub('checked', { released: true, score: 9, total_points: 10 }),
      loadError: sub('in_progress'),
    }[scenario] ?? null,
    attachment: Object.hasOwn(ATTACHMENT_BY_SCENARIO(linkRow), scenario) ? ATTACHMENT_BY_SCENARIO(linkRow)[scenario] : fileRow,
    attachmentReadFails: scenario === 'loadError',
    uploads: [], removes: [], signs: [], writes: [],
  };

  const tasks = [
    { id: SUBMISSION_TASK_ID, title: 'Water cycle poster', subject: 'Science', subject_id: null, task_type: assignment ? 'assignment' : 'worksheet',
      items: 0, instructions: 'Draw the water cycle on one page. Label evaporation, condensation, precipitation and collection.',
      submission_mode: 'attachment', max_points: 10 },
    { id: ANSWERS_TASK_ID, title: 'Fractions check', subject: 'Mathematics', subject_id: null, task_type: 'quiz', items: 1,
      instructions: null, submission_mode: 'answers', max_points: null },
  ];
  const assignees = tasks.map((t, i) => ({ task_id: t.id, section_id: SECTION_ID, due_at: due === 'past' && i === 0 ? PAST_DUE : FUTURE_DUE,
    assigned_at: `2026-11-1${2 - i}T08:00:00.000Z` }));

  const respond = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'content-range': Array.isArray(body) ? `0-${Math.max(body.length - 1, 0)}/${body.length}` : '0-0/1' },
    body: JSON.stringify(body) });
  // .single() asks for one object; everything else (maybeSingle on GET too) gets an array.
  const rows = async (route, list) => {
    const wantsObject = (route.request().headers().accept || '').includes('vnd.pgrst.object');
    if (!wantsObject) return respond(route, list);
    if (list.length !== 1) return respond(route, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }, 406);
    return respond(route, list[0]);
  };
  const pick = (row, select) => {
    if (!select || select === '*') return row;
    return Object.fromEntries(select.split(',').map(s => s.trim()).filter(Boolean).map(k => [k, row[k] ?? null]));
  };

  await page.route(`${PROFILE_E2E_ORIGIN}/rest/v1/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').pop();
    const method = request.method();
    const select = url.searchParams.get('select');
    const eq = name => url.searchParams.get(name)?.replace(/^eq\./, '');
    const body = request.postDataJSON?.() ?? null;

    if (table === 'task_assignees' && method === 'GET') return rows(route, assignees);
    if (table === 'worksheets' && method === 'GET') return rows(route, tasks.map(t => pick(t, select)));
    if (['schedules', 'subjects'].includes(table) && method === 'GET') return rows(route, []);
    if (table === 'worksheet_items' && method === 'GET') {
      return rows(route, eq('worksheet_id') === ANSWERS_TASK_ID
        ? [{ id: '0e2e0000-0000-4000-8000-0000000000e1', position: 1, question: 'What is 1/2 + 1/4?', item_type: 'identification', options: null, points: 1, essay_min_sentences: null, essay_min_words: null }]
        : []);
    }
    if (table === 'worksheet_answers') return rows(route, []);

    if (table === 'worksheet_submissions') {
      const s = state.submission;
      if (method === 'GET') {
        if (eq('released') === 'true') {
          if (!s?.released) return rows(route, []);
          return rows(route, [pick(s, select)]);
        }
        return rows(route, s ? [pick(s, select)] : []);
      }
      if (method === 'POST') {
        state.writes.push('POST worksheet_submissions');
        state.submission = sub('in_progress');
        return rows(route, [pick(state.submission, select)]);
      }
      if (method === 'PATCH') {
        state.writes.push(`PATCH worksheet_submissions ${JSON.stringify(body)}`);
        if (!s || s.status === 'checked' || s.released) return rows(route, []);
        if (body?.status === 'submitted' && !state.attachment) {
          return respond(route, { code: 'P0001', message: 'attachment_required' }, 400);
        }
        state.submission = body?.status === 'submitted'
          ? { ...s, status: 'submitted', submitted_at: '2026-11-14 16:00:00', is_late: due === 'past' }
          : { ...s, status: 'in_progress', submitted_at: null, is_late: false };
        return rows(route, [pick(state.submission, select)]);
      }
    }

    if (table === 'worksheet_submission_attachments') {
      if (method === 'GET') {
        if (state.attachmentReadFails) return respond(route, { message: 'synthetic outage' }, 503);
        return rows(route, state.attachment ? [pick(state.attachment, select)] : []);
      }
      if (method === 'POST') {
        state.writes.push('POST worksheet_submission_attachments');
        const row = Array.isArray(body) ? body[0] : body;
        state.attachment = { id: ATTACHMENT_ID, ...row };
        return rows(route, [pick(state.attachment, select)]);
      }
      if (method === 'PATCH') {
        state.writes.push(`PATCH worksheet_submission_attachments ${JSON.stringify(body)}`);
        if (!state.attachment || state.submission?.status !== 'in_progress') return rows(route, []);
        state.attachment = { ...state.attachment, ...body };
        return rows(route, [pick(state.attachment, select)]);
      }
      if (method === 'DELETE') {
        state.writes.push('DELETE worksheet_submission_attachments');
        if (!state.attachment || state.submission?.status !== 'in_progress') return rows(route, []);
        const gone = state.attachment;
        state.attachment = null;
        return rows(route, [pick(gone, select || 'id')]);
      }
    }
    return route.fallback();
  });

  await page.route(`${PROFILE_E2E_ORIGIN}/storage/v1/object/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname.startsWith('/storage/v1/object/sign/task-submissions/') && method === 'POST') {
      const path = decodeURIComponent(url.pathname.replace('/storage/v1/object/sign/task-submissions/', ''));
      state.signs.push({ path, expiresIn: request.postDataJSON?.()?.expiresIn });
      return respond(route, { signedURL: `/object/sign/task-submissions/${path}?token=e2e-synthetic` });
    }
    if (url.pathname.startsWith('/storage/v1/object/task-submissions/') && method === 'POST') {
      const path = decodeURIComponent(url.pathname.replace('/storage/v1/object/task-submissions/', ''));
      state.uploads.push({ path, contentType: request.headers()['content-type'] });
      return respond(route, { Key: `task-submissions/${path}`, Id: '0e2e0000-0000-4000-8000-0000000000aa' });
    }
    if (url.pathname === '/storage/v1/object/task-submissions' && method === 'DELETE') {
      state.removes.push(request.postDataJSON?.()?.prefixes ?? []);
      return respond(route, []);
    }
    return route.fallback();
  });

  // The new tab a signed URL or a submitted link opens: a small local page.
  await page.context().route(`${SIGNED_FILE_URL_PREFIX}**`, route => route.fulfill({ status: 200, contentType: 'text/plain', body: 'Synthetic submitted file' }));
  await page.context().route(`${SUBMITTED_LINK}**`, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Submitted link</title><p>Synthetic linked page</p>' }));

  return { state, now: NOW };
}
