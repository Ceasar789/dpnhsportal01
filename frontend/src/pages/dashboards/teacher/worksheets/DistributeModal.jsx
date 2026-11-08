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
import { Loader2 } from 'lucide-react';
import { Modal, Btn } from '../shared/ui';
import { useTheme } from '../hooks';
import { combineDateAndTime, DEFAULT_DUE_TIME, formatClockTime, isFutureManila, joinClockTime, manilaDateToday,
  splitClockTime } from '../../../../lib/taskFormatting';
import useDialogSafety from './useDialogSafety';

const MAX_STUDENTS = 200;
const CHECKING_MODES = [
  { value: 'auto', label: 'Auto-check', help: 'Answers are marked for you when you open Check submissions.' },
  { value: 'manual', label: 'Manual check', help: 'You mark every answer yourself.' },
];
const modeLabel = mode => CHECKING_MODES.find(option => option.value === mode)?.label;
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
  const retryAll = () => { loadRoster(); loadMeta(); };

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
  const modeReason = manualOnly ? 'Auto-check is not available for this task'
    : itemCheck === 'failed' ? 'Could not check the questions, so Manual check will be used.' : '';
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
  const startReview = () => {
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

  const disableReview = rosterLoading || readFailed || metaLoading || itemCheck === 'loading'
    || !sectionId || !dueInFuture || selectedIds.length === 0 || tooMany;
  const closeReview = () => { if (!sendingRef.current) setReviewing(false); };
  const sectionOption = s => <option key={s.id} value={s.id}>{s.name} ({s.grade_level})</option>;
  const advisorySections = sections.filter(s => s.isAdviser);
  const handledSections = sections.filter(s => !s.isAdviser);

  return (
    <>{routeBlocker}<Modal title={`Distribute "${task.title}"`} onClose={requestClose} size="max-w-2xl">
      <div className="flex flex-col gap-4">
        {busyNotice && <p role="status" className="text-sm">{busyNotice}</p>}
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
                  onChange={e => { setSectionId(e.target.value); setTicked(new Set()); }}
                  className="w-full h-10 px-3 rounded-lg text-sm outline-none mt-1" style={fieldStyle}>
                  {advisorySections.length > 0 && <optgroup label="Advisory section">{advisorySections.map(sectionOption)}</optgroup>}
                  {handledSections.length > 0 && <optgroup label="Handled sections">{handledSections.map(sectionOption)}</optgroup>}
                </select>
              </div>
              {/* Date and time wrap onto two rows on a narrow screen instead of overflowing. */}
              <div data-row="due" className="flex flex-wrap gap-3 min-w-0">
                <div className="flex-1 basis-40 min-w-0">
                  <label htmlFor="teacher-distribute-date" className="text-xs font-semibold" style={muted}>Due date</label>
                  <input id="teacher-distribute-date" type="date" value={dueDate} disabled={saving} min={manilaDateToday()}
                    onChange={e => { setDueDate(e.target.value); setTimeError(''); }}
                    className="w-full h-10 px-3 rounded-lg text-sm outline-none mt-1" style={fieldStyle} />
                </div>
                <div role="group" aria-labelledby="teacher-distribute-time-label" className="flex-1 basis-48 min-w-0">
                  <span id="teacher-distribute-time-label" className="text-xs font-semibold" style={muted}>Due time</span>
                  <div data-due-time className="flex flex-wrap gap-2 mt-1">
                    <select aria-label="Due hour" value={clock.hour} disabled={saving} onChange={e => setClock({ hour: e.target.value })}
                      className="h-10 px-3 rounded-lg text-sm outline-none" style={fieldStyle}>
                      {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <select aria-label="Due minute" value={clock.minute} disabled={saving} onChange={e => setClock({ minute: e.target.value })}
                      className="h-10 px-3 rounded-lg text-sm outline-none" style={fieldStyle}>
                      {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select aria-label="AM or PM" value={clock.period} disabled={saving} onChange={e => setClock({ period: e.target.value })}
                      className="h-10 px-3 rounded-lg text-sm outline-none" style={fieldStyle}>
                      <option value="AM">AM</option><option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {dueDate !== '' && (timeError || dueMessage) && <p role="alert" className="text-xs font-semibold" style={{ color: '#dc2626' }}>{timeError || dueMessage}</p>}
            {dueDate === '' && <p className="text-xs" style={muted}>{dueMessage}</p>}

            <fieldset>
              <legend className="text-xs font-semibold" style={muted}>Checking mode</legend>
              {CHECKING_MODES.map(option => (
                <label key={option.value} className="flex items-start gap-2 mt-1 text-sm" style={bodyText}>
                  <input type="radio" name="teacher-distribute-mode" className="mt-1" value={option.value}
                    checked={checkingMode === option.value} disabled={saving || modeLocked || autoBlocked || itemCheck === 'loading'}
                    onChange={() => setChosenMode(option.value)} />
                  <span>{option.label}<span className="block text-xs" style={muted}>{option.help}</span></span>
                </label>
              ))}
              {modeLocked ? <p className="text-xs mt-1" style={muted}>Locked after the first distribution.</p>
                : itemCheck === 'loading' && !manualOnly ? <p role="status" className="text-xs mt-1" style={muted}>Checking questions...</p>
                  : modeReason && <p className="text-xs mt-1" style={muted}>{modeReason}</p>}
              {checkingMode === 'auto' && itemCheck === 'essay' && <p role="note" className="text-xs mt-1" style={muted}>
                Objective items are scored automatically. Essay answers get a provisional mark; scores are released after you confirm.</p>}
            </fieldset>

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
                  <input type="checkbox" checked={allSelected} disabled={saving || selectable.length === 0}
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

            <div className="flex items-center justify-end gap-2 pt-1">
              {!rosterLoading && !metaLoading && !readFailed && roster.length > 0 && (
                <span className="text-xs mr-auto" style={muted}>
                  {selectedIds.length} selected
                  {alreadyTicked > 0 && ` · ${alreadyTicked} already have it`}
                </span>
              )}
              <Btn variant="outline" onClick={requestClose}>Cancel</Btn>
              <Btn variant="primary" onClick={startReview} disabled={disableReview}>Review</Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
    {reviewing && <Modal title="Confirm distribution" onClose={closeReview} escapeCloses closeDisabled={saving}>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm mb-5" style={bodyText}>
        <dt style={muted}>Section</dt><dd>{sectionName}</dd>
        <dt style={muted}>Students</dt><dd>{selectedIds.length}</dd>
        <dt style={muted}>Due</dt><dd>{dueDate} at {formatClockTime(dueTime)} (Manila time)</dd>
        <dt style={muted}>Checking mode</dt><dd>{modeLabel(checkingMode)}</dd>
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
