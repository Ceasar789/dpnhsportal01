import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge, Btn, Card, ConfirmDialog } from '../shared/ui';
import { archiveAiWeeklyCollection, updateAiWeeklyCollection } from '../persistence/aiWeeklyWorksheetManageClient';
import { weeklyWorksheetSaveFlagEnabled } from '../persistence/aiWeeklyWorksheetSaveClient';
import { loadSavedWeeklyCollection } from './savedCollectionLoader';
import SavedDistributePanel from './SavedDistributePanel';
import DistributedDayViewer from './DistributedDayViewer';
import { saveGeneratedWorksheetLocally } from './generatedDraftModel';
import { shuffleWeeklyWorksheet, updateWeeklyWorksheet } from './weeklyWorksheetCollection';
import QuestionBuilderModal from './QuestionBuilderModal';
import useDialogSafety from './useDialogSafety';

const LOAD_MESSAGES = {
  not_found: 'This collection was not found.',
  incomplete_data: 'This collection could not be fully loaded. Reload it before editing.',
  load_failed: 'Could not load this collection. Check your connection and try again.',
  invalid_id: 'This collection has an invalid ID.',
};
const RELOAD_CODES = new Set(['revision_conflict', 'collection_archived', 'student_work_exists', 'not_found']);
const DAY_NUMBERS = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
const DAY_NAMES = Object.keys(DAY_NUMBERS);
const DISTRIBUTION_READS = [['task_assignees', 'task_id'],
  ['worksheet_submissions', 'worksheet_id'], ['worksheet_sections', 'worksheet_id']];
const DISTRIBUTION_READ_ERROR = 'Could not check which days are distributed. Reload the collection.';
async function readDistributedIds(client, worksheetIds) {
  if (!client || worksheetIds.length !== 5 || new Set(worksheetIds).size !== 5) throw new Error('invalid_ids');
  const groups = await Promise.all(DISTRIBUTION_READS.map(async ([table, column]) => {
    const found = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await client.from(table).select(column)
        .in(column, worksheetIds).range(start, start + 999);
      if (error || !Array.isArray(data) || data.some(row => !worksheetIds.includes(row?.[column]))) {
        throw new Error('read_failed');
      }
      found.push(...data.map(row => row[column]));
      if (data.length < 1000) break;
    }
    return found;
  }));
  return [...new Set(groups.flat())];
}
const content = day => ({ title: day.title, instructions: day.instructions,
  sections: day.sections, checkingMode: day.checkingMode, questions: day.questions,
  answerKey: day.answerKey });
const signature = collection => JSON.stringify(collection.worksheets.map(day => [day.day, content(day)]));

export default function SavedCollectionEditor({ collectionId, displayTitle, subtitle, teacherId,
  client, apiBase, knownRevision, onCollectionChanged, open, onOpenChange, onDirtyChange }) {
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = open === undefined ? localOpen : open;
  const setOpen = onOpenChange || setLocalOpen;
  const [workingCopy, setWorkingCopy] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [detail, setDetail] = useState(null);
  const [saveLock, setSaveLock] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [viewingId, setViewingId] = useState(null);
  const [editorBaseline, setEditorBaseline] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [distributeDay, setDistributeDay] = useState(null);
  const [distributedIds, setDistributedIds] = useState([]);
  const [distributionReadError, setDistributionReadError] = useState(false);
  const [checkingDistribution, setCheckingDistribution] = useState(false);
  const busyRef = useRef(false);
  const loadSequence = useRef(0);
  const distributionSequence = useRef(0);
  const loadedCollection = useRef(null);
  const changed = Boolean(workingCopy && baseline && signature(workingCopy) !== baseline);
  const effectiveRevision = workingCopy?.revision ?? knownRevision;
  const canManage = Number.isSafeInteger(effectiveRevision) && effectiveRevision >= 1
    && !changed && !loading && !saving && !saveLock && !loadError;
  const distributionEnabled = weeklyWorksheetSaveFlagEnabled();
  const hasDistributedDay = distributionEnabled && isOpen && distributedIds.length > 0;
  const canArchive = canManage && (!distributionEnabled || !isOpen
    || (!checkingDistribution && !hasDistributedDay));
  const canDistribute = distributionEnabled && isOpen && Boolean(workingCopy) && canManage;

  useEffect(() => { setDistributeDay(null); }, [collectionId, knownRevision, effectiveRevision]);
  useEffect(() => { if (!canDistribute) setDistributeDay(null); }, [canDistribute]);

  const refreshDistribution = useCallback(async (collection, loadToken = loadSequence.current) => {
    if (!distributionEnabled) return;
    const sequence = ++distributionSequence.current;
    setCheckingDistribution(true);
    setDistributionReadError(false);
    try {
      const ids = await readDistributedIds(client, collection.worksheets.map(day => day.draftId));
      if (sequence !== distributionSequence.current || loadToken !== loadSequence.current
        || loadedCollection.current?.collectionId !== collection.collectionId
        || loadedCollection.current?.revision !== collection.revision) return;
      setDistributedIds(ids);
    } catch {
      if (sequence !== distributionSequence.current || loadToken !== loadSequence.current
        || loadedCollection.current?.collectionId !== collection.collectionId
        || loadedCollection.current?.revision !== collection.revision) return;
      setDistributionReadError(true);
    } finally {
      if (sequence === distributionSequence.current && loadToken === loadSequence.current
        && loadedCollection.current?.collectionId === collection.collectionId
        && loadedCollection.current?.revision === collection.revision) setCheckingDistribution(false);
    }
  }, [client, distributionEnabled]);

  const load = useCallback(async () => {
    setDistributeDay(null);
    setViewingId(null);
    const sequence = ++loadSequence.current;
    distributionSequence.current += 1;
    loadedCollection.current = null;
    setDistributedIds([]);
    setDistributionReadError(false);
    setCheckingDistribution(false);
    setLoading(true);
    setLoadError('');
    const result = await loadSavedWeeklyCollection(client, collectionId, teacherId);
    if (sequence !== loadSequence.current) return false;
    setLoading(false);
    if (!result.ok) {
      setLoadError(LOAD_MESSAGES[result.code] || LOAD_MESSAGES.load_failed);
      return false;
    }
    loadedCollection.current = { collectionId: result.collection.collectionId,
      revision: result.collection.revision };
    setWorkingCopy(result.collection);
    setBaseline(signature(result.collection));
    setSaveLock(null);
    setMessage('');
    setDetail(null);
    await refreshDistribution(result.collection, sequence);
    return sequence === loadSequence.current;
  }, [client, collectionId, teacherId, refreshDistribution]);

  useEffect(() => {
    if (isOpen) { void load(); return () => {
      loadSequence.current += 1;
      distributionSequence.current += 1;
      loadedCollection.current = null;
    }; }
    setWorkingCopy(null);
    setBaseline('');
    setLoadError('');
    setMessage('');
    setDetail(null);
    setSaveLock(null);
    setEditingId(null);
    setViewingId(null);
    setDistributedIds([]);
    setDistributionReadError(false);
    setCheckingDistribution(false);
    return undefined;
  }, [isOpen, load]);

  useEffect(() => { onDirtyChange?.(collectionId, isOpen && changed); },
    [collectionId, isOpen, changed, onDirtyChange]);
  const { requestClose, routeBlocker, busyNotice } = useDialogSafety({
    dirty: isOpen && changed, pending: saving,
    onClose: () => setOpen(null),
    discardMessage: 'Leave this collection and discard unsaved changes?',
    leaveMessage: 'Leave Worksheets with unsaved collection changes?',
  });
  const reload = () => {
    if (busyRef.current || loading) return;
    requestClose(() => {
      setEditingId(null);
      void (async () => { await load(); await onCollectionChanged?.(); })();
    });
  };
  const openDay = day => {
    if (distributionEnabled && distributedIds.includes(day.draftId)) return;
    const prepared = saveGeneratedWorksheetLocally(day);
    setWorkingCopy(current => updateWeeklyWorksheet(current, prepared));
    setEditorBaseline(day);
    setEditingId(day.draftId);
  };
  const changeDay = useCallback(day => {
    setWorkingCopy(current => current ? updateWeeklyWorksheet(current, day) : current);
  }, []);
  const closeDay = () => {
    if (editorBaseline) changeDay(editorBaseline);
    setEditingId(null);
    setEditorBaseline(null);
  };
  const saveDayLocally = day => {
    changeDay(day);
    setEditingId(null);
    setEditorBaseline(null);
  };
  const verifyCurrentCollection = async () => {
    if (!client || !teacherId) return null;
    try {
      const { data, error } = await client.from('worksheet_collections')
        .select('revision,archived_at').eq('id', collectionId).eq('teacher_id', teacherId);
      if (error || !Array.isArray(data) || data.length !== 1
        || !Object.hasOwn(data[0] || {}, 'archived_at')) return null;
      const revision = Number(data[0].revision);
      return Number.isSafeInteger(revision) && revision >= 1
        ? { revision, archivedAt: data[0].archived_at } : null;
    } catch { return null; }
  };
  const saveChanges = async () => {
    if (busyRef.current || loading || !changed || saveLock || !workingCopy
      || (distributionEnabled && (checkingDistribution || distributionReadError))) return;
    busyRef.current = true;
    setSaving(true);
    setMessage('');
    setDetail(null);
    try {
      const result = await updateAiWeeklyCollection(apiBase, { collectionId,
        expectedRevision: workingCopy.revision, collection: workingCopy });
      if (result.status === 'saved') {
        const lockedDays = result.receipt?.lockedDays ?? [];
        const savedMessage = lockedDays.length
          ? `Saved. Distributed days were not changed: ${lockedDays.map(day => DAY_NAMES[day - 1]).join(', ')}.`
          : 'Changes saved';
        setBaseline(signature(workingCopy));
        const reloaded = await load();
        if (reloaded) {
          setMessage(savedMessage);
          onCollectionChanged?.();
        } else {
          setSaveLock('reload_failed');
          setMessage('Saved, but reloading failed. Reload the collection.');
        }
      } else {
        const verified = result.status === 'unknown' ? await verifyCurrentCollection() : null;
        const notApplied = verified?.revision === workingCopy.revision;
        setMessage(notApplied
          ? 'The change was not applied. Your edits are still here. You can try Save changes again.'
          : result.message);
        setDetail(result.status === 'unknown' ? result.detail : null);
        setSaveLock(notApplied ? null : result.status === 'unknown' ? 'unknown'
          : RELOAD_CODES.has(result.code) ? 'blocked' : null);
      }
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };
  const archiveCollection = async () => {
    if (busyRef.current || !canArchive) return;
    busyRef.current = true;
    setSaving(true);
    setConfirmAction(null);
    setMessage('');
    setDetail(null);
    try {
      const sentRevision = effectiveRevision;
      const result = await archiveAiWeeklyCollection(apiBase,
        { collectionId, expectedRevision: sentRevision, archived: true });
      const verified = result.status === 'unknown' ? await verifyCurrentCollection() : null;
      if (result.status === 'saved' || verified?.archivedAt != null) {
        setOpen(null);
        await onCollectionChanged?.();
      } else {
        const notApplied = verified?.archivedAt == null && verified?.revision === sentRevision;
        setMessage(notApplied ? 'The change was not applied. You can try again.' : result.message);
        setDetail(result.status === 'unknown' ? result.detail : null);
        setSaveLock(notApplied ? null : result.status === 'unknown' ? 'unknown'
          : RELOAD_CODES.has(result.code) ? 'blocked' : null);
        await onCollectionChanged?.();
      }
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };
  const editingDay = workingCopy?.worksheets.find(day => day.draftId === editingId);
  const viewingDay = distributionEnabled && workingCopy?.worksheets.find(day => day.draftId === viewingId);
  const handleDistributed = summary => {
    setMessage(summary);
    if (workingCopy) void refreshDistribution(workingCopy);
  };

  return <section aria-label="Weekly Worksheet Collection" className="min-w-0 md:col-span-2 lg:col-span-3">
    {routeBlocker}
    <Card className="p-4 min-w-0" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
      <Badge color="var(--banner-accent)" bg="var(--card2)">Saved permanently</Badge>
      {changed && <Badge color="var(--banner-accent)" bg="var(--card2)">Unsaved changes</Badge>}
      <h3 className="text-lg font-semibold mt-3" style={{ color: 'var(--text)' }}>{displayTitle || 'Weekly Worksheets'}</h3>
      {subtitle && <p className="text-xs mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
      <Btn onClick={() => isOpen ? requestClose() : setOpen(collectionId)} aria-expanded={isOpen}>
        {isOpen ? 'Hide daily worksheets' : 'Open weekly collection'}
      </Btn>
      <Btn variant="outline" disabled={!canArchive} onClick={() => setConfirmAction('archive')}>Archive collection</Btn>
      {hasDistributedDay && <p>Archive is unavailable after a day has been distributed.</p>}
      {!isOpen && message && <p role={message === 'Changes saved' || message.startsWith('Saved. Distributed days were not changed:') ? 'status' : 'alert'}>{message}</p>}
      {!isOpen && detail && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Details: {detail}</p>}
      {!isOpen && saveLock && <Btn variant="outline" onClick={reload} disabled={saving || loading}>Reload collection</Btn>}
      {isOpen && <>
        {loading && <p role="status">Loading saved collection...</p>}
        {loadError && <div role="alert">{loadError} <Btn onClick={reload}>Retry</Btn></div>}
        {busyNotice && <p role="status">{busyNotice}</p>}
        {message && <p role={message === 'Changes saved' || message.startsWith('Saved. Distributed days were not changed:') ? 'status' : 'alert'}>{message}</p>}
        {distributionEnabled && distributionReadError && <p role="alert">{DISTRIBUTION_READ_ERROR}</p>}
        {detail && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Details: {detail}</p>}
        {workingCopy && !loadError && <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
            {workingCopy.worksheets.map(day => <section key={day.draftId} aria-label={`${day.day} Worksheet`}
              className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--banner-accent)' }}>{day.day}</p>
              {distributionEnabled && distributedIds.includes(day.draftId)
                && <Badge color="var(--banner-accent)" bg="var(--card2)">Distributed</Badge>}
              {distributionEnabled && ['auto', 'manual'].includes(day.checkingMode)
                && <Badge color="var(--text-muted)" bg="var(--card2)">
                  {day.checkingMode === 'auto' ? 'Auto-check' : 'Manual check'}
                </Badge>}
              <h4 className="font-semibold break-words" style={{ color: 'var(--text)' }}>{day.title}</h4>
              <p className="text-xs my-2" style={{ color: 'var(--text-muted)' }}>{day.questions.length} questions · Saved permanently</p>
              <div className="flex flex-wrap gap-2">
                {distributionEnabled && distributedIds.includes(day.draftId)
                  ? <Btn onClick={() => setViewingId(day.draftId)}>View {day.day}</Btn>
                  : <Btn onClick={() => openDay(day)} disabled={saving || loading}>Edit/Preview {day.day}</Btn>}
                <Btn variant="outline" disabled={saving || loading || (distributionEnabled && distributedIds.includes(day.draftId))} onClick={() => setWorkingCopy(current =>
                  updateWeeklyWorksheet(current, shuffleWeeklyWorksheet(day)))}>Shuffle Questions</Btn>
                {distributionEnabled && <Btn variant="outline" disabled={!canDistribute}
                  onClick={() => setDistributeDay(day)}>Distribute</Btn>}
              </div>
            </section>)}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Btn disabled={!changed || saving || loading || Boolean(saveLock) || (distributionEnabled && (checkingDistribution || distributionReadError))} busy={saving}
              onClick={saveChanges}>Save changes</Btn>
          </div>
        </>}
        {saveLock && <Btn variant="outline" onClick={reload} disabled={saving || loading}>Reload collection</Btn>}
      </>}
    </Card>
    {distributeDay && canDistribute && <SavedDistributePanel collectionId={collectionId}
      dayNumber={DAY_NUMBERS[distributeDay.day]} dayName={distributeDay.day} worksheetTitle={distributeDay.title}
      checkingMode={distributeDay.checkingMode}
      modeEditable={!checkingDistribution && !distributionReadError && !distributedIds.includes(distributeDay.draftId)}
      revision={effectiveRevision} client={client} teacherId={teacherId} apiBase={apiBase}
      onCollectionChanged={onCollectionChanged} onDistributed={handleDistributed}
      onReload={reload} onClose={() => setDistributeDay(null)} />}
    {confirmAction && <ConfirmDialog title="Archive collection"
      message="Archive this collection? It will be hidden from the list and can be restored."
      confirmLabel="Archive collection"
      onCancel={() => setConfirmAction(null)} onConfirm={() => { void archiveCollection(); }} />}
    {editingDay && typeof document !== 'undefined' && createPortal(
      <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6" style={{ backgroundColor: 'var(--card-bg)' }}>
        <QuestionBuilderModal key={editingDay.draftId} worksheet={editingDay} draft={editingDay}
          onDraftChange={changeDay} onLocalSave={saveDayLocally} onClose={closeDay} allowDiscard={false} />
      </div>, document.body)}
    {viewingDay && <DistributedDayViewer day={viewingDay} hasUnsavedChanges={changed}
      onClose={() => setViewingId(null)} />}
  </section>;
}
