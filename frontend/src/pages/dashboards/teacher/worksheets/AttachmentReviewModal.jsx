// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/AttachmentReviewModal.jsx
// File/link submissions, teacher side (S4): review each student's turned-in
// file or link, then Save a score and feedback (graded, not returned) or
// Return it (released). Opened from Check submissions for a task with
// submission_mode = 'attachment' (the wrapper in CheckSubmissionsModal.jsx).
// Rules: attachmentReviewRules.js. Reads and the grade RPC: attachmentReviewApi.js.
// Drafts are never shown or opened; the screen changes only from what the RPC
// returns; unsaved changes are confirmed before switching student or closing.
// ============================================

import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, FileText, Link2 } from 'lucide-react';
import { formatManila } from '../../../../lib/taskFormatting';
import { formatBytes, linkHost } from '../../../../lib/uploadRules';
import { Skeleton, SkeletonGroup } from '../../../../components/ui/Skeleton';
import { Btn, Modal } from '../shared/ui';
import useDialogSafety from './useDialogSafety';
import useOpenWork from '../../student/submissions/useOpenWork';
import {
  FEEDBACK_MAX, FILTERS, STATUS_LABELS, feedbackProblem, filterCounts, inFilter, matchesSearch, mergeRows,
  reviewStatus, scoreProblem,
} from './attachmentReviewRules';
import { gradeSubmission, loadReview } from './attachmentReviewApi';
import './attachment-review.css';

const OPEN_FAILED = 'The file could not be opened. Try again.';
const scoreText = submission => (submission?.status === 'checked' && submission.score != null ? String(Number(submission.score)) : '');

export default function AttachmentReviewModal({ worksheet, onClose }) {
  const ids = useId();
  const id = name => `${ids}-${name}`;
  const max = Number(worksheet.max_points);
  const [load, setLoad] = useState('loading');
  const [loadSeq, setLoadSeq] = useState(0);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(null); // 'save' | 'return' | 'open'
  const busyRef = useRef(false);
  const [error, setError] = useState(null); // { where: 'score' | 'feedback' | 'action', message }
  const [status, setStatus] = useState('');
  const headingRef = useRef(null);
  const focusDetail = useRef(false);
  const { openFile, openLink, fallbackRef, fallbackShown, clearFallback } = useOpenWork();

  useEffect(() => {
    let active = true;
    loadReview({ taskId: worksheet.id }).then((result) => {
      if (!active) return;
      if (!result) { setLoad('error'); return; }
      setRows(mergeRows(result));
      setLoad('ready');
    });
    return () => { active = false; };
  }, [worksheet.id, loadSeq]);

  const selected = rows.find(r => r.student_id === selectedId) || null;
  const selectedStatus = reviewStatus(selected?.submission);
  const gradable = Boolean(selected) && selectedStatus !== 'notSubmitted';
  const dirty = gradable && (score.trim() !== scoreText(selected.submission)
    || feedback !== (selected.submission?.remarks || ''));

  const { requestClose, routeBlocker, busyNotice } = useDialogSafety({
    dirty, pending: busy === 'save' || busy === 'return', onClose,
    discardMessage: 'Discard the score and feedback you have not saved?',
    leaveMessage: 'You have an unsaved score. Leave this page?',
  });

  useEffect(() => {
    if (focusDetail.current) { focusDetail.current = false; headingRef.current?.focus(); }
  }, [selectedId]);

  const choose = (row) => {
    if (row.student_id === selectedId) return;
    requestClose(() => {
      clearFallback();
      setSelectedId(row.student_id);
      setScore(scoreText(row.submission));
      setFeedback(row.submission?.remarks || '');
      setError(null);
      setStatus('');
      focusDetail.current = true;
    });
  };

  const save = async (release) => {
    if (busyRef.current || !gradable) return;
    const scoreError = scoreProblem(score, max);
    const feedbackError = feedbackProblem(feedback);
    if (scoreError || feedbackError) {
      setError(scoreError ? { where: 'score', message: scoreError } : { where: 'feedback', message: feedbackError });
      return;
    }
    busyRef.current = true;
    setBusy(release ? 'return' : 'save');
    setError(null);
    setStatus('');
    try {
      const result = await gradeSubmission({ submissionId: selected.submission.id, score, feedback, release, max });
      if (!result.ok) { setError({ where: 'action', message: result.error }); return; }
      const updated = { ...selected.submission, ...result.submission };
      setRows(prev => prev.map(r => (r.student_id === selected.student_id ? { ...r, submission: updated } : r)));
      setScore(scoreText(updated));
      setFeedback(updated.remarks || '');
      setStatus(updated.released ? (release ? `Returned to ${selected.name}.` : 'Saved. Still returned to the student.') : 'Saved.');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const openWork = async () => {
    const work = selected?.attachment;
    if (!work || busyRef.current) return;
    setError(null);
    if (work.kind === 'link') {
      if (!openLink(work.link_url)) setError({ where: 'action', message: OPEN_FAILED });
      return;
    }
    busyRef.current = true;
    setBusy('open');
    try {
      if (!(await openFile(work))) setError({ where: 'action', message: OPEN_FAILED });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const counts = filterCounts(rows);
  const visible = rows.filter(r => inFilter(r, filter) && matchesSearch(r, query));
  const errorFor = where => (error?.where === where ? error.message : null);
  const isBusy = Boolean(busy);
  const returned = selectedStatus === 'returned';

  return <>{routeBlocker}
    <Modal title={`Submissions — ${worksheet.title}`} onClose={requestClose} dismissible escapeCloses
      closeDisabled={busy === 'save' || busy === 'return'} size="max-w-5xl">
      <div className="arv" aria-busy={load === 'loading' || undefined}>
        <p className="arv-muted">File or link · {max} points</p>
        {busyNotice && <p role="status" className="arv-muted">{busyNotice}</p>}

        {load === 'loading' && <>
          <p className="sr-only" role="status">Loading submissions…</p>
          <SkeletonGroup className="arv-skeleton"><Skeleton h={44} /><Skeleton h={44} /><Skeleton h={44} /><Skeleton h={120} /></SkeletonGroup>
        </>}

        {load === 'error' && <div className="arv-block">
          <p className="arv-error" role="alert">Submissions could not be loaded. Check your connection.</p>
          <Btn variant="outline" className="arv-btn" onClick={() => { setLoad('loading'); setLoadSeq(n => n + 1); }}>Retry</Btn>
        </div>}

        {load === 'ready' && rows.length === 0 && <p className="arv-block">No students have this task yet. Distribute it from Worksheets.</p>}

        {load === 'ready' && rows.length > 0 && <>
          <div className="arv-top">
            <div className="arv-chips" role="group" aria-label="Filter submissions">
              {FILTERS.map(([key, label]) => (
                <button key={key} type="button" className="arv-chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                  {label} <span>({counts[key]})</span>
                </button>
              ))}
            </div>
            <div className="arv-search">
              <label htmlFor={id('search')} className="arv-label">Search students</label>
              <input id={id('search')} type="search" className="arv-input" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
          </div>
          <div className="arv-body">
            <ul className="arv-list" aria-label="Students">
              {visible.length === 0 && <li className="arv-muted arv-empty">No students match.</li>}
              {visible.map((row) => {
                const s = reviewStatus(row.submission);
                return <li key={row.student_id}>
                  <button type="button" className="arv-row" aria-current={row.student_id === selectedId ? 'true' : undefined} onClick={() => choose(row)}>
                    <span className="arv-name">{row.name}</span>
                    <span className="arv-pills">
                      <span className={`arv-pill ${s}`}>{STATUS_LABELS[s]}</span>
                      {s !== 'late' && s !== 'notSubmitted' && row.submission?.is_late === true && <span className="arv-pill late">Late</span>}
                    </span>
                  </button>
                </li>;
              })}
            </ul>

            <section className="arv-detail" aria-labelledby={selected ? id('who') : undefined} aria-label={selected ? undefined : 'Selected student'}>
              {!selected && <p className="arv-muted">Choose a student to review their work.</p>}
              {selected && <>
                <div className="arv-head">
                  <h3 id={id('who')} ref={headingRef} tabIndex={-1} className="arv-title">{selected.name}</h3>
                  <span className="arv-pills">
                    <span className={`arv-pill ${selectedStatus}`}>{STATUS_LABELS[selectedStatus]}</span>
                    {selectedStatus !== 'late' && selectedStatus !== 'notSubmitted' && selected.submission?.is_late === true && <span className="arv-pill late">Late</span>}
                  </span>
                </div>
                {!gradable && <p className="arv-muted">Not turned in yet.</p>}
                {gradable && <>
                  {selected.submission.submitted_at && <p className="arv-muted">Turned in {formatManila(selected.submission.submitted_at)}</p>}
                  {selected.attachment ? (
                    <div className="arv-item">
                      {selected.attachment.kind === 'link' ? <Link2 size={20} aria-hidden="true" /> : <FileText size={20} aria-hidden="true" />}
                      <div className="arv-item-text">
                        <p className="arv-item-name">{selected.attachment.kind === 'link' ? (linkHost(selected.attachment.link_url) || 'Link') : selected.attachment.file_name}</p>
                        <p className="arv-muted">{selected.attachment.kind === 'link' ? selected.attachment.link_url : formatBytes(selected.attachment.size_bytes)}</p>
                      </div>
                      <Btn variant="outline" className="arv-btn" onClick={openWork} disabled={isBusy}>
                        <ExternalLink size={16} aria-hidden="true" /> {busy === 'open' ? 'Opening…' : selected.attachment.kind === 'link' ? 'Open link' : 'Open file'}
                      </Btn>
                    </div>
                  ) : <p className="arv-muted">The attached work could not be found.</p>}
                  {selected.attachment?.note && <div className="arv-block"><p className="arv-label">Student&apos;s note</p><p className="arv-note">{selected.attachment.note}</p></div>}
                  <form className="arv-form" noValidate onSubmit={(e) => { e.preventDefault(); save(false); }}>
                    <div className="arv-field">
                      <label htmlFor={id('score')} className="arv-label">Score (out of {max})</label>
                      <div className="arv-score">
                        <input id={id('score')} className="arv-input" inputMode="decimal" autoComplete="off" value={score} disabled={isBusy}
                          aria-invalid={errorFor('score') ? true : undefined} aria-describedby={errorFor('score') ? id('score-error') : undefined}
                          onChange={(e) => { setScore(e.target.value); if (error?.where === 'score') setError(null); }} />
                        <span className="arv-suffix">/ {max}</span>
                      </div>
                      {errorFor('score') && <p id={id('score-error')} className="arv-error" role="alert">{errorFor('score')}</p>}
                    </div>
                    <div className="arv-field">
                      <label htmlFor={id('feedback')} className="arv-label">Feedback (optional)</label>
                      <textarea id={id('feedback')} className="arv-input" rows={4} maxLength={FEEDBACK_MAX} value={feedback} disabled={isBusy}
                        aria-invalid={errorFor('feedback') ? true : undefined}
                        aria-describedby={`${id('feedback-count')}${errorFor('feedback') ? ` ${id('feedback-error')}` : ''}`}
                        onChange={(e) => { setFeedback(e.target.value); if (error?.where === 'feedback') setError(null); }} />
                      <p id={id('feedback-count')} className="arv-muted arv-count">{feedback.length} / {FEEDBACK_MAX}</p>
                      {errorFor('feedback') && <p id={id('feedback-error')} className="arv-error" role="alert">{errorFor('feedback')}</p>}
                    </div>
                    <div className="arv-actions">
                      <button type="submit" className="arv-btn arv-sec" disabled={isBusy} aria-busy={busy === 'save' || undefined}>
                        {busy === 'save' ? 'Saving…' : returned ? 'Save changes' : 'Save'}
                      </button>
                      {!returned && <button type="button" className="arv-btn arv-pri" disabled={isBusy} aria-busy={busy === 'return' || undefined}
                        onClick={() => save(true)}>{busy === 'return' ? 'Returning…' : 'Return to student'}</button>}
                    </div>
                    <p className="arv-muted">{returned ? 'This work is returned. Saving changes keeps it returned.'
                      : 'Save keeps the score private. Return shows the score and feedback to the student.'}</p>
                  </form>
                </>}
                {errorFor('action') && <p className="arv-error" role="alert">{errorFor('action')}</p>}
                {status && <p className="arv-ok" role="status">{status}</p>}
                <p className="arv-fallback" hidden={!fallbackShown}>
                  File didn&apos;t open? <a ref={fallbackRef} target="_blank" rel="noopener noreferrer">Open file</a>
                </p>
              </>}
            </section>
          </div>
        </>}
      </div>
    </Modal>
  </>;
}
