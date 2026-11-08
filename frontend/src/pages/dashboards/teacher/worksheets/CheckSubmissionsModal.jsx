// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/CheckSubmissionsModal.jsx
// Reviews one student's answers and releases the score. Auto-check runs here,
// in the teacher's browser, because this is the only place the answer key is
// legitimately available.
//
// The release gate: a student sees nothing until worksheet_submissions.released
// is true (enforced by RLS/the app elsewhere), and releaseScore only sets that
// flag after this screen's own local gate — every item must carry a mark the
// teacher has actually looked at — is satisfied. Auto mode pre-fills that mark
// so satisfying the gate is instant; essay items and items with no answer key
// are left blank on purpose, because nothing here could have scored them.
//
// Overriding one item is a single click (the Correct/Wrong buttons set the
// mark to full/zero points immediately) or a one-field edit for partial
// credit — never a multi-step flow — because a tedious override is the
// failure mode the whole review screen exists to prevent: a teacher who
// finds it tedious will stop reading and just release.
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Check, X as XIcon } from 'lucide-react';
import { Modal, Btn } from '../shared/ui';
import { useTheme } from '../hooks';
import { scoreSubmission, round2 } from '../../../../lib/worksheetChecking';
import useDialogSafety from './useDialogSafety';

// The marks one release sends, for Release and Release all alike.
const perItemMarks = (items, keys, marks) => items.map(i => {
  const unscorable = i.item_type === 'essay' || keys[i.id] === undefined;
  const earned = Number(marks[i.id]) || 0;
  const max = Number(i.points) || 0;
  // A zero-point item is not "correct" just because 0 >= 0.
  return { item_id: i.id, isCorrect: unscorable ? null : (max > 0 && earned >= max), pointsEarned: earned };
});

const BULK_WARNING = 'Auto-check can mark valid answers wrong on open-ended questions such as enumeration. Open a submission to review it before releasing.';
const BULK_UNCONFIRMED = 'Could not confirm the release. Check the submission and try again.';

// An answer or key as readable text: a list (enumeration) shows one entry per line.
const answerText = value => (Array.isArray(value) ? value.filter(v => String(v).trim()).join('\n')
  : value === null || value === undefined ? '' : String(value));
const boxClass = 'mt-1 rounded-lg border px-3 py-2 text-sm break-words whitespace-pre-wrap';

const sameMarks = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(key => a[key] === b[key]);
};

const CheckSubmissionsModal = ({
  worksheet, loadItems, loadSubmissions, loadAnswers, releaseScore, onClose,
}) => {
  const { dark } = useTheme();
  const [submissions, setSubmissions] = useState([]);
  const [items, setItems] = useState([]);
  const [keys, setKeys] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [active, setActive] = useState(null);
  const [answers, setAnswers] = useState({});
  const [answersFailed, setAnswersFailed] = useState(false);
  const [answersLoading, setAnswersLoading] = useState(false);
  const [marks, setMarks] = useState({});
  const [feedback, setFeedback] = useState({});
  const [loadedMarks, setLoadedMarks] = useState({});
  // Per item: 'auto-correct' | 'auto-incorrect' | 'unscorable' | 'manual'.
  // Fixed at load time from the auto-checker's verdict (or the lack of one),
  // so the card's colour keeps showing what the machine found even after the
  // teacher overrides the number — only the small "auto" tag disappears.
  const [cardState, setCardState] = useState({});
  const [autoScored, setAutoScored] = useState({});
  const [saving, setSaving] = useState(false);
  const [releaseError, setReleaseError] = useState(false);
  const [reviewApproved, setReviewApproved] = useState(false);
  // Release all: null, or { phase: 'checking' | 'confirm' | 'running' | 'done', ... }.
  const [bulk, setBulk] = useState(null);
  const bulkRef = useRef({ cancelled: false, running: false });
  const { requestClose, routeBlocker, busyNotice } = useDialogSafety({
    dirty: Boolean(active) && (!sameMarks(marks, loadedMarks) || Object.values(feedback).some(Boolean)),
    pending: saving || bulk?.phase === 'running', onClose,
  });

  const isAuto = worksheet.checking_mode === 'auto';

  const aliveRef = useRef(true);

  const attemptLoad = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    const [itemResult, subs] = await Promise.all([
      loadItems(worksheet.id),
      loadSubmissions(worksheet.id),
    ]);
    if (!aliveRef.current) return;
    if (!itemResult || !subs) { setLoadFailed(true); setLoading(false); return; }
    setItems(itemResult.items);
    setKeys(itemResult.keys);
    setSubmissions(subs);
    setLoading(false);
  }, [worksheet.id, loadItems, loadSubmissions]);

  useEffect(() => {
    aliveRef.current = true;
    attemptLoad();
    return () => { aliveRef.current = false; };
  }, [attemptLoad]);

  // Every open gets a token. A slow answers fetch for one student must never
  // land after the teacher has moved to another: the screen would show B's
  // name above A's answers, and releasing would write A's marks against B's
  // submission id. Comparing against `active` cannot work — it is stale in
  // this closure — so the comparison is against a ref.
  const openTokenRef = useRef(0);

  const openSubmission = async (sub) => {
    const token = ++openTokenRef.current;
    setActive(sub);
    setMarks({});
    setFeedback({});
    setLoadedMarks({});
    setAutoScored({});
    setCardState({});
    setAnswersFailed(false);
    setReleaseError(false);
    setReviewApproved(false);
    setAnswersLoading(true);
    setAnswers({});

    const loaded = await loadAnswers(sub.id);
    if (!aliveRef.current || openTokenRef.current !== token) return;
    setAnswersLoading(false);
    if (!loaded) { setAnswersFailed(true); return; }
    const { answers: loadedAnswers, prior } = loaded;
    setAnswers(loadedAnswers);

    const states = {};
    const prefilled = {};
    const flagged = {};

    if (isAuto) {
      // `keys` is already `{ [item_id]: { correct_answer } }` — the row
      // shape scoreSubmission expects — so it is passed through as-is.
      // Re-wrapping it in another `{ correct_answer: ... }` here would score
      // every item against `undefined` and silently fail the whole class.
      const { perItem } = scoreSubmission(items, keys, loadedAnswers);
      perItem.forEach(r => {
        const item = items.find(i => i.id === r.item_id);
        if (r.pointsEarned !== null) {
          prefilled[r.item_id] = r.pointsEarned;
          flagged[r.item_id] = true;
          // A partly-right enumeration comes back isCorrect: false carrying
          // real points. Painting that red would contradict the number in the
          // box beside it, so partial credit gets its own state.
          // Matches how release() decides is_correct: a zero-point item is
          // not full credit, so it must not paint green either.
          const max = Number(item?.points ?? 0);
          const full = max > 0 && Number(r.pointsEarned) >= max;
          states[r.item_id] = r.isCorrect || full
            ? 'auto-correct'
            : (Number(r.pointsEarned) > 0 ? 'auto-partial' : 'auto-incorrect');
        } else {
          states[r.item_id] = item?.item_type === 'essay' ? 'essay' : 'unscorable';
        }
      });
    } else {
      items.forEach(it => {
        states[it.id] = it.item_type === 'essay' || keys[it.id] === undefined
          ? (it.item_type === 'essay' ? 'essay' : 'unscorable')
          : 'manual';
      });
    }

    // Marks already on record win over the checker's guess: they are what the
    // teacher approved last time, including any override they made.
    // Clamped like any other mark: these come from the database, so an
    // out-of-range value written by an older build or by hand would otherwise
    // be restored and re-released unchecked.
    Object.entries(prior).forEach(([itemId, pts]) => {
      prefilled[itemId] = clampMark(itemId, pts);
      flagged[itemId] = false;
    });

    setCardState(states);
    setMarks(prefilled);
    setLoadedMarks(prefilled);
    setAutoScored(flagged);
  };

  // The number input's min/max only constrain its steppers — a typed value
  // goes straight through. Without clamping, a fat-fingered "55" on a 5-point
  // item releases 55 out of 20 and nothing anywhere objects: the column is
  // DECIMAL(6,2) and the release gate only asks that a mark exists.
  const clampMark = (itemId, value) => {
    if (value === '') return '';
    const max = Number(items.find(i => i.id === itemId)?.points ?? 0);
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return round2(Math.min(Math.max(n, 0), max));
  };

  const setMark = (itemId, value) => {
    setMarks(p => ({ ...p, [itemId]: clampMark(itemId, value) }));
    setAutoScored(p => ({ ...p, [itemId]: false }));
    setReviewApproved(false);
  };

  const total = round2(items.reduce((sum, i) => sum + (Number(i.points) || 0), 0));
  const given = round2(Object.values(marks).reduce((sum, v) => sum + (Number(v) || 0), 0));
  const untouched = items.filter(it => marks[it.id] === undefined || marks[it.id] === '');
  const canRelease = !answersLoading && !answersFailed && untouched.length === 0 && items.length > 0;

  const release = async () => {
    if (!canRelease || !reviewApproved || saving) return;
    setReleaseError(false);
    setSaving(true);
    const perItem = perItemMarks(items, keys, marks);
    const ok = await releaseScore(active.id, worksheet.id, given, total, perItem);
    if (ok) {
      let refreshed = null;
      try {
        refreshed = await loadSubmissions(worksheet.id);
      } catch {
        console.warn('Submission list refresh failed after score release');
      }
      if (refreshed) setSubmissions(refreshed);
      else setSubmissions(prev => prev.map(s =>
        s.id === active.id ? { ...s, status: 'checked', released: true, score: given, total_points: total } : s));
      setActive(null);
    } else {
      setReleaseError(true);
    }
    setSaving(false);
  };

  // Release all is offered only when every item can be auto-checked; then only a
  // submitted, unreleased paper with no saved marks is released, one at a time.
  const bulkReady = isAuto && items.length > 0 && items.every(i => i.item_type !== 'essay' && keys[i.id] !== undefined);
  const bulkCandidates = bulkReady ? submissions.filter(s => s.status === 'submitted' && !s.released) : [];

  const startBulk = async () => {
    if (bulk || bulkRef.current.running) return;
    bulkRef.current = { cancelled: false, running: false };
    setBulk({ phase: 'checking', done: 0, count: submissions.length });
    const eligible = [];
    const skipped = [];
    for (const [index, s] of submissions.entries()) {
      if (s.released) skipped.push({ name: s.name, reason: 'Already released' });
      else if (s.status !== 'submitted') skipped.push({ name: s.name, reason: 'Not submitted' });
      else {
        const loaded = await loadAnswers(s.id);
        const perItem = loaded ? scoreSubmission(items, keys, loaded.answers).perItem : [];
        if (!loaded) skipped.push({ name: s.name, reason: 'Answers could not be loaded' });
        else if (Object.keys(loaded.prior).length > 0) skipped.push({ name: s.name, reason: 'Has saved marks' });
        else if (perItem.some(r => r.pointsEarned === null)) skipped.push({ name: s.name, reason: 'Needs a manual check' });
        else {
          const itemMarks = Object.fromEntries(perItem.map(r => [r.item_id, r.pointsEarned]));
          eligible.push({ sub: s, marks: itemMarks, score: round2(perItem.reduce((sum, r) => sum + r.pointsEarned, 0)) });
        }
      }
      if (bulkRef.current.cancelled || !aliveRef.current) return;
      setBulk({ phase: 'checking', done: index + 1, count: submissions.length });
    }
    setBulk({ phase: 'confirm', eligible, skipped });
  };

  const runBulk = async () => {
    if (bulkRef.current.running || bulk?.phase !== 'confirm' || bulk.eligible.length === 0) return;
    bulkRef.current.running = true;
    const { eligible } = bulk;
    setBulk({ phase: 'running', done: 0, count: eligible.length });
    const releasedIds = new Set();
    const failed = [];
    for (const [index, entry] of eligible.entries()) {
      let message = '';
      const ok = await releaseScore(entry.sub.id, worksheet.id, entry.score, total,
        perItemMarks(items, keys, entry.marks), { quiet: true, onFailure: text => { message = text; } });
      if (ok) releasedIds.add(entry.sub.id);
      else failed.push({ name: entry.sub.name, message: message || BULK_UNCONFIRMED });
      if (aliveRef.current) setBulk({ phase: 'running', done: index + 1, count: eligible.length });
    }
    let refreshed = null;
    try { refreshed = await loadSubmissions(worksheet.id); } catch { /* the rows are updated locally below */ }
    bulkRef.current.running = false;
    if (!aliveRef.current) return;
    if (refreshed) setSubmissions(refreshed);
    else setSubmissions(prev => prev.map(s => {
      const entry = releasedIds.has(s.id) && eligible.find(e => e.sub.id === s.id);
      return entry ? { ...s, status: 'checked', released: true, score: entry.score, total_points: total } : s;
    }));
    setBulk({ phase: 'done', released: releasedIds.size, failed });
  };

  // Closing while checking stops the reads; while releasing it is refused until the run ends.
  const closeBulk = () => {
    if (bulkRef.current.running) return;
    bulkRef.current.cancelled = true;
    setBulk(null);
  };

  const muted = { color: dark ? '#64748b' : '#94a3b8' };

  const STATE_STYLE = {
    'auto-correct': { border: '#16a34a', bg: 'rgba(22,163,74,0.07)', tag: 'Auto — correct', tagColor: '#16a34a' },
    'auto-incorrect': { border: '#dc2626', bg: 'rgba(220,38,38,0.07)', tag: 'Auto — wrong', tagColor: '#dc2626' },
    'auto-partial': { border: '#0ea5e9', bg: 'rgba(14,165,233,0.07)', tag: 'Auto — partly right', tagColor: dark ? '#38bdf8' : '#0284c7' },
    essay: { border: '#d97706', bg: 'rgba(217,119,6,0.07)', tag: 'Essay — score by hand', tagColor: '#d97706' },
    unscorable: { border: '#d97706', bg: 'rgba(217,119,6,0.07)', tag: 'No answer key — score by hand', tagColor: '#d97706' },
    manual: { border: dark ? '#334155' : '#e2e8f0', bg: 'transparent', tag: null, tagColor: null },
  };

  return (
    <>{routeBlocker}<Modal title={`Submissions — ${worksheet.title}`} onClose={requestClose} size="max-w-3xl">
      {busyNotice && <p role="status" className="text-sm">{busyNotice}</p>}
      {loading ? (
        <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm" style={{ color: 'var(--text-muted)' }}><Loader2 className="animate-spin" size={22} aria-hidden="true" />Loading submissions…</div>
      ) : loadFailed ? (
        <div role="alert" className="flex flex-col items-center gap-3 py-6 text-sm text-center" style={{ color: 'var(--red)' }}>
          <p>Could not load the submissions for this worksheet.</p>
          <button onClick={attemptLoad} className="underline font-semibold" style={{ color: '#dc2626' }}>
            Retry
          </button>
        </div>
      ) : active ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border px-3 py-2 min-w-0" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card2)' }}>
            <p className="text-sm font-semibold break-words" style={{ color: 'var(--text)' }}>{active.name}</p>
            <p className="text-xs mt-1" style={muted}>{active.released ? `Previously released: ${active.score}/${active.total_points}` : active.status?.replace('_', ' ') || 'Status unavailable'}</p>
          </div>
          {!isAuto && (
            <p className="text-xs" style={muted}>
              This worksheet is set to manual checking — every item is yours to score.
            </p>
          )}

          {answersLoading ? (
            <p role="status" className="py-6 text-sm text-center" style={muted}>Loading answers…</p>
          ) : answersFailed ? (
            <div role="alert" className="flex flex-col items-center gap-3 py-6 text-sm text-center" style={{ color: 'var(--red)' }}>
              <p>
                Could not load this student's answers. Releasing is turned off until this
                loads — a failed read must never be shown as "answered nothing".
              </p>
              <div className="flex items-center gap-3">
                <button onClick={() => openSubmission(active)} className="underline font-semibold" style={{ color: '#dc2626' }}>
                  Retry
                </button>
                <button onClick={() => requestClose(() => { setActive(null); setAnswersFailed(false); })}
                  className="underline font-semibold" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
                  Back to the list
                </button>
              </div>
            </div>
          ) : (
            <>
              {items.map((it, index) => {
                const style = STATE_STYLE[cardState[it.id]] || STATE_STYLE.manual;
                const unscorable = it.item_type === 'essay' || keys[it.id] === undefined;
                return (
                  <section key={it.id} className="p-3 rounded-lg min-w-0" style={{ border: `1px solid ${style.border}`, backgroundColor: style.bg }}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-sm font-medium break-words min-w-0" style={{ color: 'var(--text)' }}>
                        {index + 1}. {it.question}
                      </h3>
                      {style.tag && (
                        <span className="text-[11px] font-semibold" style={{ color: style.tagColor }}>
                          {style.tag}
                          {cardState[it.id]?.startsWith('auto') && autoScored[it.id] === false ? ' (edited)' : ''}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid gap-2">
                      <div>
                        <p className="text-xs font-bold" style={{ color: 'var(--text)' }}>Student answer</p>
                        <div className={`${boxClass} font-semibold`} data-answer-box="student"
                          style={{ color: 'var(--text)', borderColor: 'var(--border)', backgroundColor: 'var(--card-bg)' }}>
                          {answerText(answers[it.id]).trim()
                            ? answerText(answers[it.id])
                            : <span className="font-normal" style={{ color: 'var(--text-muted)' }}>No answer</span>}
                        </div>
                      </div>
                      {it.item_type !== 'essay' && (
                        <div>
                          <p className="text-xs font-bold" style={{ color: 'var(--text)' }}>Expected answer</p>
                          <div className={boxClass} data-answer-box="expected"
                            style={{ color: 'var(--text)', borderColor: 'var(--green)', backgroundColor: 'rgba(22,163,74,0.08)' }}>
                            {answerText(keys[it.id]?.correct_answer) || '—'}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {!unscorable && (
                        <>
                          <button type="button" onClick={() => setMark(it.id, it.points)}
                            aria-label={`Mark question ${index + 1} fully correct`}
                            title="Mark fully correct"
                            className="min-h-11 min-w-11 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: 'rgba(22,163,74,0.12)', color: '#16a34a' }}>
                            <Check size={14} />
                          </button>
                          <button type="button" onClick={() => setMark(it.id, 0)}
                            aria-label={`Mark question ${index + 1} wrong`}
                            title="Mark wrong"
                            className="min-h-11 min-w-11 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: 'rgba(220,38,38,0.12)', color: '#dc2626' }}>
                            <XIcon size={14} />
                          </button>
                        </>
                      )}
                      <input type="number" min="0" max={it.points} step="0.5" aria-label={`Score for question ${index + 1}`}
                        value={marks[it.id] ?? ''}
                        onChange={e => setMark(it.id, e.target.value)}
                        className="min-h-11 w-20 px-2 rounded text-xs"
                        style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc',
                                 border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
                                 color: dark ? '#f1f5f9' : '#1a2b4a' }} />
                      <span className="text-xs" style={muted}>/ {it.points}</span>
                    </div>
                    <label className="block text-xs mt-2" style={muted}>Feedback for question {index + 1}
                      <textarea rows={2} value={feedback[it.id] || ''}
                        onChange={event => { setFeedback(previous => ({ ...previous, [it.id]: event.target.value })); setReviewApproved(false); }}
                        className="block w-full mt-1 p-2 rounded border text-sm" style={{ color: 'var(--text)', backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }} />
                    </label>
                  </section>
                );
              })}

              <p className="text-sm font-semibold rounded-lg border px-3 py-2" role="status" style={{ color: 'var(--text)', borderColor: 'var(--border)', backgroundColor: 'var(--card2)' }}>
                Reviewed score: {given} / {total}
              </p>
              {releaseError && <p role="alert" className="rounded-lg border px-3 py-2 text-sm" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
                Could not confirm the release. Check the submission and try again.
              </p>}
              {untouched.length > 0 && (
                <p className="text-xs" style={{ color: '#d97706' }}>
                  {untouched.length} item{untouched.length === 1 ? '' : 's'} still need{untouched.length === 1 ? 's' : ''} your score
                  before this can be released.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Btn variant="outline" onClick={() => requestClose(() => setActive(null))}>Back</Btn>
                <Btn variant="outline" onClick={() => setReviewApproved(true)} disabled={!canRelease || reviewApproved || saving}>
                  {reviewApproved ? 'Review approved locally' : 'Approve review locally'}
                </Btn>
                <Btn variant="primary" onClick={release} disabled={!canRelease || !reviewApproved || saving} busy={saving}>
                  {saving ? 'Releasing…' : 'Release result'}
                </Btn>
              </div>
              {reviewApproved && <p role="status" className="text-xs" style={muted}>Review approval and feedback are local to this open dialog. They have not been saved or released.</p>}
            </>
          )}
        </div>
      ) : submissions.length === 0 ? (
        <p className="text-sm py-6" style={muted}>
          No one has answered this worksheet in the app yet. If your class answered it
          on paper, use <strong>Encode scores</strong> on the worksheet card instead.
        </p>
      ) : (
        <>
        {bulkCandidates.length > 0 && <div className="flex justify-end mb-2">
          <Btn variant="primary" onClick={startBulk} disabled={Boolean(bulk)}>Release all</Btn>
        </div>}
        <ul className="flex flex-col gap-2" aria-label="Worksheet submissions">
          {submissions.map(s => (
            <li key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg min-w-0"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--card-bg)' }}>
              <div className="min-w-0">
                <p className="text-sm font-medium break-words" style={{ color: 'var(--text)' }}>{s.name}</p>
                <p className="text-xs" style={muted}>
                  {s.released ? `Released — ${s.score}/${s.total_points}` : s.status?.replace('_', ' ') || 'Status unavailable'}
                </p>
              </div>
              <Btn onClick={() => openSubmission(s)} disabled={s.status === 'in_progress'}>
                {s.released ? 'Review again' : 'Check'}
              </Btn>
            </li>
          ))}
        </ul>
        </>
      )}
    </Modal>
    {bulk && <Modal title="Release all auto-checked results" onClose={closeBulk} closeDisabled={bulk.phase === 'running'} size="max-w-lg">
      <div className="flex flex-col gap-3 text-sm" style={{ color: 'var(--text)' }}>
        {bulk.phase === 'checking' && <p role="status">Checking submissions... {bulk.done} of {bulk.count}</p>}
        {bulk.phase === 'confirm' && <>
          <p role="alert" className="rounded-lg border px-3 py-2" style={{ borderColor: '#d97706', color: 'var(--text)' }}>{BULK_WARNING}</p>
          {bulk.eligible.length > 0 ? <ul aria-label="Results to release" className="flex flex-col gap-1">
            {bulk.eligible.map(e => <li key={e.sub.id}>{e.sub.name}: {e.score} / {total}</li>)}
          </ul> : <p>Nothing can be released automatically.</p>}
          {bulk.skipped.length > 0 && <div>
            <p className="font-medium">{bulk.skipped.length} skipped</p>
            <ul aria-label="Skipped submissions" className="flex flex-col gap-1" style={muted}>
              {bulk.skipped.map((k, index) => <li key={index}>{k.name}: {k.reason}</li>)}
            </ul>
          </div>}
        </>}
        {bulk.phase === 'running' && <p role="status">Releasing... {bulk.done} of {bulk.count}</p>}
        {bulk.phase === 'done' && <div role="status">
          <p className="font-medium">Released {bulk.released}. Failed {bulk.failed.length}.</p>
          {bulk.failed.length > 0 && <ul aria-label="Failed releases" className="flex flex-col gap-1 mt-1">
            {bulk.failed.map((k, index) => <li key={index}>{k.name}: {k.message}</li>)}
          </ul>}
        </div>}
        <div className="flex justify-end gap-2">
          {bulk.phase !== 'running' && <Btn variant="outline" onClick={closeBulk}>{bulk.phase === 'done' ? 'Close' : 'Cancel'}</Btn>}
          {(bulk.phase === 'confirm' || bulk.phase === 'running') && <Btn variant="primary" onClick={runBulk}
            disabled={bulk.phase === 'running' || bulk.eligible?.length === 0} busy={bulk.phase === 'running'}>
            {bulk.phase === 'running' ? 'Releasing…' : `Release ${bulk.eligible.length}`}</Btn>}
        </div>
      </div>
    </Modal>}</>
  );
};

export default CheckSubmissionsModal;
