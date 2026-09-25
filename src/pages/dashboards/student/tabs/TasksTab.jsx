// ============================================
// FILE: src/pages/dashboards/student/tabs/TasksTab.jsx
// Tasks assigned to this student (task_assignees), and the answering surface.
// Never selects worksheet_item_keys — the answer key is not readable here and
// must not be requested. Never imports checkItem/scoreSubmission — those run
// only in the teacher's browser, where the key is actually readable.
// ============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { FileText, Loader2, RefreshCw, Clock, CalendarClock } from 'lucide-react';
import { useTheme, useToast, Card, Badge } from '../hooks';
import { withRetry } from '../../../../lib/supabaseRetry';
import { TRUE_FALSE_VALUES } from '../../../../lib/worksheetChecking';
import { formatCountdown, TASK_TYPE_LABELS } from '../../../../lib/taskFormatting';
import { useStudentData } from '../StudentDataContext';
import { SUBMISSION_STATE_FIELDS } from '../../../../lib/studentTaskGraph';

// Colors for the countdown badge, one per formatCountdown tone. Kept in one
// place so the meaning of a color (late vs. soon vs. plenty of time) stays
// consistent no matter which row renders it.
const COUNTDOWN_COLORS = {
  late: { color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
  urgent: { color: '#ea580c', bg: 'rgba(234,88,12,0.12)' },
  soon: { color: '#ca8a04', bg: 'rgba(202,138,4,0.12)' },
  normal: { color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  none: { color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
};

// Debounce window for autosaving free-typed answers (identification,
// enumeration, essay) as the student types, in addition to the existing
// save-on-blur. Long enough that ordinary typing does not storm the
// connection pool this project's hosting tier already struggles with;
// short enough that leaving the worksheet, or navigating away inside the
// app, loses at most the last fraction of a second of typing — both of
// those fire the pending write rather than dropping it. Closing the browser
// tab outright is NOT covered: there is no beforeunload handler, so React's
// cleanup never runs and anything newer than the last write is gone.
const TYPING_SAVE_DEBOUNCE_MS = 800;

// Maps a Postgres/PostgREST error to a sentence a student can act on,
// while keeping the raw message (trigger text, RLS denial, constraint
// name, etc.) in the console for whoever debugs it later.
const toStudentMessage = (error, fallback) => {
  console.warn(fallback, '—', error?.message);
  return fallback;
};

const StudentTasksTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { showToast, Toast } = useToast();
  const [searchParams] = useSearchParams();
  const subjectFilter = searchParams.get('subject');

  // Every read this tab needs comes from the one shared graph held by
  // StudentDataProvider — the same rows OverviewTab reads. `fetchTasks`
  // refreshes that graph, so both screens move together.
  const { graph, loading, refresh: fetchTasks } = useStudentData();

  // A schedule failure is NOT fatal here, unlike on Overview, which cannot
  // draw its subject cards without it. This tab lists every assigned task
  // whatever the schedule says, so a failed schedule read costs it nothing.
  const loadError = !!graph && !!graph.fatalError;


  // Held as state rather than derived, because Start and Submit patch a
  // single row's submission in place (see patchSubmission) without paying
  // for a refetch. The effect below rebuilds it whenever the graph changes.
  const [rows, setRows] = useState([]);
  const [active, setActive] = useState(null);
  const [items, setItems] = useState([]);
  const [answers, setAnswers] = useState({});
  const [submission, setSubmission] = useState(null);
  const [busy, setBusy] = useState(false);

  // Drives the live countdown on every row from ONE interval for the whole
  // list — a class with thirty tasks would otherwise hold thirty timers.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // itemId -> pending debounce timer id; itemId -> the currently in-flight
  // write promise for that item, removed the instant it settles (this map
  // must only ever describe writes actually in flight right now — an entry
  // left behind after settling would be re-inspected by every later flush,
  // permanently blocking Submit over one long-past failure); itemId -> true
  // for an item whose most recent write is known to have failed, cleared
  // the moment a later write for that same item succeeds.
  const saveTimers = useRef({});
  const pendingWrites = useRef({});
  const failedWrites = useRef({});

  useEffect(() => () => {
    // Fire, don't drop: an unmount mid-typing (the student uses the sidebar)
    // would otherwise lose whatever has not yet been blurred or debounced.
    Object.values(saveTimers.current).forEach(({ timer, run }) => {
      clearTimeout(timer);
      run({ silent: true });
    });
  }, []);

  // All three maps are keyed by item id, and item ids belong to ONE worksheet.
  // The refs, though, live as long as the component, while opening another
  // worksheet swaps `items`, `answers` and `submission` underneath them. Left
  // uncleared, a failure recorded against worksheet A's item would block
  // submitting worksheet B — naming a question B does not have — and a debounce
  // timer left over from A would fire with B's submission id, writing an answer
  // whose item belongs to a different worksheet. Clearing on every switch is
  // what keeps this per-worksheet state honest.
  // Bumped on every worksheet switch. A write already in flight when the
  // student leaves still completes — their answer is saved — but its
  // bookkeeping is discarded, so a failure belonging to the worksheet they
  // left cannot block the one they just opened.
  const saveGenRef = useRef(0);

  const resetSaveState = useCallback(() => {
    // Timers are fired, not dropped: a pending timer holds typing the student
    // has done but not yet blurred, and the closure that fires it still has
    // the correct submission. Cancelling them would silently lose that work.
    Object.values(saveTimers.current).forEach(({ timer, run }) => {
      clearTimeout(timer);
      run({ silent: true });
    });
    saveTimers.current = {};
    pendingWrites.current = {};
    failedWrites.current = {};
    saveGenRef.current += 1;
  }, []);

  const muted = { color: dark ? '#64748b' : '#94a3b8' };

  // Rebuilds the list whenever the shared graph changes. The graph already
  // holds the assignments newest-first (the order the student learned about
  // the work), their worksheets, every submission's state, and the released
  // scores — all fetched once for the whole dashboard.
  //
  // The score is merged in only for released submissions, which is the only
  // case statusLabel renders a number for anyway. A failed submissions read
  // never reaches here: the graph reports it as fatalError, so an
  // already-submitted student is never shown an unanswered task they would
  // then fail to insert against the UNIQUE(worksheet_id, student_id)
  // constraint.
  useEffect(() => {
    if (!graph || graph.fatalError) { setRows([]); return; }
    setRows(graph.assignees.map(a => {
      const sheet = graph.sheetById.get(a.task_id);
      if (!sheet) return null; // task deleted out from under the assignment
      const state = graph.submissionStates.find(s => s.worksheet_id === sheet.id) || null;
      const score = state ? graph.releasedScores.find(s => s.worksheet_id === sheet.id) : null;
      return {
        assignee: a,
        sheet,
        // A missing subject name is decoration, not something a wrong value
        // could corrupt — it falls back to the worksheet's own legacy
        // subject text at render time.
        subjectName: sheet.subject_id ? (graph.subjectsById.get(sheet.subject_id) || null) : null,
        submission: state ? (score ? { ...state, ...score } : state) : null,
      };
    }).filter(Boolean));
  }, [graph]);


  // ?subject=<id> narrows the list to that subject. Every card is a subject,
  // so there is no bucket filter any more.
  const visibleRows = subjectFilter
    ? rows.filter(r => r.sheet.subject_id === subjectFilter)
    : rows;

  // Writes one submission's `submission` field into the matching `rows`
  // entry in place, without a full refetch. Called the instant a
  // worksheet_submissions row exists (created here, or recovered below) —
  // BEFORE any further read that might fail — so backing out (or a failed
  // saved-answers read) never leaves the list showing "Not started" for a
  // worksheet that already has a row. Without this, the student's only way
  // back in is a second INSERT, which UNIQUE(worksheet_id, student_id)
  // rejects.
  const rememberSubmission = (taskId, sub) => {
    setRows(prev => prev.map(r => (r.assignee.task_id === taskId ? { ...r, submission: sub } : r)));
  };

  const open = async (row) => {
    resetSaveState();
    setBusy(true);
    const { data: itemRows, error } = await withRetry(
      () => supabase.from('worksheet_items')
        .select('id, position, question, item_type, options, points')
        .eq('worksheet_id', row.sheet.id).order('position'),
      { label: 'Student worksheet items fetch' }
    );
    if (error) {
      showToast('Could not load the questions. Check your connection.', 'error');
      setBusy(false); return;
    }

    let sub = row.submission;
    if (!sub) {
      const { data, error: createError } = await supabase.from('worksheet_submissions').insert([{
        worksheet_id: row.sheet.id,
        student_id: userData.uid,
        // Must equal task_assignees.section_id for this (task, student) pair
        // — the database's student_assigned_task_in_section RLS check pins
        // worksheet_submissions.section_id to exactly that value. row.assignee
        // IS that task_assignees row, so this is always the right one.
        section_id: row.assignee.section_id,
        source: 'online',
        status: 'in_progress',
      // State only, for the same reason as the recovery read below. The
      // INSERT policy pins the scoring columns NULL anyway, so there would be
      // nothing to return.
      }]).select(SUBMISSION_STATE_FIELDS).single();

      if (createError) {
        if (createError.code === '23505') {
          // UNIQUE(worksheet_id, student_id) fired: a submission already
          // exists for this worksheet (most likely this same lockout from
          // before this fix — a stale `rows` snapshot after backing out).
          // Recover by reading the existing row instead of leaving the
          // student stuck with no way back in.
          const { data: existing, error: fetchError } = await withRetry(
            // State only: this path reopens a worksheet, and the answering
            // view never renders a score, so there is no reason to pull one.
            () => supabase.from('worksheet_submissions').select(SUBMISSION_STATE_FIELDS)
              .eq('worksheet_id', row.sheet.id).eq('student_id', userData.uid).single(),
            { label: 'Student existing submission recovery fetch' }
          );
          if (fetchError || !existing) {
            showToast('Could not reopen this worksheet. Check your connection and try again.', 'error');
            setBusy(false); return;
          }
          sub = existing;
          showToast(existing.status === 'in_progress'
            ? 'Reopening the worksheet you already started.'
            : 'This worksheet was already submitted.');
        } else {
          showToast(toStudentMessage(createError, 'Could not start this worksheet. Check your connection and try again.'), 'error');
          setBusy(false); return;
        }
      } else {
        sub = data;
      }

      // Recorded immediately — before the saved-answers read below, which
      // can itself fail — so either failure path still leaves `rows`
      // knowing this submission exists.
      rememberSubmission(row.assignee.task_id, sub);
      row = { ...row, submission: sub };
    }

    // A failed read here must not render as "no answers saved yet" — for a
    // submission the student already has in progress (or submitted), that
    // would show blank inputs over real saved work, inviting them to
    // re-type answers or, worse, mis-representing what they actually
    // submitted in the read-only view.
    const { data: saved, error: savedError } = await withRetry(
      () => supabase.from('worksheet_answers').select('item_id, answer').eq('submission_id', sub.id),
      { label: 'Student saved answers fetch' }
    );
    if (savedError) {
      showToast('Could not load your saved answers. Check your connection and try again.', 'error');
      setBusy(false); return;
    }

    setItems(itemRows || []);
    setAnswers(Object.fromEntries((saved || []).map(a => [a.item_id, a.answer])));
    setSubmission(sub);
    setActive(row);
    setBusy(false);
  };

  // The actual write. Records its own promise in pendingWrites — removed
  // the instant it settles — so submit() can await every write genuinely
  // in flight right now before it locks the submission by moving its
  // status to 'submitted'. `.catch` turns even an unexpected rejection
  // into a normal `{ error }` result, so a failed write can never leave an
  // unhandled rejection or skip the pendingWrites cleanup below. `silent`
  // is used by the flush path, which reports one clear failure of its own
  // instead of stacking a duplicate per-field toast.
  const writeAnswer = useCallback((itemId, value, { silent = false } = {}) => {
    const gen = saveGenRef.current;
    let selfPromise;
    selfPromise = supabase.from('worksheet_answers').upsert([{
      submission_id: submission.id, item_id: itemId, answer: value,
    }], { onConflict: 'submission_id,item_id' })
      .then(({ error }) => ({ error }))
      .catch((err) => ({ error: err }))
      .then((result) => {
        // Only clear the map if this write is still the latest one for
        // this item — an older write settling after a newer one started
        // must not delete the newer write's still-in-flight entry.
        if (pendingWrites.current[itemId] === selfPromise) delete pendingWrites.current[itemId];

        // The student has moved to another worksheet since this write began.
        // It still completed against the right submission, but recording its
        // outcome now would attach it to a worksheet it has nothing to do with.
        if (gen !== saveGenRef.current) {
          if (result.error) {
            console.warn('Answer save failed after leaving the worksheet —', result.error.message);
            // Still tell them. The generation guard exists to stop a failure
            // in the worksheet they left from BLOCKING the one they opened —
            // not to hide it. Without this, typing the last line of an essay
            // and clicking Back would lose it in silence.
            showToast('An answer in the worksheet you just left could not be saved.', 'error');
          }
          return result;
        }

        if (result.error) {
          failedWrites.current[itemId] = true;
          console.warn('Answer save failed —', result.error.message);
          if (!silent) showToast('Could not save that answer. Check your connection.', 'error');
        } else {
          delete failedWrites.current[itemId];
        }
        return result;
      });
    pendingWrites.current[itemId] = selfPromise;
    return selfPromise;
  }, [submission, showToast]);

  // Saved as the student works — this project's hosting tier drops
  // connections, and losing a half-finished worksheet would be worse than
  // an extra write per answer.
  const saveAnswer = useCallback((itemId, value) => {
    setAnswers(prev => ({ ...prev, [itemId]: value }));
    if (saveTimers.current[itemId]) {
      clearTimeout(saveTimers.current[itemId].timer);
      delete saveTimers.current[itemId];
    }
    writeAnswer(itemId, value);
  }, [writeAnswer]);

  // Debounced save-on-change for free-typed answers (identification,
  // enumeration, essay). A write per keystroke would storm the connection
  // pool this project's hosting tier already struggles with, so the write
  // waits for a short pause in typing — but text typed and never blurred
  // (leaving via the sidebar, closing the tab) is no longer silently lost.
  const debouncedSaveAnswer = useCallback((itemId, value) => {
    setAnswers(prev => ({ ...prev, [itemId]: value }));
    if (saveTimers.current[itemId]) clearTimeout(saveTimers.current[itemId].timer);
    // `run` lets the flush and the worksheet-switch reset fire this same
    // pending write immediately, with the value and submission captured here
    // rather than whatever is current when they call it.
    const run = (opts) => {
      delete saveTimers.current[itemId];
      return writeAnswer(itemId, value, opts);
    };
    saveTimers.current[itemId] = { timer: setTimeout(() => run(), TYPING_SAVE_DEBOUNCE_MS), run };
  }, [writeAnswer]);

  // Flushes every pending debounced save and waits for every write
  // currently in flight to settle. Submitting blurs the focused field,
  // which fires its own save — but that save and the status UPDATE below
  // would otherwise race as two independent requests; if the UPDATE won,
  // submission_open() would already be false and the student's last
  // answer would be rejected with no way to recover it, since the
  // submission is now read-only. This makes submit() wait the extra
  // moment instead.
  //
  // Failure is judged from failedWrites, not from the settled outcomes of
  // this call's own Promise.all: pendingWrites only ever holds writes that
  // are still running, so a write that failed minutes ago (and was never
  // retried) must not silently re-fail every later submit attempt forever
  // — only an item whose most recent write is still in the failed state
  // blocks submission, and answering that item again (which fires a new
  // write and clears the flag on success) is what un-blocks it.
  const flushPendingSaves = useCallback(async () => {
    Object.values(saveTimers.current).forEach(({ timer, run }) => {
      clearTimeout(timer);
      run({ silent: true });
    });
    await Promise.all(Object.values(pendingWrites.current));

    // Retry anything still marked failed, once, before judging. A transient
    // blip then heals itself with no action from the student — which matters
    // most for multiple choice and true/false, where "answer it again" is not
    // advice they can follow: re-clicking the option already selected fires no
    // change event, so there would be no way to clear the flag at all.
    const stale = Object.keys(failedWrites.current);
    if (stale.length > 0) {
      await Promise.all(stale.map((itemId) => writeAnswer(itemId, answers[itemId], { silent: true })));
    }

    const failedIds = Object.keys(failedWrites.current);
    if (failedIds.length === 0) return { ok: true };

    const label = (itemId) => {
      const idx = items.findIndex((i) => i.id === itemId);
      return idx === -1 ? 'One of your answers' : `Question ${idx + 1}`;
    };
    const extra = failedIds.length - 1;
    const message = extra > 0
      ? `${label(failedIds[0])} and ${extra} other answer${extra > 1 ? 's' : ''} could not be saved — answer ${extra > 1 ? 'them' : 'it'} again, then submit.`
      : `${label(failedIds[0])} could not be saved — answer it again, then submit.`;
    return { ok: false, message };
  }, [answers, items, writeAnswer]);

  const submit = async () => {
    setBusy(true);
    try {
      const flushResult = await flushPendingSaves();
      if (!flushResult.ok) {
        showToast(flushResult.message, 'error');
        return;
      }
      // submitted_at is stamped server-side by guard_worksheet_submission_write
      // (in_progress -> submitted); a student is not allowed to set it, and
      // sending it here would be pointless even though the trigger overwrites it.
      const { error } = await supabase.from('worksheet_submissions').update({
        status: 'submitted',
      }).eq('id', submission.id);
      if (error) {
        showToast(toStudentMessage(error, 'Could not submit. Check your connection and try again.'), 'error');
        return;
      }
      showToast('Submitted. Your teacher will check it.');
      setSubmission(prev => prev ? { ...prev, status: 'submitted' } : prev);
      setActive(null);
      fetchTasks();
    } finally {
      // Always released, even if flushPendingSaves or the update throws
      // unexpectedly — otherwise the button is stuck reading "Submitting…"
      // forever with no toast telling the student anything went wrong.
      setBusy(false);
    }
  };

  const statusLabel = (row) => {
    const s = row.submission;
    if (!s) return 'Not started';
    // The release gate: a score, however it is phrased, may only appear once
    // released is true — never before, regardless of status.
    if (s.released) return `${s.score}/${s.total_points}`;
    if (s.status === 'submitted' || s.status === 'checked') return 'Submitted — awaiting result';
    return 'In progress';
  };

  if (active) {
    const done = submission?.status !== 'in_progress';
    return (
      <div className="p-6">
        <Toast />
        <button onClick={() => { resetSaveState(); setActive(null); }} className="text-sm mb-4" style={muted}>← Back</button>
        <h1 className="text-xl font-bold mb-1" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{active.sheet.title}</h1>
        <p className="text-xs mb-4" style={muted}>{active.subjectName || active.sheet.subject}</p>

        {items.length === 0 ? (
          <Card className="p-6 text-center">
            <p style={muted}>This worksheet has no questions to answer in the app. Download it from your teacher instead.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((it, index) => (
              <Card key={it.id} className="p-4">
                <p className="text-sm font-medium mb-2" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                  {index + 1}. {it.question} <span className="text-xs" style={muted}>({it.points} pts)</span>
                </p>

                {/* Disabled on `busy` too, not just `done`: submit() awaits
                    a flush that can take a real moment on a congested pool,
                    and an answer changed during that window would otherwise
                    fire a write that races the status UPDATE exactly like
                    the bug this flush was built to fix. */}
                {it.item_type === 'multiple_choice' && (it.options || []).map(opt => (
                  <label key={opt} className="flex items-center gap-2 text-sm py-1" style={{ color: dark ? '#cbd5e1' : '#374151' }}>
                    <input type="radio" name={it.id} disabled={done || busy} checked={answers[it.id] === opt}
                      onChange={() => saveAnswer(it.id, opt)} />
                    {opt}
                  </label>
                ))}

                {/* Submitted as exactly "True"/"False" — TRUE_FALSE_VALUES,
                    not retyped — because that is what the teacher's key
                    stores those two options as. */}
                {it.item_type === 'true_false' && TRUE_FALSE_VALUES.map(opt => (
                  <label key={opt} className="flex items-center gap-2 text-sm py-1" style={{ color: dark ? '#cbd5e1' : '#374151' }}>
                    <input type="radio" name={it.id} disabled={done || busy} checked={answers[it.id] === opt}
                      onChange={() => saveAnswer(it.id, opt)} />
                    {opt}
                  </label>
                ))}

                {it.item_type === 'identification' && (
                  <input type="text" disabled={done || busy} defaultValue={answers[it.id] || ''}
                    onChange={e => debouncedSaveAnswer(it.id, e.target.value)}
                    onBlur={e => saveAnswer(it.id, e.target.value)}
                    className="w-full h-9 px-3 rounded-lg text-sm outline-none"
                    style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc',
                             border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
                             color: dark ? '#f1f5f9' : '#1a2b4a' }} />
                )}

                {it.item_type === 'enumeration' && (
                  <textarea disabled={done || busy} rows={3}
                    defaultValue={Array.isArray(answers[it.id]) ? answers[it.id].join('\n') : ''}
                    onChange={e => debouncedSaveAnswer(it.id, e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
                    onBlur={e => saveAnswer(it.id, e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
                    placeholder="One answer per line"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc',
                             border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
                             color: dark ? '#f1f5f9' : '#1a2b4a' }} />
                )}

                {it.item_type === 'essay' && (
                  <textarea disabled={done || busy} rows={5} defaultValue={answers[it.id] || ''}
                    onChange={e => debouncedSaveAnswer(it.id, e.target.value)}
                    onBlur={e => saveAnswer(it.id, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc',
                             border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
                             color: dark ? '#f1f5f9' : '#1a2b4a' }} />
                )}
              </Card>
            ))}

            {!done && (
              <button onClick={submit} disabled={busy}
                className="h-10 px-5 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: '#1908DF', color: '#fff' }}>
                {busy ? 'Submitting…' : 'Submit'}
              </button>
            )}
            {done && <p className="text-sm" style={muted}>Submitted. You cannot change your answers now.</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      <Toast />
      <div className="flex items-center justify-between mb-6 rounded-lg px-4 py-3"
        style={{ background: 'var(--banner-bg)', border: '1px solid var(--banner-border)' }}>
        <h1 className="text-xl font-bold" style={{ color: 'var(--banner-text)' }}>Tasks</h1>
        <button onClick={fetchTasks} className="p-1.5 rounded-lg" style={muted}><RefreshCw size={16} /></button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" size={32} style={muted} /></div>
      ) : loadError ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-semibold mb-2" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Could not load your tasks.</p>
          <p className="text-sm mb-3" style={muted}>Check your connection and try again.</p>
          <button onClick={fetchTasks} className="h-9 px-4 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: '#1908DF', color: '#fff' }}>Retry</button>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText size={40} className="mx-auto mb-3" style={{ color: dark ? '#334155' : '#cbd5e1' }} />
          <p style={muted}>No tasks have been assigned to you yet.</p>
        </Card>
      ) : visibleRows.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText size={40} className="mx-auto mb-3" style={{ color: dark ? '#334155' : '#cbd5e1' }} />
          <p style={muted}>No tasks match this subject.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleRows.map(row => {
            const countdown = formatCountdown(row.assignee.due_at, now);
            const countdownColors = COUNTDOWN_COLORS[countdown.tone] || COUNTDOWN_COLORS.none;
            const typeLabel = TASK_TYPE_LABELS[row.sheet.task_type] || 'Task';
            return (
              <Card key={row.assignee.task_id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{row.sheet.title}</p>
                    <Badge color="#7c3aed" bg="rgba(124,58,237,0.12)">{typeLabel}</Badge>
                  </div>
                  <p className="text-xs" style={muted}>{row.subjectName || row.sheet.subject}</p>
                  {row.assignee.assigned_at && (
                    <p className="text-xs flex items-center gap-1 mt-1" style={muted}>
                      <CalendarClock size={12} /> Assigned {new Date(row.assignee.assigned_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                  {row.assignee.due_at && (
                    <p className="text-xs flex items-center gap-1 mt-1" style={muted}>
                      <Clock size={12} /> Due {new Date(row.assignee.due_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                    <Badge color={countdownColors.color} bg={countdownColors.bg}>{countdown.text}</Badge>
                    <Badge color="#2563eb" bg="rgba(37,99,235,0.12)">{statusLabel(row)}</Badge>
                  </div>
                  <button onClick={() => open(row)} disabled={busy}
                    className="block mt-2 text-xs font-semibold" style={{ color: '#1908DF' }}>
                    {row.submission ? 'Open' : 'Start'}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentTasksTab;
