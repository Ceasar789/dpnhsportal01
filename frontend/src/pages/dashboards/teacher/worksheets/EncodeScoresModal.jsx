// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/EncodeScoresModal.jsx
// The paper path: the class answered on paper, the teacher types the marks.
// Saves as source = 'manual' with no per-item answers.
//
// There is no per-item review here because there is nothing to review — the
// teacher is attesting to the total themselves. Two things therefore get
// extra care on this screen:
//
//  1. The class list is a READ. A failed one must never render as "this
//     section has no students": a teacher who believes that will go and
//     re-add a class that is already enrolled. A failed read gets its own
//     red state with a working Retry; a genuinely empty section says so in
//     its own words.
//  2. Encoding a class is many single-row writes with no transaction. One
//     failing does not roll the others back, and it does not stop the run
//     either — every student is attempted, and the ones that failed are
//     named, per row, with the modal held open so the teacher sees exactly
//     which marks are on record and which are not.
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal, Btn } from '../shared/ui';
import { useTheme } from '../hooks';
import { round2 } from '../../../../lib/worksheetChecking';
import useDialogSafety from './useDialogSafety';

const sameScoreMap = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(key => a[key] === b[key]);
};

const EncodeScoresModal = ({
  worksheet, postings, sections, loadClassList, loadSubmissions, encodeManualScore, onClose, onSaved,
}) => {
  const { dark } = useTheme();
  const posted = postings.filter(p => p.worksheet_id === worksheet.id);

  const [sectionId, setSectionId] = useState(posted[0]?.section_id || '');
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState({});
  const [loadedScores, setLoadedScores] = useState({});
  // student_id -> the submission already on record, so an online submission
  // can be flagged before the teacher types anything into that row.
  const [existing, setExisting] = useState({});
  const [totalPoints, setTotalPoints] = useState('');
  const [loadedTotalPoints, setLoadedTotalPoints] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);   // { done, total } while saving
  const [pendingStudentId, setPendingStudentId] = useState(null);
  // student_id -> the last write result for that row ({ ok, reason, message }).
  const [rowResult, setRowResult] = useState({});
  // student_ids whose existing ONLINE submission the teacher has explicitly
  // agreed to replace with a paper total.
  const [overwrite, setOverwrite] = useState({});
  const [summary, setSummary] = useState(null);
  const partialWrites = summary?.tone === 'error' && Object.values(rowResult).some(result => result?.ok);
  const dirty = sectionId !== (posted[0]?.section_id || '')
    || totalPoints !== loadedTotalPoints || !sameScoreMap(scores, loadedScores)
    || Object.values(overwrite).some(Boolean) || partialWrites;
  const { requestClose, routeBlocker, busyNotice } = useDialogSafety({
    dirty, pending: saving, onClose,
    discardMessage: partialWrites
      ? 'Some scores were already saved and released. Closing will discard the remaining edits and row results; saved scores will not be undone. Close?'
      : 'Discard unsaved score changes?',
  });

  const aliveRef = useRef(true);

  const muted = { color: 'var(--text-muted)' };
  const bodyText = { color: 'var(--text)' };
  const fieldStyle = {
    backgroundColor: 'var(--card2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
  };

  const attemptLoad = useCallback(async () => {
    if (!sectionId) { setStudents([]); setExisting({}); return; }
    setLoading(true);
    setLoadFailed(false);
    const [list, subs] = await Promise.all([
      loadClassList(sectionId),
      loadSubmissions(worksheet.id),
    ]);
    if (!aliveRef.current) return;
    // Both loaders return null (never [] / {}) on failure, precisely so this
    // branch can exist.
    if (!list || !subs) { setLoadFailed(true); setLoading(false); return; }

    setStudents(list);
    // Show what is already recorded so the teacher is editing, not guessing.
    const byStudent = {};
    const prefilled = {};
    subs.forEach(s => {
      byStudent[s.student_id] = s;
      // Only a previous PAPER score is prefilled. Prefilling an online one
      // made every run report failures the teacher never asked for — they
      // typed nothing for those students, yet the rows were attempted and
      // refused — and the only way to clear the red was to tick "replace",
      // which converts a genuine online submission to manual carrying a score
      // the teacher never entered. Online rows are shown and left alone.
      if (s.source !== 'online' && s.score !== null && s.score !== undefined) {
        prefilled[s.student_id] = String(s.score);
      }
    });
    setExisting(byStudent);
    setScores(prefilled);
    setLoadedScores(prefilled);
    setRowResult({});
    setOverwrite({});
    setSummary(null);
    const anyTotal = subs.find(s => s.total_points !== null && s.total_points !== undefined);
    const loadedTotal = anyTotal ? String(anyTotal.total_points) : '';
    setTotalPoints(loadedTotal);
    setLoadedTotalPoints(loadedTotal);
    setLoading(false);
  }, [sectionId, worksheet.id, loadClassList, loadSubmissions]);

  useEffect(() => {
    aliveRef.current = true;
    attemptLoad();
    return () => { aliveRef.current = false; };
  }, [attemptLoad]);

  const maxPoints = Number(totalPoints);
  const totalIsUsable = Number.isFinite(maxPoints) && maxPoints > 0;

  // What the teacher typed is kept EXACTLY as typed, and judged rather than
  // rewritten. Two reasons this is not a clamp-on-input:
  //
  //  - A number input fires onChange per character, so clamping would rewrite
  //    a value from its own prefixes. Retyping a total of 50 as 40 used to
  //    pass through "4" first and pull every score in the class down to 4 —
  //    silently, and then release it, with no un-release path.
  //  - An in-progress decimal like "12." reports as '' from a number input, so
  //    coercing on every keystroke threw the digits away while the box still
  //    showed them.
  //
  // The hook rejects an out-of-range or unparseable score before it writes, so
  // nothing invalid can reach the database. Here it is only flagged.
  const scoreProblem = (raw) => {
    const value = String(raw ?? '').trim();
    if (value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return 'Not a number';
    if (n < 0) return 'Below zero';
    if (totalIsUsable && n > maxPoints) return `Above the ${round2(maxPoints)} total`;
    return null;
  };

  const setScore = (studentId, value) => {
    setScores(p => ({ ...p, [studentId]: value }));
    // Editing a row retires whatever the last run said about it. Otherwise a
    // stale "Saved and released." sits under a number the teacher has since
    // changed, and a stale failure hides the validation flag on the row that
    // is now blocking the whole save.
    setRowResult(p => (p[studentId] === undefined ? p : { ...p, [studentId]: undefined }));
  };

  const changeTotal = (value) => setTotalPoints(value);

  const typedCount = students.filter(s => String(scores[s.student_id] ?? '').trim() !== '').length;
  const problemCount = students.filter(s => scoreProblem(scores[s.student_id])).length;

  const submit = async () => {
    if (!totalIsUsable) {
      setSummary({ tone: 'error', text: 'Set the total points first — a score needs something to be out of.' });
      return;
    }
    if (typedCount === 0) {
      setSummary({ tone: 'error', text: 'No scores typed yet. A blank box is left alone, not saved as zero.' });
      return;
    }
    // Refuse the whole run rather than releasing the good rows and reporting
    // the bad ones: every write here is released the moment it lands, so a
    // mistyped score is not something the teacher can take back.
    if (problemCount > 0) {
      setSummary({
        tone: 'error',
        text: `${problemCount} score${problemCount === 1 ? ' is' : 's are'} out of range or not a number — fix ${problemCount === 1 ? 'it' : 'them'} before saving. Nothing has been written.`,
      });
      return;
    }

    setSaving(true);
    setProgress({ done: 0, total: typedCount });
    setSummary(null);
    const results = {};
    let saved = 0;
    let failed = 0;
    let conflicts = 0;

    for (const s of students) {
      const raw = String(scores[s.student_id] ?? '').trim();
      if (raw === '') continue;   // blank means not yet scored
      if (aliveRef.current) setPendingStudentId(s.student_id);
      const result = await encodeManualScore(
        worksheet.id, sectionId, s.student_id, raw, totalPoints,
        { overwriteOnline: !!overwrite[s.student_id] }
      );
      results[s.student_id] = result;
      if (result.ok) saved += 1;
      else {
        failed += 1;
        if (result.reason === 'online-conflict') conflicts += 1;
      }
      // Each write is a separate round trip, and on a congested pool the run
      // can take minutes. A button reading only "Saving…" for that long looks
      // like a hang.
      if (aliveRef.current) setProgress({ done: saved + failed, total: typedCount });
    }

    if (!aliveRef.current) return;
    setRowResult(results);
    setSaving(false);
    setProgress(null);
    setPendingStudentId(null);

    if (failed === 0) {
      onSaved?.(`Saved and released ${saved} ${saved === 1 ? 'score' : 'scores'}.`);
      onClose();
      return;
    }

    if (saved === 0 && Object.values(results).every(result => result.reason === 'unavailable')) {
      setSummary({ tone: 'error', text: 'Paper score saving and release are unavailable. Nothing was saved or released.' });
      return;
    }

    // Deliberately stays open. These writes are one row each with no
    // transaction, so the ones that succeeded are already released to those
    // students — saying "could not save" and closing would leave the teacher
    // thinking nothing was written.
    setSummary({
      tone: 'error',
      text: `Saved ${saved} of ${saved + failed}. ${failed} could not be saved — each one is marked below. ` +
        `The ${saved} that saved are already released to those students; nothing was undone.` +
        (conflicts > 0
          ? ` ${conflicts} of them already answered this worksheet in the app — tick "replace" on those rows if the paper total should win.`
          : ''),
    });
  };

  const rowNote = (studentId) => {
    const result = rowResult[studentId];
    if (result?.ok) return { color: '#16a34a', text: 'Saved and released.' };
    if (result) return { color: '#dc2626', text: result.message };
    // Typed-but-invalid is flagged here rather than rewritten in the box, so
    // the teacher sees what they actually entered and fixes it themselves.
    const problem = scoreProblem(scores[studentId]);
    if (problem) return { color: '#dc2626', text: `${problem} — this row will not be saved.` };
    const sub = existing[studentId];
    // Only a FINISHED online submission is worth warning about. A row with
    // status 'in_progress' just means the student opened the worksheet; it
    // carries no answers to lose, so encoding a paper score over it is not a
    // decision the teacher needs to be stopped for.
    if (sub && sub.source === 'online' && (sub.status !== 'in_progress' || sub.hasAnswers)) {
      return {
        color: '#d97706',
        text: sub.released
          ? `Answered in the app — already released as ${sub.score}/${sub.total_points}.`
          : 'Answered in the app — that submission is still waiting to be checked.',
      };
    }
    if (sub && sub.source === 'manual' && sub.score !== null && sub.score !== undefined) {
      return { color: dark ? '#64748b' : '#94a3b8', text: `Already encoded as ${sub.score}/${sub.total_points}.` };
    }
    return null;
  };

  return (
    <>{routeBlocker}<Modal title={`Encode scores — ${worksheet.title}`} onClose={requestClose} size="max-w-2xl">
      <div className="flex flex-col gap-3">
        {busyNotice && <p role="status" className="text-sm">{busyNotice}</p>}
        {posted.length === 0 ? (
          <p className="text-sm" style={muted}>
            Post this worksheet to a section first — there is no class to score yet.
          </p>
        ) : (
          <>
            <p className="text-xs" style={muted}>
              For a class that answered on paper. Saving and release are unavailable until
              trusted Teacher authorization is connected. Leave a box blank for anyone
              you have not marked yet; blank is never saved as zero.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              {/* Both locked while a run is in flight: changing either mid-run
                  reloads the list underneath the loop, so the per-row results
                  land on the wrong names. */}
              <label className="flex flex-col gap-1 flex-1 min-w-0 text-xs font-medium" style={bodyText}>
                Section
                <select value={sectionId} disabled={saving} onChange={e => setSectionId(e.target.value)}
                  className="min-h-11 px-2 rounded text-sm w-full min-w-0" style={fieldStyle}>
                  <option value="">Select section…</option>
                  {posted.map(p => (
                    <option key={p.id} value={p.section_id}>
                      {sections.find(s => s.id === p.section_id)?.name || 'Section'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 w-full sm:w-32 text-xs font-medium" style={bodyText}>
                Total points
                <input type="number" min="1" step="1" placeholder="Total points"
                  value={totalPoints} disabled={saving} onChange={e => changeTotal(e.target.value)}
                  className="min-h-11 w-full px-2 rounded text-sm" style={fieldStyle} />
              </label>
            </div>

            {summary && (
              <p role={summary.tone === 'error' ? 'alert' : 'status'} className="text-xs font-semibold" style={{ color: summary.tone === 'error' ? '#dc2626' : '#16a34a' }}>
                {summary.text}
              </p>
            )}

            {!sectionId ? (
              <p className="text-sm py-4" style={muted}>Pick a section to load its class list.</p>
            ) : loading ? (
              <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm" style={muted}><Loader2 className="animate-spin" size={20} aria-hidden="true" />Loading class list…</div>
            ) : loadFailed ? (
              <div role="alert" className="flex flex-col items-center gap-3 py-6 text-sm text-center" style={{ color: 'var(--red)' }}>
                <p>
                  Could not load this section's class list. This is a failed read, not an
                  empty class — no scores can be encoded until it loads.
                </p>
                <button onClick={attemptLoad} className="underline font-semibold" style={{ color: '#dc2626' }}>
                  Retry
                </button>
              </div>
            ) : students.length === 0 ? (
              <p className="text-sm py-4" style={muted}>
                This section's class list loaded, and it really is empty — no active students
                are enrolled in it yet. Add them in Class List first.
              </p>
            ) : (
              <div role="list" aria-label="Students to score" className="flex flex-col gap-1">
              {students.map((s, i) => {
                const note = rowNote(s.student_id);
                const conflicted = rowResult[s.student_id]?.reason === 'online-conflict'
                  || (existing[s.student_id]?.source === 'online'
                      && (existing[s.student_id]?.status !== 'in_progress'
                          || existing[s.student_id]?.hasAnswers));
                return (
                  <div role="listitem" key={s.student_id} className="flex flex-col gap-1 px-3 py-3 rounded-lg min-w-0"
                    style={{ border: '1px solid var(--border)', backgroundColor: 'var(--card-bg)' }}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0">
                      <span className="text-sm font-medium flex-1 min-w-0 break-words" style={bodyText}>{i + 1}. {s.name}</span>
                      <div className="flex items-center gap-2">
                      {/* text, not number: a number input in its bad-input
                          state hands back '' for an in-progress "12.", so the
                          box showed 12. while the state held nothing and the
                          row was skipped at save with no explanation. Now the
                          raw string survives and scoreProblem judges it. */}
                      <input type="text" inputMode="decimal" aria-label={`Score for ${s.name}`} aria-invalid={Boolean(scoreProblem(scores[s.student_id]))}
                        aria-describedby={note ? `score-note-${s.student_id}` : undefined} disabled={saving}
                        value={scores[s.student_id] ?? ''}
                        onChange={e => setScore(s.student_id, e.target.value)}
                        className="min-h-11 w-20 px-2 rounded text-sm" style={fieldStyle} />
                      <span className="text-xs" style={muted}>/ {totalIsUsable ? maxPoints : '—'}</span>
                      </div>
                    </div>
                    {pendingStudentId === s.student_id && <p role="status" className="text-xs" style={muted}>Saving this row…</p>}
                    {note && (
                      <p id={`score-note-${s.student_id}`} className="text-xs break-words" style={{ color: note.color }}>{note.text}</p>
                    )}
                    {conflicted && !rowResult[s.student_id]?.ok && (
                      <label className="text-xs flex items-start gap-2" style={{ color: '#d97706' }}>
                        <input type="checkbox" checked={!!overwrite[s.student_id]} disabled={saving}
                          aria-label={`Replace ${s.name}'s online submission with this paper score`}
                          onChange={e => setOverwrite(p => ({ ...p, [s.student_id]: e.target.checked }))} />
                        Replace their online submission with this paper score
                      </label>
                    )}
                  </div>
                );
              })
              }
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {!loading && !loadFailed && students.length > 0 && (
                <span className="text-xs mr-auto" style={problemCount > 0 ? { color: '#dc2626' } : muted}>
                  {typedCount} of {students.length} scored
                  {problemCount > 0 && ` · ${problemCount} need${problemCount === 1 ? 's' : ''} fixing`}
                </span>
              )}
              <Btn variant="outline" onClick={requestClose}>Close</Btn>
              <Btn variant="primary" onClick={submit}
                disabled={loading || loadFailed || students.length === 0} busy={saving}>
                {saving
                  ? (progress ? `Saving ${progress.done} of ${progress.total}…` : 'Saving…')
                  : 'Save scores'}
              </Btn>
            </div>
          </>
        )}
      </div>
    </Modal></>
  );
};

export default EncodeScoresModal;
