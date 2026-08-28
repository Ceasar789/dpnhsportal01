// ============================================
// FILE: src/pages/dashboards/teacher/tabs/LessonPlansTab.jsx
// LESSON PLANS TAB — Full Supabase CRUD + File Upload
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import {
  BookOpen, Plus, Search, Trash2, Edit, X, Check, Upload, Download,
  FileText, Calendar, Loader2, Eye, Save, FileUp
} from 'lucide-react';
import { useTheme, useToast } from '../hooks';
import { Card, Input, Table, TR, TD, Modal, Badge, Btn } from '../shared/ui';

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

  // --- View mode: 'list' | 'editor' ---
  const [view, setView] = useState('list');

  // --- Edit existing plan modal ---
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', subject: '', duration: '', strategy: '', objectives: '' });
  const [saving, setSaving] = useState(false);

  // ── Fetch saved plans ──────────────────────────────────────
  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lesson_plans')
        .select('*')
        .eq('teacher_id', userData?.uid)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPlans(data || []);
    } catch (err) {
      showToast('Error loading plans: ' + err.message, 'error');
    }
    setLoading(false);
  }, [userData, showToast]);

  useEffect(() => {
    fetchPlans();
    const channel = supabase
      .channel('teacher-lesson-plans-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_plans' }, fetchPlans)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchPlans]);

  // ── Convert PDF file to base64 ─────────────────────────────
  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // ── Call Gemini API with PDF ───────────────────────────────
  const callGeminiWithPDF = async (base64PDF, fileName) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error('VITE_GEMINI_API_KEY not set in .env');

    const prompt = `You are an expert Filipino teacher assistant. Analyze the uploaded PDF document and generate a complete ILAW Lesson Plan following DepEd Order No. 3, s. 2026.

The ILAW framework stands for:
I - Intentions (Learning Competency, Learning Objectives per day, Learner Context per day)
L - Learning Experience (Pre-Lesson, Flow, Learning Resources, Integration Opportunities — each per day)
A - Assessment (Formative Assessment per day)
W - Ways Forward (Extended Learning opportunities and Reflections per day)

Most fields are organized as a 5-day week (Monday to Friday). If the PDF content only reasonably covers fewer days, you may still fill all 5 columns with a sensible session breakdown so the lesson spans the week.

Based on the PDF content, generate the lesson plan in this EXACT HTML format (keep all class names exactly as shown, do not add or rename any class):

<div class="ilaw-lesson-plan">

<div class="ilaw-letterhead">
<p>Republic of the Philippines</p>
<p>Department of Education</p>
<p>Region IVA-CALABARZON</p>
<p>City Schools Division of Biñan City</p>
<p class="ilaw-school-name">Dela Paz National High School</p>
<p class="ilaw-school-address">P. Paterno St., Dela Paz, Biñan City, Laguna</p>
</div>

<h2 class="ilaw-title">ILAW Lesson Plan in [Subject from PDF, e.g. TLE 9]</h2>

<table class="ilaw-info-table">
<tr><th>Name of Lesson</th><td>[Extract or infer from PDF]</td><th>Teaching Date</th><td>[Infer a plausible date range, or write "To be specified"]</td></tr>
<tr><th>Learning Area/s</th><td>[Subject area from PDF]</td><th>Term No. and Week No.</th><td>[Infer, or write "To be specified"]</td></tr>
<tr><th>Designed by Teacher/s</th><td colspan="3">[Leave as "____________________"]</td></tr>
<tr><th>Designed for which Grade Level and Section</th><td colspan="3">[Grade level if mentioned in PDF, else "To be specified"]</td></tr>
<tr><th>No. of Sessions</th><td colspan="3">5 Sessions (1 Week)</td></tr>
<tr><th>References (books, websites, toolkits, etc.)</th><td colspan="3">[List references from PDF, or "Based on uploaded material"]</td></tr>
<tr><th>Declaration of AI use</th><td colspan="3">AI (Gemini) was used to analyze the uploaded reference material and generate a structured first draft of this lesson plan, which the teacher reviewed and edited.</td></tr>
</table>

<div class="ilaw-section ilaw-I">
<div class="ilaw-section-header">I — INTENTIONS</div>
<div class="ilaw-section-intro">Start by deciding what you want learners to master by the end of the lesson — keep it clear and simple.</div>
<div class="ilaw-field">
<span class="ilaw-label">Learning Competency</span>
<span class="ilaw-label-hint">Competency/ies from the curriculum being targeted, and the content or performance standards applicable.</span>
<p>[Extract main competency from PDF content]</p>
</div>
<div class="ilaw-field">
<span class="ilaw-label">Learning Objectives</span>
<span class="ilaw-label-hint">Smaller knowledge, skills, or tasks from the competency that learners will work on and show by end of session.</span>
<table class="ilaw-week-table">
<tr><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr>
<tr><td>[Objective for Mon]</td><td>[Objective for Tue]</td><td>[Objective for Wed]</td><td>[Objective for Thu]</td><td>[Objective for Fri]</td></tr>
</table>
</div>
<div class="ilaw-field">
<span class="ilaw-label">Learner Context</span>
<span class="ilaw-label-hint">Observations of learners and how they've been performing recently — strengths, interests, possible barriers.</span>
<table class="ilaw-week-table">
<tr><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr>
<tr><td>[Context note]</td><td>[Context note]</td><td>[Context note]</td><td>[Context note]</td><td>[Context note]</td></tr>
</table>
</div>
</div>

<div class="ilaw-section ilaw-L">
<div class="ilaw-section-header">L — LEARNING EXPERIENCE</div>
<div class="ilaw-section-intro">Identify activities and interactions to help learners gain knowledge, skills, or understanding in a purposeful way.</div>
<div class="ilaw-field">
<span class="ilaw-label">Pre-Lesson</span>
<span class="ilaw-label-hint">How you will help learners get ready for the lesson.</span>
<table class="ilaw-week-table">
<tr><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr>
<tr><td>[Activity]</td><td>[Activity]</td><td>[Activity]</td><td>[Activity]</td><td>[Activity]</td></tr>
</table>
</div>
<div class="ilaw-field">
<span class="ilaw-label">Flow</span>
<span class="ilaw-label-hint">Activities to implement across sessions to meet the learning objectives.</span>
<table class="ilaw-week-table">
<tr><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr>
<tr><td>[Flow of activities]</td><td>[Flow of activities]</td><td>[Flow of activities]</td><td>[Flow of activities]</td><td>[Flow of activities]</td></tr>
</table>
</div>
<div class="ilaw-field">
<span class="ilaw-label">Learning Resources</span>
<span class="ilaw-label-hint">Resources that will help reach the objectives — must be available and inclusive.</span>
<table class="ilaw-week-table">
<tr><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr>
<tr><td>[Resources]</td><td>[Resources]</td><td>[Resources]</td><td>[Resources]</td><td>[Resources]</td></tr>
</table>
</div>
<div class="ilaw-field">
<span class="ilaw-label">Opportunities for Integration</span>
<span class="ilaw-label-hint">Possibilities to meaningfully anchor other learning areas, special topics, or technology. Write N/A if none.</span>
<table class="ilaw-week-table">
<tr><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr>
<tr><td>[Integration or N/A]</td><td>[Integration or N/A]</td><td>[Integration or N/A]</td><td>[Integration or N/A]</td><td>[Integration or N/A]</td></tr>
</table>
</div>
</div>

<div class="ilaw-section ilaw-A">
<div class="ilaw-section-header">A — ASSESSMENT</div>
<div class="ilaw-section-intro">Assessments reveal what learners have gained and what they still need help with.</div>
<div class="ilaw-field">
<span class="ilaw-label">Formative Assessment</span>
<span class="ilaw-label-hint">Task, activity, or questions to evaluate learning and provide feedback, with appropriate accommodations.</span>
<table class="ilaw-week-table">
<tr><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr>
<tr><td>[Assessment]</td><td>[Assessment]</td><td>[Assessment]</td><td>[Assessment]</td><td>[Assessment]</td></tr>
</table>
</div>
</div>

<div class="ilaw-section ilaw-W">
<div class="ilaw-section-header">W — WAYS FORWARD</div>
<div class="ilaw-section-intro">Meaningful learning can also happen beyond the classroom — pause and reflect on what happened today.</div>
<div class="ilaw-field">
<span class="ilaw-label">Extended Learning Opportunities</span>
<span class="ilaw-label-hint">Other learning experiences outside class hours to reinforce, spark curiosity, or support areas of difficulty.</span>
<table class="ilaw-week-table">
<tr><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr>
<tr><td>[Extension]</td><td>[Extension]</td><td>[Extension]</td><td>[Extension]</td><td>[Extension]</td></tr>
</table>
</div>
<div class="ilaw-field">
<span class="ilaw-label">Reflections</span>
<span class="ilaw-label-hint">What to change for next session, and what to share with co-teachers, parents, or school leaders.</span>
<table class="ilaw-week-table">
<tr><th>Monday</th><th>Tuesday</th><th>Wednesday</th><th>Thursday</th><th>Friday</th></tr>
<tr><td>[Reflection prompt]</td><td>[Reflection prompt]</td><td>[Reflection prompt]</td><td>[Reflection prompt]</td><td>[Reflection prompt]</td></tr>
</table>
</div>
</div>

<div class="ilaw-signatures">
<span class="ilaw-sig-tag">Prepared by:</span>
<div class="ilaw-sig-row">
<div class="ilaw-sig-col">
<p class="ilaw-sig-name">WILSON R. DALISAY</p>
<p class="ilaw-sig-position">Teacher II</p>
</div>
<div class="ilaw-sig-col">
<p class="ilaw-sig-name">REXES MARLON A. TEODORO</p>
<p class="ilaw-sig-position">TLE Coordinator</p>
<span class="ilaw-sig-tag" style="margin-bottom:0;">Checked by</span>
</div>
</div>
<div class="ilaw-sig-noted">
<span class="ilaw-sig-tag">Noted:</span>
<p class="ilaw-sig-name">MARIA BEATRIZ T. MANAIG</p>
<p class="ilaw-sig-position">School Principal II</p>
</div>
</div>

</div>

IMPORTANT:
- Fill in ALL bracketed placeholders based on actual PDF content — never leave literal placeholder text like "[Extract...]" in the output.
- Keep the weekly tables to exactly 5 columns (Monday–Friday) in every case.
- Do NOT include markdown code blocks or backticks in your response.
- Do NOT change, translate, or omit the letterhead, the signature names, or any class name.
- Return ONLY the HTML, nothing else.
- Make the lesson plan detailed and specific to the PDF content, written in clear professional English appropriate for a DepEd lesson plan.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { inline_data: { mime_type: 'application/pdf', data: base64PDF } },
                  { text: prompt },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 16384,
            },
          }),
        }
      );
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData?.error?.message || `Gemini API error (${response.status})`);
      }

      const data = await response.json();
      console.log('🔍 Gemini raw response:', data); // Debug: see full response

      const candidate = data?.candidates?.[0];
      if (!candidate) throw new Error('No candidates in Gemini response — check console for raw response');
      
      const finishReason = candidate?.finishReason;
      if (finishReason === 'MAX_TOKENS') {
        throw new Error('Output was cut off (MAX_TOKENS). Try increasing maxOutputTokens.');
      }

      const text = candidate?.content?.parts?.[0]?.text || '';
      if (!text) throw new Error('Empty response text from Gemini — check console for raw response');

      return text.replace(/```html/gi, '').replace(/```/g, '').trim();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Gemini API timed out after 60 seconds. Try a smaller PDF or simpler prompt.');
      }
      throw err;
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

      const html = await callGeminiWithPDF(base64, file.name);
      setIlawOutput(html);
      setView('editor');
      showToast('✅ ILAW Lesson Plan generated! You can now edit and save it.', 'success');
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
    <div className="p-6 max-w-7xl mx-auto">
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 shadow-lg ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {view === 'editor' && (
            <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm font-medium hover:opacity-70 transition"
              style={{ color: dark ? '#94a3b8' : '#64748b' }}>
              ← Back to list
            </button>
          )}
          <h1 className="text-xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>
            {view === 'editor' ? (currentPlanMeta?.title || 'ILAW Lesson Plan') : 'Lesson Plans'}
          </h1>
          <Badge color="#16a34a" bg="rgba(22,163,74,0.12)">AI-Powered · Gemini</Badge>
        </div>

        {view === 'editor' && ilawOutput && (
          <div className="flex gap-2 flex-wrap">
            <Btn variant="outline" onClick={handlePrint}><Eye size={15} /> Print</Btn>
            <Btn variant="outline" onClick={handleDownload}><Download size={15} /> Download</Btn>
            <Btn onClick={handleSaveIlawPlan} disabled={saving}>
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
                <Card key={plan.id} className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base truncate" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{plan.title}</h3>
                      <p className="text-xs mt-0.5" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                        {plan.subject} · {new Date(plan.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-3 flex-shrink-0">
                      {plan.ai_generated && <Badge color="#3b82f6" bg="rgba(59,130,246,0.12)">AI</Badge>}
                      <Badge
                        color={plan.status === 'draft' ? '#d97706' : '#16a34a'}
                        bg={plan.status === 'draft' ? 'rgba(217,119,6,0.12)' : 'rgba(22,163,74,0.12)'}>
                        {plan.status || 'draft'}
                      </Badge>
                    </div>
                  </div>

                  {plan.file_name && (
                    <div className="flex items-center gap-2 mb-3 p-2 rounded-lg"
                      style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
                      <FileText size={14} style={{ color: '#3b82f6' }} />
                      <span className="text-xs truncate" style={{ color: '#3b82f6' }}>{plan.file_name}</span>
                      {plan.file_url && (
                        <a href={plan.file_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs ml-auto flex-shrink-0" style={{ color: '#64748b' }}>Open ↗</a>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Btn variant="outline" className="flex-1" onClick={() => handleViewPlan(plan)}>
                      <Eye size={14} /> View & Edit
                    </Btn>
                    <button onClick={() => handleDeletePlan(plan.id)}
                      className="p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition"
                      style={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Right: Quick Create */}
          <Card className="p-5 h-fit">
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4"
              style={{ color: dark ? '#64748b' : '#94a3b8' }}>Quick Create (Manual)</h2>
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

          {/* Toolbar */}
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium" style={{ color: dark ? '#94a3b8' : '#64748b' }}>
                📄 {currentPlanMeta?.file_name || 'Manual Plan'}
              </span>
              <div className="ml-auto flex gap-2 flex-wrap">
                <Btn variant="outline" onClick={handlePrint}><Eye size={14} /> Print</Btn>
                <Btn variant="outline" onClick={handleDownload}><Download size={14} /> Download .doc</Btn>
                <Btn onClick={handleSaveIlawPlan} disabled={saving}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {savedPlanId ? 'Save Changes' : 'Save Plan'}
                </Btn>
              </div>
            </div>
          </Card>

          {/* Editable ILAW output */}
          <Card className="p-6">
            <p className="text-xs mb-3 font-medium" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
              ✏️ Click anywhere in the lesson plan below to edit it directly
            </p>
            <style>{ilawStyles}</style>
            <div
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
              dangerouslySetInnerHTML={{ __html: ilawOutput || '<p style="color:#94a3b8">No content yet. Upload a PDF to generate.</p>' }}
            />
          </Card>
        </div>
      )}
    </div>
  );
};

export default LessonPlansTab;
