// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/QuestionBuilderModal.jsx
// Builds a worksheet's questions and answer key, and carries the per-worksheet
// auto-check toggle. Manual is the default: an auto-checker that marks a wrong
// answer correct looks right on review and slips through.
// ============================================

import React, { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { Modal, Btn, Input } from '../shared/ui';
import { useTheme } from '../hooks';
import { ITEM_TYPES, TRUE_FALSE_VALUES, splitAcceptedAnswers } from '../../../../lib/worksheetChecking';

const TYPE_LABELS = {
  multiple_choice: 'Multiple choice',
  true_false: 'True / False',
  identification: 'Identification',
  enumeration: 'Enumeration',
  essay: 'Essay',
};

let uidCounter = 0;
const genUid = () => `new-${Date.now()}-${(uidCounter += 1)}`;

const blankItem = () => ({
  uid: genUid(), question: '', item_type: 'multiple_choice',
  options: ['', '', '', ''], correct_answer: '', points: 1,
});

const QuestionBuilderModal = ({ worksheet, loadItems, saveItems, setCheckingMode, onClose }) => {
  const { dark } = useTheme();
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState(worksheet.checking_mode || 'manual');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const fieldStyle = {
    backgroundColor: dark ? '#0f172a' : '#f8fafc',
    border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
    color: dark ? '#f1f5f9' : '#1a2b4a',
  };

  // `activeRef` cancels a load that resolves after the modal has already
  // unmounted (e.g. the teacher closed it mid-fetch) so the async result
  // doesn't call setState on an unmounted component. It resets on every
  // call so a manual Retry after unmount-and-remount (a fresh instance,
  // fresh ref) behaves the same as the initial load.
  const activeRef = React.useRef(true);

  // Extracted so the failed-load state can offer a real Retry rather than
  // telling the teacher to close and reopen the whole modal.
  const attemptLoad = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    const result = await loadItems(worksheet.id);
    if (!activeRef.current) return;
    setLoading(false);
    if (!result) { setLoadFailed(true); return; }
    setItems(result.items.map(i => ({
      // Existing items already have a stable, server-assigned id — reuse it
      // as the React key so reordering doesn't jumble focus.
      uid: i.id,
      question: i.question,
      item_type: i.item_type,
      options: i.options || ['', '', '', ''],
      correct_answer: result.keys[i.id]?.correct_answer ?? '',
      points: i.points,
    })));
  }, [worksheet.id, loadItems]);

  useEffect(() => {
    activeRef.current = true;
    attemptLoad();
    return () => { activeRef.current = false; };
  }, [attemptLoad]);

  const patch = (index, changes) =>
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, ...changes } : it)));

  const patchOptions = (index, optionIndex, value) => setItems(prev => prev.map((it, i) => {
    if (i !== index) return it;
    const options = it.options.map((o, oi) => (oi === optionIndex ? value : o));
    // If the key pointed at the option that just changed, it no longer
    // matches anything in the list — clear it rather than silently keeping
    // an answer key that can never be satisfied.
    const keyStillValid = options.includes(it.correct_answer);
    return { ...it, options, correct_answer: keyStillValid ? it.correct_answer : '' };
  }));

  const move = (index, delta) => setItems(prev => {
    const next = [...prev];
    const target = index + delta;
    if (target < 0 || target >= next.length) return prev;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const submit = async () => {
    for (const [i, it] of items.entries()) {
      if (!it.question.trim()) return alert(`Question ${i + 1} has no text.`);
      if (it.item_type !== 'essay' && !String(it.correct_answer).trim().length) {
        return alert(`Question ${i + 1} has no answer key.`);
      }
      // The <select> keeps a freshly-built key matched to an option, but a
      // stale value can still arrive here: an item loaded from before this
      // control existed, or a key edited directly in the database. The
      // select is a convenience, not the only thing standing between a
      // typo and a key nothing can ever match, so re-check on submit too.
      if (it.item_type === 'multiple_choice'
          && !it.options.filter(o => o.trim()).includes(it.correct_answer)) {
        return alert(`Question ${i + 1}'s answer key does not match any of its choices.`);
      }
      // A key of just "," (or any separators-only string) passes the
      // non-empty check above but splits to an empty accepted-answers list,
      // producing a real key row nothing can ever satisfy — the same
      // failure mode as a missing key row, just self-inflicted.
      if (['identification', 'enumeration'].includes(it.item_type)
          && splitAcceptedAnswers(it.correct_answer).length === 0) {
        return alert(`Question ${i + 1}'s answer key has no usable answers.`);
      }
    }
    setSaving(true);
    const ok = await saveItems(worksheet.id, items.map(it => ({
      ...it,
      // Identification and enumeration keys are stored as lists.
      correct_answer: ['identification', 'enumeration'].includes(it.item_type)
        ? splitAcceptedAnswers(it.correct_answer)
        : it.correct_answer,
      options: it.item_type === 'multiple_choice' ? it.options.filter(o => o.trim()) : null,
    })));
    if (ok) await setCheckingMode(worksheet.id, mode);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal title={`Questions — ${worksheet.title}`} onClose={onClose} size="max-w-2xl">
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={22} /></div>
      ) : loadFailed ? (
        <div className="flex flex-col items-center gap-3 py-6 text-sm text-center" style={{ color: '#dc2626' }}>
          <p>
            Could not load the existing questions. Saving now would replace them
            with nothing, so saving stays off until this loads.
          </p>
          <button onClick={attemptLoad} className="underline font-semibold" style={{ color: '#dc2626' }}>
            Retry
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm" style={{ color: dark ? '#cbd5e1' : '#374151' }}>
            <input type="checkbox" checked={mode === 'auto'}
              onChange={e => setMode(e.target.checked ? 'auto' : 'manual')} />
            Auto-check this worksheet when reviewing
            <span className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
              (off = you score every item yourself)
            </span>
          </label>

          {items.map((it, index) => (
            <div key={it.uid} className="p-3 rounded-lg flex flex-col gap-2"
              style={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: dark ? '#94a3b8' : '#64748b' }}>#{index + 1}</span>
                <select value={it.item_type} onChange={e => patch(index, { item_type: e.target.value, correct_answer: '' })}
                  className="h-8 px-2 rounded text-xs outline-none" style={fieldStyle}>
                  {ITEM_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
                <input type="number" min="0" step="0.5" value={it.points}
                  onChange={e => patch(index, { points: e.target.value })}
                  className="h-8 w-20 px-2 rounded text-xs outline-none" style={fieldStyle} />
                <span className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>points</span>
                <div className="ml-auto flex gap-1">
                  <button onClick={() => move(index, -1)} title="Move up"><ChevronUp size={14} /></button>
                  <button onClick={() => move(index, 1)} title="Move down"><ChevronDown size={14} /></button>
                  <button onClick={() => setItems(prev => prev.filter((_, i) => i !== index))} title="Delete">
                    <Trash2 size={14} className="text-red-500" />
                  </button>
                </div>
              </div>

              <Input placeholder="Question" value={it.question}
                onChange={e => patch(index, { question: e.target.value })} />

              {it.item_type === 'multiple_choice' && (
                <div className="grid grid-cols-2 gap-2">
                  {it.options.map((opt, oi) => (
                    <Input key={oi} placeholder={`Choice ${oi + 1}`} value={opt}
                      onChange={e => patchOptions(index, oi, e.target.value)} />
                  ))}
                </div>
              )}

              {it.item_type === 'multiple_choice' && (
                // A select over the item's own options, not free text: a
                // typed key that doesn't exactly match an option can never
                // be satisfied by any student, and would fail silently.
                <select value={it.correct_answer} onChange={e => patch(index, { correct_answer: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg text-sm outline-none" style={fieldStyle}>
                  <option value="">Select the correct choice…</option>
                  {it.options.filter(o => o.trim()).map((opt, oi) => (
                    <option key={oi} value={opt}>{opt}</option>
                  ))}
                </select>
              )}

              {it.item_type === 'true_false' && (
                <select value={it.correct_answer} onChange={e => patch(index, { correct_answer: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg text-sm outline-none" style={fieldStyle}>
                  <option value="">Select the correct answer…</option>
                  {TRUE_FALSE_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              )}

              {(it.item_type === 'identification' || it.item_type === 'enumeration') && (
                <Input
                  placeholder={
                    it.item_type === 'identification' ? 'Accepted answers, comma separated'
                      : 'Expected answers, comma separated'
                  }
                  value={it.correct_answer}
                  onChange={e => patch(index, { correct_answer: e.target.value })}
                />
              )}

              {it.item_type === 'essay' && (
                <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                  You will score this one by hand when checking.
                </p>
              )}
            </div>
          ))}

          <Btn onClick={() => setItems(prev => [...prev, blankItem()])}>
            <Plus size={14} /> Add question
          </Btn>

          <div className="flex justify-end gap-2">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : 'Save questions'}
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default QuestionBuilderModal;
