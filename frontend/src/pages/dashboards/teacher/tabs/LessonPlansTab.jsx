// ============================================
// FILE: src/pages/dashboards/teacher/tabs/LessonPlansTab.jsx
// LESSON PLANS TAB — Full Supabase CRUD + File Upload
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { permanentSaveUnavailable } from '../persistence/editorPersistence';
import AiPlanSaveAction from '../persistence/AiPlanSaveAction';
import { aiLessonPlanSaveFlagEnabled, saveAiLessonPlan } from '../persistence/aiLessonPlanSaveClient';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import {
  Search, Trash2, Upload, Printer, FileEdit,
  FileText, Loader2, Eye, Save, FileUp, AlertTriangle, Sparkles, Download
} from 'lucide-react';
import { useToast } from '../hooks';
import { Card, Input, Badge, Btn, Toast, Modal, ConfirmDialog } from '../shared/ui';
import useDialogSafety from '../worksheets/useDialogSafety';
import TeacherFilePicker from '../shared/TeacherFilePicker';
import { sanitizeLessonPlanHtml, syncAiLessonPlanHeading } from '../lessonPlanHtml';
import { resolveLessonPlanDownloadFilename, suggestLessonPlanFilename } from '../lessonPlanFilename';
import { validateLessonPlanTitle } from '../lessonPlanTitle';
import { lessonPlanFilenamePreferenceKey, readLessonPlanFilenamePreference, writeLessonPlanFilenamePreference, removeLessonPlanFilenamePreference } from '../lessonPlanFilenamePreference';
import IlawHybridHeader from '../ilaw/IlawHybridHeader';
import { ilawBrandAssets } from '../ilaw/ilawBrandAssets';
import { openLessonPlanPrint } from '../ilaw/printLessonPlan';
import { parseAiIlawHtml } from '../ilaw/aiIlawPdf';
import FullManualIlawEditor from '../ilaw/FullManualIlawEditor';
import IlawTemplate from '../ilaw/IlawTemplate';
import { createTemporaryManualIlawDraft } from '../ilaw/fullManualIlawModel';
import { parseManualIlawV2, validateManualIlawCompletion } from '../ilaw/manualIlawV2';
import { savedPlanType, SAVED_PLAN_TYPE_LABEL } from '../lessonPlans/savedPlanType';
import { prepareDevelopmentWorksheetContext } from '../lessonPlans/worksheetContext';
import { extractWeeklyWorksheetSource } from '../lessonPlans/weeklyWorksheetSource';
import { savedAiMetadata } from '../lessonPlans/aiAssignment';
import { createGeneratedDraft, validateGeneratedWorksheet } from '../worksheets/generatedDraftModel';
import { createWeeklyWorksheetCollection } from '../worksheets/weeklyWorksheetCollection';
import { weeklyJobClient } from '../persistence/weeklyJobClient';
import WeeklyGenerationProgress from './WeeklyGenerationProgress';
import '../ilaw/IlawActivePreview.css';

// Where the EduScribe API lives. Deployment sets VITE_API_BASE_URL.
//
// The fallback follows whatever host the page was opened from, rather than
// hardcoding localhost. Vite serves on every interface, so this page is
// reached at localhost, at 192.168.x.x, and from other devices during the
// sixty-user test — and on another device "localhost:3001" means THAT
// device, which is running no API at all.
//
// Note what is NOT here any more: VITE_GEMINI_API_KEY. This is only a URL —
// public by nature, and worthless to whoever finds it, which is the entire
// difference between a base URL and an API key.
// Kept in step with MAX_PDF_BYTES in backend/src/routes/ai.js by hand. The
// ceiling exists because Vercel caps a serverless request body at 4.5MB and
// base64 inflates a file by about a third.
const MAX_PDF_MB = 3;
const SCHOOL_NAME = /dela\s+paz\s+national\s+high\s+school/i;
const PLAN_STATUS = {
  draft: { color: 'var(--badge-yellow-fg)', bg: 'var(--badge-yellow-bg)' },
  published: { color: 'var(--badge-green-fg)', bg: 'var(--badge-green-bg)' },
  archived: { color: 'var(--text-muted)', bg: 'var(--card2)' },
};
const planDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString();
};

const insertEditorTransfer = (event, editor, transfer, onChange, drop = false) => {
  event.preventDefault();
  if (!editor || !transfer) return;
  const html = transfer.getData('text/html');
  const text = transfer.getData('text/plain');
  const fragment = document.createDocumentFragment();
  if (html) {
    const template = document.createElement('template');
    template.innerHTML = sanitizeLessonPlanHtml(html);
    fragment.appendChild(template.content);
  } else if (text) {
    // Keep plain-text line breaks without interpreting angle brackets as markup.
    text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n').forEach((line, index) => {
      if (index) fragment.appendChild(document.createElement('br'));
      fragment.appendChild(document.createTextNode(line));
    });
  }
  if (!fragment.hasChildNodes()) return;

  const selection = window.getSelection();
  let range = drop && document.caretRangeFromPoint?.(event.clientX, event.clientY);
  if (!range && selection?.rangeCount && editor.contains(selection.anchorNode)) {
    range = selection.getRangeAt(0);
  }
  if (!range || !editor.contains(range.commonAncestorContainer)) {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  const lastNode = fragment.lastChild;
  range.deleteContents();
  range.insertNode(fragment);
  range.setStartAfter(lastNode);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  onChange(editor.innerHTML);
};

// Where the API lives, resolved in three steps.
//
//   VITE_API_BASE_URL   set it to point anywhere; nothing else applies.
//   production          empty, so requests go to /api on the SAME ORIGIN.
//                       The whole system deploys as one Vercel project, and
//                       same-origin means there is no CORS to get wrong —
//                       which is what broke the first live upload.
//   development         the host this page was served from, port 3001. Vite
//                       serves on every interface, so the page is opened at
//                       localhost, at 192.168.x.x, and from other devices
//                       during testing — and on another device "localhost"
//                       is THAT device, which runs no API.
//
// Note what is NOT here any more: VITE_GEMINI_API_KEY. This is only a URL —
// public by nature, and worthless to whoever finds it, which is the entire
// difference between a base URL and an API key.
const API_BASE = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV && typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : '');

const LessonPlansTab = ({ onGeneratedDraft, generatedDraft, jobClient = weeklyJobClient }) => {
  const navigate = useNavigate();
  const { userData } = useAuth();
  const { toast, showToast } = useToast();
  const [worksheetRun, setWorksheetRun] = useState(null);
  const [worksheetGenerationError, setWorksheetGenerationError] = useState(null);
  const [weeklyQuestionCount, setWeeklyQuestionCount] = useState(30);
  const worksheetGenerationRef = useRef(false);
  const worksheetRequestRef = useRef(0);
  const worksheetAbortRef = useRef(null);
  const worksheetTeacherRef = useRef(userData?.uid);
  const finishWeeklyProgress = useCallback(() => setWorksheetRun(current => current?.status === 'generation-complete'
    ? { ...current, status: 'ready' } : current), []);

  useEffect(() => () => { worksheetRequestRef.current += 1; }, []);
  useLayoutEffect(() => {
    if (worksheetTeacherRef.current !== userData?.uid) {
      worksheetTeacherRef.current = userData?.uid;
      worksheetRequestRef.current += 1;
      worksheetAbortRef.current?.abort();
      worksheetGenerationRef.current = false;
      setWorksheetRun(null);
      setWorksheetGenerationError(null);
    }
  }, [userData?.uid]);

  useEffect(() => {
    if (!jobClient.enabled || worksheetRun?.status !== 'job' || !worksheetRun.job?.id) return;
    const jobId = worksheetRun.job.id;
    let active = true;
    const refresh = async () => {
      try {
        const job = await jobClient.status(jobId);
        if (!active) return;
        setWorksheetRun(current => current?.job?.id === jobId ? { ...current, job,
          status: job.status === 'COMPLETED' ? job.saved ? 'saved' : 'error'
            : ['FAILED_VALIDATION', 'FAILED_PROVIDER', 'INTERRUPTED_UNKNOWN_OUTCOME', 'CANCELED'].includes(job.status)
              ? 'error' : 'job',
          message: job.status === 'COMPLETED' && !job.saved ? 'The job finished without a confirmed durable Save.'
            : ['FAILED_VALIDATION', 'FAILED_PROVIDER', 'INTERRUPTED_UNKNOWN_OUTCOME', 'CANCELED'].includes(job.status)
              ? `Worksheet job stopped: ${job.status.replaceAll('_', ' ').toLowerCase()}.` : current.message,
        } : current);
      } catch {
        if (active) setWorksheetRun(current => current?.job?.id === jobId
          ? { ...current, status: 'error', message: 'Could not read the saved job status. Check the backend before retrying.' }
          : current);
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [jobClient, worksheetRun?.job?.id, worksheetRun?.status]);

  const worksheetEligibility = plan => prepareDevelopmentWorksheetContext({ plan, teacherId: userData?.uid });

  const handleGenerateWorksheet = async plan => {
    if (worksheetGenerationRef.current) return;
    if (generatedDraft) {
      setWorksheetGenerationError({ planId: plan.id, message: 'A local worksheet draft already exists. Review or delete it in Worksheets before starting another sample.' });
      return;
    }
    const ownerId = userData?.uid;
    const weeklySource = plan.ai_generated ? extractWeeklyWorksheetSource(plan.objectives) : null;
    const isWeeklyAi = Boolean(weeklySource?.days.some(day => day.objective || day.activity || day.assessment));
    const kind = isWeeklyAi || (plan.ai_generated && !import.meta.env.DEV) ? 'weekly' : 'sample';
    const requestId = ++worksheetRequestRef.current;
    worksheetGenerationRef.current = true;
    setWorksheetRun({ plan, status: 'validating', kind,
      sourceTitle: plan.title, sourceContent: plan.objectives });
    setWorksheetGenerationError(null);
    try {
      await Promise.resolve();
      if (requestId !== worksheetRequestRef.current || worksheetTeacherRef.current !== ownerId) return;
      const eligibility = worksheetEligibility(plan);
      if (eligibility.status !== 'ready') throw new Error(eligibility.reason);
      const aiPlan = eligibility.context.source.kind === 'ai-html-text';
      if (kind === 'weekly' && weeklySource?.issues.length) {
        const issue = weeklySource.issues[0];
        throw new Error(`${issue.message} Review the weekly ILAW before generating worksheets.`);
      }
      if (kind === 'weekly' && jobClient.enabled) {
        const job = await jobClient.submit({ requestId: crypto.randomUUID(),
          sourceLessonPlanId: plan.id, questionCount: weeklyQuestionCount });
        if (requestId === worksheetRequestRef.current && worksheetTeacherRef.current === ownerId)
          setWorksheetRun({ plan, status: 'job', kind, job,
            sourceTitle: plan.title, sourceContent: plan.objectives });
        return;
      }
      if (kind === 'weekly' && import.meta.env.PROD) {
        throw new Error('Durable Worksheet generation is not available yet. No Worksheets were saved.');
      }
      setWorksheetRun({ plan, status: 'generating', kind,
        sourceTitle: plan.title, sourceContent: plan.objectives });
      let draft;
      let providerCalls;
      if (aiPlan && kind === 'weekly') {
        const { data: { session } } = await supabase.auth.getSession();
        if (requestId !== worksheetRequestRef.current || worksheetTeacherRef.current !== ownerId) return;
        if (!session?.access_token) throw new Error('Your session has expired. Sign in again and retry.');
        const controller = new AbortController();
        worksheetAbortRef.current = controller;
        let response;
        try {
          response = await fetch(`${API_BASE}/api/ai/weekly-worksheets`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ lessonPlanId: plan.id, sourceHtml: plan.objectives, days: weeklySource.days,
              questionCount: weeklyQuestionCount }),
            signal: controller.signal,
          });
        } catch (error) {
          if (error?.name === 'AbortError') return;
          throw new Error('Backend unavailable or the connection was interrupted. Check the backend before starting another generation.',
            { cause: error });
        } finally {
          if (worksheetAbortRef.current === controller) worksheetAbortRef.current = null;
        }
        if (requestId !== worksheetRequestRef.current || worksheetTeacherRef.current !== ownerId) return;
        const result = await response.json().catch(() => null);
        if (!result) throw new Error('Backend returned an unreadable response. Check its logs before trying again.');
        if (!response.ok) throw Object.assign(new Error(result.error || 'Weekly worksheet generation failed.'),
          { retryable: result.retryable === true, providerCalls: result.providerCalls });
        providerCalls = result.providerCalls;
        if (result.status !== 'generated-weekly-drafts' || result.saved !== false
          || result.questionCount !== weeklyQuestionCount
          || result.sourceLessonPlanId !== plan.id) throw new Error('Backend returned an invalid weekly worksheet response.');
        try {
          draft = createWeeklyWorksheetCollection({ plan, teacherId: ownerId,
            sources: weeklySource.days, responses: result.worksheets, questionCount: weeklyQuestionCount,
            sourceWeek: weeklySource.sourceWeek, teachingDate: weeklySource.teachingDate });
        } catch {
          throw new Error('Weekly collection construction failed. The five daily drafts need review.');
        }
      } else {
        const { createDevelopmentWorksheetResponse } = await import('../worksheets/developmentWorksheetDraft');
        const response = createDevelopmentWorksheetResponse(eligibility.context);
        draft = createGeneratedDraft(response, aiPlan ? 'ai' : 'manual');
        if (validateGeneratedWorksheet(draft).length) throw new Error('The local worksheet fixture is incomplete. Nothing was saved.');
      }
      if (requestId !== worksheetRequestRef.current || worksheetTeacherRef.current !== ownerId) return;
      setWorksheetRun({ plan, status: 'validating-result', kind,
        sourceTitle: plan.title, sourceContent: plan.objectives });
      setWorksheetRun({ plan, status: kind === 'weekly' && aiPlan ? 'generation-complete' : 'ready', kind, draft, providerCalls,
        sourceTitle: plan.title, sourceContent: plan.objectives });
    } catch (error) {
      if (requestId === worksheetRequestRef.current && worksheetTeacherRef.current === ownerId) {
        setWorksheetRun({ plan, status: 'error', kind,
          sourceTitle: plan.title, sourceContent: plan.objectives,
          retryable: kind === 'sample',
          providerCalls: error?.providerCalls,
          message: error instanceof Error ? error.message : 'Could not prepare the worksheet.' });
      }
    } finally {
      if (requestId === worksheetRequestRef.current) {
        worksheetGenerationRef.current = false;
      }
    }
  };

  const cancelWorksheetRun = () => {
    worksheetRequestRef.current += 1;
    worksheetAbortRef.current?.abort();
    worksheetAbortRef.current = null;
    worksheetGenerationRef.current = false;
    setWorksheetRun(null);
  };

  const requestJobCancel = async () => {
    if (!worksheetRun?.job?.id) return;
    try {
      const job = await jobClient.cancel(worksheetRun.job.id);
      setWorksheetRun(current => current?.job?.id === job.id ? { ...current, job,
        status: job.status === 'CANCELED' ? 'error' : 'job',
        message: job.status === 'CANCELED' ? 'Worksheet job canceled.' : current.message } : current);
    } catch {
      setWorksheetRun(current => current ? { ...current, status: 'error',
        message: 'Could not confirm cancellation. Check the job in Worksheets.' } : current);
    }
  };

  const openReadyWorksheet = () => {
    if (worksheetRun?.status !== 'ready') return;
    const currentPlan = [...mockPlans, ...plans].find(item => item.id === worksheetRun.plan.id && item.teacher_id === userData?.uid);
    if (!currentPlan || currentPlan.title !== worksheetRun.sourceTitle || currentPlan.objectives !== worksheetRun.sourceContent || generatedDraft) {
      setWorksheetRun({ ...worksheetRun, status: 'error', message: 'The source plan or local worksheet state changed. Nothing was created. Close this dialog and review the plan.' });
      return;
    }
    onGeneratedDraft(worksheetRun.draft);
    setWorksheetRun(null);
    navigate('/teacher-dashboard/worksheets');
  };

  // --- List of saved plans ---
  const [plans, setPlans] = useState([]);
  const fetchSequenceRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // --- Upload / generation state ---
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedPdf, setSelectedPdf] = useState(null);
  const uploadInFlightRef = useRef(false);
  const uploadedPdfRef = useRef(null);
  const [uploadProgress, setUploadProgress] = useState('');
  // Shown inside the upload card and left there until the next attempt.
  // A toast for this was the wrong shape: it appears in a corner away from
  // where the teacher is looking, and disappears on its own — so the one
  // message explaining why nothing happened was gone before it was read.
  const [uploadError, setUploadError] = useState('');

  // --- ILAW output state ---
  const [ilawOutput, setIlawOutput] = useState('');
  const [hasEmbeddedLetterhead, setHasEmbeddedLetterhead] = useState(false);
  const [hasSchoolName, setHasSchoolName] = useState(false);
  const [currentPlanMeta, setCurrentPlanMeta] = useState(null); // { title, file_name, file_url, file_path }
  const [downloadName, setDownloadName] = useState('');
  const filenameDraftsRef = useRef(new Map());
  const filenameValueRef = useRef('');
  const filenameEditedRef = useRef(false);
  const filenameOwnerRef = useRef(null);
  const [savedPlanId, setSavedPlanId] = useState(null);
  const [savedTitle, setSavedTitle] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [titleError, setTitleError] = useState('');
  const openedUpdatedAtRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const [savedHtml, setSavedHtml] = useState('');
  const [saveError, setSaveError] = useState('');

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
      editorRef.current.innerHTML = sanitizeLessonPlanHtml(ilawOutput || '<p class="ilaw-empty-placeholder">No content yet. Upload a PDF to generate.</p>');
      setHasEmbeddedLetterhead(Boolean(editorRef.current.querySelector('.ilaw-letterhead')));
      setHasSchoolName(SCHOOL_NAME.test(editorRef.current.textContent));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorLoadKey]);

  // --- View mode: 'list' | 'editor' | 'manual' ---
  const [view, setView] = useState('list');
  const [confirmAction, setConfirmAction] = useState(null);
  const requestConfirmation = (message, action, confirmLabel = 'Discard changes') =>
    setConfirmAction({ message, action, confirmLabel });
  const [temporaryPlan, setTemporaryPlan] = useState(null);
  const [manualBaseline, setManualBaseline] = useState(null);
  const [manualMockIdentity, setManualMockIdentity] = useState(null);
  const [manualErrors, setManualErrors] = useState({});
  const [manualSaveError, setManualSaveError] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [mockPlans, setMockPlans] = useState([]);
  const [printingManual, setPrintingManual] = useState(null);
  const [manualCardError, setManualCardError] = useState('');
  const [aiPdfError, setAiPdfError] = useState(null);
  const [aiPdfBusyId, setAiPdfBusyId] = useState(null);
  const aiPdfInFlightRef = useRef(false);
  const manualQaStoreRef = useRef(null);
  const manualSaveRef = useRef(false);
  const currentManualTeacherRef = useRef(userData?.uid);
  useLayoutEffect(() => { currentManualTeacherRef.current = userData?.uid; }, [userData?.uid]);
  useEffect(() => {
    if (!import.meta.env.DEV || !userData?.uid) return undefined;
    let active = true;
    import('../lessonPlans/localManualQaStore').then(({ getLocalManualQaStore }) => {
      if (active) setMockPlans(getLocalManualQaStore().list(userData.uid).map(row => ({ ...row, localMock: true })));
    });
    return () => { active = false; };
  }, [userData?.uid]);
  const headerRef = useRef(null);
  const manualHeadingRef = useRef(null);
  const manualResumeRef = useRef(null);

  useLayoutEffect(() => {
    if (view === 'editor' || view === 'manual') headerRef.current?.closest('main')?.scrollTo(0, 0);
    if (view === 'manual') manualHeadingRef.current?.focus({ preventScroll: true });
  }, [view]);

  const [saving, setSaving] = useState(false);
  // ── Fetch saved plans ──────────────────────────────────────
  const fetchPlans = useCallback(async () => {
    if (!userData?.uid) return;
    const requestId = ++fetchSequenceRef.current;
    setLoading(true);
    setListError('');
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
      if (requestId === fetchSequenceRef.current) setPlans(data || []);
    } catch (err) {
      if (requestId === fetchSequenceRef.current) setListError('Lesson plans could not be loaded. Check your connection and try again.');
      console.error('Error loading lesson plans:', err);
    }
    if (requestId === fetchSequenceRef.current) setLoading(false);
  }, [userData?.uid]);

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
        if (body?.error) throw new Error(body.error);

        // A 413 with no body is the HOST rejecting the request before any of
        // our code runs — Vercel caps a serverless request body at 4.5MB,
        // and says so in a way nothing here can read. Left to the generic
        // branch it surfaced as a bare "(413)", which tells a teacher
        // nothing and does not even hint that the file is the problem.
        if (response.status === 413) {
          throw new Error(
            `That PDF is too large to send. The limit is ${MAX_PDF_MB}MB — `
            + 'scanned documents are large because every page is an image, '
            + 'so export it as text from Word, or compress it further.'
          );
        }
        throw new Error(`Lesson plan generation failed (${response.status}).`);
      }

      const { html, truncated } = await response.json();
      return { html, truncated };
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('The request timed out. Try a smaller PDF.', { cause: err });
      }
      // fetch reports every network-level failure as a bare TypeError:
      // server down, CORS refused, connection blocked, body rejected. The
      // first version of this said "check that the API is running", which
      // was wrong the first time it fired — the API was running, and that
      // message sent the search in the wrong direction for an hour. It now
      // says what it actually knows: the URL it tried and what the browser
      // said, with the real cause in the console.
      if (err instanceof TypeError) {
        console.error('[lesson-plan] request to', `${API_BASE}/api/ai/lesson-plan`, 'failed:', err);
        throw new Error(
          `Could not receive a response from ${API_BASE || 'the API'} — ${err.message}. `
          + 'The request may have reached the API. Check the browser network details before retrying.',
          { cause: err }
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // ── Handle PDF upload → Gemini → ILAW output ──────────────
  const selectPdf = file => {
    uploadedPdfRef.current = null;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setSelectedPdf(null);
      setUploadError('That is not a PDF. Choose a file ending in .pdf.');
      return;
    }
    // Mirrors MAX_PDF_BYTES in backend/src/routes/ai.js. Checked here so a
    // large file is rejected instantly rather than after a slow upload; the
    // server checks again, because this one can be bypassed.
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      setSelectedPdf(null);
      setUploadError(
        `This PDF is ${(file.size / 1024 / 1024).toFixed(1)}MB and the limit is ${MAX_PDF_MB}MB. `
        + 'Scanned documents are large because every page is an image — '
        + 'export it as text from Word, or compress it further.'
      );
      return;
    }

    filenameValueRef.current = suggestLessonPlanFilename(file.name.replace(/\.[^/.]+$/, ''));
    filenameEditedRef.current = false;
    filenameOwnerRef.current = userData?.uid ?? null;
    setSelectedPdf(file);
    setUploadError('');
  };

  const handlePdfUpload = async () => {
    const file = selectedPdf;
    if (!file || uploadInFlightRef.current) return;

    uploadInFlightRef.current = true;
    setUploadError('');
    setUploading(true);
    setGenerating(false);
    setIlawOutput('');
    setHasEmbeddedLetterhead(false);
    setHasSchoolName(false);
    setSavedHtml('');
    setSavedPlanId(null);

    let storageUploaded = false;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Your session has expired. Sign in again and retry.');

      // 1. Convert to base64
      setUploadProgress('Reading PDF...');
      const base64 = await fileToBase64(file);

      // Reuse this page's confirmed upload when retrying the same file after AI failure.
      setUploadProgress('Preparing PDF...');
      let uploaded = uploadedPdfRef.current;
      if (uploaded?.file !== file || uploaded.teacherId !== userData?.uid) {
        setUploadProgress('Uploading to storage...');
        const filePath = `${userData?.uid}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from('lesson-pdfs')
          .upload(filePath, file, { cacheControl: '3600', upsert: false });
        if (uploadError) throw new Error('Storage upload failed: ' + uploadError.message);
        storageUploaded = true;
        const { data: urlData } = supabase.storage.from('lesson-pdfs').getPublicUrl(filePath);
        uploaded = { file, teacherId: userData?.uid, filePath, publicUrl: urlData?.publicUrl };
        uploadedPdfRef.current = uploaded;
      }
      storageUploaded = true;

      const suggestedName = suggestLessonPlanFilename(file.name.replace(/\.[^/.]+$/, ''));
      setDownloadName(suggestedName);
      setCurrentPlanMeta({
        title: file.name.replace(/\.[^/.]+$/, ''),
        ai_generated: true,
        file_name: file.name,
        file_url: uploaded.publicUrl,
        file_path: uploaded.filePath,
      });

      // 3. Send to Gemini
      setUploading(false);
      setGenerating(true);
      setUploadProgress('Analysing your PDF and generating the ILAW lesson plan...');

      const { html, truncated } = await callGeminiWithPDF(base64, file.name);
      const safeHtml = sanitizeLessonPlanHtml(html);
      const template = document.createElement('template');
      template.innerHTML = safeHtml;
      setHasEmbeddedLetterhead(Boolean(template.content.querySelector('.ilaw-letterhead')));
      setHasSchoolName(SCHOOL_NAME.test(template.content.textContent));
      setIlawOutput(safeHtml);
      setSavedHtml('');
      setEditorLoadKey(k => k + 1);
      setView('editor');
      setSelectedPdf(null);
      uploadedPdfRef.current = null;
      showToast(
        truncated
          ? 'Lesson plan generated but was cut off near the end — review and finish it, or try regenerating.'
          : 'ILAW lesson plan generated. You can edit it here; permanent save is unavailable.',
        truncated ? 'error' : 'success'
      );
    } catch (err) {
      console.error('PDF Upload Error:', err);
      setUploadError(err.message + (storageUploaded
        ? uploadedPdfRef.current?.file === file && uploadedPdfRef.current?.teacherId === userData?.uid
          ? ' The PDF was uploaded. Retry with this selected file to reuse it; choosing another file starts a new upload.'
          : ' The PDF may already be stored. Retrying may create another stored copy.'
        : ''));
    }

    uploadInFlightRef.current = false;
    setUploading(false);
    setGenerating(false);
    setUploadProgress('');
  };

  // ── Save generated ILAW plan to Supabase ──────────────────
  const handleSaveIlawPlan = async (saveCommand) => {
    if (saveInFlightRef.current) return;
    const teacherId = userData?.uid;
    const existingPlanId = savedPlanId;
    if (!existingPlanId) {
      if (!aiLessonPlanSaveFlagEnabled() || !saveCommand?.requestId) {
        setSaveError('Permanent AI Lesson Plan saving is unavailable. Your draft remains open.');
        return;
      }
      const { title, error } = validateLessonPlanTitle(currentPlanMeta?.title);
      if (error) { setSaveError(error); return; }
      const html = editorRef.current?.innerHTML ?? ilawOutput;
      if (!html.trim()) { setSaveError('Nothing to save yet.'); return; }
      saveInFlightRef.current = true;
      setSaving(true);
      setSaveError('');
      try {
        const result = await saveAiLessonPlan(API_BASE, { requestId: saveCommand.requestId,
          title, html });
        if (result.ok !== true || result.durable !== true || !result.record?.id) {
          throw new Error('The save could not be confirmed. Your draft remains open.');
        }
        const plan = result.record;
        if (editorRef.current) editorRef.current.innerHTML = plan.objectives;
        setIlawOutput(plan.objectives);
        setSavedHtml(plan.objectives);
        setSavedPlanId(plan.id);
        setSavedTitle(plan.title);
        setTitleDraft(plan.title);
        setCurrentPlanMeta(previous => ({ ...previous, title: plan.title,
          assignment: savedAiMetadata(plan), file_url: null, file_name: null, file_path: null }));
        openedUpdatedAtRef.current = plan.updated_at ?? null;
        if (filenameEditedRef.current && filenameOwnerRef.current === teacherId) {
          const key = lessonPlanFilenamePreferenceKey(teacherId, plan.id);
          if (key) filenameDraftsRef.current.set(key, filenameValueRef.current);
          writeLessonPlanFilenamePreference(teacherId, plan.id, filenameValueRef.current);
        }
        showToast('Lesson plan saved.', 'success');
        fetchPlans();
      } catch (error) {
        setSaveError(`Could not save the lesson plan. Your draft remains open. ${error.message}`);
      } finally {
        saveInFlightRef.current = false;
        setSaving(false);
      }
      return;
    }
    const { title: normalizedTitle, error: validationError } = existingPlanId
      ? validateLessonPlanTitle(titleDraft)
      : { title: currentPlanMeta?.title, error: '' };
    if (validationError) {
      setTitleError(validationError);
      return;
    }
    if (existingPlanId && !teacherId) {
      setSaveError('Your session is unavailable. Sign in again before saving.');
      return;
    }
    const editorHtml = sanitizeLessonPlanHtml(editorRef.current?.innerHTML ?? ilawOutput);
    const safeHtml = existingPlanId && currentPlanMeta?.ai_generated && normalizedTitle !== savedTitle
      ? syncAiLessonPlanHeading(editorHtml, normalizedTitle) ?? editorHtml
      : editorHtml;
    if (!safeHtml || !currentPlanMeta) {
      showToast('Nothing to save yet', 'error');
      return;
    }
    // Only reconcile the uncontrolled editor at the save boundary, never per keystroke.
    if (editorRef.current && editorRef.current.innerHTML !== safeHtml) editorRef.current.innerHTML = safeHtml;
    setIlawOutput(safeHtml);
    setSaveError('');
    setTitleError('');
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      if (existingPlanId) {
        // Update existing
        let query = supabase
          .from('lesson_plans')
          .update({ title: normalizedTitle, objectives: safeHtml, updated_at: new Date().toISOString() })
          .eq('id', existingPlanId)
          .eq('teacher_id', teacherId);
        if (openedUpdatedAtRef.current) query = query.eq('updated_at', openedUpdatedAtRef.current);
        const { data, error } = await query.select('id,teacher_id,title,objectives,updated_at');
        if (error) throw error;
        if (data?.length !== 1) {
          throw new Error('This lesson plan changed or is no longer available. Your edits are still here. Reload the plan before saving again.');
        }
        const [updated] = data;
        if (updated.id !== existingPlanId || updated.teacher_id !== teacherId
          || updated.title !== normalizedTitle || updated.objectives !== safeHtml
          || typeof updated.updated_at !== 'string') {
          throw new Error('The saved lesson plan could not be verified. Your edits are still here. Please reload before trying again.');
        }
        ++fetchSequenceRef.current;
        setLoading(false);
        setPlans(previous => previous.map(plan => plan.id === existingPlanId ? { ...plan, ...updated } : plan));
        const renamed = normalizedTitle !== savedTitle;
        setSavedTitle(updated.title);
        setTitleDraft(updated.title);
        setCurrentPlanMeta(previous => ({ ...previous, title: updated.title }));
        openedUpdatedAtRef.current = updated.updated_at;
        setSavedHtml(safeHtml);
        if (renamed) {
          const key = lessonPlanFilenamePreferenceKey(teacherId, existingPlanId);
          if (key) filenameDraftsRef.current.delete(key);
          removeLessonPlanFilenamePreference(teacherId, existingPlanId);
          const suggestedName = suggestLessonPlanFilename(updated.title);
          filenameValueRef.current = suggestedName;
          filenameEditedRef.current = false;
          setDownloadName(suggestedName);
        }
        showToast('Changes saved.', 'success');
      }
    } catch (err) {
      setSaveError('Could not save the lesson plan. Your edits are still here. ' + err.message);
      showToast('Error saving: ' + err.message, 'error');
    }
    saveInFlightRef.current = false;
    setSaving(false);
  };

  // ── Print ──────────────────────────────────────────────────
  const handlePrint = () => {
    const filename = resolveLessonPlanDownloadFilename(downloadName, currentPlanMeta?.title);
    void openLessonPlanPrint({
      html: editorRef.current?.innerHTML ?? ilawOutput,
      filename,
      aiGenerated: Boolean(currentPlanMeta?.ai_generated),
    }).catch(error => showToast(error.message, 'error'));
  };

  // Load saved plan into editor
  const handleViewPlan = (plan) => {
    const safeHtml = sanitizeLessonPlanHtml(plan.objectives);
    const template = document.createElement('template');
    template.innerHTML = safeHtml;
    setHasEmbeddedLetterhead(Boolean(template.content.querySelector('.ilaw-letterhead')));
    setHasSchoolName(SCHOOL_NAME.test(template.content.textContent));
    setIlawOutput(safeHtml);
    setSavedHtml(safeHtml);
    setSaveError('');
    setSavedTitle(plan.title || '');
    setTitleDraft(plan.title || '');
    setTitleError('');
    openedUpdatedAtRef.current = plan.updated_at ?? null;
    setEditorLoadKey(k => k + 1);
    const key = lessonPlanFilenamePreferenceKey(userData?.uid, plan.id);
    const preferredName = key
      ? filenameDraftsRef.current.get(key) ?? readLessonPlanFilenamePreference(userData?.uid, plan.id)
      : null;
    const name = preferredName ?? suggestLessonPlanFilename(plan.title);
    filenameValueRef.current = name;
    filenameEditedRef.current = false;
    filenameOwnerRef.current = userData?.uid ?? null;
    setDownloadName(name);
    setCurrentPlanMeta({
      title: plan.title,
      ai_generated: Boolean(plan.ai_generated),
      assignment: savedAiMetadata(plan),
      file_name: plan.file_name,
      file_url: plan.file_url,
      file_path: plan.file_path,
    });
    setSavedPlanId(plan.id);
    setView('editor');
  };

  // ── Delete plan ────────────────────────────────────────────
  const deletePlan = async (id) => {
    const { error } = await supabase.from('lesson_plans').delete().eq('id', id);
    if (error) showToast('Error: ' + error.message, 'error');
    else {
      const key = lessonPlanFilenamePreferenceKey(userData?.uid, id);
      if (key) filenameDraftsRef.current.delete(key);
      removeLessonPlanFilenamePreference(userData?.uid, id);
      showToast('Lesson plan deleted');
      if (savedPlanId === id) {
        setView('list');
        setIlawOutput('');
        setSavedPlanId(null);
      }
      fetchPlans();
    }
  };
  const handleDeletePlan = (id) => requestConfirmation(
    'Delete this saved lesson plan? This cannot be undone.', () => deletePlan(id), 'Delete lesson plan');

  // ── Quick create (manual) ──────────────────────────────────
  const activeTemporaryPlan = temporaryPlan?.teacherId === userData?.uid ? temporaryPlan : null;
  const manualDirty = Boolean(activeTemporaryPlan && manualBaseline &&
    JSON.stringify({ document: activeTemporaryPlan.document, sourceDetails: activeTemporaryPlan.sourceDetails }) !==
    JSON.stringify({ document: manualBaseline.document, sourceDetails: manualBaseline.sourceDetails }));
  const createManualPlan = () => {
    if (!userData?.uid) return;
    const start = () => {
      const draft = createTemporaryManualIlawDraft(userData.uid, userData.profile);
      setTemporaryPlan(draft);
      setManualBaseline(structuredClone(draft));
      setManualMockIdentity(null);
      setManualErrors({});
      setManualSaveError('');
      setView('manual');
    };
    if (manualDirty) requestConfirmation('Discard unsaved Manual ILAW changes and start a new document?', start);
    else start();
  };
  const manualQaStore = async () => {
    if (!import.meta.env.DEV) throw new Error('Manual ILAW mock saving is available only in local development.');
    if (!manualQaStoreRef.current) {
      const { getLocalManualQaStore } = await import('../lessonPlans/localManualQaStore');
      manualQaStoreRef.current = getLocalManualQaStore();
    }
    return manualQaStoreRef.current;
  };
  const saveManualMock = async intent => {
    if (!import.meta.env.DEV || !activeTemporaryPlan || manualSaveRef.current) return;
    if (intent === 'saved') {
      const errors = validateManualIlawCompletion(activeTemporaryPlan.document, activeTemporaryPlan.sourceDetails);
      if (Object.keys(errors).length) {
        setManualErrors(errors);
        setManualSaveError('Complete the required information before saving this lesson plan.');
        const first = Object.keys(errors)[0];
        const target = ({ objectives: 'learningObjectives', activities: 'flow.Monday', assessment: 'formativeAssessment.Monday' })[first] || first;
        requestAnimationFrame(() => document.querySelector(`[data-ilaw-field="${target}"]`)?.focus());
        return;
      }
    }
    manualSaveRef.current = true;
    setManualSaving(true);
    setManualErrors({});
    setManualSaveError('');
    try {
      const teacherId = userData.uid;
      const store = await manualQaStore();
      if (teacherId !== currentManualTeacherRef.current) throw new Error('Teacher identity changed. Start again.');
      const row = await store.save({ teacherId, planId: manualMockIdentity?.id,
        revision: manualMockIdentity?.revision, draft: activeTemporaryPlan, intent });
      if (teacherId !== currentManualTeacherRef.current) throw new Error('Teacher identity changed. Reopen the local mock to review its result.');
      setMockPlans(store.list(teacherId).map(item => ({ ...item, localMock: true })));
      setManualMockIdentity({ id: row.id, revision: row.revision, workflowState: intent });
      setManualBaseline(structuredClone(activeTemporaryPlan));
      setTemporaryPlan(null);
      setView('list');
      showToast(`${intent === 'draft' ? 'Draft' : 'Lesson plan'} kept in this local QA session only. Nothing was saved to EduScribe.`);
    } catch (error) {
      setManualSaveError(error instanceof Error ? error.message : 'The local mock save failed. Your edits were kept.');
    } finally {
      manualSaveRef.current = false;
      setManualSaving(false);
    }
  };
  const openManualMock = plan => {
    const open = () => { try {
      const payload = parseManualIlawV2(plan.objectives, { teacherId: userData.uid, planId: plan.id });
      const draft = { ...createTemporaryManualIlawDraft(userData.uid, userData.profile),
        document: payload.document, sourceDetails: payload.sourceDetails };
      setTemporaryPlan(draft);
      setManualBaseline(structuredClone(draft));
      setManualMockIdentity({ id: plan.id, revision: plan.revision, workflowState: payload.workflowState });
      setManualErrors({});
      setManualSaveError('');
      setView('manual');
    } catch (error) { setManualCardError(error.message); } };
    if (manualDirty) requestConfirmation('Discard unsaved Manual ILAW changes and open this local plan?', open);
    else open();
  };
  const printManualMock = plan => {
    try { setPrintingManual(parseManualIlawV2(plan.objectives, { teacherId: userData.uid, planId: plan.id })); }
    catch (error) { setManualCardError(error.message); }
  };
  const downloadManualMock = async plan => {
    try {
      setManualCardError('');
      const payload = parseManualIlawV2(plan.objectives, { teacherId: userData.uid, planId: plan.id });
      const { downloadManualIlawPdf } = await import('../ilaw/downloadManualIlawPdf');
      await downloadManualIlawPdf({ document: payload.document, sourceDetails: payload.sourceDetails,
        filename: suggestLessonPlanFilename(plan.title) });
    } catch (error) { setManualCardError(error.message); }
  };
  const printSavedAi = plan => {
    void openLessonPlanPrint({
      html: plan.objectives || '', filename: suggestLessonPlanFilename(plan.title), aiGenerated: true,
    }).catch(error => setManualCardError(error instanceof Error ? error.message : 'The lesson plan could not be printed.'));
  };
  const downloadSavedAi = async plan => {
    if (aiPdfInFlightRef.current) return;
    aiPdfInFlightRef.current = true;
    setAiPdfBusyId(plan.id);
    setAiPdfError(null);
    try {
      const ownerId = userData?.uid;
      if (!ownerId || (plan.teacher_id && plan.teacher_id !== ownerId)) {
        throw new Error('This lesson plan is not available to the signed-in Teacher.');
      }
      const key = lessonPlanFilenamePreferenceKey(ownerId, plan.id);
      const preferredName = (key && filenameDraftsRef.current.get(key))
        ?? readLessonPlanFilenamePreference(ownerId, plan.id)
        ?? suggestLessonPlanFilename(plan.title);
      const { downloadAiIlawPdf } = await import('../ilaw/downloadAiIlawPdf');
      if (worksheetTeacherRef.current !== ownerId) throw new Error('The signed-in Teacher changed. Reopen the lesson plan before downloading.');
      await downloadAiIlawPdf({ html: plan.objectives, title: plan.title, filename: preferredName,
        isCurrentTeacher: () => worksheetTeacherRef.current === ownerId });
    } catch (error) {
      setAiPdfError({ planId: plan.id, message: error instanceof Error ? error.message : 'The PDF could not be downloaded.' });
    } finally {
      aiPdfInFlightRef.current = false;
      setAiPdfBusyId(null);
    }
  };
  useEffect(() => {
    if (!printingManual) return undefined;
    const clear = () => setPrintingManual(null);
    window.addEventListener('afterprint', clear, { once: true });
    const frame = requestAnimationFrame(() => window.print());
    return () => { cancelAnimationFrame(frame); window.removeEventListener('afterprint', clear); };
  }, [printingManual]);
  const editorDirty = view === 'editor' && (ilawOutput !== savedHtml || (savedPlanId != null && titleDraft !== savedTitle));
  const safety = useDialogSafety({
    dirty: Boolean(manualDirty || editorDirty || selectedPdf),
    pending: saving || uploading || generating || manualSaving,
    onClose: () => setView('list'),
    discardMessage: 'Discard unsaved lesson-plan changes?',
    leaveMessage: 'Leave Lesson Plans and discard unsaved changes?',
  });
  const allPlans = [...(import.meta.env.DEV ? mockPlans.filter(plan => plan.teacher_id === userData?.uid) : []), ...plans];
  const aiPdfUnavailableById = useMemo(() => new Map(plans.filter(plan => savedPlanType(plan) === 'ai').map(plan => {
    try { parseAiIlawHtml(plan.objectives); return [plan.id, '']; }
    catch (error) { return [plan.id, error instanceof Error ? error.message : 'This plan cannot be exported as a PDF.']; }
  })), [plans]);
  const visiblePlans = allPlans.filter(plan => {
    const mockState = plan.localMock ? parseManualIlawV2(plan.objectives, { teacherId: userData.uid, planId: plan.id }).workflowState : null;
    const matchesStatus = statusFilter === 'all' || (plan.localMock ? mockState === statusFilter : (plan.status || 'draft') === statusFilter);
    const matchesType = typeFilter === 'all' || savedPlanType(plan) === typeFilter;
    const query = search.trim().toLocaleLowerCase();
    return matchesStatus && matchesType && (!query || `${plan.title || ''} ${plan.subject || ''}`.toLocaleLowerCase().includes(query));
  });
  // ── ILAW output styles ─────────────────────────────────────


  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className={`p-4 sm:p-6 space-y-5${view === 'manual' ? ' teacher-manual-ilaw-active' : ''}`}>
      <Toast toast={toast} shadow />
      {confirmAction && <ConfirmDialog title="Confirm lesson plan action" message={confirmAction.message}
        confirmLabel={confirmAction.confirmLabel} onCancel={() => setConfirmAction(null)}
        onConfirm={() => { const action = confirmAction.action; setConfirmAction(null); void action(); }} />}
      {safety.routeBlocker}
      {/* ── HEADER ── */}
      <header ref={headerRef} className={view === 'editor' ? 'flex flex-col items-start gap-3 min-w-0' : 'flex flex-wrap items-start justify-between gap-3'}>
        <div className={view === 'editor' ? 'flex flex-col items-start gap-3 min-w-0 w-full' : view === 'manual' ? 'flex flex-col items-start gap-1 min-w-0' : 'flex flex-wrap items-center gap-3 min-w-0'}>
          {view === 'manual' && <button type="button" onClick={() => {
            const leave = () => {
              setView('list');
              requestAnimationFrame(() => manualResumeRef.current?.focus({ preventScroll: true }));
            };
            if (manualDirty) requestConfirmation('Leave this Manual ILAW document with unsaved changes?', leave, 'Leave document');
            else leave();
          }} className="flex items-center gap-1 min-h-[44px] text-sm font-medium hover:underline flex-shrink-0"
            style={{ color: 'var(--banner-accent)' }}>← Back to Lesson Plans</button>}
          {view === 'editor' && (
            <button type="button" disabled={saving} onClick={() => {
              const leave = () => { setView('list'); setIlawOutput(savedHtml); setTitleDraft(savedTitle); setTitleError(''); };
              if (editorDirty) requestConfirmation('Discard unsaved lesson-plan changes?', leave);
              else leave();
            }}
              className="flex items-center gap-1 min-h-[44px] text-sm font-medium hover:underline flex-shrink-0"
              style={{ color: 'var(--banner-accent)' }}>
              ← Back
            </button>
          )}
          <div className="min-w-0">
            <h1 ref={manualHeadingRef} tabIndex={view === 'manual' ? -1 : undefined} className="text-2xl font-bold break-words" style={{ color: 'var(--text)', overflowWrap: 'anywhere' }}>
              {view === 'editor' ? (currentPlanMeta?.title || 'ILAW Lesson Plan') : view === 'manual' ? 'Manual ILAW Editor' : 'Lesson Plans'}
            </h1>
            {view === 'list' && <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Create, review, and manage your lesson plans.</p>}
            {view === 'editor' && currentPlanMeta?.file_name && (
              <p className="text-xs break-all flex items-start gap-1 min-w-0" style={{ color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                <FileText size={12} className="shrink-0" aria-hidden="true" />{currentPlanMeta.file_name}
              </p>
            )}
          </div>
        </div>

        {view === 'manual' && <span role="status" className="rounded-lg px-3 py-2 text-sm font-medium" style={{ color: 'var(--text-muted)', backgroundColor: 'var(--card2)', border: '1px solid var(--border)' }}>Local QA only · Not saved to EduScribe · Use synthetic content</span>}

        {view === 'editor' && savedPlanId != null && (
          <div className="max-w-xl w-full">
            <label htmlFor="saved-lesson-plan-title" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Lesson Plan Title</label>
            <Input id="saved-lesson-plan-title" value={titleDraft} disabled={saving} aria-invalid={Boolean(titleError)}
              aria-describedby={`saved-lesson-plan-title-help${titleError ? ' saved-lesson-plan-title-error' : ''}`}
              onChange={event => {
                const title = event.target.value;
                setTitleDraft(title);
                setTitleError('');
                if (!currentPlanMeta?.ai_generated || !editorRef.current || validateLessonPlanTitle(title).error) return;
                const html = syncAiLessonPlanHeading(editorRef.current.innerHTML, title.trim());
                if (html !== null) {
                  editorRef.current.innerHTML = html;
                  setIlawOutput(html);
                }
              }} />
            <p id="saved-lesson-plan-title-help" className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              This is the title shown in Saved lesson plans. Choose Save Changes to rename the saved plan.
            </p>
            {titleError && <p id="saved-lesson-plan-title-error" role="alert" className="text-xs mt-1" style={{ color: 'var(--badge-red-fg)' }}>{titleError}</p>}
          </div>
        )}
        {view === 'editor' && savedPlanId != null && currentPlanMeta?.ai_generated && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Saved metadata — Subject: {currentPlanMeta.assignment.subjectName || 'Unknown'} · Grade: {currentPlanMeta.assignment.gradeLevel || 'Unknown'} · Academic Year: {currentPlanMeta.assignment.schoolYear || 'Unknown'}
        </p>}
        {view === 'editor' && savedPlanId == null && !aiLessonPlanSaveFlagEnabled() && <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Permanent AI Lesson Plan save is unavailable until the local trusted writer is enabled. Your generated draft remains editable on this page.
        </p>}
        {view === 'editor' && ilawOutput && (
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Btn variant="outline" className="min-h-[44px]" onClick={handlePrint}><Printer size={15} aria-hidden="true" /> Print</Btn>
            <label htmlFor="lesson-plan-download-name" className="text-sm font-medium" style={{ color: 'var(--text)' }}>Suggested PDF filename</label>
            <Input id="lesson-plan-download-name" className="w-56 max-w-full" value={downloadName} onChange={event => {
              const name = event.target.value;
              filenameValueRef.current = name;
              filenameEditedRef.current = true;
              setDownloadName(name);
              if (savedPlanId != null && filenameOwnerRef.current === userData?.uid) {
                const key = lessonPlanFilenamePreferenceKey(userData?.uid, savedPlanId);
                if (key) filenameDraftsRef.current.set(key, name);
                writeLessonPlanFilenamePreference(userData?.uid, savedPlanId, name);
              }
            }} aria-describedby="lesson-plan-download-name-help" autoComplete="off" spellCheck={false} />
            {savedPlanId == null ? <AiPlanSaveAction apiBase={API_BASE} content={ilawOutput} title={currentPlanMeta?.title} busy={saving} onSave={handleSaveIlawPlan} />
              : <Btn variant="default" className="min-h-[44px]" onClick={handleSaveIlawPlan} busy={saving} disabled={saving}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Save Changes
              </Btn>}
          </div>
        )}
        {view === 'editor' && ilawOutput && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Choose Save as PDF in the browser print dialog. Check the filename there before saving.</p>}
        {view === 'editor' && ilawOutput && <p id="lesson-plan-download-name-help" className="text-xs" style={{ color: 'var(--text-muted)' }}>
          The suggested PDF filename is saved only on this device. It does not rename the Lesson Plan Title or the original uploaded PDF.
        </p>}
      </header>
      {safety.busyNotice && <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>{safety.busyNotice}</p>}

      {/* ══════════════ LIST VIEW ══════════════ */}
      {view === 'list' && (
        <>
        <div className="space-y-5">

          {/* Left: upload + saved plans */}
          <div className="min-w-0 space-y-5">

            {/* Upload card */}
            <Card className="p-5 sm:p-6 text-center" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
              <h2 className="font-semibold text-lg mb-2" style={{ color: 'var(--text)' }}>AI-Generated ILAW Lesson Plan</h2>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                style={{ backgroundColor: 'var(--card2)', color: 'var(--banner-accent)' }}>
                {(uploading || generating) ? (
                  <Loader2 size={24} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Upload size={24} aria-hidden="true" />
                )}
              </div>

              {(uploading || generating) ? (
                <>
                  <p role="status" className="font-semibold mb-2" style={{ color: 'var(--text)' }}>{uploadProgress}</p>
                  <p className="text-sm break-all mb-1" style={{ color: 'var(--text)' }}>{selectedPdf?.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Keep this page open. Your editable result will appear when generation finishes.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                    Upload a PDF to generate an editable ILAW lesson plan. Review the result here; permanent AI-plan saving is currently unavailable.
                  </p>
                  <TeacherFilePicker id="lesson-pdf-upload" accept=".pdf"
                    guidance={`PDF only · Maximum ${MAX_PDF_MB} MB`}
                    file={selectedPdf} onSelect={selectPdf}
                    onRemove={() => { uploadedPdfRef.current = null; setSelectedPdf(null); setUploadError(''); }} />
                  <div className="mt-3">
                    <Btn variant="default" disabled={!selectedPdf} onClick={handlePdfUpload}>
                      <FileUp size={16} aria-hidden="true" />Generate lesson plan
                    </Btn>
                  </div>

                  {/* Inside the card, where the teacher is already looking,
                      and it stays until the next attempt. The toast this
                      replaces appeared in a far corner and faded on its own,
                      so the one sentence explaining why nothing happened was
                      usually gone before it was read. */}
                  {uploadError && (
                    <div role="alert"
                      className="mt-5 text-left rounded-lg px-4 py-3 flex gap-3 items-start"
                      style={{
                        backgroundColor: 'var(--badge-red-bg)',
                        border: '1px solid var(--badge-red-border)',
                      }}
                    >
                      <AlertTriangle size={17} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--badge-red-fg)' }} />
                      <div>
                        <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--badge-red-fg)' }}>
                          Could not generate the lesson plan
                        </p>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--badge-red-fg)' }}>
                          {uploadError}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>

            <Card className="p-4 sm:p-5" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
              <div className="flex items-start gap-3">
                <FileEdit size={20} className="shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Manual ILAW Lesson Plan</h2>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Prefer to write it yourself? Start with the blank school ILAW template.</p>
                  {activeTemporaryPlan && <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--card2)', border: '1px solid var(--border)' }}>
                    <p className="text-sm sm:flex-1 min-w-0" style={{ color: 'var(--text-muted)' }}>Local test draft — Not saved to EduScribe</p>
                    <button ref={manualResumeRef} type="button" className="self-start sm:self-auto min-h-[44px] px-4 py-2 rounded-lg text-sm font-semibold" style={{ color: 'var(--text)', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }} onClick={() => setView('manual')}>Resume temporary draft</button>
                  </div>}
                  <Btn variant="outline" className="min-h-[44px] mt-3" onClick={createManualPlan} disabled={!userData?.uid}>
                    {activeTemporaryPlan ? 'Create new Manual ILAW Lesson Plan' : 'Create Manual ILAW Lesson Plan'}
                  </Btn>
                </div>
              </div>
            </Card>

            {/* Saved plans list */}
            <section aria-labelledby="saved-plans-heading" className="space-y-3">
              {manualCardError && <p role="alert" className="text-sm" style={{ color: 'var(--badge-red-fg)' }}>{manualCardError}</p>}
              {listError && mockPlans.length > 0 && <p role="alert" className="text-sm" style={{ color: 'var(--badge-red-fg)' }}>
                Real lesson plans could not be loaded. Local QA mock entries remain visible. <button type="button" className="underline" onClick={fetchPlans}>Retry real plans</button>
              </p>}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="saved-plans-heading" className="text-base font-semibold" style={{ color: 'var(--text)' }}>Saved lesson plans</h2>
                {!loading && !listError && <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>{visiblePlans.length} of {allPlans.length} plans</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                <label className="sr-only" htmlFor="lesson-plan-search">Search lesson plans</label>
                <div className="relative min-w-0">
                  <Search size={16} className="absolute left-3 top-3" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
                  <Input id="lesson-plan-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title or subject" className="pl-9" />
                </div>
                <label className="sr-only" htmlFor="lesson-plan-status">Filter by status</label>
                <select id="lesson-plan-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  className="h-10 px-3 rounded-lg text-sm" style={{ color: 'var(--text)', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                  <option value="all">All statuses</option><option value="draft">Draft</option>
                  {import.meta.env.DEV && <option value="saved">Saved</option>}
                  <option value="published">Published</option><option value="archived">Archived</option>
                </select>
                <label className="sr-only" htmlFor="lesson-plan-type">Filter by plan type</label>
                <select id="lesson-plan-type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                  className="h-10 px-3 rounded-lg text-sm min-w-0" style={{ color: 'var(--text)', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                  <option value="all">All plan types</option><option value="ai">AI-Generated</option><option value="manual">Manual ILAW</option>
                </select>
              </div>
              {loading && mockPlans.length === 0 ? (
                <Card className="p-6" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
                  <p role="status" className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading lesson plans…</p>
                </Card>
              ) : listError && mockPlans.length === 0 ? (
                <Card className="p-5" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm" style={{ color: 'var(--text)' }}>{listError}</p>
                    <Btn variant="outline" onClick={fetchPlans}>Retry lesson plans</Btn>
                  </div>
                </Card>
              ) : visiblePlans.length === 0 ? (
                <Card className="p-6 text-center" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{allPlans.length ? 'No plans match your search or filters.' : 'No lesson plans yet. Create one manually or upload a PDF.'}</p>
                </Card>
              ) : (
                <ul className="space-y-2">
                  {visiblePlans.map(plan => {
                    const status = PLAN_STATUS[plan.status || 'draft'] || PLAN_STATUS.draft;
                    const planType = savedPlanType(plan);
                    const mockSaved = plan.localMock && parseManualIlawV2(plan.objectives, { teacherId: userData.uid, planId: plan.id }).workflowState === 'saved';
                    const worksheetPreview = (planType === 'ai' || (import.meta.env.DEV && planType === 'manual')) && (!plan.localMock || mockSaved)
                      ? worksheetEligibility(plan) : null;
                    const mockState = plan.localMock ? parseManualIlawV2(plan.objectives, { teacherId: userData.uid, planId: plan.id }).workflowState : null;
                    const aiPdfUnavailable = planType === 'ai' ? aiPdfUnavailableById.get(plan.id) || '' : '';
                    return <li key={plan.id}>
                      <Card className="p-4 min-w-0" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold break-words" style={{ color: 'var(--text)' }}>{plan.title || 'Untitled lesson plan'}</h3>
                            <p className="text-sm mt-1 break-words" style={{ color: 'var(--text-muted)' }}>{plan.subject || 'Subject unavailable'} · {plan.created_at ? `Created ${planDate(plan.created_at)}` : 'Local session only'}</p>
                            {planType === 'ai' && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                              Subject: {savedAiMetadata(plan).subjectName || 'Unknown'} · Grade: {savedAiMetadata(plan).gradeLevel || 'Unknown'} · Academic Year: {savedAiMetadata(plan).schoolYear || 'Unknown'}
                            </p>}
                            {plan.updated_at && plan.updated_at !== plan.created_at && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Updated {planDate(plan.updated_at)}</p>}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{planType === 'ai' && <Sparkles size={12} className="inline mr-1" aria-hidden="true" />}{SAVED_PLAN_TYPE_LABEL[planType]}</span>
                            {plan.localMock && <><Badge color="var(--text)" bg="var(--card2)">Local test only</Badge><Badge color="var(--banner-accent)" bg="var(--card2)">{mockState === 'saved' ? 'Saved' : 'Draft'}</Badge></>}
                            {plan.localMock && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Not saved to EduScribe · This browser session only</span>}
                            {plan.status?.toLowerCase() !== 'draft' && plan.status && (
                              <Badge color={status.color} bg={status.bg}>{plan.status}</Badge>
                            )}
                          </div>
                        </div>
                        {plan.file_name && <p className="text-xs mt-2 break-all" style={{ color: 'var(--text-muted)' }}><FileText size={14} className="inline mr-1" aria-hidden="true" />{plan.file_name}</p>}
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <Btn variant="pastel" onClick={() => plan.localMock ? openManualMock(plan) : handleViewPlan(plan)}><Eye size={14} aria-hidden="true" />View and edit<span className="sr-only"> {plan.title || 'lesson plan'}</span></Btn>
                          {planType === 'ai' && (!plan.localMock || mockSaved) && <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
                            Questions per day
                            <select aria-label="Questions per day" value={weeklyQuestionCount} disabled={worksheetRun !== null}
                              onChange={event => setWeeklyQuestionCount(Number(event.target.value))}
                              className="min-h-11 rounded-lg px-2" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                              {[20, 30, 40].map(count => <option key={count} value={count}>{count}</option>)}
                            </select>
                          </label>}
                          {(planType === 'ai' || (import.meta.env.DEV && planType === 'manual')) && (!plan.localMock || mockSaved) &&
                            <button type="button" onClick={() => handleGenerateWorksheet(plan)}
                              disabled={worksheetPreview?.status !== 'ready' || worksheetRun !== null}
                              aria-label={`Generate Worksheet from ${plan.title || 'lesson plan'}`}
                              className="min-h-11 px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
                              style={{ color: 'var(--banner-accent)', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                              <Sparkles size={15} aria-hidden="true" />{planType === 'ai' ? 'Generate Weekly Worksheets' : 'Generate Worksheet'}
                            </button>}
                          {planType === 'ai' && <Btn variant="outline" onClick={() => printSavedAi(plan)}>
                            <Printer size={14} aria-hidden="true" />Print<span className="sr-only"> saved version of {plan.title || 'lesson plan'}</span>
                          </Btn>}
                          {planType === 'ai' && <Btn variant="outline" className="min-h-[44px]" onClick={() => downloadSavedAi(plan)}
                            disabled={Boolean(aiPdfUnavailable) || aiPdfBusyId !== null} busy={aiPdfBusyId === plan.id}>
                            <Download size={14} aria-hidden="true" />{aiPdfBusyId === plan.id ? 'Preparing PDF…' : 'Download PDF'}
                            <span className="sr-only"> saved version of {plan.title || 'lesson plan'}</span>
                          </Btn>}
                          {plan.localMock && <>
                            <Btn variant="outline" onClick={() => printManualMock(plan)}><Printer size={14} aria-hidden="true" />Print<span className="sr-only"> saved version of {plan.title || 'lesson plan'}</span></Btn>
                            <Btn variant="outline" onClick={() => downloadManualMock(plan)}>Download PDF<span className="sr-only"> saved version of {plan.title || 'lesson plan'}</span></Btn>
                          </>}
                          {planType !== 'manual' && plan.file_url && <a href={plan.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold px-3 py-2 rounded-lg hover:underline" style={{ color: 'var(--banner-accent)' }}>Open source PDF ↗<span className="sr-only"> for {plan.title || 'lesson plan'}</span></a>}
                          {!plan.localMock && <button type="button" onClick={() => handleDeletePlan(plan.id)} aria-label={`Delete ${plan.title || 'lesson plan'}`}
                            className="ml-auto min-h-11 px-3 py-2 rounded-lg text-sm font-semibold hover:opacity-90" style={{ color: 'var(--badge-red-fg)', border: '1px solid var(--border)' }}>
                            <Trash2 size={15} className="inline mr-1" aria-hidden="true" />Delete
                          </button>}
                        </div>
                        {import.meta.env.DEV && worksheetPreview?.status === 'ready'
                          && (!worksheetPreview.context.subjectId || !worksheetPreview.context.gradeLevel) &&
                          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                            Saved subject or grade is unknown. Private unsaved worksheets will keep it unknown; distribution still requires verified authorization.
                          </p>}
                        {import.meta.env.DEV && worksheetPreview?.status === 'ineligible' &&
                          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Worksheet preview unavailable: {worksheetPreview.reason}</p>}
                        {import.meta.env.DEV && worksheetGenerationError?.planId === plan.id &&
                          <p role="alert" className="text-sm mt-2" style={{ color: 'var(--red)' }}>{worksheetGenerationError.message}</p>}
                        {aiPdfUnavailable && <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{aiPdfUnavailable}</p>}
                        {aiPdfError?.planId === plan.id && <p role="alert" className="text-sm mt-2" style={{ color: 'var(--badge-red-fg)' }}>{aiPdfError.message}</p>}
                      </Card>
                    </li>;
                  })}
                </ul>
              )}
            </section>
          </div>

        </div>
        </>
      )}

      {worksheetRun && <Modal title={worksheetRun.kind === 'weekly' ? 'Weekly worksheet generation' : 'Sample worksheet generation'} onClose={cancelWorksheetRun}
        escapeCloses description={worksheetRun.job ? 'Five private drafts are saved only after the whole job validates.'
          : 'Nothing is saved or distributed automatically.'}>
        <div className="grid gap-4 text-sm" style={{ color: 'var(--text)' }}>
          <p className="font-semibold break-words">{worksheetRun.plan.title || 'Saved lesson plan'}</p>
          {worksheetRun.kind === 'weekly' && ['generating', 'generation-complete'].includes(worksheetRun.status) &&
            <WeeklyGenerationProgress plannedCalls={5 * weeklyQuestionCount / 10}
              completed={worksheetRun.status === 'generation-complete'} onComplete={finishWeeklyProgress} />}
          {['validating', 'generating', 'validating-result'].includes(worksheetRun.status)
            && !(worksheetRun.kind === 'weekly' && worksheetRun.status === 'generating') && <p role="status" className="flex items-center gap-2">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            {worksheetRun.status === 'validating' ? worksheetRun.kind === 'weekly' ? 'Checking five daily ILAW sections…' : 'Checking the saved Assessment…'
              : worksheetRun.status === 'generating' ? 'Matching a local test Assessment fixture…'
                : worksheetRun.kind === 'weekly' ? 'Checking the worksheet drafts…' : 'Checking the sample worksheet…'}
          </p>}
          {worksheetRun.status === 'ready' && <p role="status">{worksheetRun.kind === 'weekly'
            ? `Five separate daily drafts are ready for Teacher review in Worksheets.${Number.isInteger(worksheetRun.providerCalls) ? ` ${worksheetRun.providerCalls} provider requests were attempted.` : ''} Nothing was saved or distributed.`
            : 'Sample generated from a test Assessment fixture — not live AI. View the unsaved draft on Worksheets, then choose View/Edit to open the editor.'}</p>}
          {worksheetRun.status === 'job' && <p role="status">{worksheetRun.job.status.replaceAll('_', ' ').toLowerCase()}: {worksheetRun.job.completedValidatedBatches} of {worksheetRun.job.plannedProviderCalls} batches validated; {worksheetRun.job.attemptedProviderCalls} provider requests attempted. {worksheetRun.job.status === 'WAITING_FOR_CAPACITY'
            ? 'Waiting for provider capacity. Resume requires an explicit action after the retry time.'
            : 'Progress changes only when a trusted worker completes a step.'}</p>}
          {worksheetRun.status === 'saved' && <p role="status">Saved private weekly collection. Open Worksheets to review all five days.</p>}
          {worksheetRun.status === 'error' && <p role="alert">{worksheetRun.message}
            {Number.isInteger(worksheetRun.providerCalls) ? ` ${worksheetRun.providerCalls} provider requests were attempted.` : ''}
            {!worksheetRun.job && ' No worksheets were saved.'}
            {worksheetRun.retryable ? ' You may retry this request.' : ' Close this dialog and review the source or backend status before trying again.'}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Btn variant="outline" onClick={cancelWorksheetRun}>{worksheetRun.job ? 'Close' : 'Cancel'}</Btn>
            {worksheetRun.status === 'job' && <Btn variant="outline" onClick={requestJobCancel}>Request cancellation</Btn>}
            {worksheetRun.status === 'saved' && <Btn onClick={() => { setWorksheetRun(null); navigate('/teacher-dashboard/worksheets'); }}>Open saved collection</Btn>}
            {worksheetRun.status === 'error' && worksheetRun.retryable && <Btn onClick={() => handleGenerateWorksheet(worksheetRun.plan)}>Retry</Btn>}
            {worksheetRun.status === 'ready' && <Btn onClick={openReadyWorksheet}>View draft in Worksheets</Btn>}
          </div>
        </div>
      </Modal>}

      {view === 'manual' && activeTemporaryPlan && <div data-manual-print>
        <FullManualIlawEditor mode="active" manualDraft={activeTemporaryPlan} onManualDraftChange={next => {
          setTemporaryPlan(next); setManualErrors({}); setManualSaveError('');
        }} baselineDraft={manualBaseline} validationErrors={manualErrors}
          onFocusHeading={() => manualHeadingRef.current?.focus({ preventScroll: true })} />
        {manualSaveError && <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--badge-red-fg)' }}>{manualSaveError}</p>}
        {import.meta.env.DEV ? <div role="group" aria-label="Local Manual ILAW save actions" className="mt-5 pt-4 flex flex-wrap gap-3" style={{ borderTop: '1px solid var(--border)' }}>
          <Btn variant="outline" onClick={() => saveManualMock('draft')} busy={manualSaving}
            disabled={manualSaving || manualMockIdentity?.workflowState === 'saved'}>Save Incomplete Draft (local)</Btn>
          <Btn variant="primary" onClick={() => saveManualMock('saved')} busy={manualSaving} disabled={manualSaving}>Save Lesson Plan</Btn>
          {manualSaving && <span role="status">Saving to this local QA session…</span>}
        </div> : <p role="status" className="mt-4 text-sm">{permanentSaveUnavailable}</p>}
        <div data-manual-discard className="mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button type="button" className="min-h-[44px] px-3 rounded-lg text-sm font-medium" style={{ color: 'var(--badge-red-fg)', border: '1px solid var(--border)' }}
          onClick={() => {
            const discard = () => { setTemporaryPlan(null); setManualMockIdentity(null); setView('list'); };
            requestConfirmation('Discard this temporary Manual ILAW draft? Any changes in this editor will be lost.', discard);
          }}>Discard temporary draft</button>
        </div>
      </div>}
      {printingManual && <div className="teacher-manual-saved-print"><IlawTemplate value={printingManual.document}
        sourceDetails={printingManual.sourceDetails} editable={false} sourceDetailsTitle="Lesson-wide details" /></div>}

      {/* ══════════════ EDITOR VIEW ══════════════ */}
      {view === 'editor' && (
        <div className="space-y-4">

          {/* Editable ILAW output */}
          <Card className="p-4 sm:p-6" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>Lesson plan editor</h2>
            {currentPlanMeta?.ai_generated && ilawOutput && (
              <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 mb-3"
                style={{
                  backgroundColor: 'var(--badge-yellow-bg)',
                  border: '1px solid var(--badge-yellow-border)',
                }}>
                <AlertTriangle size={14} style={{ color: 'var(--badge-yellow-fg)', flexShrink: 0, marginTop: 2 }} />
                <p className="text-xs" style={{ color: 'var(--badge-yellow-fg)' }}>
                  This lesson plan was generated with AI (Gemini) and can make mistakes. Please review and verify all
                  content — objectives, activities, and assessments — before using it in class.
                </p>
              </div>
            )}
            <p id="lesson-editor-help" className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
              Review the plan below. Select the editor to make changes, then print or download your draft.
            </p>
            {saveError && <p role="alert" className="text-sm mb-3" style={{ color: 'var(--badge-red-fg)' }}>{saveError}</p>}
            {saving && <p role="status" className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>Saving lesson plan…</p>}
            <div className={currentPlanMeta?.ai_generated ? "ilaw-active-header" : undefined}>{currentPlanMeta?.ai_generated && ilawOutput && !hasEmbeddedLetterhead && <IlawHybridHeader showLetterhead={!hasSchoolName} />}</div>
            {currentPlanMeta?.ai_generated && ilawOutput && hasEmbeddedLetterhead && (
              <span className="sr-only">DepEd logo, school seal, and EduScribe logo frame the existing lesson plan letterhead.</span>
            )}
            <div
              ref={editorRef}
              contentEditable={!saving}
              role="textbox"
              aria-label="Lesson plan content"
              aria-describedby="lesson-editor-help"
              aria-multiline="true"
              tabIndex={0}
              suppressContentEditableWarning
              onInput={e => {
                setIlawOutput(e.currentTarget.innerHTML);
                setHasEmbeddedLetterhead(Boolean(e.currentTarget.querySelector('.ilaw-letterhead')));
                setHasSchoolName(SCHOOL_NAME.test(e.currentTarget.textContent));
              }}
              onPaste={e => saving ? e.preventDefault() : insertEditorTransfer(e, e.currentTarget, e.clipboardData, setIlawOutput)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => saving ? e.preventDefault() : insertEditorTransfer(e, e.currentTarget, e.dataTransfer, setIlawOutput, true)}
              className={`min-h-96 min-w-0 overflow-x-auto focus-visible:ring-2${currentPlanMeta?.ai_generated ? ' ilaw-active-editor' : ''}`}
              style={{
                '--ilaw-deped-logo': `url("${ilawBrandAssets.depedLogo}")`,
                '--ilaw-school-seal': `url("${ilawBrandAssets.schoolSeal}")`,
                '--ilaw-eduscribe-logo': `url("${ilawBrandAssets.eduscribeLogo}")`,
                padding: '16px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                backgroundColor: currentPlanMeta?.ai_generated ? '#ffffff' : 'var(--card2)',
                color: currentPlanMeta?.ai_generated ? '#172b40' : 'var(--text)',
              }}
            />
          </Card>
        </div>
      )}
    </div>
  );
};

export default LessonPlansTab;
