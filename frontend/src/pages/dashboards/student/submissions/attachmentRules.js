// ============================================
// FILE: src/pages/dashboards/student/submissions/attachmentRules.js
// File/link submissions (S3): the pure rules. A task with
// worksheets.submission_mode = 'attachment' is handed in as ONE file or ONE
// link plus an optional note (public.worksheet_submission_attachments). Files
// go to the private task-submissions bucket at
// <student id>/<task id>/<uuid>-<safe name>, as its policies require.
// ============================================

import { safeMaterialFileName } from '../../../../lib/uploadRules';
import { GREEN, INFO, NEUTRAL, YELLOW } from '../badgeTones';

export const SUBMISSIONS_BUCKET = 'task-submissions';
export const NOTE_MAX = 1000;

export const attachmentPath = (studentId, taskId, id, name) => `${studentId}/${taskId}/${id}-${safeMaterialFileName(name)}`;

export const noteProblem = note => (String(note ?? '').length > NOTE_MAX ? 'Keep your note to 1,000 characters.' : null);

// The note as stored: trimmed, and null when empty.
export const cleanNote = note => String(note ?? '').trim() || null;

// The five states of the Your work panel, from the submission state the
// student may read (never a score unless released).
//   none      no submission, or in progress with nothing attached
//   attached  in progress with an attachment
//   turnedIn  submitted, not graded
//   graded    checked by the teacher, not returned (no score shown)
//   returned  released
export const panelState = (submission, hasAttachment) => {
  if (submission?.released === true) return 'returned';
  if (submission?.status === 'checked') return 'graded';
  if (submission?.status === 'submitted') return 'turnedIn';
  return hasAttachment ? 'attached' : 'none';
};

// The badge on the task card and in the panel. Anything unknown reads Assigned.
export const attachmentStatus = (submission) => {
  if (submission?.released === true) return { label: 'Returned', tone: GREEN };
  if (submission?.status === 'checked') return { label: 'Graded', tone: INFO };
  if (submission?.status === 'submitted') return { label: 'Turned in', tone: YELLOW };
  return { label: 'Assigned', tone: NEUTRAL };
};

// The paper heading: an Activity (stored as task_type 'worksheet'), else the type in capitals.
export const attachmentHeading = (sheet) => {
  const type = sheet?.task_type;
  if (!type || type === 'worksheet') return 'ACTIVITY';
  return String(type).toUpperCase();
};

// Friendly text for every failure. Database text is never shown.
export const MESSAGES = {
  uploadFailed: 'The file could not be uploaded. Check your connection and try again.',
  notOpen: 'This work is already turned in. Unsubmit it to make changes.',
  saveFailed: 'Your work could not be saved. Check your connection and try again.',
  orphan: ' The uploaded file could not be removed automatically.',
  duplicate: 'You already added work for this task. Refresh and try again.',
  attachmentRequired: 'Add a file or link before turning in.',
  alreadyGraded: "Your teacher has already graded this work, so it can't be changed.",
  turnInFailed: 'Could not turn in. Check your connection and try again.',
  unsubmitFailed: 'Could not unsubmit. Check your connection and try again.',
  removeFailed: 'Your work could not be removed. Check your connection and try again.',
  openFailed: 'The file could not be opened. Try again.',
  loadFailed: 'Your work could not be loaded. Check your connection.',
  startFailed: 'Could not start this task. Check your connection and try again.',
};

const text = error => `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`;

// Storage refused the object (403/401, or an RLS message): the submission is no longer open.
export const isStorageRefusal = error => /\b(403|401)\b/.test(String(error?.statusCode ?? error?.status ?? ''))
  || /row-level security|unauthori[sz]ed|not allowed/i.test(text(error));

export const isAttachmentRequired = error => /attachment_required/.test(text(error));

// The guard's refusal for a student moving a graded or released row.
export const isGradedRefusal = error => /may not move a submission|may not score or release|Only the worksheet owner/i.test(text(error));
