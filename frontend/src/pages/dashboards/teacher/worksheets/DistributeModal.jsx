// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/DistributeModal.jsx
// Distributes a task to chosen students in a section, with a dated and timed
// deadline — replaces PostToSectionModal's whole-section posting.
//
// Three reads feed this screen, and each is treated as its own failure mode:
//  - the class list (loadClassList) — who could receive this task at all
//  - who already has it (loadAssignees) — so re-opening this modal on a task
//    some students already hold does not re-notify them or block adding a
//    latecomer
//  - who has already started (loadSubmissions) — a student with a submission
//    row must not be unticked, because task_assignees.section_id is what the
//    database pins worksheet_submissions.section_id to on insert; taking the
//    task away from someone who already has a row for it would leave that
//    row orphaned against nothing.
// A failure in any of the three renders as a distinct error state with a
// working Retry — never as an empty roster, which would read as "this
// section has no students" and let a teacher distribute to nobody believing
// it went out.
// ============================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CheckSquare, Loader2, Lock, Send } from 'lucide-react';
import { Modal, Btn } from '../shared/ui';
import FormErrorSummary from '../../../../components/ui/form/FormErrorSummary';
import { useTheme } from '../hooks';
import { combineDateAndTime, DEFAULT_DUE_TIME, formatClockTime, isFutureManila, joinClockTime, manilaDateToday,
  splitClockTime } from '../../../../lib/taskFormatting';
import useDialogSafety from './useDialogSafety';
import { AUTO_CHECK_TYPES, autoCheckTypesFlagEnabled } from './autoCheckTypes';

const MAX_STUDENTS = 200;
// U-PDF-T (AI checking OFF design): one switch over the same field as before.
// ON stores checking_mode 'auto' (what Auto-check stored), OFF stores 'manual'
// (what Manual check stored); same default, same locks and fallbacks.
const MODE_SUMMARY = { auto: 'ON · AI checks the objective items', manual: 'OFF · You check this worksheet manually' };
const TYPE_LABELS = { multiple_choice: 'Multiple choice', identification: 'Identification', true_false: 'True or false' };
const modeLabel = mode => (mode === 'auto' ? 'On' : 'Off');
const LATER_THAN_NOW = 'Choose a due time that is later than now.';
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const DistributeModal = ({
  task, sections, sectionsError, onRetrySections,
  loadClassList, loadAssignees, loadSubmissions, distributeTask, onClose,
  showToast, loadItems,
}) => {
  const { dark } = useTheme();

  // `sections` already lists the advisory section first (see
  // useWorksheetAssessment's fetchMySections), so the first entry is the
  // right default without this modal needing to know which is which itself.
  const [sectionId, setSectionId] = useState(sections[0]?.id || '');

  // `sections` can arrive (or refresh, after a Retry) after this modal has
  // already mounted with an empty list — a teacher who opens Distribute
  // mid-fetch, or while `sectionsError` is showing, gets `sectionId = ''`
  // even though the <select> renders its first option as if it were chosen.
  // Sync the default in once sections show up, but only while nothing has
  // been picked yet — never override a choice the teacher already made.
  useEffect(() => {
    if (!sectionId && sections.length > 0) {
      setSectionId(sections[0].id);
    }
  }, [sections, sectionId]);
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState(DEFAULT_DUE_TIME);
  const [timeError, setTimeError] = useState('');
  const clock = splitClockTime(dueTime);
  const setClock = change => {
    const next = { ...clock, ...change };
    setDueTime(joinClockTime(next.hour, next.minute, next.period));
    setTimeError('');
  };
  // With loadItems, the real items are checked: an essay is allowed with Auto (its
  // marks are provisional until the teacher confirms); a failed read forces Manual.
  const [itemCheck, setItemCheck] = useState(loadItems ? 'loading' : 'skipped');

  const [roster, setRoster] = useState([]);
  const [rosterError, setRosterError] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(false);

  // Per-task, not per-section — loaded once and reused across a section
  // change, since who already has this task or has started it does not
  // depend on which section is currently selected in the picker.
  const [assignees, setAssignees] = useState([]);
  const [assigneesError, setAssigneesError] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [submissionsError, setSubmissionsError] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);

  const [ticked, setTicked] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { tone, text }
  const [chosenMode, setChosenMode] = useState(task.checking_mode === 'auto' ? 'auto' : 'manual');
  const [reviewing, setReviewing] = useState(false);
  const [loadingPressed, setLoadingPressed] = useState(false); // Review pressed while still loading
  const sendingRef = useRef(false);

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const muted = { color: 'var(--text-muted)' };
  const bodyText = { color: 'var(--text)' };
  const fieldStyle = {
    backgroundColor: 'var(--card2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
  };

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    setAssigneesError(false);
    setSubmissionsError(false);
    const [a, s] = await Promise.all([loadAssignees(task.id), loadSubmissions(task.id)]);
    if (!aliveRef.current) return;
    if (a === null) setAssigneesError(true); else setAssignees(a);
    if (s === null) setSubmissionsError(true); else setSubmissions(s);
    setMetaLoading(false);
  }, [task.id, loadAssignees, loadSubmissions]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  useEffect(() => {
    if (!loadItems) return undefined;
    let active = true;
    Promise.resolve().then(() => loadItems(task.id)).then(data => {
      if (!active) return;
      if (!Array.isArray(data?.items)) setItemCheck('failed');
      else setItemCheck(data.items.some(item => item.item_type === 'essay') ? 'essay' : 'ok');
    }).catch(() => { if (active) setItemCheck('failed'); });
    return () => { active = false; };
  }, [loadItems, task.id]);

  const loadRoster = useCallback(async () => {
    if (!sectionId) { setRoster([]); setRosterError(false); return; }
    setRosterLoading(true);
    setRosterError(false);
    const list = await loadClassList(sectionId);
    if (!aliveRef.current) return;
    if (list === null) { setRosterError(true); setRosterLoading(false); return; }
    setRoster(list);
    setRosterLoading(false);
  }, [sectionId, loadClassList]);

  useEffect(() => { loadRoster(); }, [loadRoster]);

  const assignedIds = useMemo(() => new Set(assignees.map(a => a.student_id)), [assignees]);
  const startedIds = useMemo(() => new Set(submissions.map(s => s.student_id)), [submissions]);

  const isTicked = (studentId) => ticked.has(studentId) || assignedIds.has(studentId) || startedIds.has(studentId);
  const isLocked = (studentId) => saving || assignedIds.has(studentId) || startedIds.has(studentId);

  const toggle = (studentId) => {
    if (isLocked(studentId)) return;
    setTicked(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  };

  const readFailed = rosterError || assigneesError || submissionsError;
  const retryAll = () => { setLoadingPressed(false); loadRoster(); loadMeta(); };

  // Only ticked new students are sent. Anyone who already holds or has started
  // this task is shown ticked so the roster reads honestly, but is never counted
  // or requested here.
  const selectable = roster.filter(r => !assignedIds.has(r.student_id) && !startedIds.has(r.student_id));
  const selectedIds = selectable.filter(r => ticked.has(r.student_id)).map(r => r.student_id);
  const allSelected = selectable.length > 0 && selectedIds.length === selectable.length;
  const toggleAll = () => setTicked(allSelected ? new Set() : new Set(selectable.map(r => r.student_id)));
  const alreadyTicked = roster.filter(r => assignedIds.has(r.student_id)).length;
  const tooMany = selectedIds.length > MAX_STUDENTS;

  const storedMode = task.checking_mode === 'auto' ? 'auto' : 'manual';
  const modeLocked = assignees.length > 0;
  // The row carries no item types: an Assignment is essays and zero items is an
  // Activity.
  const manualOnly = task.task_type === 'assignment' || !Number(task.items);
  const autoBlocked = manualOnly || itemCheck === 'failed';
  const modeReason = manualOnly ? 'AI checking is not available for this task'
    : itemCheck === 'failed' ? 'Could not check the questions, so you will check this worksheet manually.' : '';
  const switchDisabled = saving || modeLocked || autoBlocked || itemCheck === 'loading';
  const checkingMode = modeLocked ? storedMode : autoBlocked ? 'manual' : chosenMode;

  const dueAt = combineDateAndTime(dueDate, dueTime);
  const dueInFuture = Boolean(dueAt) && isFutureManila(dueAt);
  const dueMessage = !dueDate ? 'Choose a due date.'
    : !dueInFuture ? 'The due date and time must be in the future (Manila time).' : '';
  const sectionName = sections.find(s => s.id === sectionId)?.name;

  const dirty = sectionId !== (sections[0]?.id || '') || dueDate !== ''
    || dueTime !== DEFAULT_DUE_TIME
    || ticked.size > 0 || chosenMode !== storedMode
    || result?.postingSaved;
  const { requestClose, routeBlocker, busyNotice } = useDialogSafety({
    dirty, pending: saving, onClose,
    discardMessage: result?.postingSaved
      ? 'The section posting was saved, but no new students were assigned. Closing will discard your current selections; the posting will not be undone. Close?'
      : 'Discard unsaved distribution changes?',
  });

  // Checked again with a fresh clock at Review and at Confirm: the form can sit open past the due time.
  const dueStillLater = () => Boolean(dueAt) && isFutureManila(dueAt, new Date());
  const [reviewAttempt, setReviewAttempt] = useState(0);
  // A read failed: Review does nothing yet (the dialog shows the error and Retry).
  // Still loading: Review says so next to the button (the line goes when loading ends).
  const stillLoading = rosterLoading || metaLoading || itemCheck === 'loading';
  const reviewWaiting = stillLoading || readFailed;
  // U5: Review is never disabled. Every problem is listed and linked to its field,
  // re-checked as the teacher fixes things (the list only appears after a press).
  const reviewProblems = () => [
    !sectionId && { fieldId: 'teacher-distribute-section', message: 'Choose a section.' },
    !dueInFuture && { fieldId: 'teacher-distribute-date', message: dueMessage || LATER_THAN_NOW },
    selectedIds.length === 0 && { fieldId: 'teacher-distribute-students', message: 'Tick at least one student.' },
    tooMany && { fieldId: 'teacher-distribute-students', message: `Tick at most ${MAX_STUDENTS} students.` },
  ].filter(Boolean);
  const startReview = () => {
    setLoadingPressed(stillLoading);
    if (reviewWaiting) return;
    if (reviewProblems().length) { setReviewAttempt(a => a + 1); return; }
    if (!dueStillLater()) { setTimeError(LATER_THAN_NOW); return; }
    setTimeError('');
    setReviewing(true);
  };

  const submit = async () => {
    if (sendingRef.current) return;
    if (!dueStillLater()) { setReviewing(false); setTimeError(LATER_THAN_NOW); return; }
    sendingRef.current = true;
    setResult(null);
    setSaving(true);
    const res = await distributeTask(task.id, sectionId, selectedIds, dueAt, checkingMode);
    if (!aliveRef.current) return;
    sendingRef.current = false;
    setSaving(false);
    setReviewing(false);
    const elsewhere = res.assignedElsewhere?.length
      ? `${res.assignedElsewhere.length} student(s) already have this task in another section.` : '';
    if (res.ok) {
      // `added` empty means the write happened but inserted nobody — every
      // ticked student already held this task (the database skipped them
      // all at write time). That is
      // not a distribution: closing here would let the teacher believe
      // students were just sent a task when nothing changed. Keep the modal
      // open and say so, using distributeTask's own message.
      if (!res.added || res.added.length === 0) {
        setResult({ tone: 'warning', postingSaved: Boolean(res.postingSaved),
          text: [res.message || 'Nothing new was distributed.', elsewhere].filter(Boolean).join(' ') });
        return;
      }
      // The task itself was genuinely distributed even when notified is
      // false — that only means the separate notification write was
      // refused (the reachable case: a student was withdrawn from the
      // section between the roster load and this submit, so
      // teaches_student no longer holds for them). Say both things: the
      // distribution succeeded, and who could not be told.
      const notifiedText = res.notified === false
        ? 'Task distributed, but the students could not be notified. They will still see it in their task list.'
        : `Task distributed to ${res.added.length} student(s).`;
      showToast?.([notifiedText, elsewhere].filter(Boolean).join(' '), res.notified === false ? 'error' : 'success');
      onClose();
      return;
    }
    // Distribution is one database transaction, so a failure wrote nothing.
    // The modal stays open with the failure named, and resubmitting is safe:
    // the database skips anyone who already holds the task.
    setResult({ tone: 'error', text: res.message });
  };

  const shownProblems = reviewAttempt && !reviewWaiting ? reviewProblems() : [];
  const dueInvalid = dueDate !== '' && Boolean(timeError || dueMessage);
  const dueProps = dueInvalid ? { 'aria-invalid': 'true', 'aria-describedby': 'teacher-distribute-due-error' } : {};
  const closeReview = () => { if (!sendingRef.current) setReviewing(false); };
  const sectionOption = s => <option key={s.id} value={s.id}>{s.name} ({s.grade_level})</option>;
  const advisorySections = sections.filter(s => s.isAdviser);
  const handledSections = sections.filter(s => !s.isAdviser);

  return (
    <>{routeBlocker}<Modal title={`Distribute "${task.title}"`} onClose={requestClose} size="max-w-2xl"
      // Same condition as the branch it used to sit in: hidden while sections
      // fail to load or when there are none, exactly as before.
      footer={!sectionsError && sections.length > 0 ? (
      <div className="flex items-center justify-end gap-2 pt-1">
        {!rosterLoading && !metaLoading && !readFailed && roster.length > 0 && (
          <span className="text-xs mr-auto" style={muted}>
            {selectedIds.length} selected
            {alreadyTicked > 0 && ` · ${alreadyTicked} already have it`}
          </span>
        )}
        {loadingPressed && stillLoading && (
          <p role="status" className="text-xs mr-auto min-w-0" style={muted}>Still loading, try again in a moment.</p>
        )}
        <Btn variant="outline" onClick={requestClose}>Cancel</Btn>
        <Btn variant="primary" onClick={startReview}>Review</Btn>
      </div>
      ) : null}>
      <div className="flex flex-col gap-4">
        {busyNotice && <p role="status" className="text-sm">{busyNotice}</p>}
        <FormErrorSummary id="teacher-distribute-summary" errors={shownProblems} attempt={reviewAttempt} focusTo="first-field" />
        {sectionsError ? (
          <p className="text-sm" style={{ color: '#dc2626' }}>
            Could not load your sections.
            <button onClick={onRetrySections} className="ml-2 underline font-semibold" style={{ color: '#dc2626' }}>
              Retry
            </button>
          </p>
        ) : sections.length === 0 ? (
          <p className="text-sm" style={muted}>
            You have no sections yet. An administrator assigns these in Schedules.
          </p>
        ) : (
          <>
            <div className="grid gap-3 min-w-0">
              <div data-row="section" className="min-w-0">
                <label htmlFor="teacher-distribute-section" className="text-xs font-semibold" style={muted}>Section</label>
                <select id="teacher-distribute-section" value={sectionId} disabled={saving}
                  onChange={e => { setSectionId(e.target.value); setTicked(new Set()); setLoadingPressed(false); }}
                  className="w-full h-10 px-3 rounded-lg text-sm mt-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1908DF]" style={fieldStyle}>
                  {advisorySections.length > 0 && <optgroup label="Advisory section">{advisorySections.map(sectionOption)}</optgroup>}
                  {handledSections.length > 0 && <optgroup label="Handled sections">{handledSections.map(sectionOption)}</optgroup>}
                </select>
              </div>
              {/* Date and time wrap onto two rows on a narrow screen instead of overflowing. */}
              <div data-row="due" className="flex flex-wrap gap-3 min-w-0">
                <div className="flex-1 basis-40 min-w-0">
                  <label htmlFor="teacher-distribute-date" className="text-xs font-semibold" style={muted}>Due date</label>
                  <input id="teacher-distribute-date" type="date" value={dueDate} disabled={saving} min={manilaDateToday()}
                    onChange={e => { setDueDate(e.target.value); setTimeError(''); }} {...dueProps}
                    className="w-full h-10 px-3 rounded-lg text-sm mt-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1908DF]" style={fieldStyle} />
                </div>
                <div role="group" aria-labelledby="teacher-distribute-time-label" className="flex-1 basis-48 min-w-0">
                  <span id="teacher-distribute-time-label" className="text-xs font-semibold" style={muted}>Due time</span>
                  <div data-due-time className="flex flex-wrap gap-2 mt-1">
                    <select aria-label="Due hour" value={clock.hour} disabled={saving} onChange={e => setClock({ hour: e.target.value })}
                      {...dueProps} className="h-10 px-3 rounded-lg text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1908DF]" style={fieldStyle}>
                      {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <select aria-label="Due minute" value={clock.minute} disabled={saving} onChange={e => setClock({ minute: e.target.value })}
                      {...dueProps} className="h-10 px-3 rounded-lg text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1908DF]" style={fieldStyle}>
                      {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select aria-label="AM or PM" value={clock.period} disabled={saving} onChange={e => setClock({ period: e.target.value })}
                      {...dueProps} className="h-10 px-3 rounded-lg text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1908DF]" style={fieldStyle}>
                      <option value="AM">AM</option><option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {dueInvalid && <p id="teacher-distribute-due-error" role="alert" className="text-xs font-semibold" style={{ color: '#dc2626' }}>{timeError || dueMessage}</p>}
            {dueDate === '' && <p className="text-xs" style={muted}>{dueMessage}</p>}

            <section aria-labelledby="teacher-distribute-ai-h" className="rounded-xl p-4 grid gap-3"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--card-bg)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 id="teacher-distribute-ai-h" className="text-sm font-semibold" style={{ color: 'var(--text)' }}>AI checking</h3>
                  <p id="teacher-distribute-ai-state" className="text-xs mt-0.5" style={muted}>{MODE_SUMMARY[checkingMode]}</p>
                </div>
                <button type="button" role="switch" aria-checked={checkingMode === 'auto'} disabled={switchDisabled}
                  aria-labelledby="teacher-distribute-ai-h"
                  aria-describedby={`teacher-distribute-ai-state${modeLocked || (itemCheck === 'loading' && !manualOnly) || modeReason ? ' teacher-distribute-ai-reason' : ''}`}
                  onClick={() => setChosenMode(checkingMode === 'auto' ? 'manual' : 'auto')}
                  className="relative shrink-0 inline-flex items-center min-h-11 min-w-11 justify-center disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1908DF] rounded-full">
                  <span aria-hidden="true" className="inline-flex items-center w-12 h-7 rounded-full p-1"
                    style={{ backgroundColor: checkingMode === 'auto' ? 'var(--banner-accent, #1908DF)' : 'var(--border)',
                      justifyContent: checkingMode === 'auto' ? 'flex-end' : 'flex-start' }}>
                    <span className="block w-5 h-5 rounded-full" style={{ backgroundColor: '#ffffff', boxShadow: '0 1px 2px rgba(0,0,0,.25)' }} />
                  </span>
                </button>
              </div>
              {checkingMode === 'auto' ? <p className="text-sm" style={{ color: 'var(--text)' }}>Answers are marked for you when you open Check submissions.</p>
                : <div className="rounded-lg p-3 grid gap-3 text-sm" style={{ backgroundColor: 'var(--card2)', border: '1px solid var(--border)' }}>
                  <p className="flex items-start gap-2"><CheckSquare size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--banner-accent)' }} aria-hidden="true" />
                    <span><strong style={{ color: 'var(--text)' }}>You review every submission</strong><span className="block" style={muted}>All question types, including multiple choice, identification, and true or false.</span></span></p>
                  <p className="flex items-start gap-2"><Send size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--banner-accent)' }} aria-hidden="true" />
                    <span><strong style={{ color: 'var(--text)' }}>You release the scores</strong><span className="block" style={muted}>Students see their score only after you release it in Grading.</span></span></p>
                </div>}
              {checkingMode === 'manual' && !switchDisabled && <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs" style={muted}>Want AI to check the objective items?</p>
                <Btn variant="outline" className="min-h-11" onClick={() => setChosenMode('auto')}>Turn on AI checking</Btn>
              </div>}
              {autoCheckTypesFlagEnabled() && <div className="grid gap-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>AI checks these question types</p>
                <ul className="grid gap-2">
                  {AUTO_CHECK_TYPES.map(type => <li key={type} className="flex items-center gap-2 rounded-lg px-3 min-h-11 text-sm"
                    style={{ border: '1px solid var(--border)', backgroundColor: 'var(--card2)', color: checkingMode === 'auto' ? 'var(--text)' : 'var(--text-muted)' }}>
                    <CheckSquare size={16} aria-hidden="true" />{TYPE_LABELS[type]}</li>)}
                  <li className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--card2)' }}>
                    <Lock size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span><strong style={{ color: 'var(--text)' }}>Essay, handwriting, drawing, arts</strong><span className="block text-xs" style={muted}>Always checked manually by you</span></span></li>
                </ul>
              </div>}
              {/* The reason (lock, loading or forced manual) is also read with the switch. */}
              {modeLocked ? <p id="teacher-distribute-ai-reason" className="text-xs" style={muted}>Locked after the first distribution.</p>
                : itemCheck === 'loading' && !manualOnly ? <p id="teacher-distribute-ai-reason" role="status" className="text-xs" style={muted}>Checking questions...</p>
                  : modeReason && <p id="teacher-distribute-ai-reason" className="text-xs" style={muted}>{modeReason}</p>}
              {checkingMode === 'auto' && itemCheck === 'essay' && <p role="note" className="text-xs" style={muted}>
                Objective items are scored automatically. Essay answers get a provisional mark; scores are released after you confirm.</p>}
            </section>

            {result && (
              <p role={result.tone === 'error' ? 'alert' : 'status'} className="text-xs font-semibold" style={{
                color: result.tone === 'error' ? '#dc2626' : result.tone === 'warning' ? '#d97706' : '#16a34a',
              }}>
                {result.text}
              </p>
            )}

            {!sectionId ? (
              <p className="text-sm py-4" style={muted}>Pick a section to load its class list.</p>
            ) : (rosterLoading || metaLoading) ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
            ) : readFailed ? (
              <div className="flex flex-col items-center gap-3 py-6 text-sm text-center" style={{ color: '#dc2626' }}>
                <p>
                  {rosterError
                    ? "Could not load this section's class list."
                    : 'Could not check who already has this task.'}
                  {' '}This is a failed read, not an empty class — nothing can be distributed until it loads.
                </p>
                <button onClick={retryAll} className="underline font-semibold" style={{ color: '#dc2626' }}>
                  Retry
                </button>
              </div>
            ) : roster.length === 0 ? (
              <p className="text-sm py-4" style={muted}>
                This section's class list loaded, and it really is empty — no active students
                are enrolled in it yet. Add them in Class List first.
              </p>
            ) : (
              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-1">
                <label className="flex items-center gap-3 py-1.5 text-sm font-semibold" style={bodyText}>
                  <input id="teacher-distribute-students" type="checkbox" checked={allSelected} disabled={saving || selectable.length === 0}
                    ref={element => { if (element) element.indeterminate = selectedIds.length > 0 && !allSelected; }}
                    onChange={toggleAll} />
                  Select all
                </label>
                {roster.map((s, i) => {
                  const started = startedIds.has(s.student_id);
                  const assigned = assignedIds.has(s.student_id);
                  return (
                    <label key={s.student_id}
                      className="flex items-center gap-3 py-1.5"
                      style={{ borderBottom: `1px solid ${dark ? '#334155' : '#f1f5f9'}` }}>
                      <input type="checkbox" checked={isTicked(s.student_id)}
                        disabled={isLocked(s.student_id)}
                        onChange={() => toggle(s.student_id)} />
                      <span className="text-xs w-6" style={muted}>{i + 1}</span>
                      <span className="text-sm flex-1" style={bodyText}>{s.name}</span>
                      {assigned ? (
                        <span className="text-[11px]" style={muted}>Already has this task</span>
                      ) : started ? (
                        <span className="text-[11px]" style={{ color: '#d97706' }}>Already started</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            )}

            {tooMany && <p role="alert" className="text-xs font-semibold" style={{ color: '#dc2626' }}>
              You can send to at most {MAX_STUDENTS} students at a time. Untick some students.
            </p>}
          </>
        )}
      </div>
    </Modal>
    {reviewing && <Modal title="Confirm distribution" onClose={closeReview} escapeCloses closeDisabled={saving}>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm mb-5" style={bodyText}>
        <dt style={muted}>Section</dt><dd>{sectionName}</dd>
        <dt style={muted}>Students</dt><dd>{selectedIds.length}</dd>
        <dt style={muted}>Due</dt><dd>{dueDate} at {formatClockTime(dueTime)} (Manila time)</dd>
        <dt style={muted}>AI checking</dt><dd>{modeLabel(checkingMode)}</dd>
      </dl>
      <div className="flex flex-wrap justify-end gap-2">
        <Btn variant="outline" className="min-h-11" onClick={closeReview} disabled={saving}>Back</Btn>
        <Btn variant="primary" className="min-h-11" onClick={submit} disabled={saving} busy={saving}>
          {saving ? 'Distributing…' : 'Confirm'}
        </Btn>
      </div>
    </Modal>}</>
  );
};

export default DistributeModal;
