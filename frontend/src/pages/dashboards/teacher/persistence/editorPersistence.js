import { UNAVAILABLE, WORKSHEET_KIND, validateWorksheetDraft } from '../../../../../../shared/trustedPersistence/contracts.js';

// Editor mapping is not authorization evidence. The server rechecks Settings
// and the selected tuple; no owner/role/assignmentVerified flag is forwarded.
export function manualEditorDocument(draft, selection) {
  return { kind: 'eduscribe.manual-ilaw', version: 2, title: draft.document.info.nameOfLesson,
    assignment: selection && { subjectId: selection.subjectId, gradeLevel: selection.gradeLevel, schoolYear: selection.schoolYear },
    document: structuredClone(draft.document), sourceDetails: structuredClone(draft.sourceDetails) };
}
export function worksheetEditorDocument(draft, selection) {
  return validateWorksheetDraft({
    kind: WORKSHEET_KIND, version: 1, title: draft.title ?? '',
    assignment: selection ? { subjectId: selection.subjectId, gradeLevel: selection.gradeLevel, schoolYear: selection.schoolYear } : null,
    sourcePlanId: draft.sourceLessonPlan?.id ?? null, instructions: draft.instructions ?? '', workflowState: 'draft',
    groups: (draft.sections ?? []).map(g => ({ id: g.id, title: g.title, directions: g.directions })),
    questions: (draft.questions ?? []).map(q => ({ id: q.localId, groupId: q.sectionId,
      type: q.item_type || null, text: q.question ?? '', options: [...(q.options ?? [])],
      points: q.points === '' || q.points === undefined || q.points === null ? null : Number(q.points) })),
    answerKeys: Object.fromEntries((draft.answerKey ?? []).map(k => [k.localId, k.correct_answer ?? null])),
  });
}
// Future authenticated transport seam; no fetch/Supabase/browser-storage fallback.
// Keep requestId across ambiguous retries, use a new ID for changed content,
// and retain editor contents until a confirmed durable result is returned.
export function createEditorPersistence(invoke) {
  const send = async (operation, command) => {
    if (!invoke) return { ...UNAVAILABLE };
    try {
      const result = await invoke(operation, command);
      if (result?.ok === true && result.durable !== true) return { ...UNAVAILABLE };
      return result?.ok === true || result?.ok === false ? result : { ...UNAVAILABLE };
    } catch { return { ok: false, code: 'outcome_unknown', durable: false,
      message: 'The save outcome could not be confirmed. Keep your edits and retry with the same request ID.' }; }
  };
  return {
    saveManual: ({ draft, selection, id = null, expectedRevision = null, requestId, intent = 'draft', previousState = 'draft' }) => {
      const operation = id === null ? 'CreateIncompleteDraft' : intent === 'saved'
        ? previousState === 'saved' ? 'UpdateSavedLessonPlan' : 'SaveCompleteLessonPlan' : 'UpdateIncompleteDraft';
      if (id === null && intent === 'saved') return Promise.resolve({ ok: false, code: 'create_draft_first', durable: false });
      return send(operation, { requestId, id, expectedRevision, document: manualEditorDocument(draft, selection) });
    },
    saveWorksheet: ({ draft, selection, id = null, expectedRevision = null, requestId }) =>
      send(id === null ? 'CreatePrivateWorksheetDraft' : 'UpdatePrivateWorksheetDraft',
        { requestId, id, expectedRevision, document: worksheetEditorDocument(draft, selection) }),
    reopenManual: id => send('ReopenOwnedLessonPlan', { id }),
    reopenWorksheet: id => send('ReopenPrivateWorksheetDraft', { id }),
  };
}
// No approved transport is installed. Backend independently fails closed.
export const editorPersistence = createEditorPersistence();
export const permanentSaveUnavailable = UNAVAILABLE.message;
