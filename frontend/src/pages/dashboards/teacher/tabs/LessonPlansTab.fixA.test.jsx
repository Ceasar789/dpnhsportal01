// @vitest-environment jsdom
// U-PDF-T-FIX-A (design p16): the saved-plan view. Header: Back, title, Saved, Powered by Gemini,
// Last edited; Print, Download (Word, PDF), Save changes; no Edit as manual copy and no Reuse.
// The document has no inner scroll area; the cards beside it hold Linked worksheet (real rows only),
// Details (the Title and Suggested PDF filename fields) and History. The yellow banner shows only
// when the plan was edited after its newest worksheet was made.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mock = vi.hoisted(() => ({ plans: [], sheets: [], teacherId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', showToast: vi.fn(), docx: vi.fn() }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: mock.teacherId } }) }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-token' } } }) },
  from(table) {
    const chain = { select() { return chain; }, eq() { return chain; }, not() { return chain; },
      order: async () => ({ data: table === 'lesson_plans' ? mock.plans : table === 'worksheets' ? mock.sheets : [], error: null }),
      then: resolve => Promise.resolve({ data: [], error: null }).then(resolve) };
    return chain;
  },
} }));
vi.mock('../hooks', () => ({ useTheme: () => ({ dark: false }), useToast: () => ({ toast: null, showToast: mock.showToast }) }));
vi.mock('../worksheets/useDialogSafety', () => ({ default: () => ({ routeBlocker: null, busyNotice: '' }) }));
vi.mock('../../../../lib/backendApi', () => ({ API_BASE: '', backendRequest: vi.fn() }));
vi.mock('../../../../lib/docx', async (importOriginal) => ({ ...(await importOriginal()), downloadDocx: mock.docx }));
vi.mock('../ilaw/downloadAiIlawPdf', () => ({ downloadAiIlawPdf: vi.fn() }));

import LessonPlansTab from './LessonPlansTab';
import { createTemporaryManualIlawDraft } from '../ilaw/fullManualIlawModel';

const aiPlan = (extra = {}) => ({ id: 'c137877f-b729-4e7e-b258-c6cbb18cced1', teacher_id: mock.teacherId, status: 'draft', title: 'Plant cells',
  subject: 'Science', grade_level: 'Grade 7', subject_id: 'subject-1', ai_generated: true,
  created_at: '2026-11-18T00:00:00Z', updated_at: '2026-11-20T02:05:00Z', objectives: '<h1>Plant cells</h1><p>Body</p>', ...extra });
const sheet = { id: 'w1', title: 'Plant cells Quiz', items: 10, task_type: 'quiz', created_at: '2026-11-19T00:00:00Z', source_lesson_plan_id: aiPlan().id };
afterEach(() => { cleanup(); mock.sheets = []; mock.docx.mockReset(); });
const openView = async (plan = aiPlan(), sheets = []) => {
  mock.plans = [plan];
  mock.sheets = sheets;
  render(<MemoryRouter><LessonPlansTab onGeneratedDraft={vi.fn()} /></MemoryRouter>);
  const card = (await screen.findByRole('heading', { name: plan.title })).closest('li');
  fireEvent.click(within(card).getByRole('button', { name: /^View and edit/ }));
  return screen.findByRole('textbox', { name: 'Lesson plan content' });
};
const region = name => screen.queryByRole('complementary', { name: 'About this lesson plan' })
  && within(screen.getByRole('complementary', { name: 'About this lesson plan' })).queryByRole('region', { name });

describe('U-PDF-T-FIX-A lesson plan view', () => {
  it('header: Saved, Powered by Gemini, a real Last edited; Print, Download, Save changes; no Edit as manual copy or Reuse', async () => {
    await openView();
    const header = document.querySelector('header');
    expect(within(header).getByText('Saved')).toBeTruthy();
    expect(within(header).getByText('Powered by Gemini')).toBeTruthy();
    expect(within(header).getByText(/^Last edited Nov 20, 2026/)).toBeTruthy();
    const names = within(header).getAllByRole('button').map(b => b.textContent.replace(/\s+/g, ' ').trim());
    expect(names).toEqual(expect.arrayContaining(['← Back to Lesson Plans', 'Print', 'Save changes']));
    expect(within(header).getByRole('button', { name: 'Download Plant cells' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Edit as manual|Reuse and repost|Post to class/);
  });

  it('no Last edited without a real date', async () => {
    await openView(aiPlan({ updated_at: null }));
    expect(screen.queryByText(/^Last edited/)).toBeNull();
  });

  it('the document has no inner scroll area', async () => {
    const editor = await openView();
    expect(screen.queryByRole('region', { name: 'Lesson plan document' })).toBeNull();
    expect(document.querySelector('.t-doc-scroll')).toBeNull();
    expect(editor.closest('[class*="overflow-y"], [style*="max-height"]')).toBeNull();
  });

  it('Details holds the Title and Suggested PDF filename fields with their help', async () => {
    await openView();
    const details = region('Details');
    expect(within(details).getByLabelText('Lesson Plan Title').value).toBe('Plant cells');
    expect(within(details).getByLabelText('Suggested PDF filename')).toBeTruthy();
    expect(details.textContent).toContain('Choose Save changes to rename the saved plan.');
    expect(details.textContent).toContain('The suggested PDF filename is saved only on this device.');
  });

  it('no linked worksheet: no Linked worksheet card and no banner; History from real dates', async () => {
    await openView();
    expect(region('Linked worksheet')).toBeNull();
    expect(screen.queryByText(/You edited this lesson plan after generating its worksheet/)).toBeNull();
    expect(within(region('History')).getAllByRole('listitem').map(li => li.firstChild.textContent)).toEqual(['Edited', 'Created']);
  });

  it('edited after its newest worksheet: banner, Linked worksheet with Out of sync, Sync opens Generate Task', async () => {
    await openView(aiPlan(), [sheet]);
    expect(await screen.findByText('You edited this lesson plan after generating its worksheet. Update the worksheet too?')).toBeTruthy();
    const linked = region('Linked worksheet');
    expect(linked.textContent).toContain('Plant cells Quiz');
    expect(within(linked).getByText('Out of sync')).toBeTruthy();
    fireEvent.click(within(linked).getByRole('button', { name: /^Sync with updated plan/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('worksheet made after the last edit: linked, no banner, no Out of sync', async () => {
    await openView(aiPlan(), [{ ...sheet, created_at: '2026-11-21T00:00:00Z' }]);
    const linked = await vi.waitFor(() => { const card = region('Linked worksheet'); if (!card) throw new Error('not yet'); return card; });
    expect(within(linked).queryByText('Out of sync')).toBeNull();
    expect(screen.queryByText(/You edited this lesson plan after generating its worksheet/)).toBeNull();
  });
});

describe('U-PDF-T-FIX-A manual lesson plan view', () => {
  const TEACHER = mock.teacherId;
  const ID = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  const manualPlan = () => {
    const draft = createTemporaryManualIlawDraft(TEACHER);
    draft.document.info.nameOfLesson = 'Matter';
    const envelope = { kind: 'eduscribe.manual-ilaw', version: 2, teacherId: TEACHER, planId: ID, title: 'Matter',
      assignment: { subjectId: '11111111-1111-4111-8111-111111111111', subjectName: 'Science', gradeLevel: 'Grade 7', schoolYear: '2026-2027' },
      workflowState: 'draft', document: draft.document, sourceDetails: draft.sourceDetails };
    return { id: ID, teacher_id: TEACHER, title: 'Matter', subject: 'Science', grade_level: 'Grade 7', subject_id: '11111111-1111-4111-8111-111111111111', academic_year: '2026-2027',
      ai_generated: false, status: 'draft', authoring_revision: 1, objectives: JSON.stringify(envelope),
      created_at: '2026-11-18T00:00:00Z', updated_at: '2026-11-20T02:05:00Z' };
  };
  afterEach(() => vi.unstubAllEnvs());
  const openManual = async sheets => {
    vi.stubEnv('VITE_MANUAL_LESSON_PLAN_SAVE_ENABLED', '1');
    mock.plans = [manualPlan()];
    mock.sheets = sheets;
    render(<MemoryRouter><LessonPlansTab onGeneratedDraft={vi.fn()} /></MemoryRouter>);
    const card = (await screen.findByRole('heading', { name: 'Matter' })).closest('li');
    fireEvent.click(within(card).getByRole('button', { name: /^View and edit/ }));
    return vi.waitFor(() => { const aside = screen.getByRole('complementary', { name: 'About this lesson plan' }); return aside; });
  };

  it('shows the same cards: Details (subject line), History, and Linked worksheet with the banner when out of sync', async () => {
    await openManual([{ ...sheet, source_lesson_plan_id: ID }]);
    expect(region('Details').textContent).toContain('Subject and grade: Science · Grade 7 · S.Y. 2026-2027');
    expect(screen.getAllByText(/Subject and grade: Science/)).toHaveLength(1);
    expect(within(region('History')).getAllByRole('listitem').length).toBeGreaterThan(0);
    const linked = await vi.waitFor(() => { const c = region('Linked worksheet'); if (!c) throw new Error('not yet'); return c; });
    expect(within(linked).getByText('Out of sync')).toBeTruthy();
    expect(screen.getByText('You edited this lesson plan after generating its worksheet. Update the worksheet too?')).toBeTruthy();
    expect(document.querySelector('[data-manual-print] .t-doc-scroll')).toBeNull();
  });

  it('no linked worksheet: no Linked worksheet card and no banner; the cards are screen-only', async () => {
    const aside = await openManual([]);
    expect(region('Linked worksheet')).toBeNull();
    expect(screen.queryByText(/You edited this lesson plan after generating its worksheet/)).toBeNull();
    expect(aside.closest('[data-manual-screen-only]')).toBeTruthy();
  });
});
