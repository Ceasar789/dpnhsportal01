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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Check, X as XIcon } from 'lucide-react';
import { Modal, Btn } from '../shared/ui';
import { useTheme } from '../hooks';
import { scoreSubmission } from '../../../../lib/worksheetChecking';

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
  const [marks, setMarks] = useState({});
  // Per item: 'auto-correct' | 'auto-incorrect' | 'unscorable' | 'manual'.
  // Fixed at load time from the auto-checker's verdict (or the lack of one),
  // so the card's colour keeps showing what the machine found even after the
  // teacher overrides the number — only the small "auto" tag disappears.
  const [cardState, setCardState] = useState({});
  const [autoScored, setAutoScored] = useState({});
  const [saving, setSaving] = useState(false);

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

  const openSubmission = async (sub) => {
    setActive(sub);
    setMarks({});
    setAutoScored({});
    setCardState({});
    setAnswersFailed(false);
    setAnswers({});

    const loaded = await loadAnswers(sub.id);
    if (!loaded) { setAnswersFailed(true); return; }
    setAnswers(loaded);

    const states = {};
    const prefilled = {};
    const flagged = {};

    if (isAuto) {
      // `keys` is already `{ [item_id]: { correct_answer } }` — the row
      // shape scoreSubmission expects — so it is passed through as-is.
      // Re-wrapping it in another `{ correct_answer: ... }` here would score
      // every item against `undefined` and silently fail the whole class.
      const { perItem } = scoreSubmission(items, keys, loaded);
      perItem.forEach(r => {
        const item = items.find(i => i.id === r.item_id);
        if (r.pointsEarned !== null) {
          prefilled[r.item_id] = r.pointsEarned;
          flagged[r.item_id] = true;
          states[r.item_id] = r.isCorrect ? 'auto-correct' : 'auto-incorrect';
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

    setCardState(states);
    setMarks(prefilled);
    setAutoScored(flagged);
  };

  const setMark = (itemId, value) => {
    setMarks(p => ({ ...p, [itemId]: value }));
    setAutoScored(p => ({ ...p, [itemId]: false }));
  };

  const total = items.reduce((sum, i) => sum + (Number(i.points) || 0), 0);
  const given = Object.values(marks).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const untouched = items.filter(it => marks[it.id] === undefined || marks[it.id] === '');
  const canRelease = !answersFailed && untouched.length === 0 && items.length > 0;

  const release = async () => {
    if (!canRelease) return;
    setSaving(true);
    const perItem = items.map(i => {
      const unscorable = i.item_type === 'essay' || keys[i.id] === undefined;
      return {
        item_id: i.id,
        isCorrect: unscorable ? null : Number(marks[i.id]) >= Number(i.points),
        pointsEarned: Number(marks[i.id]) || 0,
      };
    });
    const ok = await releaseScore(active.id, worksheet.id, given, total, perItem);
    setSaving(false);
    if (ok) {
      setSubmissions(prev => prev.map(s =>
        s.id === active.id ? { ...s, status: 'checked', released: true, score: given, total_points: total } : s));
      setActive(null);
    }
  };

  const muted = { color: dark ? '#64748b' : '#94a3b8' };

  const STATE_STYLE = {
    'auto-correct': { border: '#16a34a', bg: 'rgba(22,163,74,0.07)', tag: 'Auto — correct', tagColor: '#16a34a' },
    'auto-incorrect': { border: '#dc2626', bg: 'rgba(220,38,38,0.07)', tag: 'Auto — wrong', tagColor: '#dc2626' },
    essay: { border: '#d97706', bg: 'rgba(217,119,6,0.07)', tag: 'Essay — score by hand', tagColor: '#d97706' },
    unscorable: { border: '#d97706', bg: 'rgba(217,119,6,0.07)', tag: 'No answer key — score by hand', tagColor: '#d97706' },
    manual: { border: dark ? '#334155' : '#e2e8f0', bg: 'transparent', tag: null, tagColor: null },
  };

  return (
    <Modal title={`Submissions — ${worksheet.title}`} onClose={onClose} size="max-w-3xl">
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={22} /></div>
      ) : loadFailed ? (
        <div className="flex flex-col items-center gap-3 py-6 text-sm text-center" style={{ color: '#dc2626' }}>
          <p>Could not load the submissions for this worksheet.</p>
          <button onClick={attemptLoad} className="underline font-semibold" style={{ color: '#dc2626' }}>
            Retry
          </button>
        </div>
      ) : active ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{active.name}</p>
          {!isAuto && (
            <p className="text-xs" style={muted}>
              This worksheet is set to manual checking — every item is yours to score.
            </p>
          )}

          {answersFailed ? (
            <div className="flex flex-col items-center gap-3 py-6 text-sm text-center" style={{ color: '#dc2626' }}>
              <p>
                Could not load this student's answers. Releasing is turned off until this
                loads — a failed read must never be shown as "answered nothing".
              </p>
              <button onClick={() => openSubmission(active)} className="underline font-semibold" style={{ color: '#dc2626' }}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {items.map((it, index) => {
                const style = STATE_STYLE[cardState[it.id]] || STATE_STYLE.manual;
                const unscorable = it.item_type === 'essay' || keys[it.id] === undefined;
                return (
                  <div key={it.id} className="p-3 rounded-lg" style={{ border: `1px solid ${style.border}`, backgroundColor: style.bg }}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                        {index + 1}. {it.question}
                      </p>
                      {style.tag && (
                        <span className="text-[11px] font-semibold whitespace-nowrap ml-2" style={{ color: style.tagColor }}>
                          {style.tag}
                          {cardState[it.id]?.startsWith('auto') && autoScored[it.id] === false ? ' (edited)' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1" style={muted}>
                      Answer: {Array.isArray(answers[it.id]) ? answers[it.id].join(', ') : (answers[it.id] || '— blank —')}
                    </p>
                    {it.item_type !== 'essay' && (
                      <p className="text-xs" style={muted}>
                        Expected: {Array.isArray(keys[it.id]?.correct_answer)
                          ? keys[it.id].correct_answer.join(', ')
                          : String(keys[it.id]?.correct_answer ?? '—')}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {!unscorable && (
                        <>
                          <button type="button" onClick={() => setMark(it.id, it.points)}
                            title="Mark fully correct"
                            className="h-8 w-8 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: 'rgba(22,163,74,0.12)', color: '#16a34a' }}>
                            <Check size={14} />
                          </button>
                          <button type="button" onClick={() => setMark(it.id, 0)}
                            title="Mark wrong"
                            className="h-8 w-8 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: 'rgba(220,38,38,0.12)', color: '#dc2626' }}>
                            <XIcon size={14} />
                          </button>
                        </>
                      )}
                      <input type="number" min="0" max={it.points} step="0.5"
                        value={marks[it.id] ?? ''}
                        onChange={e => setMark(it.id, e.target.value)}
                        className="h-8 w-20 px-2 rounded text-xs outline-none"
                        style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc',
                                 border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
                                 color: dark ? '#f1f5f9' : '#1a2b4a' }} />
                      <span className="text-xs" style={muted}>/ {it.points}</span>
                    </div>
                  </div>
                );
              })}

              <p className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                Total: {given} / {total}
              </p>
              {untouched.length > 0 && (
                <p className="text-xs" style={{ color: '#d97706' }}>
                  {untouched.length} item{untouched.length === 1 ? '' : 's'} still need{untouched.length === 1 ? 's' : ''} your score
                  before this can be released.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Btn onClick={() => setActive(null)}>Back</Btn>
                <Btn variant="primary" onClick={release} disabled={saving || !canRelease}>
                  {saving ? 'Releasing…' : 'Save & Release'}
                </Btn>
              </div>
            </>
          )}
        </div>
      ) : submissions.length === 0 ? (
        <p className="text-sm py-6" style={muted}>
          No one has answered this worksheet in the app yet. If your class answered it
          on paper, use <strong>Encode scores</strong> on the worksheet card instead.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {submissions.map(s => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg"
              style={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
              <div>
                <p className="text-sm" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{s.name}</p>
                <p className="text-xs" style={muted}>
                  {s.released ? `Released — ${s.score}/${s.total_points}` : s.status.replace('_', ' ')}
                </p>
              </div>
              <Btn onClick={() => openSubmission(s)} disabled={s.status === 'in_progress'}>
                {s.released ? 'Review again' : 'Check'}
              </Btn>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

export default CheckSubmissionsModal;
