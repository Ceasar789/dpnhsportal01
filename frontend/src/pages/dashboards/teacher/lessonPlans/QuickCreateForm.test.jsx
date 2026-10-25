// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QuickCreateForm from './QuickCreateForm';

const rows = [
  { subject_id: 'math', grade_level: 'Grade 7', subjects: { id: 'math', name: 'Mathematics' } },
  { subject_id: 'math', grade_level: 'Grade 8', subjects: { id: 'math', name: 'Mathematics' } },
  { subject_id: 'english', grade_level: 'Grade 7', subjects: { id: 'english', name: 'English' } },
];
const props = { teacherId: 'synthetic-teacher', sourceTeacherId: 'synthetic-teacher', schoolYear: '2026-2027', sourceSchoolYear: '2026-2027',
  assignmentRows: rows, loadState: 'ready', onRetry: vi.fn(), onMockCreate: vi.fn(async () => {}) };
const mount = overrides => render(<QuickCreateForm {...props} {...overrides} />);

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('isolated Quick Create form', () => {
  it('creates only a temporary payload after valid assigned fields and preserves custom strategy and objectives', async () => {
    const handler = vi.fn(() => true);
    mount({ onMockCreate: undefined, onTemporaryCreate: handler, assignmentRows: [rows[2]] });
    const action = screen.getByRole('button', { name: 'Create Temporary Draft' });
    expect(action.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson Plan Title *' }), { target: { value: 'Cells' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Class Duration (minutes per session)' }), { target: { value: '45' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Teaching Strategy' }), { target: { value: 'custom' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom Teaching Strategy' }), { target: { value: 'Peer instruction' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Learning Objectives' }), { target: { value: 'Describe cells\nCompare cells' } });
    expect(action.disabled).toBe(false);
    fireEvent.click(action);
    await waitFor(() => expect(handler).toHaveBeenCalledOnce());
    expect(handler.mock.calls[0][0]).toMatchObject({ title: 'Cells', subject_id: 'english', grade_level: 'Grade 7',
      duration: '45 minutes', strategy: 'Peer instruction', objectives: 'Describe cells\nCompare cells' });
  });

  it('blocks temporary creation for an invalid pair, empty load, or failed assignment read', () => {
    const handler = vi.fn();
    const view = mount({ onMockCreate: undefined, onTemporaryCreate: handler, assignmentRows: rows });
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson Plan Title *' }), { target: { value: 'Draft' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Assigned Subject *' }), { target: { value: 'math' } });
    expect(screen.getByRole('button', { name: 'Create Temporary Draft' }).disabled).toBe(true);
    view.rerender(<QuickCreateForm {...props} onMockCreate={undefined} onTemporaryCreate={handler} assignmentRows={[]} />);
    expect(screen.getByRole('button', { name: 'Create Temporary Draft' }).disabled).toBe(true);
    view.rerender(<QuickCreateForm {...props} onMockCreate={undefined} onTemporaryCreate={handler} loadState="error" />);
    expect(screen.getByRole('button', { name: 'Create Temporary Draft' }).disabled).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('QC6.1 shows one objectives heading while retaining the textarea name and multiline draft', () => {
    mount({ assignmentRows: [rows[2]], onMockCreate: undefined });
    expect(screen.getAllByText('Learning Objectives')).toHaveLength(1);
    const objectives = screen.getByRole('textbox', { name: 'Learning Objectives' });
    expect(objectives.getAttribute('aria-describedby')).toBe('qc-objectives-help');
    fireEvent.change(objectives, { target: { value: 'Explain cells\nCompare tissues' } });
    expect(objectives.value).toBe('Explain cells\nCompare tissues');
    expect(screen.getByRole('button', { name: 'Create plan' }).disabled).toBe(true);
  });
  it('QC-01 auto-selects a single valid subject and grade', () => {
    mount({ assignmentRows: [rows[2]] });
    expect(screen.getByRole('combobox', { name: 'Assigned Subject *' }).value).toBe('english');
    expect(screen.getByRole('combobox', { name: 'Assigned Grade Level *' }).value).toBe('Grade 7');
    expect(screen.getByRole('button', { name: 'Preview mock create' }).disabled).toBe(false);
  });

  it('QC-02 QC-03 changes subject and clears a stale grade choice', () => {
    mount();
    fireEvent.change(screen.getByRole('combobox', { name: 'Assigned Subject *' }), { target: { value: 'math' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Assigned Grade Level *' }), { target: { value: 'Grade 8' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Assigned Subject *' }), { target: { value: 'english' } });
    expect(screen.getByRole('combobox', { name: 'Assigned Grade Level *' }).value).toBe('Grade 7');
    fireEvent.change(screen.getByRole('combobox', { name: 'Assigned Subject *' }), { target: { value: 'math' } });
    expect(screen.getByRole('combobox', { name: 'Assigned Grade Level *' }).value).toBe('');
    expect(screen.getByRole('button', { name: 'Preview mock create' }).disabled).toBe(true);
  });

  it('QC-04 QC-05 QC-06 loading and fetch failure block create; retry receives new rows', () => {
    const view = mount({ loadState: 'loading' });
    expect(screen.getByRole('button', { name: 'Preview mock create' }).disabled).toBe(true);
    view.rerender(<QuickCreateForm {...props} loadState="error" />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRetry).toHaveBeenCalled();
    view.rerender(<QuickCreateForm {...props} assignmentRows={[rows[2]]} />);
    expect(screen.getByRole('combobox', { name: 'Assigned Subject *' }).value).toBe('english');
  });

  it('QC-07 QC-08 adviser-only status with no load fails closed', () => {
    mount({ assignmentRows: [] });
    expect(screen.getByText(/No assigned subject for this school year/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview mock create' }).disabled).toBe(true);
  });

  it('QC-09 switching Teacher hides prior selection and draft', () => {
    const view = mount();
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson Plan Title *' }), { target: { value: 'Private draft' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Assigned Subject *' }), { target: { value: 'math' } });
    view.rerender(<QuickCreateForm {...props} teacherId="other" sourceTeacherId="other" assignmentRows={[rows[2]]} />);
    expect(screen.getByRole('textbox', { name: 'Lesson Plan Title *' }).value).toBe('');
    expect(screen.getByRole('combobox', { name: 'Assigned Subject *' }).value).toBe('english');
  });

  it('QC-10 QC-11 shows title and minute validation without calling the mock handler', () => {
    const handler = vi.fn();
    mount({ assignmentRows: [rows[2]], onMockCreate: handler });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Class Duration (minutes per session)' }), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview mock create' }));
    expect(screen.getByText('Enter a lesson plan title.')).toBeTruthy();
    expect(screen.getByText(/whole number of minutes/)).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
  });

  it('QC-12 QC-13 QC-14 passes a proposed payload and keeps objective line breaks', async () => {
    const handler = vi.fn(async () => {});
    mount({ assignmentRows: [rows[2]], onMockCreate: handler });
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson Plan Title *' }), { target: { value: 'Cells' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Learning Objectives' }), { target: { value: 'Describe cells\nCompare cells' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Class Duration (minutes per session)' }), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview mock create' }));
    await waitFor(() => expect(handler).toHaveBeenCalledOnce());
    expect(handler.mock.calls[0][0]).toMatchObject({ title: 'Cells', subject: 'English', subject_id: 'english', grade_level: 'Grade 7', duration: '45 minutes', objectives: 'Describe cells\nCompare cells' });
    expect(handler.mock.calls[0][0]).not.toHaveProperty('section_id');
  });

  it('QC6 resolves preset and custom strategies to one payload string without losing custom text', async () => {
    const handler = vi.fn(async () => {});
    mount({ assignmentRows: [rows[2]], onMockCreate: handler });
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson Plan Title *' }), { target: { value: 'Cells' } });
    const strategy = screen.getByRole('combobox', { name: 'Teaching Strategy' });
    expect(strategy.options.length).toBe(11);
    fireEvent.change(strategy, { target: { value: 'custom' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom Teaching Strategy' }), { target: { value: 'Peer instruction' } });
    fireEvent.change(strategy, { target: { value: 'Inquiry-Based Learning' } });
    expect(screen.queryByRole('textbox', { name: 'Custom Teaching Strategy' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Preview mock create' }));
    await waitFor(() => expect(handler).toHaveBeenCalledOnce());
    expect(handler.mock.calls[0][0].strategy).toBe('Inquiry-Based Learning');
    fireEvent.change(strategy, { target: { value: 'custom' } });
    expect(screen.getByRole('textbox', { name: 'Custom Teaching Strategy' }).value).toBe('Peer instruction');
    fireEvent.click(screen.getByRole('button', { name: 'Preview mock create' }));
    await waitFor(() => expect(handler).toHaveBeenCalledTimes(2));
    expect(handler.mock.calls[1][0].strategy).toBe('Peer instruction');
  });

  it('QC6 represents an existing unknown strategy as Custom and permits an optional blank strategy', async () => {
    const legacyDraft = { ownerId: props.teacherId, schoolYear: props.schoolYear, title: 'Existing draft',
      subjectId: 'english', gradeLevel: 'Grade 7', durationMinutes: '', strategy: 'Local strategy', objectives: '' };
    const view = mount({ assignmentRows: [rows[2]], draftValue: legacyDraft });
    expect(screen.getByRole('combobox', { name: 'Teaching Strategy' }).value).toBe('custom');
    expect(screen.getByRole('textbox', { name: 'Custom Teaching Strategy' }).value).toBe('Local strategy');
    view.unmount();
    const handler = vi.fn(async () => {});
    mount({ assignmentRows: [rows[2]], onMockCreate: handler });
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson Plan Title *' }), { target: { value: 'Blank strategy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview mock create' }));
    await waitFor(() => expect(handler).toHaveBeenCalledOnce());
    expect(handler.mock.calls[0][0].strategy).toBe('');
  });

  it('QC-15 a failed mocked create preserves the entire draft', async () => {
    mount({ assignmentRows: [rows[2]], onMockCreate: vi.fn(async () => { throw new Error('Synthetic failure'); }) });
    fireEvent.change(screen.getByRole('textbox', { name: 'Lesson Plan Title *' }), { target: { value: 'Keep this title' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Learning Objectives' }), { target: { value: 'First\nSecond' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview mock create' }));
    await waitFor(() => expect(screen.getByText(/Mock create failed/)).toBeTruthy());
    expect(screen.getByRole('textbox', { name: 'Lesson Plan Title *' }).value).toBe('Keep this title');
    expect(screen.getByRole('textbox', { name: 'Learning Objectives' }).value).toBe('First\nSecond');
  });

  it('QC-17 makes no external request or mutation on its own', () => {
    const fetch = vi.fn(() => { throw new Error('Unexpected network request'); });
    vi.stubGlobal('fetch', fetch);
    mount();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Create plan' })).toBeNull();
  });

  it('QC3 active integration fails closed even when a submit event bypasses the disabled button', () => {
    const fetch = vi.fn(() => { throw new Error('Unexpected network request'); });
    vi.stubGlobal('fetch', fetch);
    const { container } = mount({ assignmentRows: [rows[2]], onMockCreate: undefined });
    expect(screen.getByRole('button', { name: 'Create plan' }).disabled).toBe(true);
    fireEvent.submit(container.querySelector('form'));
    expect(screen.getAllByText(/creation is pending authorization verification/).length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
