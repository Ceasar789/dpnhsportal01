// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// profile / student / history: what each read returns. update: what the save returns.
const h = vi.hoisted(() => ({ calls: [], ctx: null, profile: null, student: null, history: null, update: null }));

const query = (table) => {
  const state = { table, method: 'select', payload: null, filters: [] };
  const api = {
    select() { return api; },
    update(payload) { state.method = 'update'; state.payload = payload; return api; },
    eq(column, value) { state.filters.push([column, value]); return api; },
    maybeSingle() { return api; },
    then(resolve, reject) {
      h.calls.push({ ...state, filters: [...state.filters] });
      let result = { data: null, error: null };
      if (state.method === 'update') result = h.update;
      else if (table === 'profiles') result = h.profile;
      else if (table === 'students') result = h.student;
      else if (table === 'section_students') result = h.history;
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return api;
};

vi.mock('../../../../config/supabase', () => ({ supabase: { from: vi.fn(table => query(table)) } }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: async fn => fn() }));
vi.mock('../AdminContext', () => ({ useAdminContext: () => h.ctx }));

const { default: StudentProfileSheet } = await import('./StudentProfileSheet');

const ANA = { id: 'ana', name: 'Ana Reyes', email: 'ana@example.test' };
const section = (id, name, grade, year) => ({ id, name, grade_level: grade, school_year: year });
const HISTORY = [
  { id: 'h1', status: 'dropped', enrollment_date: '2024-06-10', section: section('s1', '7-Rizal', 'Grade 7', '2024-2025') },
  { id: 'h3', status: 'active', enrollment_date: '2026-06-09', section: section('s3', '9-Luna', 'Grade 9', '2026-2027') },
  { id: 'h2', status: 'transferred', enrollment_date: '2025-06-11', section: section('s2', '8-Mabini', 'Grade 8', '2025-2026') },
  { id: 'h0', status: 'graduated', enrollment_date: '2023-06-12', section: section('s0', '6-Old', 'Grade 6', '2023-2024') },
];

const renderSheet = async () => {
  const onClose = vi.fn();
  render(<StudentProfileSheet student={ANA} onClose={onClose} />);
  await waitFor(() => expect(screen.queryByText('Loading profile…')).toBeNull());
  return { onClose };
};
const pairValue = label => screen.getByText(label, { selector: 'dt' }).nextElementSibling.textContent;
const updates = () => h.calls.filter(c => c.method === 'update');
const openEditor = () => fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
const save = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save details' })); }); };

beforeEach(() => {
  h.calls.length = 0;
  h.ctx = { schoolYear: '2026-2027', showToast: vi.fn() };
  h.profile = { data: { id: 'ana', name: 'Ana Reyes', email: 'ana@example.test', status: 'active' }, error: null };
  h.student = { data: { id: 'ana', lrn: null, student_number: '', student_status: null, year_level: null }, error: null };
  h.history = { data: HISTORY, error: null };
  h.update = { data: [{ id: 'ana' }], error: null };
});
afterEach(cleanup);

describe('student profile: details', () => {
  it('names the dialog and shows the header and empty fields as "Not set"', async () => {
    await renderSheet();
    expect(screen.getByRole('dialog', { name: 'Student profile: Ana Reyes' })).toBeTruthy();
    expect(pairValue('Email')).toBe('ana@example.test');
    expect(pairValue('Account status')).toBe('Active');
    expect(pairValue('LRN')).toBe('Not set');
    expect(pairValue('Student number')).toBe('Not set');
    expect(pairValue('Student status')).toBe('Not set');
    expect(screen.queryByText('Year level', { selector: 'dt' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/null|undefined/);
  });

  it('shows the values when they are set', async () => {
    h.student = { data: { id: 'ana', lrn: '108123456789', student_number: '2026-0001', student_status: 'Regular', year_level: 'Grade 9' }, error: null };
    await renderSheet();
    expect(pairValue('LRN')).toBe('108123456789');
    expect(pairValue('Student number')).toBe('2026-0001');
    expect(pairValue('Student status')).toBe('Regular');
    expect(pairValue('Year level')).toBe('Grade 9');
  });

  it('reads the history across all years with one read, by student only', async () => {
    await renderSheet();
    const reads = h.calls.filter(c => c.table === 'section_students');
    expect(reads).toHaveLength(1);
    expect(reads[0].filters).toEqual([['student_id', 'ana']]);
  });

  it('lists the history newest school year first, with plain statuses, and the current section', async () => {
    await renderSheet();
    const items = within(screen.getByRole('list', { name: 'Enrollment history' })).getAllByRole('listitem').map(li => li.textContent);
    expect(items).toEqual([
      '9-Luna · Grade 9 · 2026-2027Active · Enrolled Jun 9, 2026',
      '8-Mabini · Grade 8 · 2025-2026Transferred · Enrolled Jun 11, 2025',
      '7-Rizal · Grade 7 · 2024-2025Dropped · Enrolled Jun 10, 2024',
      '6-Old · Grade 6 · 2023-2024Graduated · Enrolled Jun 12, 2023',
    ]);
    expect(within(screen.getByRole('list', { name: 'Current section' })).getByRole('listitem').textContent).toBe('9-Luna · Grade 9');
  });

  it('a failed history read shows an error with Retry, never an empty history', async () => {
    h.history = { data: null, error: { message: 'boom' } };
    await renderSheet();
    expect(screen.getByText('Could not load the enrollment history.')).toBeTruthy();
    expect(screen.queryByText('No enrollment history yet.')).toBeNull();
    expect(screen.queryByText('No active section this school year.')).toBeNull();
    h.history = { data: HISTORY, error: null };
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    await waitFor(() => expect(screen.getByRole('list', { name: 'Enrollment history' })).toBeTruthy());
  });

  it('with no students row it says so and hides the editor', async () => {
    h.student = { data: null, error: null };
    h.history = { data: [], error: null };
    await renderSheet();
    expect(screen.getByText('Not enrolled in any section yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull();
  });

  it('Close is a named button and closes the sheet', async () => {
    const { onClose } = await renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('student profile: editing LRN and status', () => {
  it('offers exactly Not set and the four CHECK values', async () => {
    await renderSheet();
    openEditor();
    const options = within(screen.getByLabelText('Student status')).getAllByRole('option').map(o => [o.value, o.textContent]);
    expect(options).toEqual([['', 'Not set'], ['Regular', 'Regular'], ['Irregular', 'Irregular'], ['Transferee', 'Transferee'], ['Returnee', 'Returnee']]);
    expect(screen.getByText('Exactly 12 digits. Leave empty to clear the LRN.')).toBeTruthy();
  });

  it.each(['12345', '1234567890123', '10812345678a'])('rejects LRN "%s" without saving', async (value) => {
    await renderSheet();
    openEditor();
    fireEvent.change(screen.getByLabelText('LRN'), { target: { value } });
    await save();
    expect(screen.getByText('Enter exactly 12 digits, or leave the LRN empty.')).toBeTruthy();
    expect(updates()).toHaveLength(0);
  });

  it('saves only lrn and student_status on this student, then refreshes', async () => {
    await renderSheet();
    openEditor();
    fireEvent.change(screen.getByLabelText('LRN'), { target: { value: ' 108123456789 ' } });
    fireEvent.change(screen.getByLabelText('Student status'), { target: { value: 'Transferee' } });
    h.student = { data: { id: 'ana', lrn: '108123456789', student_number: null, student_status: 'Transferee', year_level: null }, error: null };
    await save();
    expect(updates()).toHaveLength(1);
    expect(updates()[0].table).toBe('students');
    expect(updates()[0].payload).toEqual({ lrn: '108123456789', student_status: 'Transferee' });
    expect(updates()[0].filters).toEqual([['id', 'ana']]);
    expect(h.ctx.showToast).toHaveBeenCalledWith('Student details saved');
    await waitFor(() => expect(pairValue('Student status')).toBe('Transferee'));
    expect(pairValue('LRN')).toBe('108123456789');
  });

  it('an empty LRN and "Not set" status save as null, never an empty string', async () => {
    h.student = { data: { id: 'ana', lrn: '108123456789', student_number: null, student_status: 'Regular', year_level: null }, error: null };
    await renderSheet();
    openEditor();
    fireEvent.change(screen.getByLabelText('LRN'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Student status'), { target: { value: '' } });
    await save();
    expect(updates()[0].payload).toEqual({ lrn: null, student_status: null });
  });

  it.each([
    ['a duplicate LRN', { code: '23505', message: 'duplicate key value violates unique constraint "students_lrn_key"' }, 'This LRN is already used by another student.'],
    ['a CHECK violation', { code: '23514', message: 'new row violates check constraint "students_student_status_check"' }, 'This status is not accepted by the database.'],
  ])('%s shows a plain message and changes nothing on screen', async (_label, error, message) => {
    h.student = { data: { id: 'ana', lrn: '108123456789', student_number: null, student_status: 'Regular', year_level: null }, error: null };
    await renderSheet();
    openEditor();
    fireEvent.change(screen.getByLabelText('LRN'), { target: { value: '108123456790' } });
    h.update = { data: null, error };
    const readsBefore = h.calls.filter(c => c.method === 'select').length;
    await save();
    expect(h.ctx.showToast).toHaveBeenCalledWith(message, 'error');
    expect(JSON.stringify(h.ctx.showToast.mock.calls)).not.toMatch(/constraint/);
    expect(h.calls.filter(c => c.method === 'select').length).toBe(readsBefore);
    expect(screen.getByLabelText('LRN').value).toBe('108123456790');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(pairValue('LRN')).toBe('108123456789');
  });
});
