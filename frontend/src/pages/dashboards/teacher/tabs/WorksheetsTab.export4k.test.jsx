// @vitest-environment jsdom
// 4k (R22, R49): Word copies (Student copy / Key to correction) and a print page for PDF, from the saved items and keys.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorksheetsTab from './WorksheetsTab';

const { db, auth, counts, items } = vi.hoisted(() => ({ db: { rows: [] }, auth: { userData: { uid: 'teacher-1' } },
  counts: { assigneeCounts: {}, assigneeCountsLoading: false, assigneeCountsError: false },
  items: { loadItems: null } }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  from: table => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      then: resolve => Promise.resolve({ data: table === 'worksheets' ? db.rows : [], error: null }).then(resolve),
    };
    return query;
  },
} }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../worksheets/useWorksheetAssessment', () => {
  const base = { mySubjects: [], schoolYear: '2030-2031', subjectLoading: false, subjectError: false,
    postings: [], postingsError: false, fetchMySubject: vi.fn(), fetchAssigneeCounts: vi.fn(), fetchPostings: vi.fn(),
    mySections: [], sectionsError: false, fetchMySections: vi.fn(), loadItems: vi.fn(), distributeTask: vi.fn(),
    firstAssignedAt: {} };
  return { useWorksheetAssessment: () => ({ ...base, ...counts, loadItems: items.loadItems }) };
});
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: () => null }));
vi.mock('../worksheets/DistributeModal', () => ({ default: () => null }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: () => null }));

const kept = { id: 'k', title: 'Kept quiz', subject: 'English', origin: 'manual', source_lesson_plan_id: null, collection_id: null, task_type: 'quiz', items: 3 };

const ITEMS = [{ id: 'i1', position: 1, question: 'Which planet is red?', item_type: 'multiple_choice', options: ['Mars', 'Venus'], points: 1 }];
const KEYS = { i1: { correct_answer: 'Mars' } };
let blobs = [];
beforeEach(() => {
  db.rows = [kept];
  items.loadItems = vi.fn(async () => ({ items: ITEMS, keys: KEYS }));
  blobs = [];
  URL.createObjectURL = vi.fn(blob => { blobs.push(blob); return 'blob:x'; });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { blobs.at(-1).fileName = this.download; });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const docText = async blob => new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
const show = async () => { render(<WorksheetsTab />); await screen.findByRole('heading', { name: 'Kept quiz' }); };
// U-PDF-T (design p18): the three exports moved from the card into the Preview's Download menu (same exports).
const button = name => {
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  fireEvent.click(screen.getByRole('button', { name: 'Download Kept quiz' }));
  return screen.getAllByRole('menuitem').find(item => item.querySelector('.font-semibold').textContent === name);
};

describe('Worksheet downloads (4k)', () => {
  it('Student copy: a .docx with the question and options, no answer', async () => {
    await show();
    fireEvent.click(button('Student copy (.docx)'));
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(items.loadItems).toHaveBeenCalledWith('k');
    expect(blobs[0].fileName).toBe('Kept quiz - Student copy.docx');
    const text = await docText(blobs[0]);
    expect(text).toContain('Which planet is red?');
    expect(text).not.toContain('Answer: Mars');
  });
  it('Key to correction: the saved answer is in the file', async () => {
    await show();
    fireEvent.click(button('Key to correction (.docx)'));
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(blobs[0].fileName).toBe('Kept quiz - Key to correction.docx');
    expect(await docText(blobs[0])).toContain('Answer: Mars');
  });
  it('a failed items read makes no file', async () => {
    items.loadItems = vi.fn(async () => null);
    await show();
    fireEvent.click(button('Student copy (.docx)'));
    await waitFor(() => expect(items.loadItems).toHaveBeenCalled());
    expect(blobs).toHaveLength(0);
  });
  it('Print / PDF opens a print page with the student copy', async () => {
    const doc = { open() {}, write(text) { doc.text = text; }, close() {} };
    const print = vi.fn();
    vi.spyOn(window, 'open').mockImplementation(() => ({ document: doc, focus() {}, print }));
    await show();
    fireEvent.click(button('Print / PDF'));
    await waitFor(() => expect(print).toHaveBeenCalled());
    expect(doc.text).toContain('Which planet is red?');
  });
});
