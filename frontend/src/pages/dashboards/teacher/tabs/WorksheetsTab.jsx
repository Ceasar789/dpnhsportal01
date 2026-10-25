// ============================================
// FILE: src/pages/dashboards/teacher/tabs/WorksheetsTab.jsx
// WORKSHEETS TAB — Full Supabase CRUD
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import { permanentSaveUnavailable } from '../persistence/editorPersistence';
import { weeklyJobClient } from '../persistence/weeklyJobClient';
import {
  FileText, Plus, ExternalLink,
  Loader2, MoreHorizontal
} from 'lucide-react';
import { useTheme, useToast } from '../hooks';
import { Card, Input, Modal, ConfirmDialog, Badge, Btn, Toast } from '../shared/ui';
import { TASK_TYPES, TASK_TYPE_LABELS } from '../../../../lib/taskFormatting';
import { useWorksheetAssessment } from '../worksheets/useWorksheetAssessment';
import DistributeModal from '../worksheets/DistributeModal';
import QuestionBuilderModal from '../worksheets/QuestionBuilderModal';
import CheckSubmissionsModal from '../worksheets/CheckSubmissionsModal';
import EncodeScoresModal from '../worksheets/EncodeScoresModal';
import useDialogSafety from '../worksheets/useDialogSafety';
import { createManualWorksheetDraft, hasUnsavedGeneratedChanges, restoreLocallySavedWorksheet } from '../worksheets/generatedDraftModel';
import { updateWeeklyWorksheet, shuffleWeeklyWorksheet } from '../worksheets/weeklyWorksheetCollection';

const LocalDistributionModal = import.meta.env.DEV && import.meta.env.MODE === 'profile-e2e'
  ? lazy(() => import('../worksheets/LocalDistributionModal')) : null;

const EMPTY_WORKSHEET = { title: '', subject: '', pages: '', items: '', task_type: 'worksheet' };

const WorksheetActions = ({ worksheet, onDistribute, onQuestions, onCheck, onEncode, onDownload, onDelete, busy }) => {
  const [open, setOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const actions = [
    { label: 'Distribute', run: onDistribute },
    { label: 'Questions', run: onQuestions },
    { label: 'Check submissions', run: onCheck },
    { label: 'Encode scores', run: onEncode },
    ...(worksheet.file_url ? [{ label: 'Open file', run: onDownload }] : []),
    { label: 'Delete', run: onDelete, destructive: true },
  ];

  useEffect(() => {
    if (!open) return undefined;
    const dismissOutside = (event) => {
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);

  const focusItem = (index) => menuRef.current?.querySelectorAll('[role="menuitem"]')[index]?.focus();
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const showMenu = () => {
    setOpenAbove(window.innerHeight - triggerRef.current.getBoundingClientRect().bottom < actions.length * 40 + 16);
    setOpen(true);
  };

  return (
    <div className="relative shrink-0">
      <button ref={triggerRef} type="button" aria-label={`More actions for ${worksheet.title || 'worksheet'}`}
        aria-haspopup="menu" aria-expanded={open} onClick={() => open ? close() : showMenu()}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            showMenu();
            requestAnimationFrame(() => focusItem(event.key === 'ArrowDown' ? 0 : actions.length - 1));
          }
        }}
        className="h-10 min-w-10 px-2 rounded-lg flex items-center justify-center"
        style={{ color: 'var(--text)', border: '1px solid var(--border)', backgroundColor: 'var(--card-bg)' }}>
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
      {open && <div ref={menuRef} role="menu" aria-label={`Actions for ${worksheet.title || 'worksheet'}`}
        onKeyDown={event => {
          const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
          const index = items.indexOf(document.activeElement);
          if (event.key === 'Escape') { event.preventDefault(); close(true); }
          else if (event.key === 'Tab') close();
          else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
            items[next]?.focus();
          }
        }}
        className={`absolute right-0 z-30 min-w-48 rounded-lg p-1 shadow-lg ${openAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}>
        {actions.map(action => <button key={action.label} type="button" role="menuitem" disabled={busy}
          onClick={() => { close(true); action.run(); }}
          className="block w-full text-left px-3 py-2 rounded-md text-sm font-medium"
          style={{ color: action.destructive ? 'var(--red)' : 'var(--text)' }}>
          {action.label}<span className="sr-only"> for {worksheet.title || 'worksheet'}</span>
        </button>)}
      </div>}
    </div>
  );
};

const WorksheetsTab = ({ generatedDraft, onGeneratedDraftChange, onDiscardGeneratedDraft,
  weeklyCollections = [], onWeeklyCollectionChange, onDiscardWeeklyCollection,
  manualDrafts = [], onCreateManualDraft, onManualDraftChange, onDiscardManualDraft,
  localDistributions = [], onLocalDistribution, onClearLocalDistributions,
  jobClient = weeklyJobClient }) => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { toast, showToast } = useToast();
  const [activeFilter, setActiveFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [worksheets, setWorksheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGeneratedEditor, setShowGeneratedEditor] = useState(false);
  const [openWeeklyCollectionId, setOpenWeeklyCollectionId] = useState(null);
  const [activeWeeklyCollectionId, setActiveWeeklyCollectionId] = useState(null);
  const [activeDailyDraftId, setActiveDailyDraftId] = useState(null);
  const [confirmWeeklyDeleteId, setConfirmWeeklyDeleteId] = useState(null);
  const [ownedJobs, setOwnedJobs] = useState([]);
  const [savedCollections, setSavedCollections] = useState([]);
  const [openSavedCollection, setOpenSavedCollection] = useState(null);
  const [activeSavedDraft, setActiveSavedDraft] = useState(null);
  const [jobApiError, setJobApiError] = useState('');
  const [openingSaved, setOpeningSaved] = useState(false);
  useEffect(() => {
    if (!jobClient.enabled || !userData?.uid) return;
    let active = true;
    const refresh = async () => {
      try {
        const [jobs, collections] = await Promise.all([jobClient.listJobs(), jobClient.listCollections()]);
        if (active) { setOwnedJobs(jobs); setSavedCollections(collections); setJobApiError(''); }
      } catch {
        if (active) setJobApiError('Could not load private generation jobs. Check the backend.');
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [jobClient, userData?.uid]);
  const openExistingCollection = async id => {
    setOpeningSaved(true); setJobApiError('');
    try {
      const collection = await jobClient.openCollection(id);
      if (collection?.worksheets?.length !== 5) throw new Error('Incomplete collection');
      setOpenSavedCollection(collection);
    } catch { setJobApiError('Could not open the private weekly collection.'); }
    finally { setOpeningSaved(false); }
  };
  const archiveSavedCollection = async (collection, archived) => {
    try {
      await jobClient.changeArchive(collection.id, { archived, expectedRevision: collection.revision });
      setOpenSavedCollection(null);
      setSavedCollections(await jobClient.listCollections());
    } catch { setJobApiError('Archive or restore was blocked. Check the collection revision and assessment history.'); }
  };
  const weeklyCollection = weeklyCollections.find(item => item.collectionId === activeWeeklyCollectionId);
  const activeWeeklyCollectionIdRef = useRef(activeWeeklyCollectionId);
  useLayoutEffect(() => { activeWeeklyCollectionIdRef.current = activeWeeklyCollectionId; }, [activeWeeklyCollectionId]);
  const activeGeneratedDraft = activeSavedDraft || (weeklyCollection
    ? weeklyCollection.worksheets.find(item => item.draftId === activeDailyDraftId) : generatedDraft);
  const savedDraftOpen = Boolean(activeSavedDraft);
  const changeActiveGeneratedDraft = useCallback(next => savedDraftOpen
    ? setActiveSavedDraft(next)
    : activeWeeklyCollectionIdRef.current
    ? onWeeklyCollectionChange(activeWeeklyCollectionIdRef.current, current => updateWeeklyWorksheet(current, next))
    : onGeneratedDraftChange(next), [savedDraftOpen, onGeneratedDraftChange, onWeeklyCollectionChange]);
  const [activeManualDraftId, setActiveManualDraftId] = useState(null);
  const [confirmManualDelete, setConfirmManualDelete] = useState(null);
  const activeManualDraft = manualDrafts.find(item => item.draftId === activeManualDraftId);
  const [confirmDraftDelete, setConfirmDraftDelete] = useState(false);
  const [showLocalDistribution, setShowLocalDistribution] = useState(false);
  const syntheticDistributionFixture = LocalDistributionModal && typeof window !== 'undefined'
    ? window.__EDUSCRIBE_DISTRIBUTION_FIXTURE__ : null;
  const canSimulateDistribution = Boolean(syntheticDistributionFixture?.synthetic === true
    && generatedDraft?.saved && generatedDraft.status === 'local-saved' && !generatedDraft.id);
  const simulatedSections = localDistributions.filter(row => row.worksheetId === generatedDraft?.draftId);
  const [confirmWorksheetDelete, setConfirmWorksheetDelete] = useState(null);
  const generatedEntryButtonRef = useRef(null);
  const worksheetsHeadingRef = useRef(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewingWorksheet, setPreviewingWorksheet] = useState(null);
  const [formData, setFormData] = useState(EMPTY_WORKSHEET);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const deletingRef = useRef(false);
  const savingRef = useRef(false);
  const lastFileOpenRef = useRef({ id: null, at: 0 });
  const createDirty = formData.title.trim() !== '' || formData.pages.trim() !== ''
    || formData.items.trim() !== '' || formData.task_type !== EMPTY_WORKSHEET.task_type;
  const { requestClose: requestCreateClose, routeBlocker: createRouteBlocker, busyNotice: createBusyNotice } = useDialogSafety({
    dirty: createDirty, pending: saving, onClose: () => setShowAddModal(false),
    discardMessage: 'Close without saving? Your draft will remain available until you leave Worksheets.',
    leaveMessage: 'Discard your unsaved worksheet draft and leave Worksheets?',
  });
  const assessment = useWorksheetAssessment(showToast);
  const [subjectChoice, setSubjectChoice] = useState(null);
  const [gradeChoice, setGradeChoice] = useState(null);
  const eligibleSubjects = assessment.mySubjects || [];
  const selectedSubjectId = subjectChoice?.source === eligibleSubjects ? subjectChoice.id : '';
  const subject = !assessment.subjectLoading && !assessment.subjectError
    ? eligibleSubjects.find(item => item.id === (eligibleSubjects.length === 1 ? eligibleSubjects[0].id : selectedSubjectId))
    : null;
  const selectedGradeLevel = gradeChoice?.source === eligibleSubjects && gradeChoice?.subjectId === subject?.id ? gradeChoice.grade : '';
  const gradeLevel = subject?.grades.length === 1 ? subject.grades[0]
    : subject?.grades.includes(selectedGradeLevel) ? selectedGradeLevel : '';
  const subjectReady = Boolean(subject && gradeLevel && userData?.uid && !assessment.subjectLoading && !assessment.subjectError);

  const subjectFields = (prefix) => <div className="min-w-0 space-y-2">
    {assessment.subjectLoading ? <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading your teaching load…</p>
      : assessment.subjectError ? <div role="alert" className="text-sm" style={{ color: 'var(--red)' }}>
        Could not load your teaching load. <button type="button" onClick={assessment.fetchMySubject} className="underline font-semibold">Retry</button>
      </div>
      : eligibleSubjects.length === 0 ? <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>No subject is assigned for this school year. Ask your admin to set your teaching load.</p>
      : <>
        {eligibleSubjects.length > 1 ? <div>
          <label htmlFor={`${prefix}-subject`} className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Teaching-load subject</label>
          <select id={`${prefix}-subject`} value={subject?.id || ''} disabled={saving}
            onChange={event => { setSubjectChoice({ id: event.target.value, source: eligibleSubjects }); setGradeChoice(null); }}
            className="w-full min-h-10 px-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <option value="">Choose a subject</option>
            {eligibleSubjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div> : <p className="text-sm" style={{ color: 'var(--text)' }}>Subject: <strong>{subject?.name}</strong> (from your teaching load)</p>}
        {subject && (subject.grades.length > 1 ? <div>
          <label htmlFor={`${prefix}-grade`} className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Assigned grade level</label>
          <select id={`${prefix}-grade`} value={gradeLevel} disabled={saving}
            onChange={event => setGradeChoice({ grade: event.target.value, subjectId: subject.id, source: eligibleSubjects })}
            className="w-full min-h-10 px-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            <option value="">Choose a grade</option>
            {subject.grades.map(grade => <option key={grade} value={grade}>{grade}</option>)}
          </select>
        </div> : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Assigned grade: {gradeLevel}</p>)}
      </>}
  </div>;
  const [distributingTask, setDistributingTask] = useState(null);
  const [buildingWorksheet, setBuildingWorksheet] = useState(null);
  const [checkingWorksheet, setCheckingWorksheet] = useState(null);
  const [encodingWorksheet, setEncodingWorksheet] = useState(null);
  const { routeBlocker: generatedRouteBlocker } = useDialogSafety({
    dirty: Boolean(generatedDraft && !generatedDraft.saved) && !showGeneratedEditor && !showAddModal && !showPreviewModal
      && !distributingTask && !buildingWorksheet && !checkingWorksheet && !encodingWorksheet,
    pending: false, onClose: () => {},
    leaveMessage: 'Leave Worksheets and discard the unsaved generated draft?',
  });
  const { routeBlocker: manualRouteBlocker } = useDialogSafety({
    dirty: manualDrafts.some(item => !item.saved) && !activeManualDraftId,
    pending: false, onClose: () => {},
    leaveMessage: 'Leave Worksheets with unsaved local worksheet drafts?',
  });
  const [scoreSavedMessage, setScoreSavedMessage] = useState('');

  const fetchWorksheets = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const { data, error } = await withRetry(
      () => supabase
        .from('worksheets')
        .select('*')
        .eq('teacher_id', userData?.uid)
        .order('created_at', { ascending: false }),
      { label: 'Worksheets fetch' }
    );

    if (error) {
      if (!quiet) setListError('Worksheets could not be loaded. Check your connection and try again.');
      else showToast('Error: ' + error.message, 'error');
    } else {
      setWorksheets(data || []);
      setListError('');
    }
    if (!quiet) setLoading(false);
  }, [userData, showToast]);

  useEffect(() => {
    fetchWorksheets();
  }, [fetchWorksheets]);

  const handleAddWorksheet = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;
    if (assessment.subjectError) {
      showToast('Could not load your teaching load. Check your connection and try again.', 'error');
      return;
    }
    if (assessment.subjectLoading) {
      showToast('Still loading your teaching load — try again in a moment.', 'error');
      return;
    }
    if (!subjectReady) {
      showToast(eligibleSubjects.length ? 'Choose an assigned subject and grade level before creating a worksheet.' : 'No subject is assigned to you yet. Ask your admin to set your teaching load before creating tasks.', 'error');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const { error } = await supabase.from('worksheets').insert([{
        ...formData,
        subject: subject.name,
        subject_id: subject.id,
        grade_level: gradeLevel,
        task_type: formData.task_type,
        teacher_id: userData?.uid,
        created_at: new Date().toISOString()
      }]);

      if (error) showToast('Error: ' + error.message, 'error');
      else {
        showToast('Worksheet created');
        setFormData(EMPTY_WORKSHEET);
        setShowAddModal(false);
        fetchWorksheets();
      }
    } catch (error) {
      showToast('Error: ' + error.message, 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const deleteWorksheet = async (id) => {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeletingId(id);
    try {
      const { error } = await supabase.from('worksheets').delete().eq('id', id);
      if (error) showToast('Error: ' + error.message, 'error');
      else {
        showToast('Worksheet deleted');
        fetchWorksheets();
      }
    } catch (error) {
      showToast('Error: ' + (error?.message || 'Could not delete worksheet.'), 'error');
    } finally {
      deletingRef.current = false;
      setDeletingId(null);
    }
  };
  const handleDelete = (id) => setConfirmWorksheetDelete(id);

  const handlePreview = (worksheet) => {
    setPreviewingWorksheet(worksheet);
    setShowPreviewModal(true);
  };

  const downloadWorksheet = (worksheet) => {
    let fileUrl;
    try {
      fileUrl = new URL(worksheet.file_url);
      if (!['https:', 'http:'].includes(fileUrl.protocol)) throw new Error('Unsupported file URL');
    } catch {
      showToast('No valid file link is available. Ask your administrator to check this worksheet.', 'error');
      return;
    }
    const now = Date.now();
    if (lastFileOpenRef.current.id === worksheet.id && now - lastFileOpenRef.current.at < 800) return;
    const opened = window.open('', '_blank');
    if (!opened) {
      showToast('Your browser blocked the file tab. Allow pop-ups for EduScribe and try again.', 'error');
      return;
    }
    try {
      opened.opener = null;
      opened.location.replace(fileUrl.href);
      lastFileOpenRef.current = { id: worksheet.id, at: now };
      showToast('File tab opened. Check the tab to confirm the file is accessible.');
    } catch {
      opened.close();
      showToast('Could not open the file link. Please try again.', 'error');
    }
  };

  // Derived from the worksheets actually on this teacher's list, not a
  // hardcoded registry — a literal list drifts from the canonical subject
  // names (e.g. 'Math' vs the registered 'Mathematics') and leaves newer
  // subjects unreachable. A teacher with one subject just sees two chips.
  const filters = useMemo(() => {
    const subjects = [...new Set(worksheets.map(w => w.subject).filter(Boolean))].sort();
    return ['All', ...subjects];
  }, [worksheets]);

  const filtered = worksheets.filter(w =>
    (activeFilter === 'All' || w.subject === activeFilter)
    && (!search.trim() || `${w.title || ''} ${w.subject || ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  );
  // `worksheets.status` is a dead column — distribution lives in
  // task_assignees now, via assessment.assigneeCounts. A worksheet counts as
  // distributed here only when it genuinely has at least one assignee. A
  // failed count read must not read as "0 distributed" (that is the same
  // lie in a new place), so both tiles fall back to an explicit unknown
  // state rather than a number when assessment.assigneeCountsError is set.
  const stats = {
    total: worksheets.length,
    distributed: worksheets.filter(w => (assessment.assigneeCounts[w.id] || 0) > 0).length,
  };

  return activeManualDraft ? (
    <div className="p-4 sm:p-6 min-w-0">
      <QuestionBuilderModal key={activeManualDraft.draftId} worksheet={activeManualDraft} draft={activeManualDraft}
        manualEligibility={{ subjects: eligibleSubjects, loading: assessment.subjectLoading, error: assessment.subjectError,
          retry: assessment.fetchMySubject, teacherId: userData?.uid, schoolYear: assessment.schoolYear }}
        onDraftChange={onManualDraftChange}
        onClose={() => {
          if (activeManualDraft.saved) onManualDraftChange(restoreLocallySavedWorksheet(activeManualDraft));
          else onDiscardManualDraft(activeManualDraft.draftId);
          setActiveManualDraftId(null);
          requestAnimationFrame(() => worksheetsHeadingRef.current?.focus({ preventScroll: true }));
        }}
        onLocalSave={saved => {
          onManualDraftChange(saved);
          setActiveManualDraftId(null);
          requestAnimationFrame(() => worksheetsHeadingRef.current?.focus({ preventScroll: true }));
        }}
        onDiscardDraft={() => { onDiscardManualDraft(activeManualDraft.draftId); setActiveManualDraftId(null); }} />
    </div>
  ) : showGeneratedEditor && activeGeneratedDraft ? (
    <div className="p-4 sm:p-6 min-w-0">
      <QuestionBuilderModal key={activeGeneratedDraft.draftId} worksheet={activeGeneratedDraft} draft={activeGeneratedDraft}
        onDraftChange={changeActiveGeneratedDraft} allowDiscard={!weeklyCollection && !activeSavedDraft}
        onClose={() => {
          if (activeSavedDraft) setActiveSavedDraft(null);
          else if (activeGeneratedDraft.saved) changeActiveGeneratedDraft(restoreLocallySavedWorksheet(activeGeneratedDraft));
          setShowGeneratedEditor(false);
          requestAnimationFrame(() => weeklyCollection
            ? worksheetsHeadingRef.current?.focus({ preventScroll: true })
            : generatedEntryButtonRef.current?.focus({ preventScroll: true }));
        }}
        onLocalSave={saved => {
          if (activeGeneratedDraft.localSavedContent
            && JSON.stringify(activeGeneratedDraft.localSavedContent) !== JSON.stringify(saved.localSavedContent)) {
            onClearLocalDistributions?.();
          }
          changeActiveGeneratedDraft(saved);
          setShowGeneratedEditor(false);
          requestAnimationFrame(() => generatedEntryButtonRef.current?.focus({ preventScroll: true }));
        }}
        onDurableSave={activeSavedDraft ? async candidate => {
          const result = await jobClient.updateDaily(candidate.collectionId, candidate.id,
            candidate, candidate.revision);
          if (result.durable !== true || result.worksheet?.id !== candidate.id)
            throw new Error('The database did not confirm this Worksheet Save. Your edits remain here.');
          setOpenSavedCollection(current => current?.id === candidate.collectionId
            ? { ...current, worksheets: current.worksheets.map(item => item.id === candidate.id
              ? result.worksheet : item) } : current);
          setActiveSavedDraft(null);
          setShowGeneratedEditor(false);
        } : undefined}
        onDiscardDraft={() => {
          setShowGeneratedEditor(false); onDiscardGeneratedDraft();
          requestAnimationFrame(() => worksheetsHeadingRef.current?.focus({ preventScroll: true }));
        }} />
    </div>
  ) : (
    <div className="p-4 sm:p-6 min-w-0">
      {createRouteBlocker}
      {generatedRouteBlocker}
      {manualRouteBlocker}
      {confirmWorksheetDelete && <ConfirmDialog title="Delete worksheet" confirmLabel="Delete worksheet"
        message="Delete this saved worksheet? This cannot be undone."
        onCancel={() => setConfirmWorksheetDelete(null)}
        onConfirm={() => { const id = confirmWorksheetDelete; setConfirmWorksheetDelete(null); void deleteWorksheet(id); }} />}
      <Toast toast={toast} />
      {scoreSavedMessage && <p role="status" className="mb-4 rounded-lg border px-4 py-3 text-sm font-medium" style={{ color: 'var(--green)', borderColor: 'var(--border)', backgroundColor: 'var(--card-bg)' }}>{scoreSavedMessage}</p>}
      
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <h1 ref={worksheetsHeadingRef} tabIndex={-1} className="text-xl font-bold" style={{ color: 'var(--text)' }}>Worksheets</h1>
        <div className="flex flex-wrap gap-3">
          <Btn disabled={!import.meta.env.DEV || !userData?.uid || !assessment.schoolYear}
            title={!import.meta.env.DEV ? 'Manual worksheet saving is not available yet.' : !assessment.schoolYear ? 'Official academic year is unavailable.' : undefined} onClick={() => {
            const draft = createManualWorksheetDraft(userData?.uid, assessment.schoolYear);
            onCreateManualDraft(draft);
            setActiveManualDraftId(draft.draftId);
          }}><Plus size={16} /> Create Worksheet</Btn>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Saved Worksheets', value: loading || listError ? '—' : stats.total },
          {
            label: 'Distributed',
            // Loading and error are both "not a real number yet" states —
            // neither may render as 0 or as the eventual value, or the tile
            // makes the exact same false claim finding 4 existed to remove,
            // just from a different window (first paint, or a slow retry).
            value: loading || listError ? '—' : assessment.assigneeCountsLoading ? '…' : assessment.assigneeCountsError ? '—' : stats.distributed,
            color: assessment.assigneeCountsLoading ? (dark ? '#64748b' : '#94a3b8')
              : assessment.assigneeCountsError ? '#dc2626' : '#16a34a',
          },
          {
            label: 'Not distributed',
            value: loading || listError ? '—' : assessment.assigneeCountsLoading ? '…' : assessment.assigneeCountsError ? '—' : (stats.total - stats.distributed),
            color: assessment.assigneeCountsLoading ? (dark ? '#64748b' : '#94a3b8')
              : assessment.assigneeCountsError ? '#dc2626' : '#d97706',
          },
        ].map((stat, idx) => (
          <Card key={idx} className="p-4" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            <p className="text-xs mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>{stat.label}</p>
            <p className="text-2xl font-bold" style={{ color: stat.color || (dark ? '#f1f5f9' : '#1a2b4a') }}>{stat.value}</p>
            {assessment.assigneeCountsError && !assessment.assigneeCountsLoading && idx > 0 && (
              <button onClick={() => assessment.fetchAssigneeCounts()}
                className="text-[11px] underline font-semibold mt-1" style={{ color: '#dc2626' }}>
                Retry
              </button>
            )}
          </Card>
        ))}
      </div>

      <div className="mb-4 max-w-md">
        <label htmlFor="worksheet-search" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Search worksheets</label>
        <Input id="worksheet-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search title or subject" />
      </div>
      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Filter worksheets by subject">
        {filters.map(f => (
          <button key={f} onClick={() => setActiveFilter(f)} aria-pressed={activeFilter === f}
            className="px-4 min-h-10 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: activeFilter === f ? 'var(--banner-accent)' : 'var(--card-bg)',
              border: '1px solid var(--border)',
              color: activeFilter === f ? '#ffffff' : 'var(--text)'
            }}>
            {f}
          </button>
        ))}
      </div>

      {!loading && !listError && <p role="status" className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
        {filtered.length} of {worksheets.length} saved worksheets
        {(weeklyCollections.length || manualDrafts.length || generatedDraft) ? ` · ${weeklyCollections.reduce((sum, item) => sum + item.worksheets.length, 0)
          + manualDrafts.length + (generatedDraft ? 1 : 0)} local drafts` : ''}
      </p>}
      {import.meta.env.PROD && !jobClient.enabled && <p role="status" className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
        Durable weekly generation and reopening are unavailable. Local weekly drafts are not saved to EduScribe.
      </p>}
      {jobClient.enabled && <section aria-label="Weekly generation jobs" className="mb-4">
        <h2 className="text-base font-semibold">Weekly generation jobs</h2>
        {jobApiError && <p role="alert">{jobApiError}</p>}
        {ownedJobs.length === 0 && <p role="status">No private weekly generation jobs found.</p>}
        {ownedJobs.map(job => <div key={job.id} className="rounded-lg border p-3 mt-2" style={{ borderColor: 'var(--border)' }}>
          <p role="status">{job.status.replaceAll('_', ' ').toLowerCase()} · {job.completedValidatedBatches} of {job.plannedProviderCalls} batches validated · {job.attemptedProviderCalls} provider requests attempted</p>
          {job.status === 'WAITING_FOR_CAPACITY' && <Btn variant="outline" onClick={async () => {
            try { await jobClient.resume(job.id); setOwnedJobs(await jobClient.listJobs()); }
            catch { setJobApiError('Resume is unavailable until the provider retry time has passed.'); }
          }}>Resume after provider limit</Btn>}
          {['QUEUED', 'RUNNING', 'WAITING_FOR_CAPACITY'].includes(job.status) &&
            <Btn variant="outline" onClick={async () => {
              try { await jobClient.cancel(job.id); setOwnedJobs(await jobClient.listJobs()); }
              catch { setJobApiError('Could not confirm job cancellation.'); }
            }}>Request cancellation</Btn>}
          {job.status === 'COMPLETED' && <p>{job.saved ? 'Saved private collection' : 'Not saved to EduScribe'}</p>}
        </div>)}
      </section>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {jobClient.enabled && savedCollections.map(collection => <section key={collection.id}
          aria-label="Saved weekly Worksheet collection" className="min-w-0 md:col-span-2 lg:col-span-3">
          <Card className="p-4 min-w-0" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            <Badge color="var(--banner-accent)" bg="var(--card2)">{collection.durable
              ? collection.status === 'Archived' ? 'Archived private collection' : 'Saved private collection'
              : 'Not saved to EduScribe'}</Badge>
            <h3 className="text-lg font-semibold mt-3">Weekly Worksheets</h3>
            <Btn onClick={() => openExistingCollection(collection.id)} disabled={openingSaved}>
              {openingSaved ? 'Opening existing collection…' : 'Open weekly collection'}</Btn>
            {collection.durable && <Btn variant="outline" onClick={() => archiveSavedCollection(collection,
              collection.status !== 'Archived')}>{collection.status === 'Archived' ? 'Restore collection' : 'Archive collection'}</Btn>}
            {openSavedCollection?.id === collection.id && <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
              {openSavedCollection.worksheets.map(item => <section key={item.id} aria-label={`${item.day} Worksheet`}
                className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-semibold">{item.day}</p>
                <h4 className="font-semibold">{item.title}</h4>
                <p>{item.questions.length} questions · {item.status}</p>
                <Btn onClick={() => { setActiveSavedDraft({ ...item, draftId: item.id,
                  sourceType: 'ai', saved: true, status: 'generated-draft' }); setShowGeneratedEditor(true); }}>
                  Edit/Preview {item.day}</Btn>
              </section>)}
            </div>}
          </Card>
        </section>)}
        {manualDrafts.map(draft => <section key={draft.draftId} aria-label="Manual Worksheet draft entry" className="min-w-0">
          <Card className="p-4 min-w-0 flex flex-col h-full" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            <Badge color="var(--banner-accent)" bg="var(--card2)">{draft.saved ? 'Saved locally for testing' : 'Not Saved'}</Badge>
            <h3 className="text-sm font-semibold mt-3 mb-1 break-words" style={{ color: 'var(--text)' }}>{draft.title || 'Untitled manual worksheet'}</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Manual worksheet · Not saved to EduScribe · Lost on refresh</p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{draft.subjectName || 'Subject not selected'} · {draft.gradeLevel || 'Grade not selected'}</p>
            <div className="flex flex-wrap gap-2 mt-auto">
              <Btn onClick={() => setActiveManualDraftId(draft.draftId)}>View/Edit worksheet</Btn>
              <Btn variant="danger" onClick={() => setConfirmManualDelete(draft.draftId)}>Delete Draft</Btn>
            </div>
          </Card>
        </section>)}
        {confirmManualDelete && <ConfirmDialog title="Delete worksheet draft" confirmLabel="Delete draft"
          message="Delete this local worksheet draft from this browser session? This cannot be undone."
          onCancel={() => setConfirmManualDelete(null)} onConfirm={() => {
            onDiscardManualDraft(confirmManualDelete); setConfirmManualDelete(null);
          }} />}
        {weeklyCollections.map(collection => <section key={collection.collectionId} aria-label="Weekly Worksheet Collection" className="min-w-0 md:col-span-2 lg:col-span-3">
          <Card className="p-4 min-w-0" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            <Badge color="var(--banner-accent)" bg="var(--card2)">Local draft · Not saved to EduScribe</Badge>
            <h3 className="text-lg font-semibold mt-3" style={{ color: 'var(--text)' }}>{collection.title}</h3>
            {(collection.sourceWeek || !collection.sourceLessonPlan.title.endsWith(' Lesson Plan')) &&
              <p className="text-xs mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>
                {collection.sourceWeek || collection.sourceLessonPlan.title}
              </p>}
            <Btn onClick={() => setOpenWeeklyCollectionId(previous => previous === collection.collectionId ? null : collection.collectionId)}
              aria-expanded={openWeeklyCollectionId === collection.collectionId}>
              {openWeeklyCollectionId === collection.collectionId ? 'Hide daily worksheets' : 'Open weekly collection'}
            </Btn>
            <Btn variant="danger" onClick={() => setConfirmWeeklyDeleteId(collection.collectionId)}>Delete collection</Btn>
            {openWeeklyCollectionId === collection.collectionId && <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
              {collection.worksheets.map(draft => <section key={draft.draftId} aria-label={`${draft.day} Worksheet`} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--banner-accent)' }}>{draft.day}</p>
                <h4 className="font-semibold break-words" style={{ color: 'var(--text)' }}>{draft.title}</h4>
                <p className="text-xs my-2" style={{ color: 'var(--text-muted)' }}>{draft.questions.length} questions · {draft.saved
                  ? hasUnsavedGeneratedChanges(draft) ? 'Unsaved changes to local draft' : 'Saved locally for testing'
                  : 'Local draft'}</p>
                {draft.typeDistribution && <details className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                  <summary className="cursor-pointer">Question mix</summary>
                  <p>{Object.entries(draft.typeDistribution || {}).filter(([, count]) => count)
                    .map(([type, count]) => `${type.replaceAll('_', ' ')} ${count}`).join(' · ')}</p>
                  {draft.distributionNote && <p>{draft.distributionNote}</p>}
                </details>}
                <div className="flex flex-wrap gap-2">
                  <Btn onClick={() => { setActiveWeeklyCollectionId(collection.collectionId); setActiveDailyDraftId(draft.draftId); setShowGeneratedEditor(true); }}>Edit/Preview {draft.day}</Btn>
                  <Btn variant="outline" onClick={() => onWeeklyCollectionChange(collection.collectionId, current =>
                    updateWeeklyWorksheet(current, shuffleWeeklyWorksheet(draft)))}>Shuffle Questions</Btn>
                </div>
              </section>)}
            </div>}
          </Card>
        </section>)}
        {confirmWeeklyDeleteId && <ConfirmDialog title="Delete weekly collection" confirmLabel="Delete collection"
          message="Delete these five local worksheet drafts from this browser session? This cannot be undone."
          onCancel={() => setConfirmWeeklyDeleteId(null)} onConfirm={() => {
            onDiscardWeeklyCollection(confirmWeeklyDeleteId); setConfirmWeeklyDeleteId(null);
            if (openWeeklyCollectionId === confirmWeeklyDeleteId) setOpenWeeklyCollectionId(null);
          }} />}
        {generatedDraft && <section aria-label="Generated Worksheet draft entry" className="min-w-0">
          {!import.meta.env.DEV && <p role="status" className="text-sm">{permanentSaveUnavailable}</p>}
          <Card className="p-4 min-w-0 flex flex-col h-full" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--card2)' }}>
                <FileText size={20} style={{ color: 'var(--banner-accent)' }} aria-hidden="true" />
              </div>
              <Badge color="var(--banner-accent)" bg="var(--card2)">{simulatedSections.length
                ? 'Distribution Simulated Locally' : generatedDraft.saved ? 'Saved locally for testing' : 'Not Saved'}</Badge>
            </div>
            <h3 className="text-sm font-semibold mb-1 break-words" style={{ color: 'var(--text)' }}>{generatedDraft.title}</h3>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{generatedDraft.generationLabel || 'Local development sample — not live AI.'} Local only · Lost on refresh</p>
            <p className="text-xs mb-1 break-words" style={{ color: 'var(--text-muted)' }}>Source Lesson Plan: {generatedDraft.sourceLessonPlan.title}</p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Subject: {generatedDraft.subjectName || eligibleSubjects.find(item => item.id === generatedDraft.subjectId)?.name || 'Unknown'} · Grade: {generatedDraft.gradeLevel || 'Unknown'} · Academic Year: {generatedDraft.schoolYear || 'Unknown'}</p>
            <div className="flex flex-wrap gap-2 mt-auto">
              <button ref={generatedEntryButtonRef} type="button" onClick={() => setShowGeneratedEditor(true)}
                className="min-h-10 px-3 rounded-lg text-sm font-semibold"
                style={{ color: '#fff', backgroundColor: 'var(--banner-accent)' }}>{generatedDraft.saved ? 'View/Edit worksheet' : 'View/Edit draft'}</button>
              <Btn variant="danger" onClick={() => setConfirmDraftDelete(true)}>Delete Draft</Btn>
              {canSimulateDistribution && <Btn variant="outline" onClick={() => setShowLocalDistribution(true)}>
                Distribute Worksheet <span className="sr-only">(local simulation)</span>
              </Btn>}
            </div>
            {simulatedSections.length > 0 && <p role="status" className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              Simulated locally for {simulatedSections.map(row => row.sectionName).join(', ')}. No students were notified. Lost on refresh.
            </p>}
          </Card>
        </section>}
        {showLocalDistribution && canSimulateDistribution && LocalDistributionModal && <Suspense fallback={<p role="status">Loading local simulation…</p>}>
          <LocalDistributionModal draft={generatedDraft} fixture={syntheticDistributionFixture} teacherId={userData?.uid}
            previous={simulatedSections} onClose={() => setShowLocalDistribution(false)}
            onConfirm={result => {
              onLocalDistribution?.(result);
              setShowLocalDistribution(false);
              showToast('Distribution simulated locally. No students were notified.');
            }} />
        </Suspense>}
        {confirmDraftDelete && generatedDraft && <ConfirmDialog title="Delete worksheet draft" confirmLabel="Delete draft"
          message={`Delete the local draft “${generatedDraft.title}” from this browser session? This cannot be undone.`}
          onCancel={() => setConfirmDraftDelete(false)} onConfirm={() => {
            setConfirmDraftDelete(false); onDiscardGeneratedDraft();
            requestAnimationFrame(() => worksheetsHeadingRef.current?.focus({ preventScroll: true }));
          }} />}
        {loading ? (
          <div role="status" className="col-span-full flex items-center gap-2 py-8" style={{ color: 'var(--text-muted)' }}><Loader2 className="animate-spin" aria-hidden="true" /> Loading worksheets…</div>
        ) : listError ? (
          <Card className="col-span-full p-5" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
              <p style={{ color: 'var(--text)' }}>{listError}</p>
              <Btn onClick={() => fetchWorksheets()}>Retry worksheets</Btn>
            </div>
          </Card>
        ) : filtered.map((ws) => {
          const distributedCount = assessment.assigneeCounts[ws.id] || 0;
          return (
          <Card key={ws.id} className="p-4 min-w-0 flex flex-col" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'var(--card2)' }}>
                <FileText size={20} style={{ color: 'var(--banner-accent)' }} aria-hidden="true" />
              </div>
              {/* `ws.status` is a dead column — nothing writes it anymore.
                  The badge is derived from real assignee rows instead. Both
                  a failed read AND the window before the first read settles
                  must render as their own neutral state — neither may fall
                  through to "Not distributed", which is a positive claim of
                  0 that is not yet (or no longer) known to be true. */}
              {assessment.assigneeCountsLoading ? (
                <Badge color={dark ? '#94a3b8' : '#64748b'} bg={dark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.12)'}>
                  Checking…
                </Badge>
              ) : assessment.assigneeCountsError ? (
                <span className="flex items-center gap-2">
                  <Badge color="#dc2626" bg="rgba(220,38,38,0.12)">Status unknown</Badge>
                  <button onClick={() => assessment.fetchAssigneeCounts()}
                    className="text-[11px] underline font-semibold" style={{ color: '#dc2626' }}>
                    Retry
                  </button>
                </span>
              ) : (
                <Badge color={distributedCount > 0 ? '#16a34a' : '#d97706'}
                  bg={distributedCount > 0 ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)'}>
                  {distributedCount > 0 ? `Distributed · ${distributedCount}` : 'Not distributed'}
                </Badge>
              )}
            </div>
            <h3 className="text-sm font-semibold mb-1 break-words" style={{ color: 'var(--text)' }}>{ws.title}</h3>
            <p className="text-xs mb-3 break-words" style={{ color: 'var(--text-muted)' }}>{ws.subject || 'Subject unavailable'} · {ws.pages || '—'} pages · {ws.items || '—'} items</p>
            <div className="flex gap-2 mt-auto">
              <button onClick={() => handlePreview(ws)} className="flex-1 min-w-0 h-10 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: 'var(--banner-accent)', color: '#ffffff' }}>
                {ws.file_url ? 'View' : 'Preview'}
              </button>
              <WorksheetActions worksheet={ws} busy={deletingId === ws.id}
                onDistribute={() => showToast('Distribution is unavailable until trusted authorization is connected. No students were assigned.', 'error')}
                onQuestions={() => setBuildingWorksheet(ws)} onCheck={() => setCheckingWorksheet(ws)}
                onEncode={() => { setScoreSavedMessage(''); setEncodingWorksheet(ws); }} onDownload={() => downloadWorksheet(ws)}
                onDelete={() => handleDelete(ws.id)} />
            </div>
            {deletingId === ws.id && <p role="status" className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Deleting worksheet…</p>}
            {assessment.postingsError ? (
              <p className="text-[11px] mt-2 flex items-center gap-2" style={{ color: '#dc2626' }}>
                Posting status could not be loaded.
                <button onClick={() => assessment.fetchPostings()} className="underline font-semibold" style={{ color: '#dc2626' }}>
                  Retry
                </button>
              </p>
            ) : assessment.postings.filter(p => p.worksheet_id === ws.id).length > 0 && (
              <p className="text-[11px] mt-2" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                Posted to {assessment.postings.filter(p => p.worksheet_id === ws.id).length} section(s)
              </p>
            )}
          </Card>
          );
        })}
        {!loading && !listError && filtered.length === 0 && (
          <Card className="col-span-full text-center p-8" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
            <p style={{ color: 'var(--text-muted)' }}>{worksheets.length ? 'No worksheets match your search or subject filter.' : 'No worksheets yet. Create one to get started.'}</p>
          </Card>
        )}
      </div>

      {showAddModal && (
        <Modal title="Create Worksheet" onClose={requestCreateClose}>
          <form onSubmit={handleAddWorksheet} className="flex flex-col gap-4">
            {createBusyNotice && <p role="status" className="text-sm">{createBusyNotice}</p>}
            <Input placeholder="Title" aria-label="Worksheet title" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
            <div>
              <label htmlFor="teacher-worksheet-type" className="text-xs font-semibold" style={{ color: dark ? '#94a3b8' : '#64748b' }}>Type</label>
              <select id="teacher-worksheet-type" value={formData.task_type}
                onChange={e => setFormData({ ...formData, task_type: e.target.value })}
                className="w-full h-10 px-3 rounded-lg text-sm outline-none mt-1"
                style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc',
                         border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
                         color: dark ? '#f1f5f9' : '#1a2b4a' }}>
                {TASK_TYPES.map(t => <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            {subjectFields('worksheet-create')}
            <Input placeholder="Pages" aria-label="Pages" value={formData.pages} onChange={e => setFormData({...formData, pages: e.target.value})} />
            <Input placeholder="Items" aria-label="Items" value={formData.items} onChange={e => setFormData({...formData, items: e.target.value})} />
            <button type="submit" disabled={saving || !subjectReady} className="w-full h-10 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2"
              style={{ backgroundColor: '#1e3a5f' }}>
              {saving && <Loader2 size={16} className="animate-spin" />} Create Worksheet
            </button>
          </form>
        </Modal>
      )}


      {showPreviewModal && previewingWorksheet && (
        <Modal title={`Preview: ${previewingWorksheet.title}`} onClose={() => setShowPreviewModal(false)} dismissible>
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs uppercase mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>File Information</p>
              <div className="grid grid-cols-2 gap-3" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>File Name</p>
                  <p className="text-sm font-medium" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{previewingWorksheet.file_name || previewingWorksheet.title}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Subject</p>
                  <p className="text-sm" style={{ color: dark ? '#cbd5e1' : '#475569' }}>{previewingWorksheet.subject}</p>
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Status</p>
                  {assessment.assigneeCountsLoading ? (
                    <Badge color={dark ? '#94a3b8' : '#64748b'} bg={dark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.12)'}>
                      Checking…
                    </Badge>
                  ) : assessment.assigneeCountsError ? (
                    <Badge color="#dc2626" bg="rgba(220,38,38,0.12)">Status unknown</Badge>
                  ) : (() => {
                    const count = assessment.assigneeCounts[previewingWorksheet.id] || 0;
                    return (
                      <Badge color={count > 0 ? '#16a34a' : '#d97706'}
                        bg={count > 0 ? 'rgba(22,163,74,0.12)' : 'rgba(217,119,6,0.12)'}>
                        {count > 0 ? `Distributed · ${count}` : 'Not distributed'}
                      </Badge>
                    );
                  })()}
                </div>
                <div>
                  <p className="text-xs uppercase mb-1" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Created</p>
                  <p className="text-sm" style={{ color: dark ? '#cbd5e1' : '#475569' }}>{new Date(previewingWorksheet.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
            {previewingWorksheet.file_url ? (
              <div className="h-48 rounded-lg flex items-center justify-center" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `2px solid ${dark ? '#334155' : '#cbd5e1'}` }}>
                <div className="text-center">
                  <FileText size={48} style={{ color: '#3b82f6' }} className="mx-auto mb-2" />
                  <p style={{ color: dark ? '#cbd5e1' : '#475569' }}>File link available</p>
                  <p className="text-xs mt-2" style={{ color: dark ? '#64748b' : '#94a3b8' }}>Open the file in a new tab to check access.</p>
                </div>
              </div>
            ) : (
              <div className="h-48 rounded-lg flex items-center justify-center" style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `2px dashed ${dark ? '#334155' : '#cbd5e1'}` }}>
                <div className="text-center">
                  <FileText size={48} style={{ color: '#64748b' }} className="mx-auto mb-2" />
                  <p style={{ color: dark ? '#64748b' : '#94a3b8' }}>No file attached</p>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              {previewingWorksheet.file_url && (
                <button onClick={() => downloadWorksheet(previewingWorksheet)} className="flex-1 h-10 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#3b82f6' }}>
                  <ExternalLink size={16} /> Open File
                </button>
              )}
              <button onClick={() => setShowPreviewModal(false)} className="flex-1 h-10 rounded-lg text-white text-sm font-semibold"
                style={{ backgroundColor: '#1e3a5f' }}>Close</button>
            </div>
          </div>
        </Modal>
      )}

      {distributingTask && (
        <DistributeModal
          task={distributingTask}
          sections={assessment.mySections}
          sectionsError={assessment.sectionsError}
          onRetrySections={assessment.fetchMySections}
          loadClassList={assessment.loadClassList}
          loadAssignees={assessment.loadAssignees}
          loadSubmissions={assessment.loadSubmissions}
          distributeTask={assessment.distributeTask}
          onClose={() => setDistributingTask(null)}
          showToast={showToast}
        />
      )}

      {buildingWorksheet && (
        <QuestionBuilderModal
          worksheet={buildingWorksheet}
          loadItems={assessment.loadItems}
          saveItems={assessment.saveItems}
          setCheckingMode={assessment.setCheckingMode}
          onClose={() => { setBuildingWorksheet(null); fetchWorksheets(true); }}
        />
      )}

      {checkingWorksheet && (
        <CheckSubmissionsModal
          worksheet={checkingWorksheet}
          loadItems={assessment.loadItems}
          loadSubmissions={assessment.loadSubmissions}
          loadAnswers={assessment.loadAnswers}
          releaseScore={assessment.releaseScore}
          onClose={() => setCheckingWorksheet(null)}
        />
      )}

      {encodingWorksheet && (
        <EncodeScoresModal
          worksheet={encodingWorksheet}
          postings={assessment.postings}
          sections={assessment.mySections}
          loadClassList={assessment.loadClassList}
          loadSubmissions={assessment.loadSubmissions}
          encodeManualScore={assessment.encodeManualScore}
          onSaved={setScoreSavedMessage}
          onClose={() => setEncodingWorksheet(null)}
        />
      )}
    </div>
  );
};

export default WorksheetsTab;
