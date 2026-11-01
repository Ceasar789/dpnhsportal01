// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SavedDistributePanel from './SavedDistributePanel';

const { distribute } = vi.hoisted(() => ({ distribute: vi.fn() }));
vi.mock('../persistence/aiWeeklyWorksheetDistributeClient', () => ({
  distributeAiWeeklyCollection: distribute,
}));

const uuid = number => `${number.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
const collectionId = uuid(1);
const teacherId = uuid(2);
const handledId = uuid(3);
const advisedId = uuid(4);
const aliceId = uuid(5);
const bobId = uuid(6);
const inactiveId = uuid(7);
const defaultData = () => ({
  schedules: [{ section_id: handledId }],
  advised: [{ id: advisedId, name: 'Advised 7', grade_level: '7' }],
  scheduled: [{ id: handledId, name: 'Handled 7', grade_level: '7' }],
  members: [{ section_id: handledId, student_id: aliceId, status: 'active' },
    { section_id: handledId, student_id: bobId, status: 'active' },
    { section_id: handledId, student_id: inactiveId, status: 'inactive' },
    { section_id: advisedId, student_id: aliceId, status: 'active' }],
  profiles: [{ id: aliceId, name: 'Alice' }, { id: bobId, name: 'Bob' }],
});

function makeClient(data) {
  const calls = [];
  const from = vi.fn(table => {
    const call = { table, columns: '', eq: [], in: [], limit: null };
    calls.push(call);
    const query = {
      select(columns) { call.columns = columns; return query; },
      eq(column, value) { call.eq.push([column, value]); return query; },
      in(column, values) { call.in.push([column, values]); return query; },
      limit(value) { call.limit = value; return query; },
      then(resolve, reject) {
        let rows = table === 'schedules' ? data.schedules
          : table === 'sections' ? (call.in.length ? data.scheduled : data.advised)
            : table === 'section_students' ? data.members : data.profiles;
        if (table === 'section_students') {
          rows = rows.filter(row => call.eq.every(([column, value]) => row[column] === value));
        }
        if (table === 'profiles') rows = rows.filter(row => call.in[0][1].includes(row.id));
        if (call.limit !== null) rows = rows.slice(0, call.limit);
        return Promise.resolve(data.errorTable === table
          ? { data: null, error: { message: 'secret database text' } }
          : { data: rows, error: null }).then(resolve, reject);
      },
    };
    return query;
  });
  return { from, calls };
}

function renderPanel(data = defaultData(), extra = {}) {
  const client = makeClient(data);
  const onCollectionChanged = vi.fn().mockResolvedValue();
  const onDistributed = vi.fn();
  const onClose = vi.fn();
  const onReload = vi.fn();
  render(<SavedDistributePanel collectionId={collectionId} revision={2}
    dayNumber={2} dayName="Tuesday" worksheetTitle="Tuesday questions" client={client}
    teacherId={teacherId} apiBase="http://localhost:3001"
    onCollectionChanged={onCollectionChanged} onDistributed={onDistributed}
    onClose={onClose} onReload={onReload} {...extra} />);
  return { client, onCollectionChanged, onDistributed, onClose, onReload };
}
async function chooseSection(id = handledId) {
  await screen.findByRole('option', { name: id === handledId ? 'Handled 7' : 'Advised 7' });
  fireEvent.change(screen.getByLabelText('Section'), { target: { value: id } });
}
async function selectAlice() {
  await screen.findByText('Alice');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Alice' }));
}
function confirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Review and distribute' }));
  return screen.getByRole('dialog', { name: 'Confirm distribution' });
}

beforeEach(() => {
  distribute.mockReset().mockResolvedValue({ status: 'saved', receipt: {
    inserted: 1, alreadyAssigned: 0, assignedElsewhere: 0 } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('lists handled and advised sections using the existing three read shapes', async () => {
  const { client } = renderPanel();
  await screen.findByRole('option', { name: 'Handled 7' });
  expect(screen.getByRole('option', { name: 'Advised 7' })).toBeTruthy();
  expect(client.calls.map(call => [call.table, call.columns])).toEqual([
    ['schedules', 'section_id'], ['sections', 'id, name, grade_level'],
    ['sections', 'id, name, grade_level']]);
  expect(client.calls[0].eq).toEqual([['teacher_id', teacherId]]);
  expect(client.calls[1].eq).toEqual([['adviser_id', teacherId]]);
  expect(client.calls[2].in).toEqual([['id', [handledId]]]);
  expect(client.calls.some(call => call.table === 'section_students')).toBe(false);
});

it('loads only active students and supports manual row selection with a live count', async () => {
  const { client } = renderPanel();
  await chooseSection();
  expect(await screen.findByText('Alice')).toBeTruthy();
  expect(screen.getByText('Bob')).toBeTruthy();
  expect(screen.queryByText('Inactive')).toBeNull();
  const rosterCall = client.calls.find(call => call.table === 'section_students');
  expect(rosterCall.columns).toBe('student_id');
  expect(rosterCall.eq).toEqual([['section_id', handledId], ['status', 'active']]);
  expect(rosterCall.limit).toBe(201);
  expect(client.calls.find(call => call.table === 'profiles').in)
    .toEqual([['id', [aliceId, bobId]]]);
  expect(screen.getByText('0 selected')).toBeTruthy();
  expect(screen.queryByRole('checkbox', { name: 'Select all' })).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Alice' }));
  expect(screen.getByRole('checkbox', { name: 'Alice' }).checked).toBe(true);
  expect(screen.getByRole('checkbox', { name: 'Bob' }).checked).toBe(false);
  expect(screen.getByText('1 selected')).toBeTruthy();
  fireEvent.click(screen.getByText('Bob'));
  expect(screen.getByRole('checkbox', { name: 'Bob' }).checked).toBe(true);
  expect(screen.getByText('2 selected')).toBeTruthy();
  fireEvent.click(screen.getByText('Alice'));
  expect(screen.getByRole('checkbox', { name: 'Alice' }).checked).toBe(false);
  expect(screen.getByText('1 selected')).toBeTruthy();
});

it('shows the Tuesday modal without day checkboxes and cancel makes no call', async () => {
  renderPanel();
  const modal = screen.getByRole('dialog', { name: 'Distribute Tuesday worksheet' });
  expect(within(modal).getByText('Tuesday questions')).toBeTruthy();
  expect(screen.queryByText('Worksheet days')).toBeNull();
  expect(screen.queryByRole('checkbox', { name: 'Monday' })).toBeNull();
  await chooseSection();
  await selectAlice();
  expect(confirm().textContent).toContain('Day: Tuesday');
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Confirm distribution' }))
    .getByRole('button', { name: 'Cancel' }));
  expect(distribute).not.toHaveBeenCalled();
});

it('maps Manila date and time to +08:00 and empty to null, while refusing the past', async () => {
  renderPanel();
  await chooseSection();
  await selectAlice();
  const due = screen.getByLabelText('Due date and time (optional, Manila time)');
  expect(due.type).toBe('datetime-local');
  expect(due.min).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  fireEvent.change(due, { target: { value: '2020-01-01T12:30' } });
  expect(screen.getByText('Due date and time must be in the future in Manila.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Review and distribute' }).disabled).toBe(true);
  fireEvent.change(due, { target: { value: '2099-12-31T13:45' } });
  const dialog = confirm();
  expect(dialog.textContent).toContain('Due date and time: 2099-12-31 13:45 Manila time');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Distribute' }));
  await waitFor(() => expect(distribute).toHaveBeenCalledWith('http://localhost:3001', {
    collectionId, expectedRevision: 2, sectionId: handledId,
    days: [2], studentIds: [aliceId], dueAt: '2099-12-31T13:45:00+08:00' }));
  cleanup();
  distribute.mockClear();
  renderPanel();
  await chooseSection();
  await selectAlice();
  fireEvent.click(within(confirm()).getByRole('button', { name: 'Distribute' }));
  await waitFor(() => expect(distribute.mock.calls[0][1].dueAt).toBeNull());
});

it('uses Manila midnight rather than the browser clock for the minimum due time', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-01-01T15:59:30Z'));
  renderPanel();
  await chooseSection();
  await selectAlice();
  const due = screen.getByLabelText('Due date and time (optional, Manila time)');
  expect(due.min).toBe('2030-01-02T00:00');
  fireEvent.change(due, { target: { value: '2030-01-01T23:59' } });
  expect(screen.getByRole('button', { name: 'Review and distribute' }).disabled).toBe(true);
  fireEvent.change(due, { target: { value: '2030-01-02T00:01' } });
  expect(screen.getByRole('button', { name: 'Review and distribute' }).disabled).toBe(false);
});

it('shows the lock warning, cancels without a call, then confirms exactly once and closes', async () => {
  const { onCollectionChanged, onDistributed, onClose } = renderPanel();
  let finishRefresh;
  onCollectionChanged.mockReturnValue(new Promise(resolve => { finishRefresh = resolve; }));
  await chooseSection();
  await screen.findByText('Alice');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Alice' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Bob' }));
  const dialog = confirm();
  expect(dialog.textContent).toContain('Day: Tuesday');
  expect(dialog.textContent).toContain('Section: Handled 7');
  expect(dialog.textContent).toContain('Students: 2');
  expect(dialog.textContent).toContain('Due date and time: No deadline');
  expect(dialog.textContent).toContain('After distributing, this day is locked: its questions can no longer be edited, and the collection can no longer be archived.');
  expect(dialog.textContent).not.toContain('Checking:');
  expect(dialog.textContent).not.toContain('Change this in Edit/Preview before distributing.');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(distribute).not.toHaveBeenCalled();
  const again = confirm();
  const button = within(again).getByRole('button', { name: 'Distribute' });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(distribute).toHaveBeenCalledTimes(1));
  expect(onClose).not.toHaveBeenCalled();
  finishRefresh();
  await waitFor(() => expect(onCollectionChanged).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(onDistributed).toHaveBeenCalledWith('Distributed: 1 new, 0 already assigned'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it.each([
  ['auto', true, 'Checking: Auto-check.', true],
  ['manual', false, 'Checking: Manual check.', false],
])('adds checking guidance for %s with modeEditable=%s', async (checkingMode, modeEditable, sentence, hint) => {
  renderPanel(defaultData(), { checkingMode, modeEditable });
  await chooseSection();
  await selectAlice();
  const dialog = confirm();
  expect(dialog.textContent).toContain(sentence);
  expect(dialog.textContent.includes('Change this in Edit/Preview before distributing.')).toBe(hint);
  expect(dialog.textContent).toContain('After distributing, this day is locked: its questions can no longer be edited, and the collection can no longer be archived.');
});

it('reports students already assigned under another section after a confirmed save', async () => {
  distribute.mockResolvedValue({ status: 'saved', receipt: {
    inserted: 0, alreadyAssigned: 1, assignedElsewhere: 1 } });
  const { onDistributed } = renderPanel();
  await chooseSection();
  await selectAlice();
  fireEvent.click(within(confirm()).getByRole('button', { name: 'Distribute' }));
  await waitFor(() => expect(onDistributed).toHaveBeenCalledWith(
    'Distributed: 0 new, 1 already assigned. 1 were already assigned under another section'));
});

it.each(['revision_conflict', 'collection_archived'])(
  'keeps %s failures open with the fixed message and offers Reload', async code => {
  distribute.mockResolvedValue({ status: 'failed', code,
    message: 'Fixed distribution failure.' });
  const { onClose, onReload } = renderPanel();
  await chooseSection();
  await selectAlice();
  fireEvent.click(within(confirm()).getByRole('button', { name: 'Distribute' }));
  expect(await screen.findByText('Fixed distribution failure.')).toBeTruthy();
  expect(screen.getByRole('dialog', { name: 'Distribute Tuesday worksheet' })).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reload collection' }));
  expect(onReload).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Review and distribute' }).disabled).toBe(false);
});

it('shows unknown detail and locks distribution until the modal is closed', async () => {
  distribute.mockResolvedValue({ status: 'unknown',
    message: 'Could not confirm the change. Reload the collection before trying again.',
    detail: 'timeout' });
  const { onClose } = renderPanel();
  await chooseSection();
  await selectAlice();
  fireEvent.click(within(confirm()).getByRole('button', { name: 'Distribute' }));
  expect(await screen.findByText(/Could not confirm the change/)).toBeTruthy();
  expect(screen.getByText('Details: timeout')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Review and distribute' }).disabled).toBe(true);
  expect(distribute).toHaveBeenCalledTimes(1);
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Distribute Tuesday worksheet' }))
    .getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('blocks a 201-row roster instead of truncating it', async () => {
  const data = defaultData();
  data.members = Array.from({ length: 201 }, (_, index) => ({
    section_id: handledId, student_id: uuid(100 + index), status: 'active' }));
  const { client } = renderPanel(data);
  await chooseSection();
  expect(await screen.findByText('This section has more than 200 students. Distributing to groups this large is not supported yet.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Review and distribute' }).disabled).toBe(true);
  expect(client.calls.some(call => call.table === 'profiles')).toBe(false);
});

it('blocks distribution when a student name is missing or the profile read fails', async () => {
  for (const data of [{ ...defaultData(), profiles: [{ id: aliceId, name: 'Alice' }] },
    { ...defaultData(), errorTable: 'profiles' },
    { ...defaultData(), profiles: [{ id: aliceId, name: 'Alice' }, { id: bobId, name: bobId }] }]) {
    renderPanel(data);
    await chooseSection();
    expect(await screen.findByText('Could not read every student name. Distribution is unavailable.')).toBeTruthy();
    expect(screen.queryByText(bobId)).toBeNull();
    expect(screen.getByRole('button', { name: 'Review and distribute' }).disabled).toBe(true);
    cleanup();
  }
});
