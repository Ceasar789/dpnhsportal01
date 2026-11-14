// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/attachmentReviewApi.js
// File/link submissions, teacher side (S4): every read and the one write of
// the review dialog. Loaded when the dialog opens, never with the dashboard.
// RLS limits every read to tasks the teacher owns. Reads retry once; the
// grade RPC is never retried. Database text is never returned.
// ============================================

import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import { GRADE_ERRORS, NETWORK, UNCONFIRMED, cleanFeedback, gradeErrorMessage } from './attachmentReviewRules';

const PAGE_SIZE = 500;
const CHUNK = 200;
export const REVIEW_SUBMISSION_COLUMNS = 'id, student_id, section_id, status, released, score, total_points, remarks, is_late, submitted_at';
export const REVIEW_ATTACHMENT_COLUMNS = 'id, submission_id, kind, file_path, file_name, mime_type, size_bytes, link_url, note';

const chunks = list => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));
const opts = (label, sleep) => ({ label, ...(sleep ? { sleep } : {}) });

// Rows read in chunks of ids; null if any chunk fails.
const inChunks = async (ids, run) => {
  const out = [];
  for (const part of chunks(ids)) {
    const { data, error } = await run(part);
    if (error) return null;
    out.push(...(data || []));
  }
  return out;
};

// Everything the review needs for one task, in batched reads (no N+1):
// the roster (paged), the submissions, the names, and the attachments of
// work that was turned in (drafts are never requested). null on any failure.
export async function loadReview({ taskId, client = supabase, sleep }) {
  const roster = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await withRetry(() => client.from('task_assignees').select('student_id, section_id, due_at')
      .eq('task_id', taskId).order('student_id').range(from, from + PAGE_SIZE - 1), opts('Review roster fetch', sleep));
    if (error) return null;
    roster.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
  }

  const subs = await withRetry(() => client.from('worksheet_submissions').select(REVIEW_SUBMISSION_COLUMNS)
    .eq('worksheet_id', taskId), opts('Review submissions fetch', sleep));
  if (subs.error) return null;
  const submissions = subs.data || [];

  const studentIds = [...new Set([...roster.map(r => r.student_id), ...submissions.map(s => s.student_id)])];
  const nameRows = await inChunks(studentIds, part => withRetry(() => client.from('profiles').select('id, name').in('id', part),
    opts('Review names fetch', sleep)));
  if (!nameRows) return null;

  const turnedIn = submissions.filter(s => s.status !== 'in_progress').map(s => s.id);
  const attachments = await inChunks(turnedIn, part => withRetry(() => client.from('worksheet_submission_attachments')
    .select(REVIEW_ATTACHMENT_COLUMNS).in('submission_id', part), opts('Review attachments fetch', sleep)));
  if (!attachments) return null;

  return { roster, submissions, attachments, names: new Map(nameRows.map(n => [n.id, n.name])) };
}

// Saves (release false) or returns (release true) one score. The screen may
// change only from what this returns. Never retried.
export async function gradeSubmission({ submissionId, score, feedback, release, max, client = supabase }) {
  let result;
  try {
    result = await client.rpc('eduscribe_task_attachment_grade_v1', {
      p_submission_id: submissionId, p_score: Number(String(score).trim()), p_feedback: cleanFeedback(feedback), p_release: release === true,
    });
  } catch {
    return { ok: false, error: NETWORK };
  }
  const { data, error } = result || {};
  if (error) {
    const code = String(error.message ?? '').trim();
    if (Object.prototype.hasOwnProperty.call(GRADE_ERRORS, code)) return { ok: false, error: gradeErrorMessage(code, max) };
    return { ok: false, error: /fetch|network|timed? ?out/i.test(code) ? NETWORK : UNCONFIRMED };
  }
  if (data?.ok !== true || String(data.submissionId).toLowerCase() !== String(submissionId).toLowerCase()
    || !Number.isFinite(Number(data.score)) || !Number.isFinite(Number(data.totalPoints)) || typeof data.released !== 'boolean') {
    return { ok: false, error: UNCONFIRMED };
  }
  return {
    ok: true,
    submission: { score: Number(data.score), total_points: Number(data.totalPoints), released: data.released, status: 'checked', remarks: cleanFeedback(feedback) },
  };
}
