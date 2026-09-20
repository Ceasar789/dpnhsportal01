// ============================================
// FILE: src/pages/dashboards/student/tabs/WorksheetsTab.jsx
// Worksheets posted to this student's section, and the answering surface.
// Never selects worksheet_item_keys — the answer key is not readable here and
// must not be requested. Never imports checkItem/scoreSubmission — those run
// only in the teacher's browser, where the key is actually readable.
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { FileText, Loader2, RefreshCw, Clock } from 'lucide-react';
import { useTheme, useToast, Card, Badge } from '../hooks';
import { withRetry } from '../../../../lib/supabaseRetry';
import { TRUE_FALSE_VALUES } from '../../../../lib/worksheetChecking';

const StudentWorksheetsTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { showToast, Toast } = useToast();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [active, setActive] = useState(null);
  const [items, setItems] = useState([]);
  const [answers, setAnswers] = useState({});
  const [submission, setSubmission] = useState(null);
  const [busy, setBusy] = useState(false);

  const muted = { color: dark ? '#64748b' : '#94a3b8' };

  const fetchWorksheets = useCallback(async () => {
    if (!userData?.uid) return;
    setLoading(true);

    const { data: postings, error } = await withRetry(
      () => supabase.from('worksheet_sections').select('id, worksheet_id, section_id, due_at'),
      { label: 'Student worksheet postings fetch' }
    );
    if (error) {
      console.warn('Student worksheet postings fetch failed —', error.message);
      setLoadError(true); setLoading(false); return;
    }

    const ids = [...new Set((postings || []).map(p => p.worksheet_id))];
    if (ids.length === 0) { setLoadError(false); setRows([]); setLoading(false); return; }

    const [sheetResult, subResult] = await Promise.all([
      withRetry(() => supabase.from('worksheets').select('id, title, subject').in('id', ids),
        { label: 'Student worksheets fetch' }),
      // Reads the student's own submission rows so their status/score can be
      // shown. A failed read here must NEVER be treated as "no submission" —
      // that would invite an already-submitted student to answer again and
      // then fail on the UNIQUE(worksheet_id, student_id) constraint. Both
      // branches below fall into the shared loadError state instead.
      withRetry(() => supabase.from('worksheet_submissions')
        .select('id, worksheet_id, status, released, score, total_points')
        .eq('student_id', userData.uid),
        { label: 'Student submissions fetch' }),
    ]);

    if (sheetResult.error || subResult.error) {
      console.warn('Student worksheets load failed —',
        (sheetResult.error || subResult.error).message);
      setLoadError(true); setLoading(false); return;
    }

    setLoadError(false);
    setRows((postings || []).map(p => ({
      posting: p,
      sheet: (sheetResult.data || []).find(w => w.id === p.worksheet_id),
      submission: (subResult.data || []).find(s => s.worksheet_id === p.worksheet_id) || null,
    })).filter(r => r.sheet));
    setLoading(false);
  }, [userData?.uid]);

  useEffect(() => { fetchWorksheets(); }, [fetchWorksheets]);

  const open = async (row) => {
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
        section_id: row.posting.section_id,
        source: 'online',
        status: 'in_progress',
      }]).select().single();
      if (createError) {
        showToast(`Could not start: ${createError.message}`, 'error');
        setBusy(false); return;
      }
      sub = data;
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

  // Saved as the student works — this project's hosting tier drops
  // connections, and losing a half-finished worksheet would be worse than
  // an extra write per answer. This is a write, so it is not wrapped in
  // withRetry, but a failure still has to be surfaced rather than silently
  // leaving the student believing the answer is safe.
  const saveAnswer = async (itemId, value) => {
    setAnswers(prev => ({ ...prev, [itemId]: value }));
    const { error } = await supabase.from('worksheet_answers').upsert([{
      submission_id: submission.id, item_id: itemId, answer: value,
    }], { onConflict: 'submission_id,item_id' });
    if (error) {
      showToast('Could not save that answer. Check your connection.', 'error');
    }
  };

  const submit = async () => {
    setBusy(true);
    // submitted_at is stamped server-side by guard_worksheet_submission_write
    // (in_progress -> submitted); a student is not allowed to set it, and
    // sending it here would be pointless even though the trigger overwrites it.
    const { error } = await supabase.from('worksheet_submissions').update({
      status: 'submitted',
    }).eq('id', submission.id);
    setBusy(false);
    if (error) return showToast(`Could not submit: ${error.message}`, 'error');
    showToast('Submitted. Your teacher will check it.');
    setSubmission(prev => prev ? { ...prev, status: 'submitted' } : prev);
    setActive(null);
    fetchWorksheets();
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
        <button onClick={() => setActive(null)} className="text-sm mb-4" style={muted}>← Back</button>
        <h1 className="text-xl font-bold mb-1" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{active.sheet.title}</h1>
        <p className="text-xs mb-4" style={muted}>{active.sheet.subject}</p>

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

                {it.item_type === 'multiple_choice' && (it.options || []).map(opt => (
                  <label key={opt} className="flex items-center gap-2 text-sm py-1" style={{ color: dark ? '#cbd5e1' : '#374151' }}>
                    <input type="radio" name={it.id} disabled={done} checked={answers[it.id] === opt}
                      onChange={() => saveAnswer(it.id, opt)} />
                    {opt}
                  </label>
                ))}

                {/* Submitted as exactly "True"/"False" — TRUE_FALSE_VALUES,
                    not retyped — because that is what the teacher's key
                    stores those two options as. */}
                {it.item_type === 'true_false' && TRUE_FALSE_VALUES.map(opt => (
                  <label key={opt} className="flex items-center gap-2 text-sm py-1" style={{ color: dark ? '#cbd5e1' : '#374151' }}>
                    <input type="radio" name={it.id} disabled={done} checked={answers[it.id] === opt}
                      onChange={() => saveAnswer(it.id, opt)} />
                    {opt}
                  </label>
                ))}

                {it.item_type === 'identification' && (
                  <input type="text" disabled={done} defaultValue={answers[it.id] || ''}
                    onBlur={e => saveAnswer(it.id, e.target.value)}
                    className="w-full h-9 px-3 rounded-lg text-sm outline-none"
                    style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc',
                             border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
                             color: dark ? '#f1f5f9' : '#1a2b4a' }} />
                )}

                {it.item_type === 'enumeration' && (
                  <textarea disabled={done} rows={3}
                    defaultValue={(answers[it.id] || []).join('\n')}
                    onBlur={e => saveAnswer(it.id, e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
                    placeholder="One answer per line"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc',
                             border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
                             color: dark ? '#f1f5f9' : '#1a2b4a' }} />
                )}

                {it.item_type === 'essay' && (
                  <textarea disabled={done} rows={5} defaultValue={answers[it.id] || ''}
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
        <h1 className="text-xl font-bold" style={{ color: 'var(--banner-text)' }}>My Worksheets</h1>
        <button onClick={fetchWorksheets} className="p-1.5 rounded-lg" style={muted}><RefreshCw size={16} /></button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" size={32} style={muted} /></div>
      ) : loadError ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-semibold mb-2" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Could not load your worksheets.</p>
          <p className="text-sm mb-3" style={muted}>Check your connection and try again.</p>
          <button onClick={fetchWorksheets} className="h-9 px-4 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: '#1908DF', color: '#fff' }}>Retry</button>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText size={40} className="mx-auto mb-3" style={{ color: dark ? '#334155' : '#cbd5e1' }} />
          <p style={muted}>No worksheets have been posted to your section yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map(row => (
            <Card key={row.posting.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{row.sheet.title}</p>
                <p className="text-xs" style={muted}>{row.sheet.subject}</p>
                {row.posting.due_at && (
                  <p className="text-xs flex items-center gap-1 mt-1" style={muted}>
                    <Clock size={12} /> Due {new Date(row.posting.due_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
              <div className="text-right">
                <Badge color="#2563eb" bg="rgba(37,99,235,0.12)">{statusLabel(row)}</Badge>
                <button onClick={() => open(row)} disabled={busy}
                  className="block mt-2 text-xs font-semibold" style={{ color: '#1908DF' }}>
                  {row.submission ? 'Open' : 'Start'}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentWorksheetsTab;
