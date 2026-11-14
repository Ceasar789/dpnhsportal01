// ============================================
// FILE: src/pages/dashboards/student/submissions/YourWorkPanel.jsx
// File/link submissions (S3): the student's "Your work" panel, shown under the
// paper of a task with submission_mode = 'attachment' (TasksTab). One file OR
// one link, an optional note, Turn in / Unsubmit, and the score and feedback
// once the teacher returns them. States: attachmentRules panelState.
// The attachment and released feedback are read when the panel opens; the
// rest (status, late flag, released score) comes from the shared graph row.
// ============================================

import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, FileText, Link2 } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext';
import { formatManila, manilaInstant } from '../../../../lib/taskFormatting';
import { MATERIAL_ACCEPT, MATERIAL_FILE_GUIDANCE, formatBytes, linkHost } from '../../../../lib/uploadRules';
import { Skeleton, SkeletonGroup } from '../../../../components/ui/Skeleton';
import { Btn, Modal } from '../../teacher/shared/ui';
import { ThemeContext as TeacherThemeContext } from '../../teacher/hooks';
import TeacherFilePicker from '../../teacher/shared/TeacherFilePicker';
import useDialogSafety from '../../teacher/worksheets/useDialogSafety';
import { useTheme, Badge } from '../hooks';
import { RED } from '../badgeTones';
import { MESSAGES, NOTE_MAX, attachmentStatus, panelState } from './attachmentRules';
import {
  addAttachment, ensureSubmission, loadYourWork, removeAttachment, replaceAttachment, saveNote,
  turnIn, unsubmit,
} from './attachmentApi';
import useOpenWork from './useOpenWork';
import './your-work.css';

const BUSY_LABELS = { add: 'Adding…', replace: 'Replacing…', remove: 'Removing…', note: 'Saving…', turnIn: 'Turning in…', unsubmit: 'Unsubmitting…', open: 'Opening…' };

export default function YourWorkPanel({ row, onChanged, showToast, registerLeaveGuard }) {
  const { userData } = useAuth();
  const studentId = userData?.uid;
  const { dark } = useTheme();
  const ids = useId();
  const id = name => `${ids}-${name}`;

  const [submission, setSubmission] = useState(row.submission || null);
  const [attachment, setAttachment] = useState(null);
  const [feedback, setFeedback] = useState({ text: null, failed: false });
  const [load, setLoad] = useState(row.submission?.id ? 'loading' : 'ready');
  const [loadSeq, setLoadSeq] = useState(0);
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState('file');
  const [file, setFile] = useState(null);
  const [link, setLink] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const busyRef = useRef(false);
  const [error, setError] = useState(null); // { where: 'form' | 'note' | 'action', message }
  const [confirm, setConfirm] = useState(null); // 'turnIn' | 'unsubmit' | 'remove'
  const { openFile, openLink, fallbackRef, fallbackShown } = useOpenWork();
  const [now] = useState(() => Date.now());

  const submissionId = row.submission?.id;
  const released = row.submission?.released === true;
  useEffect(() => {
    if (!submissionId) return undefined;
    let active = true;
    loadYourWork({ submission: { id: submissionId, released }, studentId }).then((result) => {
      if (!active) return;
      if (!result.ok) { setLoad('error'); return; }
      setAttachment(result.attachment);
      setNote(result.attachment?.note || '');
      setFeedback({ text: result.feedback, failed: result.feedbackFailed });
      setLoad('ready');
    });
    return () => { active = false; };
  }, [submissionId, released, studentId, loadSeq]);

  const state = panelState(submission, Boolean(attachment));
  const open = state === 'none' || state === 'attached';
  const formShown = load === 'ready' && (state === 'none' || (state === 'attached' && editing));
  const draftDirty = formShown && (Boolean(file) || link.trim() !== '' || draftNote.trim() !== '');
  const noteDirty = state === 'attached' && !editing && note !== (attachment?.note || '');
  const due = manilaInstant(row.assignee?.due_at);
  const pastDue = Boolean(due) && due.getTime() < now;
  const badge = attachmentStatus(submission);

  const { requestClose, routeBlocker, busyNotice } = useDialogSafety({
    dirty: draftDirty || noteDirty,
    pending: Boolean(busy),
    onClose: () => {},
    discardMessage: 'Discard the changes to your work?',
    leaveMessage: 'You have unsaved changes to your work. Leave this page?',
  });
  useEffect(() => {
    registerLeaveGuard?.(requestClose);
    return () => registerLeaveGuard?.(null);
  }, [registerLeaveGuard, requestClose]);

  // One action at a time: a second click while one runs sends nothing.
  const run = async (name, fn) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(name);
    setError(null);
    try { await fn(); } finally { busyRef.current = false; setBusy(null); }
  };

  const resetDraft = () => { setFile(null); setLink(''); setDraftNote(''); setEditing(false); };
  const done = (message, orphan) => {
    showToast?.(orphan ? `${message} The old file could not be removed automatically.` : message);
    onChanged?.();
  };

  const submitDraft = () => run(editing ? 'replace' : 'add', async () => {
    const payload = { taskId: row.sheet.id, studentId, kind, file, link, note: editing ? note : draftNote };
    if (!editing) {
      const started = await ensureSubmission({ row: { ...row, submission }, studentId });
      if (!started.ok) { setError({ where: 'form', message: started.error }); return; }
      setSubmission(started.submission);
      const result = await addAttachment({ ...payload, submission: started.submission });
      if (!result.ok) { setError({ where: 'form', message: result.error }); return; }
      setAttachment(result.attachment);
      setNote(result.attachment.note || '');
      resetDraft();
      done(kind === 'link' ? 'Link added.' : 'File added.');
      return;
    }
    const result = await replaceAttachment({ ...payload, current: attachment });
    if (!result.ok) { setError({ where: 'form', message: result.error }); return; }
    setAttachment(result.attachment);
    setNote(result.attachment.note || '');
    resetDraft();
    done('Your work was replaced.', result.orphan);
  });

  const doRemove = () => run('remove', async () => {
    setConfirm(null);
    const result = await removeAttachment({ current: attachment, studentId });
    if (!result.ok) { setError({ where: 'action', message: result.error }); return; }
    setAttachment(null);
    setNote('');
    resetDraft();
    done('Your work was removed.', result.orphan);
  });

  const doSaveNote = () => run('note', async () => {
    const result = await saveNote({ current: attachment, studentId, note });
    if (!result.ok) { setError({ where: 'note', message: result.error }); return; }
    setAttachment(result.attachment);
    setNote(result.attachment.note || '');
    done('Note saved.');
  });

  const doTurnIn = () => run('turnIn', async () => {
    setConfirm(null);
    if (noteDirty) {
      const saved = await saveNote({ current: attachment, studentId, note });
      if (!saved.ok) { setError({ where: 'note', message: saved.error }); return; }
      setAttachment(saved.attachment);
      setNote(saved.attachment.note || '');
    }
    const result = await turnIn({ submission, studentId });
    if (!result.ok) { setError({ where: 'action', message: result.error }); return; }
    setSubmission(result.submission);
    done(result.submission.is_late === true ? 'Turned in late.' : 'Turned in.');
  });

  const doUnsubmit = () => run('unsubmit', async () => {
    setConfirm(null);
    const result = await unsubmit({ submission, studentId });
    if (!result.ok) { setError({ where: 'action', message: result.error }); return; }
    setSubmission(result.submission);
    done('Unsubmitted. You can change your work and turn it in again.');
  });

  // Opening the work: useOpenWork (a 60-second signed URL for a file, with the
  // iOS fallback link; a link only if http/https).
  const openWork = () => {
    if (!attachment) return;
    if (attachment.kind === 'link') {
      if (!openLink(attachment.link_url)) setError({ where: 'action', message: MESSAGES.openFailed });
      return;
    }
    run('open', async () => {
      if (!(await openFile(attachment))) setError({ where: 'action', message: MESSAGES.openFailed });
    });
  };

  const errorFor = where => (error?.where === where ? error.message : null);
  const formError = errorFor('form');
  const noteError = errorFor('note');
  const actionError = errorFor('action');
  const isBusy = Boolean(busy);
  const label = (name, text) => (busy === name ? BUSY_LABELS[name] : text);

  const item = attachment && (
    <div className="yw-item">
      {attachment.kind === 'link' ? <Link2 size={20} aria-hidden="true" /> : <FileText size={20} aria-hidden="true" />}
      <div className="yw-item-text">
        <p className="yw-item-name">{attachment.kind === 'link' ? (linkHost(attachment.link_url) || 'Link') : attachment.file_name}</p>
        <p className="yw-muted">{attachment.kind === 'link' ? attachment.link_url : formatBytes(attachment.size_bytes)}</p>
      </div>
      <Btn variant="outline" className="yw-btn" onClick={openWork} disabled={isBusy}>
        <ExternalLink size={16} aria-hidden="true" /> {label('open', attachment.kind === 'link' ? 'Open link' : 'Open file')}
      </Btn>
    </div>
  );

  return (
    <TeacherThemeContext.Provider value={{ dark }}>
      <section className="yw" aria-labelledby={id('title')} aria-busy={load === 'loading' || undefined}>
        <div className="yw-head">
          <h2 id={id('title')} className="yw-title">Your work</h2>
          <div className="yw-badges">
            <Badge color={badge.tone.color} bg={badge.tone.bg}>{badge.label}</Badge>
            {submission?.is_late === true && state !== 'none' && state !== 'attached'
              && <Badge color={RED.color} bg={RED.bg}>Late</Badge>}
          </div>
        </div>
        {row.assignee?.due_at && <p className="yw-muted">Due {formatManila(row.assignee.due_at)}</p>}
        {open && pastDue && load === 'ready'
          && <p className="yw-warn">The due date has passed. Your work will be marked late.</p>}

        {load === 'loading' && <>
          <p className="sr-only" role="status">Loading your work…</p>
          <SkeletonGroup className="yw-skeleton"><Skeleton h={56} /><Skeleton h={44} w="40%" /></SkeletonGroup>
        </>}

        {load === 'error' && <div className="yw-block">
          <p className="yw-error" role="alert">{MESSAGES.loadFailed}</p>
          <Btn variant="outline" className="yw-btn" onClick={() => { setLoad('loading'); setLoadSeq(n => n + 1); }}>Retry</Btn>
        </div>}

        {load === 'ready' && state !== 'none' && item}

        {formShown && (
          <form className="yw-form" noValidate onSubmit={(e) => { e.preventDefault(); submitDraft(); }}
            aria-describedby={formError ? id('form-error') : undefined}>
            {state === 'none' && <p className="yw-muted">Add one file or one link, then turn it in.</p>}
            <fieldset className="yw-kinds" disabled={isBusy}>
              <legend className="yw-label">{editing ? 'Replace with' : 'Add your work as'}</legend>
              {[['file', 'File'], ['link', 'Link']].map(([value, text]) => (
                <label key={value} className={`yw-kind${kind === value ? ' on' : ''}`}>
                  <input type="radio" name={id('kind')} value={value} checked={kind === value}
                    onChange={() => { setKind(value); setError(null); }} />
                  {text}
                </label>
              ))}
            </fieldset>
            {kind === 'file' ? (
              <TeacherFilePicker id={id('file')} accept={MATERIAL_ACCEPT} guidance={MATERIAL_FILE_GUIDANCE}
                file={file} onSelect={(f) => { setFile(f); setError(null); }} onRemove={() => setFile(null)} disabled={isBusy} />
            ) : (
              <div className="yw-field">
                <label className="yw-label" htmlFor={id('link')}>Link address</label>
                <input id={id('link')} className="yw-input" type="url" inputMode="url" autoComplete="url"
                  placeholder="https://" value={link} disabled={isBusy} maxLength={2048}
                  aria-invalid={formError ? true : undefined} aria-describedby={formError ? id('form-error') : undefined}
                  onChange={(e) => { setLink(e.target.value); setError(null); }} />
              </div>
            )}
            {!editing && (
              <div className="yw-field">
                <label className="yw-label" htmlFor={id('draft-note')}>Note for your teacher (optional)</label>
                <textarea id={id('draft-note')} className="yw-input" rows={3} maxLength={NOTE_MAX} value={draftNote}
                  disabled={isBusy} aria-describedby={id('draft-note-count')} onChange={(e) => setDraftNote(e.target.value)} />
                <p id={id('draft-note-count')} className="yw-muted yw-count">{draftNote.length} / {NOTE_MAX}</p>
              </div>
            )}
            {formError && <p id={id('form-error')} className="yw-error" role="alert">{formError}</p>}
            <div className="yw-actions">
              <button type="submit" className="yw-btn yw-pri" disabled={isBusy} aria-busy={busy === 'add' || busy === 'replace' || undefined}>
                {editing ? label('replace', kind === 'link' ? 'Replace with link' : 'Replace with file')
                  : label('add', kind === 'link' ? 'Add link' : 'Add file')}
              </button>
              {editing && <Btn variant="outline" className="yw-btn" disabled={isBusy} onClick={() => { resetDraft(); setError(null); }}>Cancel</Btn>}
            </div>
            {state === 'none' && <p className="yw-muted">Turn in becomes available after you add your work.</p>}
          </form>
        )}

        {load === 'ready' && state === 'attached' && !editing && <>
          <div className="yw-field">
            <label className="yw-label" htmlFor={id('note')}>Note for your teacher (optional)</label>
            <textarea id={id('note')} className="yw-input" rows={3} maxLength={NOTE_MAX} value={note} disabled={isBusy}
              aria-invalid={noteError ? true : undefined}
              aria-describedby={`${id('note-count')}${noteError ? ` ${id('note-error')}` : ''}`}
              onChange={(e) => { setNote(e.target.value); if (error?.where === 'note') setError(null); }} />
            <p id={id('note-count')} className="yw-muted yw-count">{note.length} / {NOTE_MAX}</p>
            {noteError && <p id={id('note-error')} className="yw-error" role="alert">{noteError}</p>}
          </div>
          <div className="yw-actions">
            <Btn className="yw-btn" disabled={isBusy} busy={busy === 'turnIn'} onClick={() => setConfirm('turnIn')}>
              {label('turnIn', 'Turn in')}
            </Btn>
            <Btn variant="outline" className="yw-btn" disabled={isBusy || !noteDirty} busy={busy === 'note'} onClick={doSaveNote}>
              {label('note', 'Save note')}
            </Btn>
            <Btn variant="outline" className="yw-btn" disabled={isBusy} onClick={() => { setEditing(true); setKind(attachment.kind); setError(null); }}>Replace</Btn>
            <Btn variant="outline" className="yw-btn" disabled={isBusy} busy={busy === 'remove'} onClick={() => setConfirm('remove')}>
              {label('remove', 'Remove')}
            </Btn>
          </div>
        </>}

        {load === 'ready' && (state === 'turnedIn' || state === 'graded' || state === 'returned') && <>
          {submission?.submitted_at && <p className="yw-muted">Turned in {formatManila(submission.submitted_at)}</p>}
          {attachment?.note && <div className="yw-block"><p className="yw-label">Your note</p><p className="yw-note">{attachment.note}</p></div>}
          {state === 'turnedIn' && <div className="yw-actions">
            <Btn variant="outline" className="yw-btn" disabled={isBusy} busy={busy === 'unsubmit'} onClick={() => setConfirm('unsubmit')}>
              {label('unsubmit', 'Unsubmit')}
            </Btn>
          </div>}
          {state === 'graded' && <p className="yw-muted">Your teacher has graded this. You will see your score when it is returned.</p>}
          {state === 'returned' && <div className="yw-block yw-result">
            <p className="yw-score">Score: {submission.score ?? '—'} / {submission.total_points ?? row.sheet.max_points ?? '—'}</p>
            {feedback.text && <><p className="yw-label">Feedback from your teacher</p><p className="yw-note">{feedback.text}</p></>}
            {feedback.failed && <p className="yw-muted">Your teacher's feedback could not be loaded. Reopen this task to try again.</p>}
          </div>}
        </>}

        {actionError && <p className="yw-error" role="alert">{actionError}</p>}
        {busyNotice && <p className="yw-muted" role="status">{busyNotice}</p>}
        <p className="yw-fallback" hidden={!fallbackShown}>
          File didn&apos;t open? <a ref={fallbackRef} target="_blank" rel="noopener noreferrer">Open file</a>
        </p>
      </section>

      {confirm && (
        <Modal title={{ turnIn: 'Turn in your work?', unsubmit: 'Unsubmit your work?', remove: 'Remove your work?' }[confirm]}
          onClose={() => setConfirm(null)} escapeCloses closeDisabled={isBusy}>
          <p className="text-sm mb-5" style={{ color: 'var(--text)' }}>
            {confirm === 'turnIn' && (pastDue
              ? 'The due date has passed, so your work will be marked late. You can unsubmit until your teacher grades it.'
              : 'Your teacher will see your work. You can unsubmit until your teacher grades it.')}
            {confirm === 'unsubmit' && 'You can change your work and turn it in again. If the due date has passed, it will be marked late.'}
            {confirm === 'remove' && (attachment?.kind === 'file' ? 'Your file will be deleted.' : 'Your link will be removed.')}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Btn variant="outline" className="min-h-11" onClick={() => setConfirm(null)} disabled={isBusy}>Cancel</Btn>
            <Btn variant={confirm === 'remove' ? 'danger' : 'primary'} className="min-h-11" disabled={isBusy}
              onClick={{ turnIn: doTurnIn, unsubmit: doUnsubmit, remove: doRemove }[confirm]}>
              {{ turnIn: 'Turn in', unsubmit: 'Unsubmit', remove: 'Remove' }[confirm]}
            </Btn>
          </div>
        </Modal>
      )}
      {routeBlocker}
    </TeacherThemeContext.Provider>
  );
}
