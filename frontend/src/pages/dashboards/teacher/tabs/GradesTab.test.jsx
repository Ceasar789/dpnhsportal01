// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GradesTab from './GradesTab';

const fixture = vi.hoisted(() => ({
  uid: 'teacher-a', rows: [], error: null, reads: [], submissions: [], loadSubmissions: vi.fn(),
}));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: fixture.uid } }) }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  from(table) {
    fixture.reads.push(table);
    if (table !== 'worksheets') throw new Error(`Unexpected ${table} request`);
    const query = {
      select: () => query,
      eq(column, value) { expect(column).toBe('teacher_id'); expect(value).toBe(fixture.uid); return query; },
      order: () => Promise.resolve({ data: fixture.rows, error: fixture.error }),
    };
    return query;
  },
} }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../hooks', () => ({
  useTheme: () => ({ dark: false }),
  useToast: () => ({ toast: null, showToast: vi.fn() }),
}));
vi.mock('../worksheets/useWorksheetAssessment', () => ({ useWorksheetAssessment: () => ({
  mySections: [{ id: 'section-1', name: 'A', grade_level: 'Grade 7' }], postings: [],
  loadSubmissions: fixture.loadSubmissions, loadItems: vi.fn(), loadAnswers: vi.fn(),
  releaseScore: vi.fn(), encodeManualScore: vi.fn(), loadClassList: vi.fn(),
}) }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: ({ onClose }) =>
  <div role="dialog" aria-label="Existing checking workflow"><button onClick={onClose}>Close checking</button></div> }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: ({ onClose }) =>
  <div role="dialog" aria-label="Existing paper scoring workflow"><button onClick={onClose}>Close encoding</button></div> }));

const worksheetA = { id: 'sheet-a', title: 'Current English', subject: 'English', grade_level: 'Grade 7', teacher_id: 'teacher-a' };
const worksheetB = { id: 'sheet-b', title: 'Prior Science', subject: 'Science', grade_level: 'Grade 8', teacher_id: 'teacher-a' };
const online = { id: 'sub-a', student_id: 'student-a', name: 'Learner A', section_id: 'section-1', source: 'online', status: 'submitted', released: false, score: null, total_points: null };
const paper = { id: 'sub-b', student_id: 'student-b', name: 'Learner B', section_id: 'old-section', source: 'manual', status: 'checked', released: true, score: 0, total_points: 20 };

beforeEach(() => {
  fixture.uid = 'teacher-a'; fixture.rows = [worksheetA, worksheetB]; fixture.error = null;
  fixture.reads.length = 0; fixture.submissions = [online, paper];
  fixture.loadSubmissions.mockReset().mockImplementation(async () => fixture.submissions);
});
afterEach(cleanup);
const renderTab = () => render(<MemoryRouter><GradesTab /></MemoryRouter>);

describe('Teacher Worksheet Scores destination', () => {
  it('uses owned worksheets and existing submission reads without general-grade requests', async () => {
    renderTab();
    expect(await screen.findByRole('heading', { name: 'Worksheet Scores' })).toBeTruthy();
    expect(await screen.findByText('Learner A')).toBeTruthy();
    expect(screen.getByText('Not scored')).toBeTruthy();
    expect(screen.getByText('Submitted · Not released')).toBeTruthy();
    expect(screen.getByText('0 / 20')).toBeTruthy();
    expect(screen.getByText('Reviewed · Released')).toBeTruthy();
    expect(fixture.loadSubmissions).toHaveBeenCalledWith('sheet-a');
    expect(fixture.reads).toEqual(['worksheets']);
    expect(screen.queryByText(/GWA|Q3 Report|Passed|Failed/)).toBeNull();
  });

  it('keeps older worksheets and filters by subject, grade, section and release', async () => {
    renderTab();
    await screen.findByText('Learner A');
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Science' } });
    await waitFor(() => expect(fixture.loadSubmissions).toHaveBeenCalledWith('sheet-b'));
    expect(screen.getByRole('heading', { name: 'Prior Science' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: 'Grade 8' } });
    expect(screen.getByRole('heading', { name: 'Prior Science' })).toBeTruthy();
    await screen.findByText('Learner B');
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'old-section' } });
    fireEvent.change(screen.getByLabelText('Release status'), { target: { value: 'released' } });
    expect(screen.getByText('Learner B')).toBeTruthy();
    expect(screen.queryByText('Learner A')).toBeNull();
  });

  it('distinguishes empty reads and read failures with Retry', async () => {
    fixture.loadSubmissions.mockResolvedValueOnce(null).mockResolvedValueOnce([]);
    renderTab();
    expect(await screen.findByText(/Could not load worksheet submissions/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry submissions' }));
    expect(await screen.findByText('No submissions for this worksheet yet.')).toBeTruthy();
  });

  it('clears a stale section filter when selecting another worksheet', async () => {
    fixture.loadSubmissions.mockImplementation(async id => id === 'sheet-a' ? [online] : [paper]);
    renderTab();
    await screen.findByText('Learner A');
    fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'section-1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Worksheet' }), { target: { value: 'sheet-b' } });
    expect(await screen.findByText('Learner B')).toBeTruthy();
    expect(screen.getByLabelText('Section').value).toBe('');
    expect(screen.queryByText('Learner A')).toBeNull();
  });

  it('keeps the score actions in the existing checking and encoding dialogs', async () => {
    renderTab();
    await screen.findByText('Learner A');
    fireEvent.click(screen.getByRole('button', { name: 'Check submissions' }));
    expect(within(screen.getByRole('dialog')).getByText('Close checking')).toBeTruthy();
    fireEvent.click(screen.getByText('Close checking'));
    fireEvent.click(screen.getByRole('button', { name: 'Encode paper scores' }));
    expect(within(screen.getByRole('dialog')).getByText('Close encoding')).toBeTruthy();
    expect(fixture.reads.every(table => table === 'worksheets')).toBe(true);
  });

  it('fails closed when the owned worksheet list cannot be read', async () => {
    fixture.error = { message: 'Synthetic failure' };
    renderTab();
    expect(await screen.findByText('Could not load your worksheets.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check submissions' })).toBeNull();
  });

  it('hides an open scoring dialog when the Teacher identity changes', async () => {
    const view = renderTab();
    await screen.findByText('Learner A');
    fireEvent.click(screen.getByRole('button', { name: 'Check submissions' }));
    expect(screen.getByRole('dialog', { name: 'Existing checking workflow' })).toBeTruthy();
    fixture.uid = 'teacher-b';
    fixture.rows = [];
    view.rerender(<MemoryRouter><GradesTab /></MemoryRouter>);
    expect(screen.queryByRole('dialog', { name: 'Existing checking workflow' })).toBeNull();
    expect(screen.queryByText('Learner A')).toBeNull();
  });
});
