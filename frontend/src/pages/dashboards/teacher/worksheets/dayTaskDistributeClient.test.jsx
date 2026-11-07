// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

const db = vi.hoisted(() => ({ rpc: vi.fn(), meta: null, metaError: null, notifyError: null, tables: [], writes: [] }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1' } }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../../../../config/supabase', () => ({
  supabase: {
    rpc: (...args) => db.rpc(...args),
    from: (table) => {
      db.tables.push(table);
      const write = (kind, rows) => {
        db.writes.push({ table, kind, rows });
        return Promise.resolve({ error: table === 'notifications' ? db.notifyError : null });
      };
      const query = {
        select: () => query, eq: () => query, in: () => query, range: () => query,
        single: () => Promise.resolve({ data: table === 'school_settings' ? { school_year: '2030-2031' } : null, error: null }),
        maybeSingle: () => Promise.resolve({ data: db.meta, error: db.metaError }),
        then: resolve => Promise.resolve({ data: [], error: null }).then(resolve),
        insert: rows => write('insert', rows),
        upsert: rows => write('upsert', rows),
        update: rows => write('update', rows),
      };
      return query;
    },
  },
}));

import { distributeDayTask, manilaTimestamp } from './dayTaskDistributeClient';
import { useWorksheetAssessment } from './useWorksheetAssessment';

const WORKSHEET = 'aaaaaaaa-1111-4111-8111-111111111111';
const SECTION = 'bbbbbbbb-2222-4222-8222-222222222222';
const request = { worksheetId: WORKSHEET, sectionId: SECTION, studentIds: ['s1', 's2'],
  dueAt: '2030-11-01T23:59:00', checkingMode: 'auto' };
const receipt = (extra = {}) => ({ ok: true, durable: true, worksheetId: WORKSHEET, sectionId: SECTION, requested: 2,
  added: ['s1', 's2'], alreadyAssigned: [], assignedElsewhere: [], checkingMode: 'auto', ...extra });
const clientWith = result => ({ rpc: vi.fn().mockResolvedValue(result) });
const send = (client, extra = {}) => distributeDayTask({ ...request, ...extra }, { client });

afterEach(() => cleanup());

describe('distributeDayTask', () => {
  it('sends one RPC with the contract parameter names', async () => {
    const client = clientWith({ data: receipt(), error: null });
    await send(client);
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith('eduscribe_day_task_distribute_v1', {
      p_worksheet_id: WORKSHEET, p_section_id: SECTION, p_student_ids: ['s1', 's2'],
      p_due_at: '2030-11-01T23:59:00+08:00', p_checking_mode: 'auto',
    });
  });

  it('adds the Manila offset to a value with or without seconds', () => {
    expect(manilaTimestamp('2030-11-01T23:59:00')).toBe('2030-11-01T23:59:00+08:00');
    expect(manilaTimestamp('2030-11-01T23:59:30')).toBe('2030-11-01T23:59:30+08:00');
    expect(manilaTimestamp('2030-11-01T23:59')).toBe('2030-11-01T23:59:00+08:00');
  });

  it('refuses a value that is not plain wall-clock time, without calling the database', async () => {
    for (const dueAt of ['2030-11-01T23:59:00Z', '2030-11-01T23:59:00+08:00', '2030-11-01', 'soon', '', null, undefined]) {
      expect(manilaTimestamp(dueAt)).toBeNull();
      const client = clientWith({ data: receipt(), error: null });
      expect(await send(client, { dueAt })).toEqual({ ok: false, code: 'invalid_due_date', message: 'Choose a due date and time in the future.' });
      expect(client.rpc).not.toHaveBeenCalled();
    }
  });

  it('returns a valid receipt, accepting ids in another case', async () => {
    const data = receipt({ worksheetId: WORKSHEET.toUpperCase(), added: ['s1'], alreadyAssigned: ['s2'] });
    expect(await send(clientWith({ data, error: null }))).toEqual({ ok: true, receipt: data });
  });

  it.each([
    ['null', null], ['not ok', receipt({ ok: false })], ['not durable', receipt({ durable: false })],
    ['another worksheet', receipt({ worksheetId: SECTION })], ['another section', receipt({ sectionId: WORKSHEET })],
    ['no requested count', receipt({ requested: '2' })], ['no added list', receipt({ added: undefined })],
    ['added not ids', receipt({ added: [1] })], ['no alreadyAssigned list', receipt({ alreadyAssigned: 'none' })],
    ['no assignedElsewhere list', receipt({ assignedElsewhere: null })],
  ])('refuses a bad receipt: %s', async (_name, data) => {
    expect(await send(clientWith({ data, error: null }))).toEqual({ ok: false, code: 'unknown',
      message: 'The task could not be distributed. Check who has it before trying again.' });
  });

  it.each([
    ['not_authenticated', 'Your session has ended. Sign in again before distributing.'],
    ['inactive_teacher', 'This account cannot distribute tasks.'],
    ['not_found', 'This task was not found. Refresh and try again.'],
    ['invalid_document', 'This task is not ready to distribute. Check that it has content.'],
    ['section_not_allowed', 'You cannot distribute to this section.'],
    ['invalid_student_list', 'Choose between 1 and 200 students.'],
    ['student_not_in_section', 'One or more students are not active members of this section.'],
    ['invalid_due_date', 'Choose a due date and time in the future.'],
    ['invalid_checking_mode', 'That checking mode is not available for this task.'],
    ['checking_mode_locked', 'The checking mode cannot change after the task has been distributed.'],
  ])('maps %s to its message', async (code, message) => {
    expect(await send(clientWith({ data: null, error: { message: code } }))).toEqual({ ok: false, code, message });
  });

  it('never shows a raw database message', async () => {
    const raw = 'duplicate key value violates unique constraint "SECRET_INTERNAL_NAME"';
    const result = await send(clientWith({ data: null, error: { message: raw, code: '23505', details: raw } }));
    expect(result).toEqual({ ok: false, code: 'unknown', message: 'The task could not be distributed. Check who has it before trying again.' });
    expect(JSON.stringify(result)).not.toContain('SECRET_INTERNAL_NAME');
  });

  it('ignores inherited property names as codes', async () => {
    expect((await send(clientWith({ data: null, error: { message: 'constructor' } }))).code).toBe('unknown');
  });

  it('maps a network failure, returned or thrown, without its raw text', async () => {
    const message = 'The server could not be reached. Check your connection, then check who has this task before trying again.';
    const returned = await send(clientWith({ data: null, error: { message: 'TypeError: Failed to fetch' } }));
    expect(returned).toEqual({ ok: false, code: 'network', message });
    const thrown = await send({ rpc: vi.fn().mockRejectedValue(new Error('RAW-SOCKET-TEXT')) });
    expect(thrown).toEqual({ ok: false, code: 'network', message });
  });
});

describe('distributeTask', () => {
  const task = ['worksheet-id', 'section-id', ['s1', 's2', 's3'], '2030-11-01T23:59:00'];
  const hookReceipt = (extra = {}) => receipt({ worksheetId: 'worksheet-id', sectionId: 'section-id', requested: 3, ...extra });
  const rpcTakes = (data) => db.rpc.mockResolvedValue({ data, error: null });
  const hook = async (options) => {
    const view = renderHook(() => useWorksheetAssessment(vi.fn(), options));
    await waitFor(() => expect(view.result.current.subjectLoading).toBe(false));
    db.tables.length = 0;
    return view.result.current;
  };
  const enabled = () => hook({ distributionEnabled: true });
  const notifications = () => db.writes.filter(write => write.table === 'notifications');

  beforeEach(() => {
    db.rpc.mockReset();
    db.meta = { title: 'Cells Quiz', task_type: 'quiz', checking_mode: 'auto' };
    db.metaError = null;
    db.notifyError = null;
    db.writes.length = 0;
  });

  it('with the flag off it refuses and calls nothing', async () => {
    const assessment = await hook();
    const response = await assessment.distributeTask(...task);
    expect(response).toEqual({ ok: false, message: 'Distribution is unavailable until trusted authorization is connected. No students were assigned.' });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.tables).toEqual([]);
  });

  it('keeps the section, deadline and student checks', async () => {
    const assessment = await enabled();
    expect((await assessment.distributeTask('w', '', ['s1'], task[3])).message).toBe('Pick a section first.');
    expect((await assessment.distributeTask('w', 's', ['s1'], null)).message).toBe('Set a deadline first.');
    expect((await assessment.distributeTask('w', 's', [], task[3])).message).toBe('Tick at least one student.');
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('makes one RPC and never writes the section posting or assignees directly', async () => {
    rpcTakes(hookReceipt());
    const assessment = await enabled();
    await assessment.distributeTask(...task);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc.mock.calls[0][1]).toMatchObject({ p_worksheet_id: 'worksheet-id', p_section_id: 'section-id',
      p_student_ids: ['s1', 's2', 's3'], p_due_at: '2030-11-01T23:59:00+08:00' });
    expect(db.writes.filter(write => ['worksheet_sections', 'task_assignees'].includes(write.table))).toEqual([]);
  });

  it('sends the stored checking mode, unless one is given', async () => {
    rpcTakes(hookReceipt());
    const assessment = await enabled();
    await assessment.distributeTask(...task);
    expect(db.rpc.mock.calls[0][1].p_checking_mode).toBe('auto');
    await assessment.distributeTask(...task, 'manual');
    expect(db.rpc.mock.calls[1][1].p_checking_mode).toBe('manual');
  });

  it('notifies only the added ids and returns the modal shape', async () => {
    rpcTakes(hookReceipt({ added: ['s1'], alreadyAssigned: ['s2'], assignedElsewhere: ['s3'] }));
    const assessment = await enabled();
    const response = await assessment.distributeTask(...task);
    expect(response).toEqual({ ok: true, added: ['s1'], skipped: 2, message: '', notified: true });
    expect(notifications()).toHaveLength(1);
    expect(notifications()[0].rows.map(row => row.user_id)).toEqual(['s1']);
    expect(notifications()[0].rows[0]).toMatchObject({ title: 'Quiz', related_entity_id: 'worksheet-id' });
    expect(notifications()[0].rows[0].message).toContain('"Cells Quiz" is due');
  });

  it('a failed notification does not fail the distribution', async () => {
    rpcTakes(hookReceipt());
    db.notifyError = { message: 'denied' };
    const assessment = await enabled();
    const response = await assessment.distributeTask(...task);
    expect(response).toMatchObject({ ok: true, added: ['s1', 's2'], notified: false });
  });

  it('reports nothing added the way the modal expects, and notifies nobody', async () => {
    rpcTakes(hookReceipt({ added: [], alreadyAssigned: ['s1', 's2', 's3'] }));
    const assessment = await enabled();
    expect(await assessment.distributeTask(...task)).toEqual({ ok: true, added: [], skipped: 3, postingSaved: true,
      message: 'Everyone ticked already has this task.' });
    expect(notifications()).toEqual([]);
  });

  it('passes a failure message on, with no posting claim and no notification', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'section_not_allowed' } });
    const assessment = await enabled();
    expect(await assessment.distributeTask(...task)).toEqual({ ok: false, message: 'You cannot distribute to this section.' });
    expect(notifications()).toEqual([]);
  });

  it('sends nothing when the task cannot be read', async () => {
    for (const [meta, metaError] of [[null, null], [null, { message: 'RAW-READ-TEXT' }]]) {
      db.meta = meta;
      db.metaError = metaError;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const assessment = await enabled();
      expect(await assessment.distributeTask(...task)).toEqual({ ok: false, message: 'Could not check this task — nothing was sent.' });
      expect(db.rpc).not.toHaveBeenCalled();
      warn.mockRestore();
    }
  });

  it('refreshes the postings and counts after a distribution', async () => {
    rpcTakes(hookReceipt());
    const assessment = await enabled();
    await assessment.distributeTask(...task);
    expect(db.tables).toEqual(expect.arrayContaining(['worksheet_sections', 'task_assignees']));
  });
});
