// ============================================
// FILE: src/pages/dashboards/teacher/worksheets/QuestionBuilderModal.jsx
// Builds a worksheet's questions and answer key, and carries the per-worksheet
// auto-check toggle. Manual is the default: an auto-checker that marks a wrong
// answer correct looks right on review and slips through.
// ============================================

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { Modal, Btn, Input, ConfirmDialog } from '../shared/ui';
import { useTheme } from '../hooks';
import useDialogSafety from './useDialogSafety';
import { ITEM_TYPES, TRUE_FALSE_VALUES, splitAcceptedAnswers } from '../../../../lib/worksheetChecking';
import { editableDraftItems, hasUnsavedGeneratedChanges, orderedWorksheetItems, saveGeneratedWorksheetLocally, updateGeneratedDraft, validateGeneratedWorksheet, worksheetSections } from './generatedDraftModel';
import WorksheetDraftDocument from './WorksheetDraftDocument';
import { ESSAY_MAX_SENTENCES, ESSAY_MAX_WORDS, parseEssayMinimum } from '../../../../lib/essayRule';

const sameValues = (a, b) => Array.isArray(a) && Array.isArray(b)
  ? a.length === b.length && a.every((value, index) => value === b[index])
  : a === b;

const sameItems = (a, b) => a.length === b.length && a.every((item, index) => {
  const saved = b[index];
  return item.uid === saved.uid && item.question === saved.question
    && item.item_type === saved.item_type && item.points === saved.points
    && sameValues(item.options, saved.options)
    && sameValues(item.correct_answer, saved.correct_answer)
    && String(item.essay_min_sentences ?? '') === String(saved.essay_min_sentences ?? '')
    && String(item.essay_min_words ?? '') === String(saved.essay_min_words ?? '');
});

const AUTO_ESSAY_NOTE = 'Objective items are scored automatically. Essay answers get a provisional mark; scores are released after you confirm.';

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

const QuestionBuilderModal = ({ worksheet, loadItems, saveItems, setCheckingMode, onClose, draft, onDraftChange, onDiscardDraft, onLocalSave, onDurableSave, manualEligibility, allowDiscard = true }) => {
  const { dark } = useTheme();
  const draftMode = Boolean(draft);
  const manualMode = draft?.sourceType === 'manual-authored';
  const initialDraft = React.useRef(draft);
  const [items, setItems] = useState(() => draftMode
    ? orderedWorksheetItems(editableDraftItems(draft), worksheetSections(draft)) : []);
  const [sections, setSections] = useState(() => draftMode ? worksheetSections(draft) : []);
  const [savedItems, setSavedItems] = useState([]);
  const [mode, setMode] = useState(draftMode ? draft.checkingMode : worksheet.checking_mode || 'manual');
  const [title, setTitle] = useState(draft?.title || '');
  const [instructions, setInstructions] = useState(draft?.instructions || '');
  const [subjectId, setSubjectId] = useState(draft?.subjectId || '');
  const [gradeLevel, setGradeLevel] = useState(draft?.gradeLevel || '');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const headingRef = React.useRef(null);
  const [loading, setLoading] = useState(!draftMode);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [partialMessage, setPartialMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);
  const [localSaveError, setLocalSaveError] = useState('');
  const savingRef = React.useRef(false);
  const editorRef = React.useRef(null);
  const eligibleSubjects = manualEligibility?.subjects || [];
  const selectedSubject = manualMode && !manualEligibility?.loading && !manualEligibility?.error
    ? eligibleSubjects.find(subject => subject.id === subjectId) : null;
  const selectedGrade = selectedSubject?.grades.includes(gradeLevel) ? gradeLevel : '';
  const draftTeacherId = draft?.teacherId;
  const draftSchoolYear = draft?.schoolYear;
  const eligibilityTeacherId = manualEligibility?.teacherId;
  const eligibilitySchoolYear = manualEligibility?.schoolYear;
  const assignment = useMemo(() => manualMode ? {
    subjectId: selectedSubject?.id || '', subjectName: selectedSubject?.name || '', gradeLevel: selectedGrade,
    assignmentVerified: Boolean(selectedSubject && selectedGrade && eligibilityTeacherId === draftTeacherId
      && Boolean(eligibilitySchoolYear) && draftSchoolYear === eligibilitySchoolYear),
  } : undefined, [manualMode, selectedSubject, selectedGrade, eligibilityTeacherId, draftTeacherId, draftSchoolYear, eligibilitySchoolYear]);
  const currentDraft = draftMode ? updateGeneratedDraft(draft, { title, instructions, items, sections, checkingMode: mode, assignment }) : null;
  // Auto is allowed with essays: the server gives them provisional marks only.
  const autoWithEssay = !draftMode && mode === 'auto' && items.some(it => it.item_type === 'essay');
  const dirty = draftMode ? hasUnsavedGeneratedChanges(currentDraft)
    : mode !== (worksheet.checking_mode || 'manual') || !sameItems(items, savedItems);
  const [saveFailed, setSaveFailed] = useState(false);
  const { requestClose, routeBlocker, busyNotice } = useDialogSafety({
    dirty, pending: saving, onClose,
    discardMessage: saveFailed ? 'Your last save failed. Close anyway and lose these questions?' : undefined,
    leaveMessage: draftMode ? 'Leave Worksheets with unsaved worksheet changes?' : undefined,
  });

  useEffect(() => {
    if (draftMode) headingRef.current?.focus({ preventScroll: true });
  }, [draftMode]);

  const fieldStyle = {
    backgroundColor: 'var(--card2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
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
    if (draftMode) return;
    setLoading(true);
    setLoadFailed(false);
    const result = await loadItems(worksheet.id);
    if (!activeRef.current) return;
    setLoading(false);
    if (!result) { setLoadFailed(true); return; }
    const loadedItems = result.items.map(i => ({
      // Existing items already have a stable, server-assigned id — reuse it
      // as the React key so reordering doesn't jumble focus.
      uid: i.id,
      question: i.question,
      item_type: i.item_type,
      options: i.options || ['', '', '', ''],
      correct_answer: result.keys[i.id]?.correct_answer ?? '',
      points: i.points,
      essay_min_sentences: i.essay_min_sentences ?? '',
      essay_min_words: i.essay_min_words ?? '',
    }));
    setItems(loadedItems);
    setSavedItems(loadedItems);
  }, [draftMode, worksheet.id, loadItems]);

  useEffect(() => {
    activeRef.current = true;
    let cancelled = false;
    if (!draftMode) queueMicrotask(() => { if (!cancelled) attemptLoad(); });
    return () => { cancelled = true; activeRef.current = false; };
  }, [attemptLoad, draftMode]);

  useEffect(() => {
    if (!draftMode) return;
    onDraftChange(updateGeneratedDraft(initialDraft.current, { title, instructions, items, sections, checkingMode: mode, assignment }));
  }, [draftMode, onDraftChange, title, instructions, items, sections, mode, assignment]);

  const clearValidation = () => { setValidationErrors([]); setLocalSaveError(''); };

  const errorFor = field => validationErrors.find(error => error.field === field)?.message;

  const saveLocal = async () => {
    if (savingRef.current) return;
    const candidate = currentDraft;
    if (manualMode && !candidate.assignmentVerified) {
      setLocalSaveError('Choose an assigned subject and grade before saving.');
      return;
    }
    const errors = validateGeneratedWorksheet(candidate);
    if (errors.length) {
      setValidationErrors(errors);
      requestAnimationFrame(() => {
        const target = errors[0].field === 'items'
          ? [...(editorRef.current?.querySelectorAll('button') || [])].find(button => button.textContent.includes('Add question'))
          : editorRef.current?.querySelector(`[data-validation-field="${errors[0].field}"]`);
        target?.focus();
      });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setLocalSaveError('');
    try {
      await Promise.resolve();
      if (onDurableSave) await onDurableSave(candidate);
      else {
        const saved = saveGeneratedWorksheetLocally(candidate, manualEligibility?.schoolYear);
        onLocalSave(saved);
      }
    } catch (error) {
      setLocalSaveError(error?.message || 'This local worksheet could not be saved. Your edits are still here.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const patch = (index, changes) => {
    clearValidation();
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, ...changes } : it)));
  };

  const patchOptions = (index, optionIndex, value) => {
    clearValidation();
    setItems(prev => prev.map((it, i) => {
    if (i !== index) return it;
    const options = it.options.map((o, oi) => (oi === optionIndex ? value : o));
    // If the key pointed at the option that just changed, it no longer
    // matches anything in the list — clear it rather than silently keeping
    // an answer key that can never be satisfied.
    const keyStillValid = options.includes(it.correct_answer);
    return { ...it, options, correct_answer: keyStillValid ? it.correct_answer : '' };
    }));
  };

  const move = (index, delta) => {
    clearValidation();
    setItems(prev => {
    const next = [...prev];
    const target = index + delta;
    if (target < 0 || target >= next.length || (draftMode && next[index].sectionId !== next[target].sectionId)) return prev;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
    });
  };

  const moveSection = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
    setItems(previous => orderedWorksheetItems(previous, next));
    clearValidation();
  };

  const submit = async () => {
    setLocalSaveError('');
    const reject = (message) => { setLocalSaveError(message); return false; };
    for (const [i, it] of items.entries()) {
      if (!it.question.trim()) return reject(`Question ${i + 1} has no text.`);
      if (it.item_type !== 'essay' && !String(it.correct_answer).trim().length) {
        return reject(`Question ${i + 1} has no answer key.`);
      }
      // The <select> keeps a freshly-built key matched to an option, but a
      // stale value can still arrive here: an item loaded from before this
      // control existed, or a key edited directly in the database. The
      // select is a convenience, not the only thing standing between a
      // typo and a key nothing can ever match, so re-check on submit too.
      if (it.item_type === 'multiple_choice'
          && !it.options.filter(o => o.trim()).includes(it.correct_answer)) {
        return reject(`Question ${i + 1}'s answer key does not match any of its choices.`);
      }
      // A key of just "," (or any separators-only string) passes the
      // non-empty check above but splits to an empty accepted-answers list,
      // producing a real key row nothing can ever satisfy — the same
      // failure mode as a missing key row, just self-inflicted.
      if (['identification', 'enumeration'].includes(it.item_type)
          && splitAcceptedAnswers(it.correct_answer).length === 0) {
        return reject(`Question ${i + 1}'s answer key has no usable answers.`);
      }
      if (it.item_type === 'essay' && !parseEssayMinimum(it.essay_min_sentences, ESSAY_MAX_SENTENCES).ok) {
        return reject(`Question ${i + 1}: minimum sentences must be a whole number from 1 to ${ESSAY_MAX_SENTENCES}, or empty.`);
      }
      if (it.item_type === 'essay' && !parseEssayMinimum(it.essay_min_words, ESSAY_MAX_WORDS).ok) {
        return reject(`Question ${i + 1}: minimum words must be a whole number from 1 to ${ESSAY_MAX_WORDS}, or empty.`);
      }
    }
    const retryModeOnly = Boolean(partialMessage) && sameItems(items, savedItems);
    setPartialMessage('');
    setSaving(true);
    const result = retryModeOnly ? { ok: true } : await saveItems(worksheet.id, items.map(it => ({
      ...it,
      // Identification and enumeration keys are stored as lists.
      correct_answer: ['identification', 'enumeration'].includes(it.item_type)
        ? splitAcceptedAnswers(it.correct_answer)
        : it.correct_answer,
      options: it.item_type === 'multiple_choice' ? it.options.filter(o => o.trim()) : null,
      // The essay rule; empty means none, and only essays carry one.
      essay_min_sentences: it.item_type === 'essay' ? parseEssayMinimum(it.essay_min_sentences, ESSAY_MAX_SENTENCES).value : null,
      essay_min_words: it.item_type === 'essay' ? parseEssayMinimum(it.essay_min_words, ESSAY_MAX_WORDS).value : null,
    })));
    // On failure the questions stay in this editor, so Save again sends them as they are.
    if (result?.ok !== true) {
      setLocalSaveError(result?.message || 'Your questions could not be saved. Keep this window open and press Save again.');
      setSaveFailed(true);
      setSaving(false);
      return;
    }
    setSaveFailed(false);
    if (!retryModeOnly) setSavedItems(items);
    const modeSaved = await setCheckingMode(worksheet.id, mode);
    if (!modeSaved) {
      setPartialMessage('Questions were saved, but the checking mode was not changed. Keep this dialog open and try Save questions again.');
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
  };

  const editorBody = <>
      {busyNotice && <p role="status" className="text-sm">{busyNotice}</p>}
      {partialMessage && <p role="alert" className="text-sm">{partialMessage}</p>}
      {localSaveError && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{localSaveError}</p>}
      {draftMode && <div className="mb-3 grid gap-2 text-sm" style={{ color: 'var(--text)' }}>
        <p role="status" className="font-semibold">{draft.collectionId ? `${draft.day} AI worksheet draft` : 'Development sample'} — <span>{draft.saved ? 'Saved locally for testing · Lost on refresh' : 'Not saved to EduScribe'}</span></p>
        {draft.generationLabel && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{draft.generationLabel}</p>}
        {!manualMode && <p className="break-words font-semibold">Source Lesson Plan: {draft.sourceLessonPlan.title}</p>}
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {manualMode ? 'Manual authoring' : draft.sourceType === 'manual' ? 'Manual ILAW V2' : 'AI Lesson Plan'} · Subject: {currentDraft.subjectName || 'Unknown'} · Grade: {currentDraft.gradeLevel || 'Unknown'}
        </p>
        {manualMode && (manualEligibility?.loading ? <p role="status">Loading your teaching load…</p>
          : manualEligibility?.error ? <p role="alert">Teaching load could not be loaded. <button type="button" onClick={manualEligibility.retry} className="underline">Retry</button></p>
            : eligibleSubjects.length === 0 ? <p role="status">No assigned subject for this school year. Ask your administrator to update your teaching load.</p>
              : <>
                <label htmlFor="manual-worksheet-subject">Teaching-load subject</label>
                <select id="manual-worksheet-subject" value={selectedSubject?.id || ''} onChange={event => { setSubjectId(event.target.value); setGradeLevel(''); clearValidation(); }} className="min-h-11 rounded-lg px-3" style={fieldStyle}>
                  <option value="">Choose a subject</option>
                  {eligibleSubjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
                <label htmlFor="manual-worksheet-grade">Assigned grade level</label>
                <select id="manual-worksheet-grade" value={selectedGrade} disabled={!selectedSubject} onChange={event => { setGradeLevel(event.target.value); clearValidation(); }} className="min-h-11 rounded-lg px-3" style={fieldStyle}>
                  <option value="">Choose a grade</option>
                  {selectedSubject?.grades.map(grade => <option key={grade} value={grade}>{grade}</option>)}
                </select>
              </>)}
        {!manualMode && !draft.assignmentVerified && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {draft.collectionId ? 'Saved plan metadata is for display only. Permanent Save and distribution require separate trusted authorization.'
            : 'Subject and grade are not verified for this local sample. EduScribe Save and distribution are unavailable.'}
        </p>}
        <label className="font-medium" htmlFor="generated-worksheet-title">Worksheet title</label>
        <Input id="generated-worksheet-title" data-validation-field="title" aria-invalid={Boolean(errorFor('title'))}
          aria-describedby={errorFor('title') ? 'generated-worksheet-title-error' : undefined}
          value={title} onChange={event => { clearValidation(); setTitle(event.target.value); }} />
        {errorFor('title') && <p id="generated-worksheet-title-error" role="alert" style={{ color: 'var(--red)' }}>{errorFor('title')}</p>}
        <label className="font-medium" htmlFor="generated-worksheet-directions">Directions / Instructions</label>
        <textarea id="generated-worksheet-directions" value={instructions} maxLength={2000} rows={4}
          aria-invalid={Boolean(errorFor('instructions'))} aria-describedby="generated-worksheet-directions-help"
          onChange={event => { clearValidation(); setInstructions(event.target.value); }}
          className="w-full rounded-lg px-3 py-2 text-sm" style={fieldStyle} />
        <p id="generated-worksheet-directions-help" className="text-xs" style={{ color: 'var(--text-muted)' }}>Optional. Up to 2,000 characters; line breaks appear in the student preview.</p>
        {errorFor('instructions') && <p role="alert" style={{ color: 'var(--red)' }}>{errorFor('instructions')}</p>}
      </div>}
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
          {draftMode && <div className="flex flex-wrap gap-2">
            <Btn variant={previewing ? 'outline' : 'primary'} onClick={() => setPreviewing(false)}>Edit questions and key</Btn>
            <Btn variant={previewing ? 'primary' : 'outline'} onClick={() => setPreviewing(true)}>Student preview</Btn>
          </div>}
          {draftMode && !manualMode && <div className="grid gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <details className="rounded-lg px-3 py-2" style={{ border: '1px solid var(--border)' }}>
              <summary className="cursor-pointer font-medium">Lesson context</summary>
              {draft.sourceContext ? <div className="mt-2 grid gap-1 whitespace-pre-wrap break-words">
                {draft.sourceContext.competency && <p><strong>Learning competency:</strong> {draft.sourceContext.competency}</p>}
                <p><strong>Objective:</strong> {draft.sourceContext.objective}</p>
                <p><strong>Activity:</strong> {draft.sourceContext.activity}</p>
                <p><strong>Assessment:</strong> {draft.sourceContext.assessment}</p>
              </div> : <p className="mt-2 whitespace-pre-wrap break-words">{draft.sourceLessonPlan.contentExcerpt || 'No instructional excerpt available.'}</p>}
            </details>
            <details className="rounded-lg px-3 py-2" style={{ border: '1px solid var(--border)' }}>
              <summary className="cursor-pointer font-medium">Source details</summary>
              <p className="mt-2 break-all">Source ID: {draft.sourceLessonPlan.id}</p>
              <p className="break-all">Recorded subject ID: {draft.subjectId || 'Unknown'}</p>
            </details>
          </div>}
          {previewing && draftMode ? <div role="region" aria-label="Student-facing worksheet preview" className="grid gap-3">
            <WorksheetDraftDocument draft={currentDraft} />
          </div> : <>
          <label className="flex items-center gap-2 text-sm" style={{ color: dark ? '#cbd5e1' : '#374151' }}>
            <input type="checkbox" checked={mode === 'auto'}
              onChange={e => { clearValidation(); setMode(e.target.checked ? 'auto' : 'manual'); }} />
            Auto-check this worksheet when reviewing
            <span className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
              (off = you score every item yourself)
            </span>
          </label>
          {autoWithEssay && <p role="note" className="text-xs" style={{ color: 'var(--text-muted)' }}>{AUTO_ESSAY_NOTE}</p>}
          {draft?.collectionId && errorFor('checkingMode') && <p role="alert" className="text-xs" style={{ color: 'var(--red)' }}>{errorFor('checkingMode')}</p>}

          {draftMode && <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Teacher editor · Answer key stays private</h3>}
           {draftMode && sections.map((section, sectionIndex) => <div key={section.id} className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
             <div className="flex flex-wrap items-center gap-2">
               <label htmlFor={`worksheet-section-${section.id}`} className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Section {sectionIndex + 1} name</label>
               <button type="button" onClick={() => moveSection(sectionIndex, -1)} disabled={sectionIndex === 0}
                 aria-label={`Move section ${sectionIndex + 1} up`} title="Move section up"><ChevronUp size={16} /></button>
               <button type="button" onClick={() => moveSection(sectionIndex, 1)} disabled={sectionIndex === sections.length - 1}
                 aria-label={`Move section ${sectionIndex + 1} down`} title="Move section down"><ChevronDown size={16} /></button>
               <button type="button" onClick={() => {
                 if (sections.length === 1) return;
                 const next = sections.filter(item => item.id !== section.id);
                 const destination = next[Math.min(sectionIndex, next.length - 1)].id;
                 setItems(previous => orderedWorksheetItems(previous.map(item =>
                   item.sectionId === section.id ? { ...item, sectionId: destination } : item), next));
                 setSections(next); clearValidation();
               }} disabled={sections.length === 1}
                 aria-label={`Delete section ${sectionIndex + 1} and move its questions to a neighboring section`}
                 title="Move questions to a neighboring section and remove"><Trash2 size={16} /></button>
             </div>
             <Input id={`worksheet-section-${section.id}`} data-validation-field={`section-${sectionIndex + 1}`}
               value={section.title} onChange={event => { setSections(previous => previous.map(item => item.id === section.id ? { ...item, title: event.target.value } : item)); clearValidation(); }} />
             <label htmlFor={`worksheet-section-directions-${section.id}`} className="block text-sm font-medium" style={{ color: 'var(--text)' }}>Directions for {section.title || `section ${sectionIndex + 1}`}</label>
             <textarea id={`worksheet-section-directions-${section.id}`} value={section.directions} maxLength={2000} rows={3}
               onChange={event => { setSections(previous => previous.map(item => item.id === section.id ? { ...item, directions: event.target.value } : item)); clearValidation(); }}
               className="w-full rounded-lg px-3 py-2 text-sm" style={fieldStyle} />
             {errorFor(`section-${sectionIndex + 1}`) && <p role="alert" className="text-xs" style={{ color: 'var(--red)' }}>{errorFor(`section-${sectionIndex + 1}`)}</p>}
             <button type="button" onClick={() => { setItems(previous => orderedWorksheetItems([...previous, { ...blankItem(), sectionId: section.id }], sections)); clearValidation(); }}
               className="min-h-10 px-3 rounded-lg text-sm font-semibold" style={{ color: 'var(--banner-accent)', border: '1px solid var(--border)' }}>
               <Plus size={14} className="inline" aria-hidden="true" /> Add question to section
             </button>
           </div>)}
           {(draftMode ? orderedWorksheetItems(items, sections) : items).map((it, index) => (
            <div key={it.uid} className="p-3 rounded-lg flex flex-col gap-2"
              style={{ border: `1px solid ${dark ? '#334155' : '#e2e8f0'}` }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold" style={{ color: dark ? '#94a3b8' : '#64748b' }}>#{index + 1}</span>
                <select aria-label={`Question ${index + 1} type`} data-validation-field={`question-${index + 1}-type`}
                  aria-invalid={Boolean(errorFor(`question-${index + 1}-type`))} value={it.item_type} onChange={e => patch(index, { item_type: e.target.value, correct_answer: '',
                    ...(e.target.value === 'essay' && draft?.collectionId && !it.essay ? { essay: { referenceAnswer: '', minWords: 20, maxWords: 100,
                      rubric: [{ criterion: '', points: Number(it.points) || 1 }] } } : {}) })}
                  className="h-8 min-w-0 px-2 rounded text-xs outline-none" style={fieldStyle}>
                  {ITEM_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
                <input type="number" min="0" step="0.5" aria-label={`Question ${index + 1} points`}
                  data-validation-field={`question-${index + 1}-points`} aria-invalid={Boolean(errorFor(`question-${index + 1}-points`))} value={it.points}
                  onChange={e => patch(index, { points: e.target.value })}
                  className="h-8 w-20 px-2 rounded text-xs outline-none" style={fieldStyle} />
                <span className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>points</span>
                 <div className="ml-auto flex gap-1">
                  <button onClick={() => move(index, -1)} aria-label={`Move question ${index + 1} up`} title="Move up"><ChevronUp size={14} aria-hidden="true" /></button>
                  <button onClick={() => move(index, 1)} aria-label={`Move question ${index + 1} down`} title="Move down"><ChevronDown size={14} aria-hidden="true" /></button>
                  <button onClick={() => { clearValidation(); setItems(prev => prev.filter((_, i) => i !== index)); }} aria-label={`Delete question ${index + 1}`} title="Delete">
                    <Trash2 size={14} className="text-red-500" aria-hidden="true" />
                  </button>
                </div>

               {draftMode && <select aria-label={`Question ${index + 1} section`} value={it.sectionId}
                 onChange={event => { setItems(previous => orderedWorksheetItems(previous.map(item => item.uid === it.uid ? { ...item, sectionId: event.target.value } : item), sections)); clearValidation(); }}
                 className="w-full min-h-10 px-3 rounded-lg text-sm" style={fieldStyle}>
                 {sections.map(section => <option key={section.id} value={section.id}>{section.title || 'Unnamed section'}</option>)}
               </select>}
              </div>

              {draftMode ? <textarea aria-label={`Question ${index + 1} text`} data-validation-field={`question-${index + 1}-text`}
                aria-invalid={Boolean(errorFor(`question-${index + 1}-text`))} value={it.question}
                onChange={e => patch(index, { question: e.target.value })}
                className="w-full min-h-[72px] resize-y rounded-lg px-3 py-2 text-sm" style={fieldStyle} />
                : <Input placeholder="Question" aria-label={`Question ${index + 1} text`} value={it.question}
                  onChange={e => patch(index, { question: e.target.value })} />}

              {it.item_type === 'multiple_choice' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {it.options.map((opt, oi) => (
                    <Input key={oi} placeholder={`Choice ${oi + 1}`} aria-label={`Question ${index + 1} choice ${oi + 1}`}
                      data-validation-field={oi === 0 ? `question-${index + 1}-choices` : undefined}
                      aria-invalid={Boolean(errorFor(`question-${index + 1}-choices`))} value={opt}
                      onChange={e => patchOptions(index, oi, e.target.value)} />
                  ))}
                </div>
              )}

              {it.item_type === 'multiple_choice' && (
                // A select over the item's own options, not free text: a
                // typed key that doesn't exactly match an option can never
                // be satisfied by any student, and would fail silently.
                <select aria-label={`Question ${index + 1} correct choice`} data-validation-field={`question-${index + 1}-answer`}
                  aria-invalid={Boolean(errorFor(`question-${index + 1}-answer`))} value={it.correct_answer} onChange={e => patch(index, { correct_answer: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg text-sm outline-none" style={fieldStyle}>
                  <option value="">Select the correct choice…</option>
                  {it.options.filter(o => o.trim()).map((opt, oi) => (
                    <option key={oi} value={opt}>{opt}</option>
                  ))}
                </select>
              )}

              {it.item_type === 'true_false' && (
                <select aria-label={`Question ${index + 1} correct answer`} data-validation-field={`question-${index + 1}-answer`}
                  aria-invalid={Boolean(errorFor(`question-${index + 1}-answer`))} value={it.correct_answer} onChange={e => patch(index, { correct_answer: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg text-sm outline-none" style={fieldStyle}>
                  <option value="">Select the correct answer…</option>
                  {TRUE_FALSE_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              )}

              {(it.item_type === 'identification' || it.item_type === 'enumeration') && (
                <Input
                  aria-label={`Question ${index + 1} accepted answers`}
                  data-validation-field={`question-${index + 1}-answer`}
                  aria-invalid={Boolean(errorFor(`question-${index + 1}-answer`))}
                  placeholder={
                    it.item_type === 'identification' ? 'Accepted answers, comma separated'
                      : 'Expected answers, comma separated'
                  }
                  value={it.correct_answer}
                  onChange={e => patch(index, { correct_answer: e.target.value })}
                />
              )}
              {draft?.collectionId && it.item_type === 'enumeration' && <div className="grid gap-2 text-xs">
                <label>Alternative complete answer lists, separated by semicolons
                  <Input aria-label={`Question ${index + 1} enumeration alternatives`}
                    value={(it.enumeration?.alternatives || []).join('; ')}
                    onChange={event => patch(index, { enumeration: { orderSensitive: it.enumeration?.orderSensitive || false,
                      alternatives: event.target.value.split(';').map(value => value.trim()).filter(Boolean) } })} />
                </label>
                <label className="flex items-center gap-2"><input type="checkbox"
                  aria-label={`Question ${index + 1} order sensitive`} checked={it.enumeration?.orderSensitive || false}
                  onChange={event => patch(index, { enumeration: { alternatives: it.enumeration?.alternatives || [],
                    orderSensitive: event.target.checked } })} /> Order matters</label>
                {(it.enumeration?.orderSensitive || it.enumeration?.alternatives?.length) &&
                  <p>These settings require manual checking; automatic enumeration scoring does not use them.</p>}
              </div>}

              {it.item_type === 'essay' && (
                <>
                  {draftMode ? <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>You will score this one by hand when checking.</p>
                    : <div className="grid gap-1">
                      <div className="flex flex-wrap gap-3">
                        <label className="text-xs" style={{ color: 'var(--text)' }}>Minimum sentences
                          <input type="number" min="1" max={ESSAY_MAX_SENTENCES} step="1" inputMode="numeric"
                            aria-label={`Question ${index + 1} minimum sentences`} value={it.essay_min_sentences ?? ''}
                            onChange={event => patch(index, { essay_min_sentences: event.target.value })}
                            className="ml-1 w-20 h-9 px-2 rounded" style={fieldStyle} /></label>
                        <label className="text-xs" style={{ color: 'var(--text)' }}>Minimum words
                          <input type="number" min="1" max={ESSAY_MAX_WORDS} step="1" inputMode="numeric"
                            aria-label={`Question ${index + 1} minimum words`} value={it.essay_min_words ?? ''}
                            onChange={event => patch(index, { essay_min_words: event.target.value })}
                            className="ml-1 w-24 h-9 px-2 rounded" style={fieldStyle} /></label>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>If the answer meets this, it gets full points as a PROVISIONAL mark. You still confirm it before the score is released.</p>
                    </div>}
                  {draft?.collectionId && it.essay && <div className="grid gap-2" aria-label={`Question ${index + 1} essay configuration`}>
                    <textarea aria-label={`Question ${index + 1} reference answer`} value={it.essay.referenceAnswer}
                      onChange={event => patch(index, { essay: { ...it.essay, referenceAnswer: event.target.value } })}
                      className="w-full min-h-[72px] rounded-lg px-3 py-2 text-sm" style={fieldStyle} />
                    <div className="flex flex-wrap gap-2">
                      <label className="text-xs">Minimum words <input type="number" min="1" max="3000" value={it.essay.minWords}
                        onChange={event => patch(index, { essay: { ...it.essay, minWords: Number(event.target.value) } })}
                        className="ml-1 w-20 h-9 px-2 rounded" style={fieldStyle} /></label>
                      <label className="text-xs">Maximum words <input type="number" min="1" max="3000" value={it.essay.maxWords}
                        onChange={event => patch(index, { essay: { ...it.essay, maxWords: Number(event.target.value) } })}
                        className="ml-1 w-20 h-9 px-2 rounded" style={fieldStyle} /></label>
                    </div>
                    {it.essay.rubric.map((part, rubricIndex) => <div key={rubricIndex} className="flex flex-wrap gap-2">
                      <Input aria-label={`Question ${index + 1} rubric criterion ${rubricIndex + 1}`} value={part.criterion}
                        onChange={event => patch(index, { essay: { ...it.essay, rubric: it.essay.rubric.map((row, rowIndex) =>
                          rowIndex === rubricIndex ? { ...row, criterion: event.target.value } : row) } })} />
                      <input type="number" min="0.5" step="0.5" aria-label={`Question ${index + 1} rubric points ${rubricIndex + 1}`}
                        value={part.points} onChange={event => patch(index, { essay: { ...it.essay, rubric: it.essay.rubric.map((row, rowIndex) =>
                          rowIndex === rubricIndex ? { ...row, points: Number(event.target.value) } : row) } })}
                        className="w-20 h-10 px-2 rounded" style={fieldStyle} />
                      <button type="button" aria-label={`Remove rubric criterion ${rubricIndex + 1}`} disabled={it.essay.rubric.length === 1}
                        onClick={() => patch(index, { essay: { ...it.essay, rubric: it.essay.rubric.filter((_, rowIndex) => rowIndex !== rubricIndex) } })}>
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>)}
                    <Btn variant="outline" onClick={() => patch(index, { essay: { ...it.essay, rubric: [...it.essay.rubric, { criterion: '', points: 1 }] } })}>Add rubric criterion</Btn>
                    {errorFor(`question-${index + 1}-essay`) && <p role="alert" className="text-xs" style={{ color: 'var(--red)' }}>{errorFor(`question-${index + 1}-essay`)}</p>}
                  </div>}
                </>
              )}
              {draftMode && ['text', 'type', 'points', 'choices', 'answer'].map(field => {
                const message = errorFor(`question-${index + 1}-${field}`);
                return message && <p key={field} role="alert" className="text-xs" style={{ color: 'var(--red)' }}>{message}</p>;
              })}
            </div>
          ))}

           {draftMode && <Btn variant="outline" onClick={() => {
             setSections(previous => [...previous, { id: globalThis.crypto.randomUUID(), title: `Section ${previous.length + 1}`, directions: '' }]); clearValidation();
           }} className="self-start"><Plus size={14} /> Add question section</Btn>}
           <Btn onClick={() => { clearValidation(); setItems(prev => [...prev, { ...blankItem(), ...(draftMode ? { sectionId: sections.at(-1).id } : {}) }]); }} className="self-start">
            <Plus size={14} /> Add question
          </Btn>
          {draftMode && errorFor('items') && <p role="alert" className="text-xs" style={{ color: 'var(--red)' }}>{errorFor('items')}</p>}
          </>}

          <div className={draftMode ? 'sticky bottom-0 z-10 flex flex-wrap justify-end gap-2 border-t py-3' : 'flex justify-end gap-2'}
            style={draftMode ? { backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' } : undefined}>
            <Btn variant="outline" onClick={draftMode && !manualMode && !draft.saved ? onClose : requestClose}>{draftMode ? 'Back to Worksheets' : 'Cancel'}</Btn>
            {draftMode && (import.meta.env.DEV || onDurableSave) && <Btn variant="primary" onClick={saveLocal} busy={saving} disabled={saving}>
              {saving ? onDurableSave ? 'Saving to EduScribe…' : 'Saving locally…'
                : onDurableSave ? 'Save private Worksheet' : draft.collectionId ? 'Save Local Draft' : 'Save Worksheet'}
            </Btn>}
            {!draftMode && <Btn variant="primary" onClick={submit} busy={saving}>
              {saving ? 'Saving…' : 'Save questions'}
            </Btn>}
          </div>
        </div>
      )}
  </>;

  if (!draftMode) return <>{routeBlocker}<Modal title={`Questions — ${worksheet.title}`} onClose={requestClose} size="max-w-2xl">{editorBody}</Modal></>;

  return <>{routeBlocker}<section ref={editorRef} aria-label={manualMode ? 'Manual Worksheet editor' : 'Generated Worksheet editor'} className="mx-auto max-w-6xl min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={draftMode && !manualMode && !draft.saved ? onClose : requestClose} className="min-h-11 px-3 rounded-lg text-sm font-semibold"
        style={{ color: 'var(--banner-accent)', border: '1px solid var(--border)' }}>Back to Worksheets</button>
    </div>
    <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Worksheet Editor</h1>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
      <div className="min-w-0 rounded-xl border p-4 sm:p-6" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>{editorBody}</div>
      <aside className="min-w-0 space-y-3" aria-label="Worksheet document and key">
        {!previewing && <WorksheetDraftDocument draft={currentDraft} />}
        <button type="button" onClick={() => setShowAnswerKey(value => !value)} aria-expanded={showAnswerKey}
          aria-controls="worksheet-editor-answer-key" className="min-h-11 px-3 rounded-lg text-sm font-semibold"
          style={{ color: 'var(--text)', border: '1px solid var(--border)' }}>
          {showAnswerKey ? 'Hide teacher answer key' : 'Teacher answer key'}
        </button>
        {showAnswerKey && <div id="worksheet-editor-answer-key"><WorksheetDraftDocument
          draft={currentDraft} audience="teacher" /></div>}
      </aside>
    </div>
    {allowDiscard && <button type="button" onClick={() => setConfirmDiscard(true)} className="min-h-11 px-3 rounded-lg text-sm font-semibold"
      style={{ color: 'var(--badge-red-fg)', border: '1px solid var(--border)' }}>Delete Draft</button>}
    {confirmDiscard && <ConfirmDialog title="Delete worksheet draft" confirmLabel="Delete draft"
      message="Delete this local worksheet draft from this browser session? This cannot be undone."
      onCancel={() => setConfirmDiscard(false)} onConfirm={() => { setConfirmDiscard(false); onDiscardDraft?.(); }} />}
  </section></>;
};

export default QuestionBuilderModal;
