// ============================================
// FILE: src/pages/dashboards/teacher/tabs/LessonPlansTab.jsx
// LESSON PLANS TAB — Full Supabase CRUD + File Upload
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import {
  BookOpen, Plus, Search, Trash2, Edit, X, Check, Upload, Download,
  FileText, Calendar, Loader2, Eye, Save, FileUp, AlertTriangle, Sparkles
} from 'lucide-react';
import { useTheme, useToast } from '../hooks';
import { Card, Input, Table, TR, TD, Modal, Badge, Btn } from '../shared/ui';

// Where the EduScribe API lives. The default is the local dev server; the
// deployed frontend sets VITE_API_BASE_URL to the deployed one.
//
// Note what is NOT here any more: VITE_GEMINI_API_KEY. This is only a URL —
// public by nature, and worthless to anyone who finds it, which is the whole
// difference between a base URL and an API key.
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const LessonPlansTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { toast, showToast } = useToast();

  // --- List of saved plans ---
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Upload / generation state ---
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // --- ILAW output state ---
  const [ilawOutput, setIlawOutput] = useState('');
  const [currentPlanMeta, setCurrentPlanMeta] = useState(null); // { title, file_name, file_url, file_path }
  const [savedPlanId, setSavedPlanId] = useState(null);

  // The editable area is an UNCONTROLLED node (ref-based), not driven by
  // React re-renders on every keystroke — combining contentEditable with
  // dangerouslySetInnerHTML on the same node causes the caret to jump/reset
  // and can scramble typed text, since React reapplies the HTML on every
  // render. `editorLoadKey` is bumped only when we deliberately want to push
  // NEW content into the DOM (after generation, or opening a saved plan) —
  // never as a side effect of the user's own typing.
  const editorRef = useRef(null);
  const [editorLoadKey, setEditorLoadKey] = useState(0);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = ilawOutput || '<p style="color:#94a3b8">No content yet. Upload a PDF to generate.</p>';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorLoadKey]);

  // --- View mode: 'list' | 'editor' ---
  const [view, setView] = useState('list');

  // --- Edit existing plan modal ---
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', subject: '', duration: '', strategy: '', objectives: '' });
  const [saving, setSaving] = useState(false);

  // ── Fetch saved plans ──────────────────────────────────────
  const fetchPlans = useCallback(async () => {
    if (!userData?.uid) return;
    setLoading(true);
    try {
      let { data, error } = await supabase
        .from('lesson_plans')
        .select('*')
        .eq('teacher_id', userData.uid)
        .order('created_at', { ascending: false });

      // The project's connection pool (free-tier, small compute) is
      // occasionally saturated for a few seconds — retry once after a
      // short pause instead of leaving the list looking empty.
      if (error) {
        console.warn('Lesson plans fetch failed, retrying once:', error.message);
        await new Promise(r => setTimeout(r, 1500));
        ({ data, error } = await supabase
          .from('lesson_plans')
          .select('*')
          .eq('teacher_id', userData.uid)
          .order('created_at', { ascending: false }));
      }

      if (error) throw error;
      setPlans(data || []);
    } catch (err) {
      showToast('Error loading plans: ' + err.message, 'error');
    }
    setLoading(false);
  }, [userData?.uid, showToast]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // ── Convert PDF file to base64 ─────────────────────────────
  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // ── Generate the lesson plan through the backend ───────────
  // The Gemini key used to be read here, from import.meta.env. Vite inlines
  // every VITE_* variable into the shipped bundle, so it was readable by
  // anyone who opened this page — and it is billable. The key, the ILAW
  // prompt and the retry now live in backend/src, and this sends the PDF to
  // an endpoint that requires a teacher's own session.
  const callGeminiWithPDF = async (base64PDF, fileName) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Your session has expired. Sign in again and retry.');
    }

    // 100s: the server gives Gemini 90 and may retry once, so a client
    // timeout tight against that would abandon a request still on its way
    // back and charge for a plan nobody receives.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 100000);

    try {
      const response = await fetch(`${API_BASE}/api/ai/lesson-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({ pdfBase64: base64PDF, fileName }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `Lesson plan generation failed (${response.status}).`);
      }

      const { html, truncated } = await response.json();
      return { html, truncated };
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('The request timed out. Try a smaller PDF.');
      }
      // A backend that is not running fails here as a bare network error,
      // which says nothing useful to a teacher.
      if (err instanceof TypeError) {
        throw new Error('Could not reach the lesson plan service. Check that the API is running.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // ── Handle PDF upload → Gemini → ILAW output ──────────────
  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Please upload a valid PDF file', 'error');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast('File too large. Max 20MB.', 'error');
      return;
    }

    setUploading(true);
    setGenerating(false);
    setIlawOutput('');
    setSavedPlanId(null);

    try {
      // 1. Convert to base64
      setUploadProgress('📄 Reading PDF...');
      const base64 = await fileToBase64(file);

      // 2. Upload to Supabase storage
      setUploadProgress('☁️ Uploading to storage...');
      const fileExt = 'pdf';
      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const filePath = `${userData?.uid}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('lesson-pdfs')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw new Error('Storage upload failed: ' + uploadError.message);

      const { data: urlData } = supabase.storage.from('lesson-pdfs').getPublicUrl(filePath);
      const publicUrl = urlData?.publicUrl;

      setCurrentPlanMeta({
        title: file.name.replace(/\.[^/.]+$/, ''),
        file_name: file.name,
        file_url: publicUrl,
        file_path: filePath,
      });

      // 3. Send to Gemini
      setUploading(false);
      setGenerating(true);
      setUploadProgress('🤖 Gemini AI is analyzing your PDF and generating ILAW lesson plan...');

      const { html, truncated } = await callGeminiWithPDF(base64, file.name);
      setIlawOutput(html);
      setEditorLoadKey(k => k + 1);
      setView('editor');
      showToast(
        truncated
          ? '⚠️ Lesson plan generated but was cut off near the end — review and finish it, or try regenerating.'
          : '✅ ILAW Lesson Plan generated! You can now edit and save it.',
        truncated ? 'error' : 'success'
      );
    } catch (err) {
      console.error('PDF Upload Error:', err);
      showToast('Error: ' + err.message, 'error');
    }

    setUploading(false);
    setGenerating(false);
    setUploadProgress('');
    e.target.value = '';
  };

  // ── Save generated ILAW plan to Supabase ──────────────────
  const handleSaveIlawPlan = async () => {
    if (!ilawOutput || !currentPlanMeta) {
      showToast('Nothing to save yet', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: currentPlanMeta.title,
        subject: 'ILAW Lesson Plan',
        teacher_id: userData?.uid,
        file_url: currentPlanMeta.file_url,
        file_name: currentPlanMeta.file_name,
        file_path: currentPlanMeta.file_path,
        objectives: ilawOutput, // store full HTML in objectives field
        ai_generated: true,
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (savedPlanId) {
        // Update existing
        const { error } = await supabase
          .from('lesson_plans')
          .update({ objectives: ilawOutput, updated_at: new Date().toISOString() })
          .eq('id', savedPlanId);
        if (error) throw error;
        showToast('✅ Changes saved!', 'success');
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('lesson_plans')
          .insert([payload])
          .select();
        if (error) throw error;
        setSavedPlanId(data?.[0]?.id);
        showToast('✅ Lesson plan saved!', 'success');
      }
      fetchPlans();
    } catch (err) {
      showToast('Error saving: ' + err.message, 'error');
    }
    setSaving(false);
  };

  // ── Print ──────────────────────────────────────────────────
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Print popup was blocked by your browser. Please allow popups for this site and try again.', 'error');
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>ILAW Lesson Plan</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 10mm; }
          .ilaw-lesson-plan { max-width: 100%; }
          .ilaw-title { text-align: center; font-size: 16px; font-weight: 900; margin-bottom: 10px; text-transform: uppercase; }
          .ilaw-info-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
          .ilaw-info-table th, .ilaw-info-table td { border: 1px solid #6b7280; padding: 5px 7px; font-size: 11px; }
          .ilaw-info-table th { background: #f3f4f6; font-weight: 700; width: 30%; }
          .ilaw-section { margin-bottom: 14px; border: 1px solid #6b7280; border-radius: 4px; overflow: hidden; }
          .ilaw-section-header { background: #1e3a5f; color: white; padding: 6px 10px; font-weight: 900; font-size: 12px; }
          .ilaw-I .ilaw-section-header { background: #1e3a5f; }
          .ilaw-L .ilaw-section-header { background: #065f46; }
          .ilaw-A .ilaw-section-header { background: #7c3aed; }
          .ilaw-W .ilaw-section-header { background: #92400e; }
          .ilaw-field { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
          .ilaw-field:last-child { border-bottom: none; }
          .ilaw-label { font-weight: 700; color: #374151; display: block; margin-bottom: 3px; }
          .ilaw-field p, .ilaw-field ul, .ilaw-field ol { margin: 2px 0; padding-left: 16px; }
          .ilaw-field li { margin-bottom: 2px; }
          .ilaw-signatures { display: flex; gap: 16px; margin-top: 16px; }
          .ilaw-sig-box { flex: 1; border: 1px solid #6b7280; padding: 8px; text-align: center; }
          .ilaw-sig-line { border-top: 1px solid #111; margin: 30px 8px 4px; }
          .ilaw-sig-name { font-weight: 700; font-size: 11px; margin: 0; }
          .ilaw-sig-position { font-size: 10px; color: #374151; margin: 2px 0 0; }
          @page { size: A4; margin: 8mm; }
        </style>
      </head>
      <body>${ilawOutput}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  // ── Download as .doc ───────────────────────────────────────
  const handleDownload = () => {
    const title = currentPlanMeta?.title || 'ILAW_Lesson_Plan';
    const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="UTF-8"><title>${title}</title>
<style>
body{font-family:Arial,sans-serif;font-size:11pt;}
.ilaw-section-header{background:#1e3a5f;color:white;padding:6px 10px;font-weight:bold;}
.ilaw-L .ilaw-section-header{background:#065f46;}
.ilaw-A .ilaw-section-header{background:#7c3aed;}
.ilaw-W .ilaw-section-header{background:#92400e;}
.ilaw-field{padding:6px 10px;}
.ilaw-label{font-weight:bold;}
table{width:100%;border-collapse:collapse;}
th,td{border:1px solid #6b7280;padding:5px 7px;}
th{background:#f3f4f6;}
</style>
</head>
<body>${ilawOutput}</body>
</html>`;
    const blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📥 Downloaded as Word document!', 'success');
  };

  // ── Load saved plan into editor ────────────────────────────
  const handleViewPlan = (plan) => {
    setIlawOutput(plan.objectives || '');
    setEditorLoadKey(k => k + 1);
    setCurrentPlanMeta({
      title: plan.title,
      file_name: plan.file_name,
      file_url: plan.file_url,
      file_path: plan.file_path,
    });
    setSavedPlanId(plan.id);
    setView('editor');
  };

  // ── Delete plan ────────────────────────────────────────────
  const handleDeletePlan = async (id) => {
    if (!confirm('Delete this lesson plan?')) return;
    const { error } = await supabase.from('lesson_plans').delete().eq('id', id);
    if (error) showToast('Error: ' + error.message, 'error');
    else {
      showToast('Lesson plan deleted');
      if (savedPlanId === id) {
        setView('list');
        setIlawOutput('');
        setSavedPlanId(null);
      }
      fetchPlans();
    }
  };

  // ── Quick create (manual) ──────────────────────────────────
  const [quickForm, setQuickForm] = useState({ title: '', subject: '', duration: '', strategy: '', objectives: '' });

  const handleQuickCreate = async (e) => {
    e.preventDefault();
    if (!quickForm.title?.trim() || !quickForm.subject?.trim()) {
      showToast('Title and Subject are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('lesson_plans').insert([{
        ...quickForm,
        teacher_id: userData?.uid,
        ai_generated: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }]);
      if (error) throw error;
      showToast('Lesson plan created!');
      setQuickForm({ title: '', subject: '', duration: '', strategy: '', objectives: '' });
      fetchPlans();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
    setSaving(false);
  };

  // ── ILAW output styles ─────────────────────────────────────
  const ilawStyles = `
  .ilaw-lesson-plan { font-family: Arial, sans-serif; font-size: 12px; color: ${dark ? '#e2e8f0' : '#111827'}; line-height: 1.5; }

  .ilaw-letterhead { text-align: center; margin-bottom: 10px; }
  .ilaw-letterhead p { margin: 0; font-size: 12px; color: ${dark ? '#cbd5e1' : '#374151'}; }
  .ilaw-letterhead .ilaw-school-name { font-weight: 900; font-size: 13px; text-transform: uppercase; color: ${dark ? '#f1f5f9' : '#111827'}; margin-top: 2px; }
  .ilaw-letterhead .ilaw-school-address { font-style: italic; }
  .ilaw-title { text-align: center; font-size: 15px; font-weight: 900; margin: 12px 0 14px; text-transform: uppercase; color: ${dark ? '#f1f5f9' : '#1e3a5f'}; }

  .ilaw-info-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .ilaw-info-table th, .ilaw-info-table td { border: 1px solid ${dark ? '#475569' : '#6b7280'}; padding: 6px 8px; font-size: 11.5px; vertical-align: top; }
  .ilaw-info-table th { background: ${dark ? '#1e293b' : '#f3f4f6'}; font-weight: 700; width: 26%; text-align: left; color: ${dark ? '#f1f5f9' : '#111'}; }
  .ilaw-info-table td { color: ${dark ? '#cbd5e1' : '#374151'}; }

  .ilaw-section { margin-bottom: 14px; border: 1px solid ${dark ? '#475569' : '#6b7280'}; border-radius: 8px; overflow: hidden; }
  .ilaw-section-header { background: #1e3a5f; color: white; padding: 8px 12px; font-weight: 900; font-size: 12.5px; letter-spacing: 0.3px; }
  .ilaw-L .ilaw-section-header { background: #065f46; }
  .ilaw-A .ilaw-section-header { background: #5b21b6; }
  .ilaw-W .ilaw-section-header { background: #92400e; }
  .ilaw-section-intro { padding: 8px 12px; font-style: italic; font-size: 11px; background: ${dark ? '#0f172a' : '#f9fafb'}; color: ${dark ? '#94a3b8' : '#6b7280'}; border-bottom: 1px solid ${dark ? '#334155' : '#e5e7eb'}; }

  .ilaw-field { padding: 8px 12px; border-bottom: 1px solid ${dark ? '#334155' : '#e5e7eb'}; background: ${dark ? '#1e293b' : '#ffffff'}; }
  .ilaw-field:last-child { border-bottom: none; }
  .ilaw-label { font-weight: 700; color: ${dark ? '#94a3b8' : '#374151'}; display: block; margin-bottom: 4px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.4px; }
  .ilaw-label-hint { font-weight: 400; text-transform: none; font-style: italic; font-size: 10px; display: block; color: ${dark ? '#64748b' : '#9ca3af'}; margin-bottom: 4px; letter-spacing: 0; }
  .ilaw-field p { margin: 4px 0; color: ${dark ? '#cbd5e1' : '#374151'}; line-height: 1.6; }
  .ilaw-field ul, .ilaw-field ol { margin: 4px 0; padding-left: 20px; color: ${dark ? '#cbd5e1' : '#374151'}; }
  .ilaw-field li { margin-bottom: 4px; line-height: 1.55; }
  .ilaw-field strong { color: ${dark ? '#f1f5f9' : '#111827'}; }

  .ilaw-week-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  .ilaw-week-table th, .ilaw-week-table td { border: 1px solid ${dark ? '#475569' : '#6b7280'}; padding: 6px 7px; font-size: 11px; vertical-align: top; text-align: left; }
  .ilaw-week-table th { background: ${dark ? '#1e293b' : '#f3f4f6'}; font-weight: 700; color: ${dark ? '#f1f5f9' : '#111'}; text-align: center; width: 18.66%; }
  .ilaw-week-table td { color: ${dark ? '#cbd5e1' : '#374151'}; }

  .ilaw-signatures { margin-top: 18px; font-size: 12px; color: ${dark ? '#cbd5e1' : '#374151'}; }
  .ilaw-sig-row { display: flex; justify-content: space-between; margin-top: 22px; }
  .ilaw-sig-col { width: 46%; }
  .ilaw-sig-tag { font-style: italic; margin-bottom: 26px; display: block; }
  .ilaw-sig-name { font-weight: 700; margin: 0; text-transform: uppercase; color: ${dark ? '#f1f5f9' : '#111'}; border-top: 1px solid ${dark ? '#cbd5e1' : '#111'}; padding-top: 3px; display: inline-block; }
  .ilaw-sig-position { font-style: italic; font-size: 11px; margin: 2px 0 0; }
  .ilaw-sig-noted { margin-top: 22px; }
`;

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="p-6">
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 shadow-lg ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3 rounded-lg px-4 py-3"
        style={{ background: 'var(--banner-bg)', border: '1px solid var(--banner-border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          {view === 'editor' && (
            <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm font-medium hover:opacity-70 transition flex-shrink-0"
              style={{ color: 'var(--banner-subtext)' }}>
              ← Back
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate" style={{ color: 'var(--banner-text)' }}>
              {view === 'editor' ? (currentPlanMeta?.title || 'ILAW Lesson Plan') : 'Lesson Plans'}
            </h1>
            {view === 'editor' && currentPlanMeta?.file_name && (
              <p className="text-xs truncate" style={{ color: 'var(--banner-subtext)' }}>📄 {currentPlanMeta.file_name}</p>
            )}
          </div>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold flex-shrink-0" style={{ backgroundColor: 'rgba(22,163,74,0.15)', color: '#16a34a' }}>
            <Sparkles size={16} />
            AI-Powered · Gemini
          </span>
        </div>

        {view === 'editor' && ilawOutput && (
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            <Btn variant="pastel" onClick={handlePrint}><Eye size={15} /> Print</Btn>
            <Btn variant="pastel" onClick={handleDownload}><Download size={15} /> Download</Btn>
            <Btn variant="pastel" onClick={handleSaveIlawPlan} disabled={saving}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {savedPlanId ? 'Save Changes' : 'Save Plan'}
            </Btn>
          </div>
        )}
      </div>

      {/* ══════════════ LIST VIEW ══════════════ */}
      {view === 'list' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: upload + saved plans */}
          <div className="lg:col-span-2 space-y-5">

            {/* Upload card */}
            <Card className="p-8 text-center" style={{ border: `2px dashed ${dark ? '#475569' : '#cbd5e1'}` }}>
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: dark ? '#0f172a' : '#eff6ff' }}>
                {(uploading || generating) ? (
                  <Loader2 size={28} className="text-blue-500 animate-spin" />
                ) : (
                  <Upload size={28} className="text-blue-500" />
                )}
              </div>

              {(uploading || generating) ? (
                <>
                  <p className="font-semibold mb-2 text-blue-500">{uploadProgress}</p>
                  <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                    Please wait — this may take 15–30 seconds
                  </p>
                  <div className="mt-4 w-full bg-gray-200 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full animate-pulse" style={{ width: generating ? '80%' : '40%' }} />
                  </div>
                </>
              ) : (
                <>
                  <p className="font-bold text-lg mb-1" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                    Upload PDF → AI generates ILAW Lesson Plan
                  </p>
                  <p className="text-sm mb-5" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                    Upload your syllabus, textbook chapter, or curriculum guide. Gemini AI will analyze it and generate a complete DepEd ILAW-formatted lesson plan.
                  </p>
                  <input type="file" accept=".pdf" id="pdfUpload" className="hidden" onChange={handlePdfUpload} />
                  <Btn variant="primary" onClick={() => document.getElementById('pdfUpload')?.click()}>
                    <FileUp size={16} /> Choose PDF to Upload
                  </Btn>
                  <p className="text-xs mt-3" style={{ color: dark ? '#475569' : '#cbd5e1' }}>Max 20MB · PDF only</p>
                </>
              )}
            </Card>

            {/* Saved plans list */}
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-500" /></div>
            ) : plans.length === 0 ? (
              <Card className="p-8 text-center">
                <p style={{ color: dark ? '#64748b' : '#94a3b8' }}>No lesson plans yet. Upload a PDF above to get started.</p>
              </Card>
            ) : (
              plans.map(plan => (
                <Card key={plan.id} className="overflow-hidden" style={{ transition: 'transform .15s, box-shadow .15s' }}>
                  {/* Accent strip — same pastel family as the rest of the dashboard */}
                  <div style={{ height: 4, background: 'var(--banner-bg)' }} />
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3 gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base truncate" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{plan.title}</h3>
                        <p className="text-xs mt-0.5" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                          {plan.subject} · {new Date(plan.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        {plan.ai_generated && (
                          <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: 'rgba(22,163,74,0.15)', color: '#16a34a' }}>
                            <Sparkles size={11} /> AI
                          </span>
                        )}
                        <Badge
                          color={plan.status === 'draft' ? '#d97706' : '#16a34a'}
                          bg={plan.status === 'draft' ? 'rgba(217,119,6,0.12)' : 'rgba(22,163,74,0.12)'}>
                          {plan.status || 'draft'}
                        </Badge>
                      </div>
                    </div>

                    {plan.file_name && (
                      <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg"
                        style={{ backgroundColor: 'var(--banner-pill-bg, #f8fafc)', border: '1px solid var(--banner-pill-border, #e2e8f0)' }}>
                        <FileText size={14} style={{ color: 'var(--banner-accent, #1908DF)' }} />
                        <span className="text-xs truncate" style={{ color: 'var(--banner-accent, #1908DF)' }}>{plan.file_name}</span>
                        {plan.file_url && (
                          <a href={plan.file_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs ml-auto flex-shrink-0 hover:underline" style={{ color: 'var(--banner-subtext, #64748b)' }}>Open ↗</a>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Btn variant="pastel" className="flex-1 justify-center" onClick={() => handleViewPlan(plan)}>
                        <Eye size={14} /> View & Edit
                      </Btn>
                      <button onClick={() => handleDeletePlan(plan.id)}
                        className="p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition"
                        style={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Right: Quick Create */}
          <Card className="p-5 h-fit">
            <h2 className="text-sm font-semibold mb-4"
              style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Quick Create (Manual)</h2>
            <form onSubmit={handleQuickCreate} className="space-y-3">
              <Input placeholder="Title" required value={quickForm.title}
                onChange={e => setQuickForm({ ...quickForm, title: e.target.value })} />
              <Input placeholder="Subject" required value={quickForm.subject}
                onChange={e => setQuickForm({ ...quickForm, subject: e.target.value })} />
              <Input placeholder="Duration (e.g. 60 minutes)" value={quickForm.duration}
                onChange={e => setQuickForm({ ...quickForm, duration: e.target.value })} />
              <Input placeholder="Strategy (e.g. Cooperative Learning)" value={quickForm.strategy}
                onChange={e => setQuickForm({ ...quickForm, strategy: e.target.value })} />
              <textarea placeholder="Objectives (one per line)" rows={4} value={quickForm.objectives}
                onChange={e => setQuickForm({ ...quickForm, objectives: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`, color: dark ? '#f1f5f9' : '#1a2b4a' }} />
              <button type="submit" disabled={saving}
                className="w-full h-10 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2"
                style={{ backgroundColor: '#1e3a5f' }}>
                {saving && <Loader2 size={16} className="animate-spin" />} Create Plan
              </button>
            </form>
          </Card>
        </div>
      )}

      {/* ══════════════ EDITOR VIEW ══════════════ */}
      {view === 'editor' && (
        <div className="space-y-4">

          {/* Editable ILAW output */}
          <Card className="p-6">
            {ilawOutput && (
              <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 mb-3"
                style={{
                  backgroundColor: dark ? 'rgba(217,119,6,0.12)' : '#fffbeb',
                  border: `1px solid ${dark ? 'rgba(217,119,6,0.3)' : '#fde68a'}`,
                }}>
                <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0, marginTop: 2 }} />
                <p className="text-xs" style={{ color: dark ? '#fbbf24' : '#92400e' }}>
                  This lesson plan was generated with AI (Gemini) and can make mistakes. Please review and verify all
                  content — objectives, activities, and assessments — before using it in class.
                </p>
              </div>
            )}
            <p className="text-xs mb-3 font-medium" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
              ✏️ Click anywhere in the lesson plan below to edit it directly
            </p>
            <style>{ilawStyles}</style>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={e => setIlawOutput(e.currentTarget.innerHTML)}
              className="outline-none min-h-96"
              style={{
                padding: '16px',
                borderRadius: '10px',
                border: `1px dashed ${dark ? '#475569' : '#cbd5e1'}`,
                backgroundColor: dark ? '#0f172a' : '#fafafa',
              }}
            />
          </Card>
        </div>
      )}
    </div>
  );
};

export default LessonPlansTab;
