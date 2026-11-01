// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SavedCollectionEditor from './SavedCollectionEditor';
import WorksheetsTab from '../tabs/WorksheetsTab';

const { load, update, archive, distribute, userData, savedRows } = vi.hoisted(() => ({
  load: vi.fn(), update: vi.fn(), archive: vi.fn(), distribute: vi.fn(),
  userData: { uid: '00000002-1111-4111-8111-111111111111' }, savedRows: { value: [] } }));
vi.mock('./savedCollectionLoader', () => ({ loadSavedWeeklyCollection: load }));
vi.mock('../persistence/aiWeeklyWorksheetManageClient', () => ({ updateAiWeeklyCollection: update,
  archiveAiWeeklyCollection: archive }));
vi.mock('../persistence/aiWeeklyWorksheetDistributeClient', () => ({
  distributeAiWeeklyCollection: distribute }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData }) }));
vi.mock('../../../../config/supabase', () => ({ supabase: { from: table => {
  const query = { select: () => query, eq: () => query, order: () => query, in: () => query,
    then: resolve => Promise.resolve({ data: table === 'worksheets' ? savedRows.value : [{ id: collectionId,
      title: 'Synthetic weekly collection' }], error: null }).then(resolve) };
  return query;
} } }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('./useWorksheetAssessment', () => ({ useWorksheetAssessment: () => ({
  mySubjects: [], schoolYear: '2030-2031', subjectLoading: false, subjectError: false,
  assigneeCounts: {}, assigneeCountsLoading: false, assigneeCountsError: false,
  postings: [], postingsError: false, fetchMySubject: vi.fn(), fetchAssigneeCounts: vi.fn(),
  fetchPostings: vi.fn(),
}) }));
vi.mock('./QuestionBuilderModal', () => ({ default: ({ draft, onDraftChange, onLocalSave, onClose,
  allowDiscard }) => <section aria-label="Mock saved editor">
  <p>{draft.title}</p><p>{allowDiscard ? 'Discard allowed' : 'Discard disabled'}</p>
  <button onClick={() => onDraftChange({ ...draft, questions: draft.questions.map((question, index) =>
    index === 0 ? { ...question, question: 'Changed question' } : question) })}>Edit question</button>
  <button onClick={() => onLocalSave({ ...draft, saved: true, status: 'local-saved' })}>Save Local Draft</button>
  <button onClick={onClose}>Back to Worksheets</button>
</section> }));

const uuid = number => `${number.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
const collectionId = uuid(1);
const teacherId = uuid(2);
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const collection = revision => ({ kind: 'weekly-worksheet-collection', collectionId,
  teacherId, title: 'Synthetic weekly collection', revision,
  sourceLessonPlan: { id: uuid(3), title: 'Synthetic plan' },
  worksheets: weekdays.map((day, index) => ({ draftId: uuid(10 + index), collectionId, day,
    title: `${day} questions`, instructions: '', status: 'saved', saved: true, sourceType: 'ai',
    sourceLessonPlan: { id: uuid(3), title: 'Synthetic plan' }, checkingMode: 'manual',
    sections: [{ id: 'main', title: 'Main', directions: '' }],
    questions: [{ localId: uuid(20 + index), sectionId: 'main', question: `Question for ${day}`,
      item_type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], points: 1 }],
    answerKey: [{ localId: uuid(20 + index), correct_answer: 'A' }] })) });
const distributionClient = (rows = {}, errorTable = null, replyFor = null) => {
  const calls = [];
  const from = vi.fn(table => {
    const call = { table, columns: null, eq: [], in: null, range: null, limit: null };
    calls.push(call);
    const query = {
      select(columns) { call.columns = columns; return query; },
      eq(column, value) { call.eq.push([column, value]); return query; },
      in(column, ids) { call.in = [column, ids]; return query; },
      range(start, end) { call.range = [start, end]; return query; },
      limit(value) { call.limit = value; return query; },
      then(resolve, reject) {
        const data = (rows[table] || []).filter(row => call.eq.every(([column, value]) =>
          row[column] === value) && (!call.in || call.in[1].includes(row[call.in[0]])));
        const result = table === errorTable
          ? { data: null, error: { message: 'synthetic read error' } }
          : { data: call.range ? data.slice(call.range[0], call.range[1] + 1)
            : call.limit ? data.slice(0, call.limit) : data,
            error: null };
        return Promise.resolve(replyFor ? replyFor(call, result) : result).then(resolve, reject);
      },
    };
    return query;
  });
  return { from, calls };
};
const props = { collectionId, displayTitle: 'Synthetic weekly collection', teacherId,
  client: distributionClient(), apiBase: 'http://localhost:3001' };
const renderEditor = extra => render(<SavedCollectionEditor {...props} {...extra} />);
const verificationClient = (data, error = null) => {
  const lockClient = distributionClient();
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query),
    then: resolve => Promise.resolve({ data, error }).then(resolve) };
  return { from: vi.fn(table => table === 'worksheet_collections'
    ? query : lockClient.from(table)), query };
};
const open = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Open weekly collection' }));
  return screen.findByRole('region', { name: 'Monday Worksheet' });
};
const editMonday = async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Edit/Preview Monday' }));
  fireEvent.click(within(screen.getByRole('region', { name: 'Mock saved editor' }))
    .getByRole('button', { name: 'Edit question' }));
};

beforeEach(() => {
  vi.stubEnv('DEV', true);
  savedRows.value = [{ id: uuid(10), collection_id: collectionId, day_of_week: 1,
    title: 'Saved Monday', items: 1, teacher_id: teacherId, origin: 'ai_generated' }];
  load.mockReset().mockResolvedValue({ ok: true, collection: collection(2) });
  update.mockReset().mockResolvedValue({ status: 'saved', code: null, message: '', receipt: {} });
  archive.mockReset().mockResolvedValue({ status: 'saved', code: null, message: '', receipt: {} });
  distribute.mockReset().mockResolvedValue({ status: 'saved', receipt: {
    inserted: 1, alreadyAssigned: 0, assignedElsewhere: 0 } });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('loads on open and shows five day cards with the existing action labels', async () => {
  renderEditor();
  expect(load).not.toHaveBeenCalled();
  await open();
  expect(load).toHaveBeenCalledWith(props.client, collectionId, teacherId);
  expect(screen.getAllByRole('region', { name: / Worksheet$/ }).map(node =>
    node.getAttribute('aria-label'))).toEqual(weekdays.map(day => `${day} Worksheet`));
  for (const day of weekdays) {
    expect(screen.getByRole('button', { name: `Edit/Preview ${day}` })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: `${day} Worksheet` }))
      .getByRole('button', { name: 'Shuffle Questions' })).toBeTruthy();
  }
  expect(screen.queryByRole('button', { name: 'Delete collection' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true);
});

it('shows a fixed load error and retries without exposing raw text', async () => {
  load.mockReset().mockResolvedValueOnce({ ok: false, code: 'incomplete_data',
    error: 'secret database text' }).mockResolvedValue({ ok: true, collection: collection(2) });
  renderEditor();
  fireEvent.click(screen.getByRole('button', { name: 'Open weekly collection' }));
  expect(await screen.findByText(/This collection could not be fully loaded/)).toBeTruthy();
  expect(screen.queryByText('secret database text')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('region', { name: 'Monday Worksheet' })).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(2);
});

it('opens a day in draft mode without marking unchanged content dirty', async () => {
  renderEditor();
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Edit/Preview Monday' }));
  expect(screen.getByRole('region', { name: 'Mock saved editor' }).textContent).toContain('Discard disabled');
  expect(screen.queryByText('Unsaved changes')).toBeNull();
  expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Back to Worksheets' }));
  expect(screen.queryByRole('region', { name: 'Mock saved editor' })).toBeNull();
  expect(screen.queryByText('Unsaved changes')).toBeNull();
});

it('marks an edited question dirty and sends all five days with the current revision', async () => {
  load.mockResolvedValueOnce({ ok: true, collection: collection(2) })
    .mockResolvedValueOnce({ ok: true, collection: collection(3) });
  const onCollectionChanged = vi.fn();
  renderEditor({ onCollectionChanged });
  await editMonday();
  expect(await screen.findByText('Unsaved changes')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save Local Draft' }));
  expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  expect(update.mock.calls[0][0]).toBe(props.apiBase);
  expect(update.mock.calls[0][1]).toMatchObject({ collectionId, expectedRevision: 2,
    collection: { collectionId, sourceLessonPlan: { id: uuid(3) } } });
  expect(update.mock.calls[0][1].collection.worksheets).toHaveLength(5);
  expect(update.mock.calls[0][1].collection.worksheets[0].questions[0].question).toBe('Changed question');
  expect(await screen.findByText('Changes saved')).toBeTruthy();
  expect(screen.queryByText('Unsaved changes')).toBeNull();
  expect(onCollectionChanged).toHaveBeenCalledTimes(1);
});

it('keeps edits and Save changes available after a definite editable refusal', async () => {
  update.mockResolvedValue({ status: 'failed', code: 'invalid_document',
    message: 'Review the weekly worksheets before saving.', receipt: null });
  renderEditor();
  await editMonday();
  fireEvent.click(screen.getByRole('button', { name: 'Save Local Draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Review the weekly worksheets before saving.')).toBeTruthy();
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(false);
});

it('keeps Save changes locked when a confirmed save cannot be reloaded', async () => {
  load.mockResolvedValueOnce({ ok: true, collection: collection(2) })
    .mockResolvedValueOnce({ ok: false, code: 'load_failed' });
  renderEditor();
  await editMonday();
  fireEvent.click(screen.getByRole('button', { name: 'Save Local Draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Saved, but reloading failed. Reload the collection.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
});

it('shuffles only the working copy and keeps question keys paired by local ID', async () => {
  const original = collection(2);
  const monday = original.worksheets[0];
  const extra = { ...monday.questions[0], localId: uuid(99), question: 'Second question' };
  monday.questions.push(extra);
  monday.answerKey.push({ localId: extra.localId, correct_answer: 'B' });
  load.mockResolvedValue({ ok: true, collection: original });
  update.mockResolvedValue({ status: 'failed', code: 'invalid_document', message: 'Review.', receipt: null });
  vi.spyOn(Math, 'random').mockReturnValue(0);
  renderEditor();
  await open();
  fireEvent.click(within(screen.getByRole('region', { name: 'Monday Worksheet' }))
    .getByRole('button', { name: 'Shuffle Questions' }));
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  const sent = update.mock.calls[0][1].collection.worksheets[0];
  expect(sent.questions.map(item => item.localId)).toEqual([uuid(99), uuid(20)]);
  expect(new Map(sent.answerKey.map(key => [key.localId, key.correct_answer])))
    .toEqual(new Map([[uuid(20), 'A'], [uuid(99), 'B']]));
  expect(original.worksheets[0].questions.map(item => item.localId)).toEqual([uuid(20), uuid(99)]);
});

it.each(['revision_conflict', 'student_work_exists'])('%s requires Reload before another save', async code => {
  update.mockResolvedValue({ status: 'failed', code, message: `Fixed ${code}`, receipt: null });
  renderEditor();
  await editMonday();
  fireEvent.click(screen.getByRole('button', { name: 'Save Local Draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText(`Fixed ${code}`)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Reload collection' })).toBeTruthy();
});

it('locks an unknown result until explicit Reload, then clears the dirty state', async () => {
  update.mockResolvedValue({ status: 'unknown', code: null,
    message: 'Could not confirm the change. Reload the collection before trying again.', receipt: null });
  renderEditor();
  await editMonday();
  fireEvent.click(screen.getByRole('button', { name: 'Save Local Draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText(/Could not confirm the change/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Reload collection' }));
  const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText('Unsaved changes')).toBeNull());
  expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true);
});

it('registers beforeunload only while changed and removes it after closing', async () => {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  renderEditor();
  await open();
  expect(add.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Edit/Preview Monday' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit question' }));
  await waitFor(() => expect(add.mock.calls.filter(([type]) => type === 'beforeunload').length).toBeGreaterThan(0));
  fireEvent.click(screen.getByRole('button', { name: 'Save Local Draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hide daily worksheets' }));
  const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Discard changes' }));
  await waitFor(() => expect(remove.mock.calls.filter(([type]) => type === 'beforeunload').length)
    .toBeGreaterThan(0));
});

it('asks before closing a changed collection', async () => {
  renderEditor();
  await editMonday();
  fireEvent.click(screen.getByRole('button', { name: 'Save Local Draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hide daily worksheets' }));
  expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Monday Worksheet' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('region', { name: 'Monday Worksheet' })).toBeTruthy();
});

it('keeps the existing read-only saved card when the local flag is off', async () => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '0');
  render(<WorksheetsTab jobClient={{ enabled: false }} />);
  const card = await screen.findByRole('region', { name: 'Weekly Worksheet Collection' });
  fireEvent.click(within(card).getByRole('button', { name: 'Open weekly collection' }));
  expect(within(card).getByRole('button', { name: 'Preview Monday' })).toBeTruthy();
  expect(within(card).getByRole('button', { name: 'Shuffle Questions' }).disabled).toBe(true);
  expect(within(card).queryByRole('button', { name: 'Save changes' })).toBeNull();
  expect(load).not.toHaveBeenCalled();
});

it('asks before opening another saved collection while the first has edits', async () => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  savedRows.value.push({ ...savedRows.value[0], id: uuid(40), collection_id: uuid(4),
    title: 'Another Monday' });
  render(<WorksheetsTab jobClient={{ enabled: false }} />);
  const cards = await screen.findAllByRole('region', { name: 'Weekly Worksheet Collection' });
  expect(cards).toHaveLength(2);
  fireEvent.click(within(cards[0]).getByRole('button', { name: 'Open weekly collection' }));
  await screen.findByRole('button', { name: 'Edit/Preview Monday' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit/Preview Monday' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit question' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Local Draft' }));
  fireEvent.click(within(cards[1]).getByRole('button', { name: 'Open weekly collection' }));
  expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeTruthy();
  expect(within(cards[0]).getByRole('button', { name: 'Hide daily worksheets' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(within(cards[0]).getByRole('button', { name: 'Hide daily worksheets' })).toBeTruthy();
});

it('enables archive from a known revision before loading and disables it for unsaved edits', async () => {
  renderEditor({ knownRevision: 2 });
  expect(screen.getByRole('button', { name: 'Archive collection' }).disabled).toBe(false);
  expect(load).not.toHaveBeenCalled();
  await editMonday();
  fireEvent.click(screen.getByRole('button', { name: 'Save Local Draft' }));
  expect(screen.getByRole('button', { name: 'Archive collection' }).disabled).toBe(true);
});

it('keeps archive disabled when the known revision is missing or invalid', () => {
  const { rerender } = renderEditor();
  expect(screen.getByRole('button', { name: 'Archive collection' }).disabled).toBe(true);
  for (const knownRevision of [0, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    rerender(<SavedCollectionEditor {...props} knownRevision={knownRevision} />);
    expect(screen.getByRole('button', { name: 'Archive collection' }).disabled).toBe(true);
  }
  expect(load).not.toHaveBeenCalled();
});

it('cancels archive without a call, then archives with the loaded revision and refreshes', async () => {
  const onCollectionChanged = vi.fn().mockResolvedValue();
  renderEditor({ onCollectionChanged });
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Archive collection' }));
  const dialog = screen.getByRole('dialog', { name: 'Archive collection' });
  expect(dialog.textContent).toContain('Archive this collection? It will be hidden from the list and can be restored.');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(archive).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Archive collection' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Archive collection' }))
    .getByRole('button', { name: 'Archive collection' }));
  await waitFor(() => expect(archive).toHaveBeenCalledWith(props.apiBase,
    { collectionId, expectedRevision: 2, archived: true }));
  await waitFor(() => expect(onCollectionChanged).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: 'Open weekly collection' })).toBeTruthy();
});

it('archives from the closed card with the known revision and refreshes without loading', async () => {
  const onCollectionChanged = vi.fn().mockResolvedValue();
  renderEditor({ knownRevision: 3, onCollectionChanged });
  fireEvent.click(screen.getByRole('button', { name: 'Archive collection' }));
  expect(archive).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog', { name: 'Archive collection' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Archive collection' }));
  await waitFor(() => expect(archive).toHaveBeenCalledWith(props.apiBase,
    { collectionId, expectedRevision: 3, archived: true }));
  await waitFor(() => expect(onCollectionChanged).toHaveBeenCalledTimes(1));
  expect(load).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Delete collection' })).toBeNull();
});

it('keeps the card and offers Reload when student work blocks archive', async () => {
  archive.mockResolvedValue({ status: 'failed', code: 'student_work_exists',
    message: 'This collection already has student work and cannot be changed.', receipt: null });
  const onCollectionChanged = vi.fn().mockResolvedValue();
  renderEditor({ knownRevision: 2, onCollectionChanged });
  fireEvent.click(screen.getByRole('button', { name: 'Archive collection' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Archive collection' }))
    .getByRole('button', { name: 'Archive collection' }));
  expect(await screen.findByText('This collection already has student work and cannot be changed.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reload collection' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Archive collection' }).disabled).toBe(true);
  expect(load).not.toHaveBeenCalled();
  await waitFor(() => expect(onCollectionChanged).toHaveBeenCalledTimes(1));
});

it('locks closed-card archive after an unknown result until Reload', async () => {
  archive.mockResolvedValue({ status: 'unknown', code: null,
    message: 'Could not confirm the change. Reload the collection before trying again.', receipt: null });
  const onCollectionChanged = vi.fn().mockResolvedValue();
  renderEditor({ knownRevision: 2, onCollectionChanged });
  fireEvent.click(screen.getByRole('button', { name: 'Archive collection' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Archive collection' }))
    .getByRole('button', { name: 'Archive collection' }));
  expect(await screen.findByText(/Could not confirm the change/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Archive collection' }).disabled).toBe(true);
  expect(load).not.toHaveBeenCalled();
  await waitFor(() => expect(onCollectionChanged).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Reload collection' }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Archive collection' }).disabled).toBe(false));
});

it('ignores a second confirmation while archive is in flight', async () => {
  let finish;
  archive.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  renderEditor();
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Archive collection' }));
  const confirm = within(screen.getByRole('dialog', { name: 'Archive collection' }))
    .getByRole('button', { name: 'Archive collection' });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(archive).toHaveBeenCalledTimes(1);
  finish({ status: 'saved', code: null, message: '', receipt: {} });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open weekly collection' })).toBeTruthy());
});

it('verifies an unknown archive once and distinguishes applied, unchanged, changed and failed reads', async () => {
  const unknown = { status: 'unknown', code: null, detail: 'http_503:persistence_failed',
    message: 'Could not confirm the change. Reload the collection before trying again.', receipt: null };
  for (const scenario of [
    { row: { revision: 3, archived_at: '2030-01-01T00:00:00Z' }, applied: true },
    { row: { revision: 2, archived_at: null }, notApplied: true },
    { row: { revision: 3, archived_at: null }, locked: true },
    { rows: [], locked: true },
    { row: null, error: new Error('synthetic read error'), locked: true },
  ]) {
    archive.mockClear().mockResolvedValue(unknown);
    load.mockClear();
    const client = verificationClient(scenario.rows ?? (scenario.row ? [scenario.row] : null), scenario.error);
    const onCollectionChanged = vi.fn().mockResolvedValue();
    const onOpenChange = vi.fn();
    renderEditor({ knownRevision: 2, client, onCollectionChanged,
      ...(scenario.applied ? { open: true, onOpenChange } : {}) });
    if (scenario.applied) await screen.findByRole('region', { name: 'Monday Worksheet' });
    fireEvent.click(screen.getByRole('button', { name: 'Archive collection' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Archive collection' }))
      .getByRole('button', { name: 'Archive collection' }));
    await waitFor(() => expect(onCollectionChanged).toHaveBeenCalledTimes(1));
    expect(archive).toHaveBeenCalledTimes(1);
    expect(client.from.mock.calls.filter(([table]) => table === 'worksheet_collections')).toHaveLength(1);
    expect(client.from).toHaveBeenCalledWith('worksheet_collections');
    expect(client.query.select).toHaveBeenCalledWith('revision,archived_at');
    expect(client.query.eq.mock.calls).toEqual([['id', collectionId], ['teacher_id', teacherId]]);
    if (scenario.applied) {
      expect(onOpenChange).toHaveBeenCalledWith(null);
      expect(screen.queryByText(/^Details:/)).toBeNull();
    } else if (scenario.notApplied) {
      expect(screen.getByText('The change was not applied. You can try again.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Archive collection' }).disabled).toBe(false);
      expect(screen.queryByRole('button', { name: 'Reload collection' })).toBeNull();
    } else {
      expect(screen.getByText(unknown.message)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Archive collection' }).disabled).toBe(true);
      expect(screen.getByRole('button', { name: 'Reload collection' })).toBeTruthy();
    }
    if (!scenario.applied) expect(screen.getByText('Details: http_503:persistence_failed')).toBeTruthy();
    cleanup();
  }
});

it('verifies an unknown Save once and keeps edits available only when revision is unchanged', async () => {
  const unknown = { status: 'unknown', code: null, detail: 'network_error',
    message: 'Could not confirm the change. Reload the collection before trying again.', receipt: null };
  for (const scenario of [
    { row: { revision: 2, archived_at: null }, notApplied: true },
    { row: { revision: 3, archived_at: null }, locked: true },
    { row: null, error: new Error('synthetic read error'), locked: true },
  ]) {
    update.mockClear().mockResolvedValue(unknown);
    load.mockClear();
    const client = verificationClient(scenario.row ? [scenario.row] : null, scenario.error);
    renderEditor({ client });
    await editMonday();
    fireEvent.click(screen.getByRole('button', { name: 'Save Local Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(client.from.mock.calls.filter(([table]) =>
      table === 'worksheet_collections')).toHaveLength(1));
    await waitFor(() => expect(screen.getByText('Details: network_error')).toBeTruthy());
    expect(client.query.select).toHaveBeenCalledWith('revision,archived_at');
    expect(client.query.eq.mock.calls).toEqual([['id', collectionId], ['teacher_id', teacherId]]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][1].expectedRevision).toBe(2);
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    if (scenario.notApplied) {
      expect(screen.getByText('The change was not applied. Your edits are still here. You can try Save changes again.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(false);
      expect(screen.queryByRole('button', { name: 'Reload collection' })).toBeNull();
    } else {
      expect(screen.getByText(unknown.message)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true);
      expect(screen.getByRole('button', { name: 'Reload collection' })).toBeTruthy();
    }
    cleanup();
  }
});

it('shows Distribute on each loaded day, not the header, and closes on revision change', async () => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  const { rerender } = renderEditor({ knownRevision: 2 });
  expect(screen.queryByRole('button', { name: 'Distribute' })).toBeNull();
  await open();
  expect(screen.getAllByRole('button', { name: 'Distribute' })).toHaveLength(5);
  const tuesday = within(screen.getByRole('region', { name: 'Tuesday Worksheet' }))
    .getByRole('button', { name: 'Distribute' });
  expect(tuesday.disabled).toBe(false);
  fireEvent.click(tuesday);
  expect(screen.getByRole('dialog', { name: 'Distribute Tuesday worksheet' })).toBeTruthy();
  rerender(<SavedCollectionEditor {...props} knownRevision={3} />);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Distribute Tuesday worksheet' })).toBeNull());
  expect(within(screen.getByRole('region', { name: 'Tuesday Worksheet' }))
    .getByRole('button', { name: 'Distribute' }).disabled).toBe(false);
});

it('disables Distribute for unsaved changes or an unknown revision', async () => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  load.mockResolvedValue({ ok: true, collection: collection(undefined) });
  const { rerender } = renderEditor();
  await open();
  const tuesday = () => within(screen.getByRole('region', { name: 'Tuesday Worksheet' }))
    .getByRole('button', { name: 'Distribute' });
  expect(tuesday().disabled).toBe(true);
  rerender(<SavedCollectionEditor {...props} knownRevision={2} />);
  expect(tuesday().disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Edit/Preview Monday' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit question' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Local Draft' }));
  expect(tuesday().disabled).toBe(true);
});

it('renders no Distribute control when the local flag is off', async () => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '0');
  renderEditor({ knownRevision: 2 });
  await open();
  expect(screen.queryByRole('button', { name: 'Distribute' })).toBeNull();
});

it.each([
  ['task_assignees', { task_id: uuid(10) }],
  ['worksheet_submissions', { worksheet_id: uuid(10) }],
  ['worksheet_sections', { worksheet_id: uuid(10) }],
])('marks a day distributed from %s while leaving other days editable', async (table, row) => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  const client = distributionClient({ [table]: [row] });
  renderEditor({ client });
  await open();
  const monday = within(screen.getByRole('region', { name: 'Monday Worksheet' }));
  const tuesday = within(screen.getByRole('region', { name: 'Tuesday Worksheet' }));
  expect(await monday.findByText('Distributed')).toBeTruthy();
  expect(monday.getByText('Manual check')).toBeTruthy();
  expect(tuesday.getByText('Manual check')).toBeTruthy();
  expect(monday.queryByRole('button', { name: 'Edit/Preview Monday' })).toBeNull();
  expect(monday.getByRole('button', { name: 'View Monday' }).disabled).toBe(false);
  expect(monday.getByRole('button', { name: 'Shuffle Questions' }).disabled).toBe(true);
  expect(monday.getByRole('button', { name: 'Distribute' }).disabled).toBe(false);
  expect(tuesday.getByRole('button', { name: 'Edit/Preview Tuesday' }).disabled).toBe(false);
  expect(tuesday.queryByRole('button', { name: 'View Tuesday' })).toBeNull();
  expect(tuesday.getByRole('button', { name: 'Shuffle Questions' }).disabled).toBe(false);
  expect(tuesday.getByRole('button', { name: 'Distribute' }).disabled).toBe(false);
  expect(screen.getByRole('button', { name: 'Archive collection' }).disabled).toBe(true);
  expect(screen.getByText('Archive is unavailable after a day has been distributed.')).toBeTruthy();
});

it('views a distributed day from the loaded copy without a new read or a dirty change', async () => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  const saved = collection(2);
  saved.worksheets[0].instructions = 'Read the directions.';
  saved.worksheets[0].questions.push({ localId: uuid(30), sectionId: 'main',
    question: 'Second question', item_type: 'true_false', options: [], points: 1 });
  saved.worksheets[0].answerKey.push({ localId: uuid(30), correct_answer: 'True' });
  load.mockResolvedValue({ ok: true, collection: saved });
  const client = distributionClient({ task_assignees: [{ task_id: uuid(10) }] });
  renderEditor({ client });
  await open();
  const monday = within(screen.getByRole('region', { name: 'Monday Worksheet' }));
  expect(await monday.findByText('Distributed')).toBeTruthy();
  expect(client.calls).toHaveLength(3);
  fireEvent.click(monday.getByRole('button', { name: 'View Monday' }));
  const dialog = screen.getByRole('dialog', { name: 'Monday worksheet (distributed)' });
  expect(within(dialog).getByText('Monday questions')).toBeTruthy();
  expect(within(dialog).getByText('Read the directions.')).toBeTruthy();
  expect(within(dialog).getByText('1. Question for Monday')).toBeTruthy();
  expect(within(dialog).getByText('2. Second question')).toBeTruthy();
  expect(within(dialog).getByText('Correct answer')).toBeTruthy();
  expect(within(dialog).getByText('Answer: True')).toBeTruthy();
  expect(within(dialog).queryByText(/This editor has unsaved changes/)).toBeNull();
  expect(dialog.querySelector('input, textarea, select')).toBeNull();
  expect(client.calls).toHaveLength(3);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close', exact: true }));
  expect(screen.queryByRole('dialog', { name: 'Monday worksheet (distributed)' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true);
  expect(update).not.toHaveBeenCalled();
});

it('shows the saved mode on each day card', async () => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  const saved = collection(2);
  saved.worksheets[0].checkingMode = 'auto';
  load.mockResolvedValue({ ok: true, collection: saved });
  renderEditor();
  await open();
  expect(within(screen.getByRole('region', { name: 'Monday Worksheet' })).getByText('Auto-check')).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Tuesday Worksheet' })).getByText('Manual check')).toBeTruthy();
});

it('keeps View available with unsaved edits and while saving', async () => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  let finishSave;
  update.mockImplementation(() => new Promise(resolve => { finishSave = resolve; }));
  const client = distributionClient({ task_assignees: [{ task_id: uuid(10) }] });
  renderEditor({ client });
  await open();
  const monday = within(screen.getByRole('region', { name: 'Monday Worksheet' }));
  await monday.findByText('Distributed');
  fireEvent.click(screen.getByRole('button', { name: 'Edit/Preview Tuesday' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit question' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Local Draft' }));
  fireEvent.click(monday.getByRole('button', { name: 'View Monday' }));
  expect(screen.getByText('This editor has unsaved changes, so this view may differ from what students received.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  expect(monday.getByRole('button', { name: 'View Monday' }).disabled).toBe(false);
  fireEvent.click(monday.getByRole('button', { name: 'View Monday' }));
  expect(screen.getByRole('dialog', { name: 'Monday worksheet (distributed)' })).toBeTruthy();
  await act(async () => { finishSave({ status: 'saved', receipt: { lockedDays: [1] } }); });
});

it('reads only ID columns scoped to the loaded five worksheets', async () => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  const client = distributionClient();
  renderEditor({ client });
  await open();
  await waitFor(() => expect(client.calls).toHaveLength(3));
  expect(client.calls.map(call => [call.table, call.columns, call.in, call.range])).toEqual([
    ['task_assignees', 'task_id', ['task_id', weekdays.map((_, i) => uuid(10 + i))], [0, 999]],
    ['worksheet_submissions', 'worksheet_id', ['worksheet_id', weekdays.map((_, i) => uuid(10 + i))], [0, 999]],
    ['worksheet_sections', 'worksheet_id', ['worksheet_id', weekdays.map((_, i) => uuid(10 + i))], [0, 999]],
  ]);
});

it('disables Save changes after a failed distribution-status read but keeps Distribute available', async () => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  const client = distributionClient({}, 'task_assignees');
  renderEditor({ client });
  await open();
  expect(await screen.findByText('Could not check which days are distributed. Reload the collection.')).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Monday Worksheet' }))
    .getByRole('button', { name: 'Distribute' }).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Edit/Preview Monday' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit question' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Local Draft' }));
  expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true);
  expect(update).not.toHaveBeenCalled();
});

it.each([
  [[], 'Changes saved'],
  [[1, 2], 'Saved. Distributed days were not changed: Monday, Tuesday.'],
])('reports saved lockedDays %j after reloading', async (lockedDays, expectedMessage) => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  load.mockResolvedValueOnce({ ok: true, collection: collection(2) })
    .mockResolvedValueOnce({ ok: true, collection: collection(3) });
  update.mockResolvedValue({ status: 'saved', code: null, message: '', receipt: { lockedDays } });
  renderEditor();
  await editMonday();
  fireEvent.click(screen.getByRole('button', { name: 'Save Local Draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText(expectedMessage)).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(2);
  if (!lockedDays.length) expect(screen.queryByText(/Distributed days were not changed/)).toBeNull();
});

it('rechecks distribution after success without reloading the collection', async () => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  const sectionId = uuid(50);
  const studentId = uuid(51);
  const rows = {
    task_assignees: [], schedules: [{ section_id: sectionId, teacher_id: teacherId }],
    sections: [{ id: sectionId, name: 'Handled 7', grade_level: '7' }],
    section_students: [{ section_id: sectionId, student_id: studentId, status: 'active' }],
    profiles: [{ id: studentId, name: 'Alice' }],
  };
  distribute.mockImplementation(async () => {
    rows.task_assignees.push({ task_id: uuid(11) });
    return { status: 'saved', receipt: { inserted: 1, alreadyAssigned: 0, assignedElsewhere: 0 } };
  });
  const client = distributionClient(rows);
  renderEditor({ client, onCollectionChanged: vi.fn().mockResolvedValue() });
  await open();
  const tuesday = within(screen.getByRole('region', { name: 'Tuesday Worksheet' }));
  fireEvent.click(tuesday.getByRole('button', { name: 'Distribute' }));
  await screen.findByRole('option', { name: 'Handled 7' });
  fireEvent.change(screen.getByLabelText('Section'), { target: { value: sectionId } });
  await screen.findByRole('checkbox', { name: 'Alice' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Alice' }));
  fireEvent.click(screen.getByRole('button', { name: 'Review and distribute' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Confirm distribution' }))
    .getByRole('button', { name: 'Distribute' }));
  expect(await tuesday.findByText('Distributed')).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(1);
  expect(tuesday.getByRole('button', { name: 'Distribute' }).disabled).toBe(false);
});

it('ignores a stale distribution read after loading another collection', async () => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '1');
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const oldClient = distributionClient({ task_assignees: [{ task_id: uuid(10) }] }, null,
    (call, result) => call.table === 'task_assignees' ? pending.then(() => result) : result);
  const newClient = distributionClient();
  const otherId = uuid(60);
  const next = collection(2);
  next.collectionId = otherId;
  next.worksheets = next.worksheets.map(day => ({ ...day, collectionId: otherId }));
  load.mockResolvedValueOnce({ ok: true, collection: collection(2) })
    .mockResolvedValueOnce({ ok: true, collection: next });
  const { rerender } = renderEditor({ client: oldClient, open: true });
  await waitFor(() => expect(oldClient.calls).toHaveLength(3));
  rerender(<SavedCollectionEditor {...props} client={newClient} collectionId={otherId} open />);
  await waitFor(() => expect(newClient.calls).toHaveLength(3));
  await act(async () => { release(); await pending; });
  expect(screen.queryByText('Distributed')).toBeNull();
  expect(screen.getByRole('button', { name: 'Archive collection' }).disabled).toBe(false);
});

it('keeps the flag-off editor output and skips distribution reads', async () => {
  vi.stubEnv('VITE_AI_WEEKLY_WORKSHEET_SAVE_ENABLED', '0');
  const client = distributionClient({ task_assignees: [{ task_id: uuid(10) }] });
  renderEditor({ client });
  await open();
  expect(client.from).not.toHaveBeenCalled();
  expect(screen.queryByText('Distributed')).toBeNull();
  expect(screen.queryByText('Archive is unavailable after a day has been distributed.')).toBeNull();
  expect(screen.queryByText('Manual check')).toBeNull();
  expect(screen.queryByText('Auto-check')).toBeNull();
  expect(screen.getByRole('button', { name: 'Edit/Preview Monday' }).disabled).toBe(false);
  expect(screen.queryByRole('button', { name: 'View Monday' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Archive collection' }).disabled).toBe(false);
});
