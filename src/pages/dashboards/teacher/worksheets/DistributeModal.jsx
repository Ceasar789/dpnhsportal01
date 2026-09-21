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

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal, Btn } from '../shared/ui';
import { useTheme } from '../hooks';
import { combineDateAndTime, DEFAULT_DUE_TIME } from '../../../../lib/taskFormatting';

const DistributeModal = ({
  task, sections, sectionsError, onRetrySections,
  loadClassList, loadAssignees, loadSubmissions, distributeTask, onClose,
  showToast,
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

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const muted = { color: dark ? '#64748b' : '#94a3b8' };
  const bodyText = { color: dark ? '#f1f5f9' : '#1a2b4a' };
  const fieldStyle = {
    backgroundColor: dark ? '#0f172a' : '#f8fafc',
    border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
    color: dark ? '#f1f5f9' : '#1a2b4a',
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

  // Every box starts ticked, per section — this fires again whenever the
  // roster for a NEWLY selected section comes in, which is exactly when a
  // fresh "everyone ticked" default is wanted.
  useEffect(() => {
    setTicked(new Set(roster.map(r => r.student_id)));
  }, [roster]);

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

  // "N will receive this" has to mean what it says: only students this click
  // actually adds. Anyone already assigned is force-ticked (isTicked) so the
  // roster reads honestly, but counting them here would claim a send that
  // distributeTask itself will skip. Reported separately instead of folded
  // into one misleading total.
  const newlyTicked = roster.filter(r => isTicked(r.student_id) && !assignedIds.has(r.student_id)).length;
  const alreadyTicked = roster.filter(r => isTicked(r.student_id) && assignedIds.has(r.student_id)).length;
  const willReceive = newlyTicked;

  const submit = async () => {
    setResult(null);
    const dueAt = combineDateAndTime(dueDate, dueTime);
    const ids = roster.filter(r => isTicked(r.student_id)).map(r => r.student_id);
    setSaving(true);
    const res = await distributeTask(task.id, sectionId, ids, dueAt);
    if (!aliveRef.current) return;
    setSaving(false);
    if (res.ok) {
      // `added` empty means the write happened but inserted nobody — every
      // ticked student already held this task (distributeTask's own
      // skip-set, recomputed fresh at write time, came up empty). That is
      // not a distribution: closing here would let the teacher believe
      // students were just sent a task when nothing changed. Keep the modal
      // open and say so, using distributeTask's own message.
      if (!res.added || res.added.length === 0) {
        setResult({ tone: 'warning', text: res.message || 'Nothing new was distributed.' });
        return;
      }
      // The task itself was genuinely distributed even when notified is
      // false — that only means the separate notification write was
      // refused (the reachable case: a student was withdrawn from the
      // section between the roster load and this submit, so
      // teaches_student no longer holds for them). Say both things: the
      // distribution succeeded, and who could not be told.
      if (res.notified === false) {
        showToast?.(
          'Task distributed, but the students could not be notified. They will still see it in their task list.',
          'error'
        );
      }
      onClose();
      return;
    }
    // Distribution is two writes with no client transaction (the section
    // posting, then the assignee rows). A failure here can therefore be
    // partial — the posting may already be recorded while nobody was
    // actually assigned. The modal stays open, with the failure named
    // rather than silently swallowed, and resubmitting is safe: the upsert
    // on worksheet_sections is idempotent and the assignee insert re-derives
    // who still needs adding from a fresh loadAssignees call.
    setResult({ tone: 'error', text: res.message });
  };

  const disableSubmit = saving || rosterLoading || readFailed || metaLoading
    || !sectionId || !dueDate || willReceive === 0;

  return (
    <Modal title={`Distribute "${task.title}"`} onClose={onClose} size="max-w-2xl">
      <div className="flex flex-col gap-4">
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
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-semibold" style={muted}>Section</label>
                <select value={sectionId} disabled={saving}
                  onChange={e => setSectionId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg text-sm outline-none mt-1" style={fieldStyle}>
                  {sections.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.grade_level}){s.isAdviser ? ' — advisory' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold" style={muted}>Due date</label>
                <input type="date" value={dueDate} disabled={saving}
                  onChange={e => setDueDate(e.target.value)}
                  className="h-10 px-3 rounded-lg text-sm outline-none mt-1" style={fieldStyle} />
              </div>
              <div>
                <label className="text-xs font-semibold" style={muted}>Due time</label>
                <input type="time" value={dueTime} disabled={saving}
                  onChange={e => setDueTime(e.target.value || DEFAULT_DUE_TIME)}
                  className="h-10 px-3 rounded-lg text-sm outline-none mt-1" style={fieldStyle} />
              </div>
            </div>

            {result && (
              <p className="text-xs font-semibold" style={{
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
                      {started ? (
                        <span className="text-[11px]" style={{ color: '#d97706' }}>
                          Already started — clear their submission first
                        </span>
                      ) : assigned ? (
                        <span className="text-[11px]" style={muted}>Already assigned</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {!rosterLoading && !metaLoading && !readFailed && roster.length > 0 && (
                <span className="text-xs mr-auto" style={muted}>
                  {willReceive} will receive this
                  {alreadyTicked > 0 && ` · ${alreadyTicked} already have it`}
                </span>
              )}
              <Btn onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" onClick={submit} disabled={disableSubmit}>
                {saving ? 'Distributing…' : 'Distribute'}
              </Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default DistributeModal;
