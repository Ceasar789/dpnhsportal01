import { useEffect, useRef, useState } from 'react';
import { Eye, Pencil, Printer } from 'lucide-react';
import IlawTemplate from './IlawTemplate';
import { createBlankIlawDocument } from './ilawTemplateModel';
import { parseManualIlawDraft, serializeManualIlawDraft, validateManualIlawDocument } from './fullManualIlawModel';
import { suggestLessonPlanFilename } from '../lessonPlanFilename';
import { downloadManualIlawPdf } from './downloadManualIlawPdf';
import { ConfirmDialog } from '../shared/ui';
import './FullManualIlawEditor.css';

// The active dashboard uses the same editor without synthetic plan or assignment fixtures.
export default function FullManualIlawEditor({ fixtures, mode = 'preview', onDirtyChange,
  quickCreateDraft, onQuickCreateDraftChange, manualDraft, onManualDraftChange, onFocusHeading, baselineDraft, validationErrors = {} }) {
  const activeMode = mode === 'active';
  const temporaryDraft = manualDraft ?? quickCreateDraft;
  const updateTemporaryDraft = onManualDraftChange ?? onQuickCreateDraftChange;
  const availableFixtures = activeMode ? [{ assignment: temporaryDraft?.assignment ?? { subjectId: '', subjectName: '', gradeLevel: '' } }] : fixtures;
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState(() => availableFixtures.map(fixture => createBlankIlawDocument({
    subject: fixture.assignment.subjectName, grade: fixture.assignment.gradeLevel,
  })));
  const [snapshots, setSnapshots] = useState(() => availableFixtures.map(() => null));
  const [preview, setPreview] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfFilename, setPdfFilename] = useState(null);
  const [pendingFixture, setPendingFixture] = useState(null);
  const [importText, setImportText] = useState('');
  const headingRef = useRef(null);
  const sectionRef = useRef(null);
  const fixture = availableFixtures[index];
  const draft = temporaryDraft?.document ?? drafts[index];
  const baseline = snapshots[index];
  const dirty = baselineDraft ? JSON.stringify({ document: draft, sourceDetails: temporaryDraft?.sourceDetails }) !==
    JSON.stringify({ document: baselineDraft.document, sourceDetails: baselineDraft.sourceDetails })
    : baseline === null ? JSON.stringify(draft) !== JSON.stringify(createBlankIlawDocument({
    subject: fixture.assignment.subjectName, grade: fixture.assignment.gradeLevel,
  })) : JSON.stringify(draft) !== baseline;

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const updateDraft = next => {
    if (temporaryDraft) updateTemporaryDraft({ ...temporaryDraft, document: next });
    else setDrafts(previous => previous.map((item, position) => position === index ? next : item));
    setErrors({});
    setMessage('');
  };

  const focusHeading = () => requestAnimationFrame(() => {
    if (onFocusHeading) onFocusHeading();
    else headingRef.current?.focus({ preventScroll: true });
  });
  const printDocument = () => {
    setPreview(true);
    requestAnimationFrame(() => window.print());
  };
  const downloadPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfError('');
    try {
      await downloadManualIlawPdf({
        document: draft, sourceDetails: temporaryDraft?.sourceDetails,
        filename: pdfFilename ?? suggestLessonPlanFilename(draft.info.nameOfLesson),
      });
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'The PDF could not be generated. Please try again.');
    } finally {
      setPdfBusy(false);
    }
  };
  const chooseFixture = next => {
    if (next === index) return;
    if (dirty && pendingFixture !== next) { setPendingFixture(next); return; }
    setPendingFixture(null);
    if (dirty) setDrafts(previous => previous.map((item, position) => position === index
      ? baseline ? JSON.parse(baseline) : createBlankIlawDocument({ subject: fixture.assignment.subjectName, grade: fixture.assignment.gradeLevel })
      : item));
    setIndex(next);
    setPreview(false);
    setErrors({});
    setMessage('');
    setPdfFilename(null);
    setPdfError('');
    focusHeading();
  };

  const checkDraft = () => {
    const next = validateManualIlawDocument(draft, fixture.assignment, { allowManualMetadata: Boolean(manualDraft) });
    setErrors(next);
    setMessage(Object.keys(next).length ? 'Complete the required lesson information.' : 'Required information is complete. This temporary draft is not saved.');
    const firstInvalid = Object.keys(next).find(key => key !== 'assignment');
    if (firstInvalid) {
      setPreview(false);
      requestAnimationFrame(() => sectionRef.current?.querySelector(`[data-ilaw-field="${firstInvalid}"]`)?.focus());
    }
    return Object.keys(next).length === 0;
  };

  const snapshot = () => {
    if (!checkDraft()) return;
    const raw = serializeManualIlawDraft({ ...fixture, document: draft });
    const parsed = parseManualIlawDraft(raw, fixture);
    setSnapshots(previous => previous.map((item, position) => position === index ? JSON.stringify(parsed.document) : item));
    setImportText(raw);
    setMessage('Mock snapshot created in this browser tab only. No plan was saved.');
  };

  const reopen = () => {
    try {
      const parsed = parseManualIlawDraft(importText, fixture);
      // A failed parse leaves the active draft untouched.
      updateDraft(parsed.document);
      setMessage('Supported mock payload reopened. No database request was made.');
    } catch (error) {
      setMessage(error.message);
    }
  };

  return <section ref={sectionRef} className="full-manual-ilaw" aria-label={activeMode ? 'Full Manual ILAW editor' : 'Full Manual ILAW local editor'}>
    {pendingFixture !== null && <ConfirmDialog title="Switch ILAW example" confirmLabel="Discard changes"
      message="Discard unsaved changes to this synthetic ILAW draft?"
      onCancel={() => setPendingFixture(null)} onConfirm={() => chooseFixture(pendingFixture)} />}
    <div className="full-manual-ilaw-controls">
      {!activeMode && <div>
        <h2 ref={headingRef} tabIndex={-1}>Full Manual ILAW</h2>
        <p>Synthetic Teacher assignments only. This preview cannot save, post, distribute, or upload.</p>
      </div>}
      {activeMode && <details className="full-manual-ilaw-draft-info">
        <summary>About this local draft</summary>
        <p>This local QA draft exists only in memory. Refreshing or closing this tab loses it. Do not enter real school content.</p>
      </details>}
      {!activeMode && <>
      <label>Preview Teacher and plan
        <select value={index} onChange={event => chooseFixture(Number(event.target.value))}>
          {fixtures.map((item, position) => <option key={`${item.teacherId}:${item.planId}`} value={position}>
            {item.teacherLabel} — {item.planLabel}
          </option>)}
        </select>
      </label>
      <p>Selected synthetic assignment: {fixture.assignment.subjectName} · {fixture.assignment.gradeLevel}</p>
      </>}
      {activeMode && !manualDraft && <p role="status">{quickCreateDraft
        ? `Quick Create assignment: ${fixture.assignment.subjectName} · ${fixture.assignment.gradeLevel}. Production Save is unavailable.`
        : 'Verified subject and grade selection is unavailable in this editor. Quick Create uses a separate assignment read; neither form can save a manual plan yet.'}</p>}
      <nav aria-label="ILAW sections" className="full-manual-ilaw-sections">
        {[
          ['Intentions', 'ilaw-intentions'], ['Learning Experience', 'ilaw-experience'],
          ['Assessment', 'ilaw-assessment'], ['Ways Forward', 'ilaw-ways-forward'],
        ].map(([label, id]) => <a href={`#${id}`} key={id} onClick={() => requestAnimationFrame(() => sectionRef.current?.querySelector(`#${id}`)?.focus({ preventScroll: true }))}>{label}</a>)}
      </nav>
      {!activeMode && <div className="full-manual-ilaw-toolbar">
        <div role="group" aria-label="Document mode" className="full-manual-ilaw-actions">
          <span className="full-manual-ilaw-group-label">Document</span>
          <button type="button" className="ilaw-view-toggle" aria-label="Edit document" title="Edit document" aria-pressed={!preview} onClick={() => { setPreview(false); focusHeading(); }}><Pencil size={18} aria-hidden="true" /></button>
          <button type="button" className="ilaw-view-toggle" aria-label="Preview document" title="Preview document" aria-pressed={preview} onClick={() => { setPreview(true); focusHeading(); }}><Eye size={18} aria-hidden="true" /></button>
          <button type="button" className="ilaw-view-toggle" aria-label="Print" title="Print" onClick={printDocument}><Printer size={18} aria-hidden="true" /></button>
          <button type="button" onClick={downloadPdf} disabled={pdfBusy}>{pdfBusy ? 'Preparing PDF…' : 'Download PDF'}</button>
        </div>
        <label className="full-manual-ilaw-filename">Suggested PDF filename
          <input value={pdfFilename ?? suggestLessonPlanFilename(draft.info.nameOfLesson)}
            onChange={event => setPdfFilename(event.target.value)} maxLength={160} autoComplete="off" spellCheck={false}
            aria-describedby="manual-ilaw-pdf-name-help" />
        </label>
        <div role="group" aria-label="Document validation" className="full-manual-ilaw-actions">
          <button type="button" onClick={checkDraft}>Check required fields</button>
        </div>
        {!activeMode && <button type="button" onClick={snapshot}>Create mock snapshot</button>}
      </div>}
      {!activeMode && <p id="manual-ilaw-pdf-name-help" className="full-manual-ilaw-draft-info">The PDF filename does not change the lesson title or save this draft to EduScribe.</p>}
      {dirty && <p role="status">Unsaved changes in this temporary draft.</p>}
      {Object.keys(activeMode ? validationErrors : errors).length > 0 && <div role="alert" className="full-manual-ilaw-errors">
        <p>Required information:</p>
        <ul>{Object.values(activeMode ? validationErrors : errors).map(error => <li key={error}>{error}</li>)}</ul>
      </div>}
      {message && <p role="status">{message}</p>}
      {pdfError && <p role="alert">{pdfError}</p>}
      {!activeMode && <details>
        <summary>Mock payload round-trip test</summary>
        <label>Versioned synthetic payload
          <textarea value={importText} onChange={event => setImportText(event.target.value)} rows={3} />
        </label>
        <button type="button" onClick={reopen}>Reopen mock payload</button>
      </details>}
    </div>
    <IlawTemplate value={draft} onChange={updateDraft} editable={!preview} fieldErrors={activeMode ? validationErrors : errors}
      sourceDetails={temporaryDraft?.sourceDetails}
      sourceDetailsTitle={manualDraft ? 'Lesson-wide details' : undefined}
      onSourceDetailsChange={next => updateTemporaryDraft?.({ ...temporaryDraft, sourceDetails: next })} />
  </section>;
}
