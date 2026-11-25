// @vitest-environment jsdom
// U-PDF-T (design p3, p16): the saved-plan card keeps View and edit, Delete and
// Open source PDF; Print, Download PDF, Download Word, Edit as manual, Generate
// Task and Post to class are gone from it. The plan view carries a Download
// menu (Word, PDF; same exports) and "Edit as manual copy" (AI plans), its
// document sits in a labelled, focusable scroll region, and no Reuse / Post
// control remains anywhere on this tab (even with the posting flag ON).
// The card never prints "Unknown": an unknown academic year is left out.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mock = vi.hoisted(() => ({ plans: [], teacherId: 'synthetic-teacher', showToast: vi.fn(), docx: vi.fn(), aiPdf: vi.fn() }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: mock.teacherId } }) }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-token' } } }) },
  from(table) {
    const chain = { select() { return chain; }, eq() { return chain; }, not() { return chain; },
      order: async () => ({ data: table === 'lesson_plans' ? mock.plans : [], error: null }),
      then: resolve => Promise.resolve({ data: [], error: null }).then(resolve) };
    return chain;
  },
} }));
vi.mock('../hooks', () => ({ useTheme: () => ({ dark: false }), useToast: () => ({ toast: null, showToast: mock.showToast }) }));
vi.mock('../worksheets/useDialogSafety', () => ({ default: () => ({ routeBlocker: null, busyNotice: '' }) }));
vi.mock('../../../../lib/backendApi', () => ({ API_BASE: '', backendRequest: vi.fn() }));
vi.mock('../../../../lib/docx', async (importOriginal) => ({ ...(await importOriginal()), downloadDocx: mock.docx }));
vi.mock('../ilaw/downloadAiIlawPdf', () => ({ downloadAiIlawPdf: mock.aiPdf }));

import LessonPlansTab from './LessonPlansTab';

const planId = 'c137877f-b729-4e7e-b258-c6cbb18cced1';
const aiPlan = (extra = {}) => ({ id: planId, teacher_id: mock.teacherId, status: 'draft', title: 'Plant cells',
  subject: 'Science', grade_level: 'Grade 7', subject_id: 'subject-1', academic_year: '2026-2027', ai_generated: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-11-20T02:05:00Z', objectives: '<h1>Plant cells</h1><p>Body</p>', ...extra });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); mock.docx.mockReset(); mock.aiPdf.mockReset(); });
const show = async (rows) => {
  mock.plans = rows;
  render(<MemoryRouter><LessonPlansTab onGeneratedDraft={vi.fn()} /></MemoryRouter>);
  return (await screen.findByRole('heading', { name: rows[0].title })).closest('li');
};

describe('U-PDF-T saved-plan card', () => {
  it('keeps View and edit, Delete and Open source PDF; the moved buttons are gone', async () => {
    vi.stubEnv('VITE_LESSON_PLAN_POSTING_ENABLED', '1');
    const card = await show([aiPlan({ file_path: 'synthetic/source.pdf' })]);
    const names = within(card).getAllByRole('button').map(b => b.textContent.replace(/\s+/g, ' ').trim());
    expect(names.some(n => n.startsWith('View and edit'))).toBe(true);
    expect(names.some(n => n.startsWith('Delete'))).toBe(true);
    expect(names.some(n => n.startsWith('Open source PDF'))).toBe(true);
    for (const gone of ['Print', 'Download PDF', 'Download Word', 'Edit as manual', 'Generate Task', 'Post to class', 'Reuse and repost']) {
      expect(names.some(n => n.startsWith(gone)), gone).toBe(false);
    }
    expect(document.body.textContent).not.toMatch(/Post to class|Reuse and repost/);
  });

  it('shows the real academic year and never "Unknown"', async () => {
    const card = await show([aiPlan()]);
    expect(card.textContent).toContain('Subject: Science · Grade: Grade 7 · Academic Year: 2026-2027');
    cleanup();
    const unknown = await show([aiPlan({ academic_year: null, grade_level: null })]);
    expect(unknown.textContent).toContain('Subject: Science');
    expect(unknown.textContent).not.toMatch(/Unknown|Academic Year/);
  });
});

describe('U-PDF-T plan view', () => {
  const openView = async (plan = aiPlan()) => {
    const card = await show([plan]);
    fireEvent.click(within(card).getByRole('button', { name: /^View and edit/ }));
    return screen.findByRole('region', { name: 'Lesson plan document' });
  };

  it('header: Back to Lesson Plans, badges and Last edited, the Download menu with Word and PDF', async () => {
    await openView();
    expect(screen.getByRole('button', { name: '← Back to Lesson Plans' })).toBeTruthy();
    expect(screen.getByText(/^Last edited /)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download Plant cells' }));
    const menu = screen.getByRole('menu', { name: 'Download Plant cells' });
    expect(within(menu).getAllByRole('menuitem').map(item => item.querySelector('.font-semibold').textContent)).toEqual(['Word (.docx)', 'PDF (.pdf)']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Word/ }));
    expect(mock.docx).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Download Plant cells' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /PDF/ }));
    await vi.waitFor(() => expect(mock.aiPdf).toHaveBeenCalledTimes(1));
    expect(mock.aiPdf.mock.calls[0][0].html).toBe(aiPlan().objectives);
  });

  it('the document is its own labelled, focusable scroll region (the editor sits inside it)', async () => {
    const region = await openView();
    expect(region.tabIndex).toBe(0);
    expect(region.className).toContain('t-doc-scroll');
    expect(within(region).getByRole('textbox', { name: 'Lesson plan content' })).toBeTruthy();
  });

  it('Edit as manual copy (AI plans) opens a Manual ILAW copy, as the card button did', async () => {
    await openView();
    fireEvent.click(screen.getByRole('button', { name: /^Edit as manual copy/ }));
    expect(await screen.findByRole('heading', { name: 'Manual ILAW Editor' })).toBeTruthy();
    expect(mock.showToast).toHaveBeenCalledWith('A Manual ILAW copy is open. The AI lesson plan is unchanged.', 'success');
  });
});
