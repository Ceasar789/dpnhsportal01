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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal, Btn } from '../shared/ui';
import { useTheme } from '../hooks';
import { round2 } from '../../../../lib/worksheetChecking';

const EncodeScoresModal = ({
  worksheet, postings, sections, loadClassList, loadSubmissions, encodeManualScore, onClose,
}) => {
  const { dark } = useTheme();
  const posted = postings.filter(p => p.worksheet_id === worksheet.id);

  const [sectionId, setSectionId] = useState(posted[0]?.section_id || '');
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState({});
  // student_id -> the submission already on record, so an online submission
  // can be flagged before the teacher types anything into that row.
  const [existing, setExisting] = useState({});
  const [totalPoints, setTotalPoints] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  // student_id -> the last write result for that row ({ ok, reason, message }).
  const [rowResult, setRowResult] = useState({});
  // student_ids whose existing ONLINE submission the teacher has explicitly
  // agreed to replace with a paper total.
  const [overwrite, setOverwrite] = useState({});
  const [summary, setSummary] = useState(null);

  const aliveRef = useRef(true);

  const muted = { color: dark ? '#64748b' : '#94a3b8' };
  const bodyText = { color: dark ? '#f1f5f9' : '#1a2b4a' };
  const fieldStyle = {
    backgroundColor: dark ? '#0f172a' : '#f8fafc',
    border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
    color: dark ? '#f1f5f9' : '#1a2b4a',
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
      if (s.score !== null && s.score !== undefined) prefilled[s.student_id] = String(s.score);
    });
    setExisting(byStudent);
    setScores(prefilled);
    setRowResult({});
    setOverwrite({});
    setSummary(null);
    const anyTotal = subs.find(s => s.total_points !== null && s.total_points !== undefined);
    if (anyTotal) setTotalPoints(String(anyTotal.total_points));
    setLoading(false);
  }, [sectionId, worksheet.id, loadClassList, loadSubmissions]);

  useEffect(() => {
    aliveRef.current = true;
    attemptLoad();
    return () => { aliveRef.current = false; };
  }, [attemptLoad]);

  const maxPoints = Number(totalPoints);
  const totalIsUsable = Number.isFinite(maxPoints) && maxPoints > 0;

  // The number input's min/max only constrain its steppers — a typed "550"
  // goes straight through to a DECIMAL(6,2) column that will store it. The
  // hook rejects an out-of-range score as well; this is the copy of the guard
  // that stops the teacher typing it in the first place.
  const clamp = (value, max) => {
    if (value === '' || value === null || value === undefined) return '';
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    const upper = Number.isFinite(max) && max > 0 ? max : n;
    return String(round2(Math.min(Math.max(n, 0), upper)));
  };

  const setScore = (studentId, value) => {
    setScores(p => ({ ...p, [studentId]: clamp(value, maxPoints) }));
  };

  // Lowering the total has to pull every already-typed score down with it,
  // or the boxes would still show marks above a total they can no longer
  // reach and the save would reject each one individually.
  const changeTotal = (value) => {
    setTotalPoints(value);
    const max = Number(value);
    if (!Number.isFinite(max) || max <= 0) return;
    setScores(p => Object.fromEntries(
      Object.entries(p).map(([id, v]) => [id, v === '' ? '' : clamp(v, max)])
    ));
  };

  const typedCount = students.filter(s => (scores[s.student_id] ?? '') !== '').length;

  const submit = async () => {
    if (!totalIsUsable) {
      setSummary({ tone: 'error', text: 'Set the total points first — a score needs something to be out of.' });
      return;
    }
    if (typedCount === 0) {
      setSummary({ tone: 'error', text: 'No scores typed yet. A blank box is left alone, not saved as zero.' });
      return;
    }

    setSaving(true);
    setSummary(null);
    const results = {};
    let saved = 0;
    let failed = 0;
    let conflicts = 0;

    for (const s of students) {
      const raw = scores[s.student_id];
      if (raw === undefined || raw === '') continue;   // blank means not yet scored
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
    }

    if (!aliveRef.current) return;
    setRowResult(results);
    setSaving(false);

    if (failed === 0) {
      onClose();
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
    const sub = existing[studentId];
    if (sub && sub.source === 'online') {
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
    <Modal title={`Encode scores — ${worksheet.title}`} onClose={onClose} size="max-w-2xl">
      <div className="flex flex-col gap-3">
        {posted.length === 0 ? (
          <p className="text-sm" style={muted}>
            Post this worksheet to a section first — there is no class to score yet.
          </p>
        ) : (
          <>
            <p className="text-xs" style={muted}>
              For a class that answered on paper. A score saved here is released to the
              student immediately — there are no per-item answers to review. Leave a box
              blank for anyone you have not marked yet; blank is never saved as zero.
            </p>

            <div className="flex gap-2">
              <select value={sectionId} onChange={e => setSectionId(e.target.value)}
                className="h-9 px-2 rounded text-sm outline-none flex-1" style={fieldStyle}>
                <option value="">Select section…</option>
                {posted.map(p => (
                  <option key={p.id} value={p.section_id}>
                    {sections.find(s => s.id === p.section_id)?.name || 'Section'}
                  </option>
                ))}
              </select>
              <input type="number" min="1" step="1" placeholder="Total points"
                value={totalPoints} onChange={e => changeTotal(e.target.value)}
                className="h-9 w-32 px-2 rounded text-sm outline-none" style={fieldStyle} />
            </div>

            {summary && (
              <p className="text-xs font-semibold" style={{ color: summary.tone === 'error' ? '#dc2626' : '#16a34a' }}>
                {summary.text}
              </p>
            )}

            {!sectionId ? (
              <p className="text-sm py-4" style={muted}>Pick a section to load its class list.</p>
            ) : loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>
            ) : loadFailed ? (
              <div className="flex flex-col items-center gap-3 py-6 text-sm text-center" style={{ color: '#dc2626' }}>
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
              students.map((s, i) => {
                const note = rowNote(s.student_id);
                const conflicted = rowResult[s.student_id]?.reason === 'online-conflict'
                  || (existing[s.student_id]?.source === 'online');
                return (
                  <div key={s.student_id} className="flex flex-col gap-1 py-1"
                    style={{ borderBottom: `1px solid ${dark ? '#334155' : '#f1f5f9'}` }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs w-6" style={muted}>{i + 1}</span>
                      <span className="text-sm flex-1" style={bodyText}>{s.name}</span>
                      <input type="number" min="0" max={totalIsUsable ? maxPoints : undefined} step="0.5"
                        value={scores[s.student_id] ?? ''}
                        onChange={e => setScore(s.student_id, e.target.value)}
                        className="h-8 w-20 px-2 rounded text-xs outline-none" style={fieldStyle} />
                      <span className="text-xs" style={muted}>/ {totalIsUsable ? maxPoints : '—'}</span>
                    </div>
                    {note && (
                      <p className="text-[11px] ml-9" style={{ color: note.color }}>{note.text}</p>
                    )}
                    {conflicted && !rowResult[s.student_id]?.ok && (
                      <label className="text-[11px] ml-9 flex items-center gap-2" style={{ color: '#d97706' }}>
                        <input type="checkbox" checked={!!overwrite[s.student_id]}
                          onChange={e => setOverwrite(p => ({ ...p, [s.student_id]: e.target.checked }))} />
                        Replace their online submission with this paper score
                      </label>
                    )}
                  </div>
                );
              })
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {!loading && !loadFailed && students.length > 0 && (
                <span className="text-xs mr-auto" style={muted}>
                  {typedCount} of {students.length} scored
                </span>
              )}
              <Btn onClick={onClose}>Close</Btn>
              <Btn variant="primary" onClick={submit}
                disabled={saving || loading || loadFailed || students.length === 0}>
                {saving ? 'Saving…' : 'Save scores'}
              </Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default EncodeScoresModal;
