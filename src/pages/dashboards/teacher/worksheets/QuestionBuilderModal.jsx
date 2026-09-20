// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/QuestionBuilderModal.jsx
// Builds a worksheet's questions and answer key, and carries the per-worksheet
// auto-check toggle. Manual is the default: an auto-checker that marks a wrong
// answer correct looks right on review and slips through.
// ============================================

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { Modal, Btn, Input } from '../shared/ui';
import { useTheme } from '../hooks';
import { ITEM_TYPES } from '../../../../lib/worksheetChecking';

const TYPE_LABELS = {
  multiple_choice: 'Multiple choice',
  true_false: 'True / False',
  identification: 'Identification',
  enumeration: 'Enumeration',
  essay: 'Essay',
};

const blankItem = () => ({
  question: '', item_type: 'multiple_choice',
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

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await loadItems(worksheet.id);
      if (!active) return;
      if (!result) { setLoadFailed(true); setLoading(false); return; }
      setItems(result.items.map(i => ({
        question: i.question,
        item_type: i.item_type,
        options: i.options || ['', '', '', ''],
        correct_answer: result.keys[i.id] ?? '',
        points: i.points,
      })));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [worksheet.id, loadItems]);

  const patch = (index, changes) =>
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, ...changes } : it)));

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
    }
    setSaving(true);
    const ok = await saveItems(worksheet.id, items.map(it => ({
      ...it,
      // Identification and enumeration keys are stored as lists.
      correct_answer: ['identification', 'enumeration'].includes(it.item_type)
        ? String(it.correct_answer).split(',').map(s => s.trim()).filter(Boolean)
        : it.correct_answer,
      options: it.item_type === 'multiple_choice' ? it.options.filter(o => o.trim()) : null,
    })));
    if (ok) await setCheckingMode(worksheet.id, mode);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal title={`Questions — ${worksheet.title}`} onClose={onClose}>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={22} /></div>
      ) : loadFailed ? (
        <p className="text-sm py-6" style={{ color: '#dc2626' }}>
          Could not load the existing questions. Close this window and try again —
          saving now would replace them with nothing.
        </p>
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
            <div key={index} className="p-3 rounded-lg flex flex-col gap-2"
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
                      onChange={e => patch(index, {
                        options: it.options.map((o, i) => (i === oi ? e.target.value : o)),
                      })} />
                  ))}
                </div>
              )}

              {it.item_type !== 'essay' && (
                <Input
                  placeholder={
                    it.item_type === 'multiple_choice' ? 'Correct choice (exact text)'
                      : it.item_type === 'true_false' ? 'True or False'
                      : it.item_type === 'identification' ? 'Accepted answers, comma separated'
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
