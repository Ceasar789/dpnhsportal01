// ============================================================
// FILE: src/pages/dashboards/AssessmentsTab.jsx
// NEW FILE — does not modify AssignmentsTab.jsx or any other tab.
// Only change needed in TeacherDashboard.jsx:
//   1. export ThemeContext (one keyword) so this file can read dark mode
//   2. import AssessmentsTab and point the /assignments route to it
// See integration notes at the bottom of this file.
// ============================================================

import React, { useState, useEffect, useCallback, useContext } from 'react';
import { supabase } from '../../../../config/supabase';
import { useAuth } from '../../../../context/AuthContext';
import {
  Plus, X, Trash2, Loader2, Sparkles, ClipboardList, ChevronLeft,
  BarChart3, CheckCircle2, AlertCircle, Lightbulb, Save, ListChecks,
  GraduationCap, BookOpen, LayoutGrid, UserCheck
} from 'lucide-react';

// ── Pull the shared theme context from TeacherDashboard.jsx ──
// Requires: `export const ThemeContext = ...` in TeacherDashboard.jsx
import { ThemeContext } from '../hooks';
const useTheme = () => useContext(ThemeContext);

// ============================================================
// SHARED UI ATOMS — local copies so this file stays self-contained
// (visually identical to the ones already in TeacherDashboard.jsx)
// ============================================================
const Card = ({ children, className = '', style = {} }) => {
  const { dark } = useTheme();
  return (
    <div className={`rounded-xl ${className}`}
      style={{ backgroundColor: dark ? '#1e293b' : '#ffffff', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, ...style }}>
      {children}
    </div>
  );
};

const Input = (props) => {
  const { dark } = useTheme();
  const { className = '', ...rest } = props;
  return (
    <input className={`w-full h-10 px-3 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`, color: dark ? '#f1f5f9' : '#1a2b4a' }}
      {...rest}
    />
  );
};

const TextArea = (props) => {
  const { dark } = useTheme();
  const { className = '', ...rest } = props;
  return (
    <textarea className={`w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none ${className}`}
      style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`, color: dark ? '#f1f5f9' : '#1a2b4a' }}
      {...rest}
    />
  );
};

const Select = (props) => {
  const { dark } = useTheme();
  const { className = '', children, ...rest } = props;
  return (
    <select className={`w-full h-10 px-3 rounded-lg text-sm outline-none ${className}`}
      style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`, color: dark ? '#f1f5f9' : '#1a2b4a' }}
      {...rest}>
      {children}
    </select>
  );
};

const Badge = ({ children, color, bg }) => (
  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: bg, color }}>
    {children}
  </span>
);

const Btn = ({ children, onClick, className = '', variant = 'default', disabled, type = 'button' }) => {
  const variants = {
    default: { backgroundColor: '#1e3a5f', color: '#ffffff' },
    outline: { backgroundColor: 'transparent', color: '#64748b', border: '1px solid #e2e8f0' },
    primary: { backgroundColor: '#2563eb', color: '#ffffff' },
    danger: { backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 ${className}`}
      style={{ ...variants[variant], opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  );
};

const Table = ({ headers, children }) => {
  const { dark } = useTheme();
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc' }}>
            {headers.map(h => (
              <th key={h} className="px-5 py-3 text-left text-xs font-semibold tracking-wider uppercase"
                style={{ color: dark ? '#64748b' : '#94a3b8' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody style={{ borderTop: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
          {children}
        </tbody>
      </table>
    </div>
  );
};

const TR = ({ children }) => {
  const { dark } = useTheme();
  return (
    <tr className="transition-colors" style={{ borderBottom: `1px solid ${dark ? '#334155' : '#f1f5f9'}` }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = dark ? '#0f172a' : '#f8fafc'}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
      {children}
    </tr>
  );
};

const TD = ({ children, className = '' }) => {
  const { dark } = useTheme();
  return (
    <td className={`px-5 py-3.5 text-sm ${className}`} style={{ color: dark ? '#cbd5e1' : '#475569' }}>
      {children}
    </td>
  );
};

const Modal = ({ title, onClose, children, wide }) => {
  const { dark } = useTheme();
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className={`rounded-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} shadow-2xl max-h-[90vh] overflow-y-auto`}
        style={{ backgroundColor: dark ? '#1e293b' : '#ffffff', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
        <div className="flex items-center justify-between p-5 border-b sticky top-0" style={{ borderColor: dark ? '#334155' : '#e2e8f0', backgroundColor: dark ? '#1e293b' : '#ffffff' }}>
          <h2 className="text-lg font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

const useToast = () => {
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  return { toast, showToast };
};

const ToastBanner = ({ toast }) => toast ? (
  <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 shadow-lg ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
    {toast.msg}
  </div>
) : null;

// ============================================================
// CONSTANTS
// ============================================================
const TYPES = [
  { value: 'activity', label: 'Activity' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'exam', label: 'Exam' },
  { value: 'assignment', label: 'Assignment' },
];

const ITEM_TYPES = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'true_false', label: 'True or false' },
  { value: 'short_answer', label: 'Short answer' },
  { value: 'essay', label: 'Essay' },
];

const typeColor = (type) => ({
  activity: { color: '#0c447c', bg: 'rgba(59,130,246,0.12)' },
  quiz: { color: '#3c3489', bg: 'rgba(127,119,221,0.15)' },
  exam: { color: '#791f1f', bg: 'rgba(226,75,74,0.12)' },
  assignment: { color: '#085041', bg: 'rgba(29,158,117,0.12)' },
}[type] || { color: '#64748b', bg: '#f1f5f9' });

// Type tiles shown at the top of the Assessments tab — each one filters
// the list down to ONLY that type (Activities show only activities, etc.)
const TYPE_META = [
  { value: 'all', label: 'All', icon: LayoutGrid, color: '#1e3a5f', bg: 'rgba(30,58,95,0.08)' },
  { value: 'activity', label: 'Activities', icon: ClipboardList, color: '#0c447c', bg: 'rgba(59,130,246,0.12)' },
  { value: 'quiz', label: 'Quizzes', icon: ListChecks, color: '#3c3489', bg: 'rgba(127,119,221,0.15)' },
  { value: 'exam', label: 'Exams', icon: GraduationCap, color: '#791f1f', bg: 'rgba(226,75,74,0.12)' },
  { value: 'assignment', label: 'Assignments', icon: BookOpen, color: '#085041', bg: 'rgba(29,158,117,0.12)' },
];

// ============================================================
// AI GRADING HELPER (Gemini — same pattern as Lesson Plans tab)
// Only used for short_answer / essay items.
// Multiple choice / true_false are always graded by exact match.
// ============================================================
async function gradeAnswerWithAI({ question_text, correct_answer, points, item_type }, studentAnswer) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY not set in .env');

  const prompt = `You are an academic checker for a Philippine high school teacher. Grade ONE student answer.

Item type: ${item_type}
Question: ${question_text}
${correct_answer ? `Reference/expected answer or rubric notes: ${correct_answer}` : 'No fixed reference answer — use academic judgment based on the question.'}
Maximum points for this item: ${points}
Student's answer: ${studentAnswer || '(no answer given)'}

Grade fairly based on correctness and completeness relative to the question. For essay items, judge clarity, relevance, and accuracy rather than exact wording match.

Respond with ONLY raw JSON, no markdown, in exactly this shape:
{"points_earned": <number, 0 to ${points}>, "is_correct": <true if points_earned equals max points, else false>, "feedback": "<one short sentence of feedback for the student, in plain academic English>"}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
      }),
    }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error (${response.status})`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      points_earned: Math.max(0, Math.min(points, Number(parsed.points_earned) || 0)),
      is_correct: !!parsed.is_correct,
      feedback: parsed.feedback || '',
    };
  } catch {
    throw new Error('Could not parse AI grading response');
  }
}

// AI-generated "what to teach next" summary, based on item analysis
async function getTeachingRecommendation(weakItems) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY not set in .env');

  const itemList = weakItems.map(i => `- "${i.question_text}" — ${i.percentCorrect}% of students got this correct`).join('\n');
  const prompt = `You are an instructional coach for a Philippine high school teacher. Based on this item analysis from a recent assessment, write 2-3 short sentences of practical, specific advice on what topic(s) to re-teach or reinforce next. Be concrete, not generic.

Weak items:
${itemList}

Respond with plain text only, no markdown, 2-3 sentences max.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 200 },
      }),
    }
  );
  if (!response.ok) throw new Error('Gemini API error');
  const data = await response.json();
  return (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

// ============================================================
// CREATE / EDIT FORM
// ============================================================
const AssessmentForm = ({ onClose, onSaved, sections, showToast, lockedType }) => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const [type, setType] = useState(lockedType || 'activity');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [instructions, setInstructions] = useState('');
  const [checkingMode, setCheckingMode] = useState('manual');
  const [items, setItems] = useState([
    { item_type: 'multiple_choice', question_text: '', choices: ['', '', '', ''], correct_answer: '', points: 1 },
  ]);
  const [saving, setSaving] = useState(false);

  const addItem = () => setItems([...items, { item_type: 'multiple_choice', question_text: '', choices: ['', '', '', ''], correct_answer: '', points: 1 }]);
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx, patch) => setItems(items.map((it, i) => i === idx ? { ...it, ...patch } : it));

  const totalPoints = items.reduce((sum, it) => sum + (Number(it.points) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { showToast('Title is required', 'error'); return; }
    if (items.some(it => !it.question_text.trim())) { showToast('Every item needs a question', 'error'); return; }

    setSaving(true);
    try {
      const { data: assessment, error: aErr } = await supabase
        .from('assessments')
        .insert([{
          teacher_id: userData?.uid,
          section_id: sectionId || null,
          type, title, subject, instructions,
          total_points: totalPoints,
          deadline: deadline || null,
          checking_mode: checkingMode,
          status: 'draft',
        }])
        .select()
        .single();
      if (aErr) throw aErr;

      const itemRows = items.map((it, idx) => ({
        assessment_id: assessment.id,
        order_index: idx,
        item_type: it.item_type,
        question_text: it.question_text,
        choices: it.item_type === 'multiple_choice' ? it.choices.filter(c => c.trim()) : null,
        correct_answer: it.item_type === 'essay' ? null : it.correct_answer,
        points: Number(it.points) || 1,
      }));
      const { error: iErr } = await supabase.from('assessment_items').insert(itemRows);
      if (iErr) throw iErr;

      showToast(`${TYPES.find(t => t.value === type)?.label} created`);
      onSaved();
      onClose();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {lockedType ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: typeColor(lockedType).bg, width: 'fit-content' }}>
          {(() => { const M = TYPE_META.find(t => t.value === lockedType); const Icon = M?.icon; return Icon ? <Icon size={15} style={{ color: typeColor(lockedType).color }} /> : null; })()}
          <span className="text-xs font-bold" style={{ color: typeColor(lockedType).color }}>{TYPES.find(t => t.value === lockedType)?.label}</span>
        </div>
      ) : (
        <div className="flex gap-2">
          {TYPES.map(t => (
            <button key={t.value} type="button" onClick={() => setType(t.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{
                backgroundColor: type === t.value ? '#1e3a5f' : (dark ? '#0f172a' : '#f8fafc'),
                color: type === t.value ? '#fff' : (dark ? '#94a3b8' : '#64748b'),
                border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
              }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Title</label>
          <Input required placeholder="e.g. Photosynthesis: Reactants and Products" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Subject</label>
          <Input placeholder="e.g. Science 7" value={subject} onChange={e => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Section</label>
          <Select value={sectionId} onChange={e => setSectionId(e.target.value)}>
            <option value="">Select section</option>
            {(sections || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Deadline</label>
          <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Instructions</label>
        <TextArea rows={2} placeholder="Read each item carefully before answering." value={instructions} onChange={e => setInstructions(e.target.value)} />
      </div>

      <div className="rounded-xl p-4" style={{
        background: dark ? 'linear-gradient(135deg, #0f172a, #1e293b)' : 'linear-gradient(135deg, #eff6ff, #f8fafc)',
        border: `1px solid ${dark ? '#334155' : '#dbeafe'}`,
      }}>
        <p className="text-sm font-bold mb-0.5 flex items-center gap-1.5" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
          <Sparkles size={14} style={{ color: '#3b82f6' }} /> Checking Mode
        </p>
        <p className="text-xs mb-3" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
          How submissions for this assessment will be checked. You can switch this anytime from the Submissions tab.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setCheckingMode('manual')}
            className="text-left p-3 rounded-lg transition-all"
            style={{
              backgroundColor: checkingMode === 'manual' ? (dark ? '#1e3a5f' : '#ffffff') : 'transparent',
              border: `2px solid ${checkingMode === 'manual' ? '#1e3a5f' : (dark ? '#334155' : '#e2e8f0')}`,
            }}>
            <div className="flex items-center gap-2 mb-1">
              <UserCheck size={16} style={{ color: checkingMode === 'manual' ? (dark ? '#fff' : '#1e3a5f') : (dark ? '#64748b' : '#94a3b8') }} />
              <span className="text-sm font-bold" style={{ color: checkingMode === 'manual' ? (dark ? '#fff' : '#1a2b4a') : (dark ? '#94a3b8' : '#64748b') }}>Manual</span>
            </div>
            <p className="text-xs leading-snug" style={{ color: checkingMode === 'manual' ? (dark ? '#cbd5e1' : '#475569') : (dark ? '#64748b' : '#94a3b8') }}>
              Teacher reviews and scores every submission item by item.
            </p>
          </button>
          <button type="button" onClick={() => setCheckingMode('ai')}
            className="text-left p-3 rounded-lg transition-all"
            style={{
              backgroundColor: checkingMode === 'ai' ? (dark ? '#1e3a5f' : '#ffffff') : 'transparent',
              border: `2px solid ${checkingMode === 'ai' ? '#1e3a5f' : (dark ? '#334155' : '#e2e8f0')}`,
            }}>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} style={{ color: checkingMode === 'ai' ? '#3b82f6' : (dark ? '#64748b' : '#94a3b8') }} />
              <span className="text-sm font-bold" style={{ color: checkingMode === 'ai' ? (dark ? '#fff' : '#1a2b4a') : (dark ? '#94a3b8' : '#64748b') }}>AI-Assisted</span>
            </div>
            <p className="text-xs leading-snug" style={{ color: checkingMode === 'ai' ? (dark ? '#cbd5e1' : '#475569') : (dark ? '#64748b' : '#94a3b8') }}>
              AI grades automatically; teacher can still review and override.
            </p>
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Items ({items.length}, {totalPoints} pts total)</p>
          <Btn type="button" variant="outline" onClick={addItem}><Plus size={14} /> Add item</Btn>
        </div>
        <div className="flex flex-col gap-3">
          {items.map((it, idx) => (
            <Card key={idx} className="p-3">
              <div className="flex items-start gap-2 mb-2">
                <span className="text-xs font-semibold pt-2.5" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{idx + 1}.</span>
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Select className="flex-1" value={it.item_type} onChange={e => updateItem(idx, { item_type: e.target.value, choices: ['', '', '', ''] })}>
                      {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Select>
                    <Input type="number" min="1" style={{ width: 80 }} value={it.points} onChange={e => updateItem(idx, { points: e.target.value })} placeholder="Pts" />
                  </div>
                  <TextArea rows={2} placeholder="Question text" value={it.question_text} onChange={e => updateItem(idx, { question_text: e.target.value })} />

                  {it.item_type === 'multiple_choice' && (
                    <div className="grid grid-cols-2 gap-2">
                      {it.choices.map((c, ci) => (
                        <Input key={ci} placeholder={`Choice ${String.fromCharCode(65 + ci)}`} value={c}
                          onChange={e => {
                            const next = [...it.choices]; next[ci] = e.target.value; updateItem(idx, { choices: next });
                          }} />
                      ))}
                      <Input className="col-span-2" placeholder="Correct answer (must match a choice exactly)" value={it.correct_answer}
                        onChange={e => updateItem(idx, { correct_answer: e.target.value })} />
                    </div>
                  )}
                  {it.item_type === 'true_false' && (
                    <Select value={it.correct_answer} onChange={e => updateItem(idx, { correct_answer: e.target.value })}>
                      <option value="">Correct answer</option>
                      <option value="True">True</option>
                      <option value="False">False</option>
                    </Select>
                  )}
                  {it.item_type === 'short_answer' && (
                    <Input placeholder="Expected answer (AI will allow close matches)" value={it.correct_answer}
                      onChange={e => updateItem(idx, { correct_answer: e.target.value })} />
                  )}
                  {it.item_type === 'essay' && (
                    <Input placeholder="Optional: rubric notes for the AI checker (e.g. must mention X, Y, Z)" value={it.correct_answer}
                      onChange={e => updateItem(idx, { correct_answer: e.target.value })} />
                  )}
                </div>
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 pt-2.5"><Trash2 size={16} /></button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <button type="submit" disabled={saving} className="w-full h-10 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2"
        style={{ backgroundColor: '#1e3a5f' }}>
        {saving && <Loader2 size={16} className="animate-spin" />} Save as draft
      </button>
    </form>
  );
};

// ============================================================
// ITEM ANALYSIS + AI RECOMMENDATION PANEL
// ============================================================
const AnalyticsPanel = ({ assessment, items, submissions, answers, showToast }) => {
  const { dark } = useTheme();
  const [loadingTip, setLoadingTip] = useState(false);
  const [tip, setTip] = useState(assessment.ai_recommendation || '');

  const checkedSubs = submissions.filter(s => s.status === 'checked');
  const classAverage = checkedSubs.length
    ? Math.round((checkedSubs.reduce((sum, s) => sum + (s.total_score || 0), 0) / checkedSubs.length / (assessment.total_points || 1)) * 100)
    : null;

  const itemStats = items.map(item => {
    const itemAnswers = answers.filter(a => a.item_id === item.id && checkedSubs.some(s => s.id === a.submission_id));
    const correctCount = itemAnswers.filter(a => a.is_correct).length;
    const percentCorrect = itemAnswers.length ? Math.round((correctCount / itemAnswers.length) * 100) : null;
    return { ...item, percentCorrect, answeredCount: itemAnswers.length };
  });

  const weakItems = itemStats.filter(i => i.percentCorrect !== null && i.percentCorrect < 60);

  const handleAITip = async () => {
    if (weakItems.length === 0) { showToast('No weak items detected yet', 'error'); return; }
    setLoadingTip(true);
    try {
      const suggestion = await getTeachingRecommendation(weakItems);
      setTip(suggestion);
      await supabase.from('assessments').update({ ai_recommendation: suggestion }).eq('id', assessment.id);
    } catch (err) {
      showToast('AI suggestion error: ' + err.message, 'error');
    }
    setLoadingTip(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Checked submissions</p>
          <p className="text-2xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{checkedSubs.length}/{submissions.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Class average</p>
          <p className="text-2xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{classAverage !== null ? `${classAverage}%` : '—'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Items below 60%</p>
          <p className="text-2xl font-bold" style={{ color: weakItems.length ? '#ef4444' : '#16a34a' }}>{weakItems.length}</p>
        </Card>
      </div>

      <Card className="p-4">
        <p className="text-sm font-semibold mb-3" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Item analysis</p>
        <div className="flex flex-col gap-2.5">
          {itemStats.map((it, idx) => (
            <div key={it.id} className="flex items-center gap-3">
              <span className="text-xs w-44 flex-shrink-0 truncate" style={{ color: dark ? '#cbd5e1' : '#475569' }} title={it.question_text}>
                {idx + 1}. {it.question_text}
              </span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: dark ? '#334155' : '#e2e8f0' }}>
                <div className="h-full rounded-full" style={{
                  width: `${it.percentCorrect ?? 0}%`,
                  backgroundColor: it.percentCorrect === null ? '#94a3b8' : it.percentCorrect < 60 ? '#ef4444' : it.percentCorrect < 80 ? '#d97706' : '#16a34a',
                }} />
              </div>
              <span className="text-xs w-24 text-right flex-shrink-0" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                {it.percentCorrect !== null ? `${it.percentCorrect}% correct` : 'Not checked'}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4" style={{ backgroundColor: dark ? '#412402' : '#FAEEDA', border: 'none' }}>
        <div className="flex items-start gap-3">
          <Lightbulb size={18} style={{ color: '#854F0B', flexShrink: 0, marginTop: 2 }} />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold" style={{ color: dark ? '#FAC775' : '#412402' }}>Suggested focus area</p>
              <Btn variant="outline" onClick={handleAITip} disabled={loadingTip}>
                {loadingTip ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Ask AI
              </Btn>
            </div>
            {tip ? (
              <p className="text-sm" style={{ color: dark ? '#FAC775' : '#633806' }}>{tip}</p>
            ) : (
              <p className="text-sm" style={{ color: dark ? '#FAC775' : '#633806' }}>
                {weakItems.length > 0
                  ? `${weakItems.length} item(s) scored below 60% class-wide. Click "Ask AI" for a specific re-teach suggestion.`
                  : 'No weak items detected yet — check more submissions to populate this.'}
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

// ============================================================
// SUBMISSIONS + CHECKING VIEW (per assessment)
// ============================================================
const SubmissionsView = ({ assessment, onBack, showToast, refreshList }) => {
  const { dark } = useTheme();
  const [items, setItems] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingMode, setCheckingMode] = useState(assessment.checking_mode);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState('submissions'); // 'submissions' | 'analytics'

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: itemsData } = await supabase.from('assessment_items').select('*').eq('assessment_id', assessment.id).order('order_index');
      const { data: subsData } = await supabase.from('assessment_submissions').select('*, profiles(name)').eq('assessment_id', assessment.id);
      const subIds = (subsData || []).map(s => s.id);
      const { data: answersData } = subIds.length
        ? await supabase.from('submission_answers').select('*').in('submission_id', subIds)
        : { data: [] };
      setItems(itemsData || []);
      setSubmissions(subsData || []);
      setAnswers(answersData || []);
    } catch (err) {
      showToast('Error loading submissions: ' + err.message, 'error');
    }
    setLoading(false);
  }, [assessment.id, showToast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleCheckingMode = async () => {
    const next = checkingMode === 'ai' ? 'manual' : 'ai';
    setCheckingMode(next);
    await supabase.from('assessments').update({ checking_mode: next }).eq('id', assessment.id);
  };

  // Auto-grade objective items (multiple_choice / true_false) by exact match
  const gradeObjective = (item, studentAnswer) => {
    if (!studentAnswer || !item.correct_answer) return { is_correct: false, points_earned: 0 };
    const match = studentAnswer.trim().toLowerCase() === item.correct_answer.trim().toLowerCase();
    return { is_correct: match, points_earned: match ? item.points : 0 };
  };

  const runAICheckForSubmission = async (submission) => {
    const subAnswers = answers.filter(a => a.submission_id === submission.id);
    let total = 0;
    for (const ans of subAnswers) {
      const item = items.find(i => i.id === ans.item_id);
      if (!item) continue;
      let result;
      if (item.item_type === 'multiple_choice' || item.item_type === 'true_false') {
        result = gradeObjective(item, ans.student_answer);
      } else {
        result = await gradeAnswerWithAI(item, ans.student_answer);
      }
      total += result.points_earned;
      await supabase.from('submission_answers').update({
        is_correct: result.is_correct,
        points_earned: result.points_earned,
        ai_feedback: result.feedback || null,
        manual_override: false,
      }).eq('id', ans.id);
    }
    await supabase.from('assessment_submissions').update({
      status: 'checked', total_score: total, checking_mode_used: 'ai',
      checked_at: new Date().toISOString(), checked_by: 'ai',
    }).eq('id', submission.id);
  };

  const handleRunAICheck = async () => {
    setRunning(true);
    try {
      const pending = submissions.filter(s => s.status === 'submitted');
      if (pending.length === 0) { showToast('No pending submissions to check', 'error'); setRunning(false); return; }
      for (const sub of pending) {
        await runAICheckForSubmission(sub);
      }
      showToast(`AI checked ${pending.length} submission(s)`);
      fetchAll();
      refreshList();
    } catch (err) {
      showToast('AI checking error: ' + err.message, 'error');
    }
    setRunning(false);
  };

  const handleManualScore = async (answerId, points, maxPoints) => {
    const value = Math.max(0, Math.min(maxPoints, Number(points) || 0));
    await supabase.from('submission_answers').update({
      points_earned: value, is_correct: value === maxPoints, manual_override: true,
    }).eq('id', answerId);
    fetchAll();
  };

  const finalizeManualSubmission = async (submission) => {
    const subAnswers = answers.filter(a => a.submission_id === submission.id);
    const total = subAnswers.reduce((sum, a) => sum + (Number(a.points_earned) || 0), 0);
    await supabase.from('assessment_submissions').update({
      status: 'checked', total_score: total, checking_mode_used: 'manual',
      checked_at: new Date().toISOString(), checked_by: 'teacher',
    }).eq('id', submission.id);
    showToast('Submission checked');
    fetchAll();
    refreshList();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
          <ChevronLeft size={16} /> Back to assessments
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setTab('submissions')} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: tab === 'submissions' ? '#1e3a5f' : 'transparent', color: tab === 'submissions' ? '#fff' : (dark ? '#94a3b8' : '#64748b'), border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
            <ListChecks size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} /> Submissions
          </button>
          <button onClick={() => setTab('analytics')} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: tab === 'analytics' ? '#1e3a5f' : 'transparent', color: tab === 'analytics' ? '#fff' : (dark ? '#94a3b8' : '#64748b'), border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
            <BarChart3 size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} /> Analytics
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{assessment.title}</h1>
        <p className="text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{assessment.subject} · {assessment.total_points} points · {items.length} items</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div>
      ) : tab === 'analytics' ? (
        <AnalyticsPanel assessment={assessment} items={items} submissions={submissions} answers={answers} showToast={showToast} />
      ) : (
        <>
          <Card className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Checking mode:</span>
              <button onClick={toggleCheckingMode} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                {checkingMode === 'ai' ? <Sparkles size={14} /> : <CheckCircle2 size={14} />}
                {checkingMode === 'ai' ? 'AI checking' : 'Manual checking'} — click to switch
              </button>
            </div>
            {checkingMode === 'ai' && (
              <Btn onClick={handleRunAICheck} disabled={running}>
                {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Run AI check on pending
              </Btn>
            )}
          </Card>

          <Card>
            <Table headers={['Student', 'Submitted', 'Status', 'Score', 'Action']}>
              {submissions.map(sub => {
                const subAnswers = answers.filter(a => a.submission_id === sub.id);
                return (
                  <TR key={sub.id}>
                    <TD><span className="font-medium" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{sub.profiles?.name || 'Unknown student'}</span></TD>
                    <TD>{new Date(sub.submitted_at).toLocaleDateString()}</TD>
                    <TD>
                      <Badge color={sub.status === 'checked' ? '#16a34a' : '#d97706'} bg={sub.status === 'checked' ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)'}>
                        {sub.status === 'checked' ? `Checked (${sub.checking_mode_used})` : 'Pending'}
                      </Badge>
                    </TD>
                    <TD>{sub.status === 'checked' ? `${sub.total_score} / ${assessment.total_points}` : '—'}</TD>
                    <TD>
                      {checkingMode === 'manual' ? (
                        <ManualGradeRow item={items} answers={subAnswers} onScore={handleManualScore} onFinalize={() => finalizeManualSubmission(sub)} dark={dark} />
                      ) : (
                        <span className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                          {sub.status === 'checked' ? 'AI-checked' : 'Run AI check above'}
                        </span>
                      )}
                    </TD>
                  </TR>
                );
              })}
              {submissions.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>No submissions yet</td></tr>
              )}
            </Table>
          </Card>
        </>
      )}
    </div>
  );
};

// Inline manual grading control per submission row (expand-on-click)
const ManualGradeRow = ({ item: items, answers, onScore, onFinalize, dark }) => {
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button onClick={() => setOpen(true)} className="text-xs font-medium text-blue-500 hover:text-blue-700">Grade manually</button>;
  }
  return (
    <div className="flex flex-col gap-1.5 p-2 rounded-lg" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', minWidth: 220 }}>
      {answers.map(ans => {
        const item = items.find(i => i.id === ans.item_id);
        if (!item) return null;
        return (
          <div key={ans.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate" style={{ color: dark ? '#cbd5e1' : '#475569', maxWidth: 120 }} title={item.question_text}>{item.question_text}</span>
            <input type="number" min="0" max={item.points} defaultValue={ans.points_earned}
              onBlur={e => onScore(ans.id, e.target.value, item.points)}
              className="w-14 h-7 px-1.5 rounded text-xs outline-none"
              style={{ backgroundColor: dark ? '#1e293b' : '#fff', border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`, color: dark ? '#f1f5f9' : '#1a2b4a' }} />
          </div>
        );
      })}
      <button onClick={onFinalize} className="mt-1 h-7 rounded text-xs font-semibold text-white" style={{ backgroundColor: '#1e3a5f' }}>
        <Save size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Finalize score
      </button>
    </div>
  );
};

// ============================================================
// FLOATING "HOW IT WORKS" BULB — hover-triggered animated reveal
// ============================================================
const HOW_STEPS = [
  { title: 'Pick a button', text: 'Activities, Quizzes, Exams, and Assignments each open their own workspace — what you create there stays in that category.' },
  { title: 'Build items', text: 'Multiple choice & true/false are auto-checked by exact match. Short answer & essay are checked against your reference answer or rubric notes.' },
  { title: 'Choose checking mode', text: 'Manual = you score every submission. AI-Assisted = AI grades automatically; you can still review and override.' },
  { title: 'Read the analytics', text: 'Open Submissions → Analytics to see % correct per item and an AI-generated suggestion on what to re-teach.' },
];

const FloatingHowItWorks = () => {
  const { dark } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;

  return (
    <div className="fixed bottom-6 right-6 z-40" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{
        position: 'absolute', bottom: '64px', right: 0, width: 300,
        transformOrigin: 'bottom right',
        transform: open ? 'scale(1) translateY(0)' : 'scale(0.82) translateY(10px)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 220ms ease-out',
      }}>
        <div style={{
          background: dark ? '#1e293b' : '#ffffff',
          border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
          borderRadius: 14, padding: '16px 16px 14px',
          boxShadow: '0 16px 40px rgba(15,23,42,0.22)',
        }}>
          <p className="flex items-center gap-1.5 text-sm font-bold mb-3" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
            <Lightbulb size={15} color="#FEB300" /> How Assessments works
          </p>
          <div className="flex flex-col gap-2.5">
            {HOW_STEPS.map((s, i) => (
              <div key={i} style={{
                display: 'flex', gap: 8,
                opacity: open ? 1 : 0,
                transform: open ? 'translateX(0)' : 'translateX(10px)',
                transition: `opacity 260ms ease ${open ? 70 + i * 65 : 0}ms, transform 260ms cubic-bezier(0.34,1.56,0.64,1) ${open ? 70 + i * 65 : 0}ms`,
              }}>
                <span className="text-xs font-bold flex-shrink-0" style={{ color: '#1e3a5f' }}>{i + 1}.</span>
                <p className="text-xs leading-snug" style={{ color: dark ? '#cbd5e1' : '#475569' }}>
                  <strong style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{s.title}.</strong> {s.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button onClick={() => setPinned(p => !p)} title="How Assessments works"
        className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center"
        style={{
          backgroundColor: '#1e3a5f',
          transform: open ? 'scale(1.1) rotate(8deg)' : 'scale(1) rotate(0deg)',
          transition: 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
        <Lightbulb size={20} color="#FEB300" style={{
          filter: open ? 'drop-shadow(0 0 7px rgba(254,179,0,0.85))' : 'none',
          transition: 'filter 320ms ease',
        }} />
      </button>
    </div>
  );
};

// ============================================================
// TYPE WORKSPACE — dedicated, self-contained area per button.
// Activities only manage activities, Quizzes only quizzes, etc.
// ============================================================
const TypeWorkspace = ({ typeValue, assessments, sections, loading, showToast, fetchAssessments, onBack, onOpenSubmissions, onPublish, onDelete }) => {
  const { dark } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const meta = TYPE_META.find(t => t.value === typeValue);
  const Icon = meta.icon;
  const list = assessments.filter(a => a.type === typeValue);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium mb-4" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
        <ChevronLeft size={16} /> Back to Assessments
      </button>

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: meta.bg }}>
            <Icon size={20} style={{ color: meta.color }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{meta.label}</h1>
            <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{list.length} {list.length === 1 ? 'item' : 'items'} in this category</p>
          </div>
        </div>
        <Btn onClick={() => setShowForm(true)}><Plus size={16} /> Create {TYPES.find(t => t.value === typeValue)?.label}</Btn>
      </div>

      <Card>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div>
        ) : (
          <Table headers={['Title', 'Points', 'Deadline', 'Submissions', 'Status', 'Actions']}>
            {list.map(a => {
              const subCount = a.assessment_submissions?.length || 0;
              const checkedCount = a.assessment_submissions?.filter(s => s.status === 'checked').length || 0;
              return (
                <TR key={a.id}>
                  <TD><span className="font-medium" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{a.title}</span></TD>
                  <TD>{a.total_points}</TD>
                  <TD>{a.deadline ? new Date(a.deadline).toLocaleDateString() : '—'}</TD>
                  <TD>{checkedCount}/{subCount} checked</TD>
                  <TD>
                    <Badge color={a.status === 'published' ? '#16a34a' : '#d97706'} bg={a.status === 'published' ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)'}>
                      {a.status === 'published' ? 'Published' : 'Draft'}
                    </Badge>
                  </TD>
                  <TD>
                    <div className="flex gap-3">
                      {a.status === 'draft' && (
                        <button onClick={() => onPublish(a.id)} className="text-xs text-blue-500 hover:text-blue-700 font-medium">Publish</button>
                      )}
                      <button onClick={() => onOpenSubmissions(a)} className="text-xs text-blue-500 hover:text-blue-700 font-medium">Submissions</button>
                      <button onClick={() => onDelete(a.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                    </div>
                  </TD>
                </TR>
              );
            })}
            {list.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                No {meta.label.toLowerCase()} yet — click "Create {TYPES.find(t => t.value === typeValue)?.label}" above to add your first one.
              </td></tr>
            )}
          </Table>
        )}
      </Card>

      {showForm && (
        <Modal title={`Create ${TYPES.find(t => t.value === typeValue)?.label}`} onClose={() => setShowForm(false)} wide>
          <AssessmentForm onClose={() => setShowForm(false)} onSaved={fetchAssessments} sections={sections} showToast={showToast} lockedType={typeValue} />
        </Modal>
      )}
    </div>
  );
};

// ============================================================
// MAIN: ASSESSMENTS TAB
// ============================================================
const AssessmentsTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { toast, showToast } = useToast();
  const [assessments, setAssessments] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState(null); // null = home, else 'activity'|'quiz'|'exam'|'assignment'
  const [selected, setSelected] = useState(null); // assessment object when viewing submissions

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('assessments')
      .select('*, assessment_submissions(id, status)')
      .eq('teacher_id', userData?.uid)
      .order('created_at', { ascending: false });
    if (error) showToast('Error: ' + error.message, 'error');
    else setAssessments(data || []);
    setLoading(false);
  }, [userData, showToast]);

  useEffect(() => {
    fetchAssessments();
    supabase.from('sections').select('id, name').eq('adviser_id', userData?.uid).then(({ data }) => setSections(data || []));
    const channel = supabase.channel('teacher-assessments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assessments' }, fetchAssessments)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchAssessments, userData]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this assessment? This also removes its items and submissions.')) return;
    const { error } = await supabase.from('assessments').delete().eq('id', id);
    if (error) showToast('Error: ' + error.message, 'error');
    else { showToast('Assessment deleted'); fetchAssessments(); }
  };

  const handlePublish = async (id) => {
    const { error } = await supabase.from('assessments').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) showToast('Error: ' + error.message, 'error');
    else { showToast('Published to class'); fetchAssessments(); }
  };

  const totalCount = assessments.length;
  const publishedCount = assessments.filter(a => a.status === 'published').length;
  const pendingChecksCount = assessments.reduce((sum, a) => sum + (a.assessment_submissions?.filter(s => s.status === 'submitted').length || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto relative">
      <ToastBanner toast={toast} />

      {selected ? (
        <SubmissionsView assessment={selected} onBack={() => setSelected(null)} showToast={showToast} refreshList={fetchAssessments} />
      ) : activeType ? (
        <TypeWorkspace
          typeValue={activeType}
          assessments={assessments}
          sections={sections}
          loading={loading}
          showToast={showToast}
          fetchAssessments={fetchAssessments}
          onBack={() => setActiveType(null)}
          onOpenSubmissions={setSelected}
          onPublish={handlePublish}
          onDelete={handleDelete}
        />
      ) : (
        <>
          <div className="mb-6">
            <h1 className="text-xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Assessments</h1>
            <p className="text-sm" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Choose a category below to create or manage that type.</p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="p-4">
              <p className="text-xs mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Total Assessments</p>
              <p className="text-2xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{totalCount}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Published</p>
              <p className="text-2xl font-bold" style={{ color: '#16a34a' }}>{publishedCount}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Pending Checks</p>
              <p className="text-2xl font-bold" style={{ color: '#d97706' }}>{pendingChecksCount}</p>
            </Card>
          </div>

          {/* Color-coded entry buttons — each opens its OWN dedicated workspace.
              Creating/managing an Activity never touches Quizzes/Exams/Assignments, and vice versa. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {TYPE_META.filter(t => t.value !== 'all').map(t => {
              const Icon = t.icon;
              const count = assessments.filter(a => a.type === t.value).length;
              return (
                <button key={t.value} onClick={() => setActiveType(t.value)}
                  className="flex flex-col gap-3 p-5 rounded-xl text-left transition-all hover:-translate-y-0.5"
                  style={{
                    backgroundColor: dark ? '#1e293b' : '#ffffff',
                    border: `1.5px solid ${dark ? '#334155' : '#e2e8f0'}`,
                    boxShadow: dark ? 'none' : '0 1px 2px rgba(15,23,42,0.04)',
                  }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.bg }}>
                    <Icon size={22} style={{ color: t.color }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold mb-0.5" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{t.label}</p>
                    <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{count} {count === 1 ? 'item' : 'items'}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <FloatingHowItWorks />
    </div>
  );
};

export default AssessmentsTab;

// ============================================================
// INTEGRATION NOTES — exactly what to change in TeacherDashboard.jsx
// (3 small, additive edits — nothing existing is removed or rewritten)
// ============================================================
//
// 1. Find this line near the top of TeacherDashboard.jsx:
//      const ThemeContext = createContext({ dark: false, toggleDark: () => {} });
//    Change it to:
//      export const ThemeContext = createContext({ dark: false, toggleDark: () => {} });
//    (just adds the `export` keyword — no behavior change)
//
// 2. Add this import near your other imports:
//      import AssessmentsTab from './AssessmentsTab';
//
// 3. In the <Routes> block, find:
//      <Route path="/assignments" element={<AssignmentsTab />} />
//    Change it to:
//      <Route path="/assignments" element={<AssessmentsTab />} />
//    (AssignmentsTab.jsx itself is untouched — just no longer mounted on this route.
//     You can still import and render it elsewhere if you want to keep it around.)
//
// Required: rename the sidebar label in navItems from 'Assignments' to 'Assessments'
//   { path: '/teacher-dashboard/assignments', icon: FileText, label: 'Assessments' }