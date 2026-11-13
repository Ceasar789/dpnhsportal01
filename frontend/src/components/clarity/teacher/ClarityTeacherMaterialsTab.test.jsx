// @vitest-environment jsdom
// Learning Materials (M2): the Teacher tab. Real data only (the teacher's
// rows and own teacher_subjects pairs), loading / error / empty states,
// search, subject chips and the type filter, Open (signed URL or a safe link
// in a new tab), Add file, Add link, Edit and Delete with a confirm, the
// unsaved-changes guard and no double submit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const UID = '0b4e3c3a-1d2e-4f5a-8b9c-0d1e2f3a4b5c';
const h = vi.hoisted(() => ({ assign: { assignmentRows: [], loadState: 'ready', retry: () => {} } }));

vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: '0b4e3c3a-1d2e-4f5a-8b9c-0d1e2f3a4b5c' } }) }));
vi.mock('../../../pages/dashboards/teacher/lessonPlans/useQuickCreateAssignments', () => ({ default: () => h.assign }));
vi.mock('./materials/materialsApi', () => ({
  listMaterials: vi.fn(), loadOfficialSchoolYear: vi.fn(), createFileMaterial: vi.fn(), createLinkMaterial: vi.fn(),
  updateMaterial: vi.fn(), deleteMaterial: vi.fn(), signedMaterialUrl: vi.fn(), openInNewTab: vi.fn(),
}));

import * as api from './materials/materialsApi';
import ClarityTeacherMaterialsTab from './ClarityTeacherMaterialsTab';

const ASSIGNMENTS = [
  { subject_id: 'sci', grade_level: 'Grade 8', subjects: { id: 'sci', name: 'Science' } },
  { subject_id: 'sci', grade_level: 'Grade 7', subjects: { id: 'sci', name: 'Science' } },
  { subject_id: 'eng', grade_level: 'Grade 7', subjects: { id: 'eng', name: 'English' } },
];
const ROWS = [
  { id: 'r1', kind: 'file', title: 'Cell diagram', description: 'Labelled parts of a cell', subject_id: 'sci', subjects: { id: 'sci', name: 'Science' },
    grade_level: 'Grade 8', file_path: `${UID}/a-cell.png`, file_name: 'cell.png', mime_type: 'image/png', size_bytes: 2048, created_at: '2026-11-10T08:00:00Z' },
  { id: 'r2', kind: 'link', title: 'DepEd K to 12', description: null, subject_id: null, subjects: null, grade_level: null,
    link_url: 'https://www.deped.gov.ph/k-to-12/', created_at: '2026-11-09T08:00:00Z' },
  { id: 'r3', kind: 'file', title: 'Reading list', description: null, subject_id: 'eng', subjects: { id: 'eng', name: 'English' },
    grade_level: 'Grade 7', file_path: `${UID}/b-list.pdf`, file_name: 'list.pdf', mime_type: 'application/pdf', size_bytes: 3 * 1024 * 1024, created_at: '2026-11-08T08:00:00Z' },
];

const show = async (rows = ROWS) => {
  api.listMaterials.mockResolvedValue(rows);
  render(<ClarityTeacherMaterialsTab />);
  await screen.findByRole('heading', { level: 1, name: 'Learning Materials' });
  await waitFor(() => expect(screen.queryByText('Loading learning materials…')).toBeNull());
};
const cards = () => [...document.querySelectorAll('.x-tlm-card')];
const card = title => cards().find(c => c.querySelector('.x-tlm-title').textContent === title);
const dialog = name => screen.getByRole('dialog', { name });

beforeEach(() => {
  h.assign = { assignmentRows: ASSIGNMENTS, loadState: 'ready', retry: vi.fn() };
  api.loadOfficialSchoolYear.mockResolvedValue('2026-2027');
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('states (real data only)', () => {
  it('loading text is a status, then the cards', async () => {
    let resolve;
    api.listMaterials.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<ClarityTeacherMaterialsTab />);
    expect((await screen.findByText('Loading learning materials…')).getAttribute('role')).toBe('status');
    await act(async () => resolve(ROWS));
    expect(cards()).toHaveLength(3);
    expect(api.listMaterials).toHaveBeenCalledWith(UID);
  });

  it('an error is an alert with Retry', async () => {
    api.listMaterials.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(ROWS);
    render(<ClarityTeacherMaterialsTab />);
    expect((await screen.findByText(/Learning materials could not be loaded/)).getAttribute('role')).toBe('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(cards()).toHaveLength(3));
  });

  it('no materials: an empty state, no search or filters, nothing invented', async () => {
    await show([]);
    expect(screen.getByText('No learning materials yet.')).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Filter by subject' })).toBeNull();
    expect(cards()).toHaveLength(0);
  });
});

describe('cards', () => {
  it('type badge, title, subject · grade, description and size · date; missing parts are simply left out', async () => {
    await show();
    const png = card('Cell diagram');
    expect(png.querySelector('.x-tlm-badge').textContent).toBe('Image');
    expect(png.querySelector('.x-tlm-sg').textContent).toBe('Science · Grade 8');
    expect(png.querySelector('.x-tlm-desc').textContent).toBe('Labelled parts of a cell');
    expect(png.querySelector('.x-tlm-meta').textContent).toMatch(/^2\.0 KB · /);
    const link = card('DepEd K to 12');
    expect(link.querySelector('.x-tlm-badge').textContent).toBe('Link');
    expect(link.querySelector('.x-tlm-sg')).toBeNull();
    expect(link.querySelector('.x-tlm-desc')).toBeNull();
    expect(link.querySelector('.x-tlm-meta').textContent).toMatch(/^www\.deped\.gov\.ph · /);
    expect(card('Reading list').querySelector('.x-tlm-badge').textContent).toBe('PDF');
  });

  it('a link opens in a new tab with rel="noopener noreferrer"', async () => {
    await show();
    const open = within(card('DepEd K to 12')).getByRole('link', { name: 'Open DepEd K to 12 (opens in a new tab)' });
    expect([open.getAttribute('href'), open.getAttribute('target'), open.getAttribute('rel')])
      .toEqual(['https://www.deped.gov.ph/k-to-12/', '_blank', 'noopener noreferrer']);
  });

  it('an unsafe stored link gets no Open control', async () => {
    await show([{ ...ROWS[1], link_url: 'javascript:alert(1)' }]);
    expect(within(cards()[0]).queryByRole('link')).toBeNull();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('a file opens through a fresh signed URL that is never rendered', async () => {
    await show();
    api.signedMaterialUrl.mockResolvedValue('https://x.supabase.co/storage/v1/object/sign/learning-materials/p?token=secret');
    api.openInNewTab.mockReturnValue(true);
    fireEvent.click(within(card('Reading list')).getByRole('button', { name: 'Open Reading list (opens in a new tab)' }));
    await waitFor(() => expect(api.openInNewTab).toHaveBeenCalledWith('https://x.supabase.co/storage/v1/object/sign/learning-materials/p?token=secret'));
    expect(api.signedMaterialUrl).toHaveBeenCalledWith(ROWS[2]);
    expect(document.body.innerHTML).not.toMatch(/token=secret/);
  });

  it('a file that cannot be signed shows an error toast', async () => {
    await show();
    api.signedMaterialUrl.mockResolvedValue(null);
    fireEvent.click(within(card('Cell diagram')).getByRole('button', { name: /^Open Cell diagram/ }));
    expect((await screen.findByRole('alert', {}, { timeout: 2000 })).textContent).toMatch(/could not be opened/);
    expect(api.openInNewTab).not.toHaveBeenCalled();
  });
});

describe('search, subject chips and type filter', () => {
  it('chips and types come only from the materials; filters combine and can be cleared', async () => {
    await show();
    const chips = within(screen.getByRole('group', { name: 'Filter by subject' })).getAllByRole('button').map(b => b.textContent);
    expect(chips).toEqual(['All subjects', 'English', 'Science']);
    fireEvent.click(screen.getByRole('button', { name: 'Science' }));
    expect(cards().map(c => c.querySelector('.x-tlm-title').textContent)).toEqual(['Cell diagram']);
    fireEvent.click(screen.getByRole('button', { name: 'All subjects' }));
    const type = screen.getByRole('combobox', { name: 'Filter by type' });
    expect([...type.options].map(o => o.textContent)).toEqual(['All types', 'Image', 'Link', 'PDF']);
    fireEvent.change(type, { target: { value: 'Link' } });
    expect(cards()).toHaveLength(1);
    fireEvent.change(type, { target: { value: '' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search learning materials' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No materials match your search or filters.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(cards()).toHaveLength(3);
  });
});

describe('add, edit and delete', () => {
  it('Add link: unsafe links are refused with an alert; a valid one is saved and shown first', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    const d = dialog('Add material');
    fireEvent.click(within(d).getByRole('button', { name: 'Link' }));
    fireEvent.change(within(d).getByLabelText('Link'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: 'Unsafe' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Add material' }));
    expect(within(d).getByRole('alert').textContent).toMatch(/http:\/\/ or https:\/\//);
    expect(api.createLinkMaterial).not.toHaveBeenCalled();

    const saved = { ...ROWS[1], id: 'new', title: 'Phet sims', link_url: 'https://phet.colorado.edu' };
    api.createLinkMaterial.mockResolvedValue({ ok: true, row: saved });
    fireEvent.change(within(d).getByLabelText('Link'), { target: { value: 'https://phet.colorado.edu' } });
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: ' Phet sims ' } });
    fireEvent.change(within(d).getByLabelText(/^Subject/), { target: { value: 'sci' } });
    fireEvent.change(within(d).getByLabelText(/^Grade/), { target: { value: 'Grade 7' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Add material' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.createLinkMaterial).toHaveBeenCalledWith({
      teacherId: UID, url: 'https://phet.colorado.edu', fields: { title: 'Phet sims', description: null, subject_id: 'sci', grade_level: 'Grade 7' },
    });
    expect(cards()[0].querySelector('.x-tlm-title').textContent).toBe('Phet sims');
  });

  it('Add file: only the teacher\'s own subjects and their grades; the chosen file is sent', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    const d = dialog('Add material');
    const subject = within(d).getByLabelText(/^Subject/);
    expect([...subject.options].map(o => o.textContent)).toEqual(['No subject', 'English', 'Science']);
    const grade = within(d).getByLabelText(/^Grade/);
    expect(grade.disabled).toBe(true);
    fireEvent.change(subject, { target: { value: 'sci' } });
    expect([...grade.options].map(o => o.textContent)).toEqual(['No grade', 'Grade 7', 'Grade 8']);
    const file = new File(['x'], 'Cells.docx', { type: '' });
    fireEvent.change(d.querySelector('#material-file'), { target: { files: [file] } });
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: 'Cells notes' } });
    api.createFileMaterial.mockResolvedValue({ ok: true, row: { ...ROWS[2], id: 'f9', title: 'Cells notes' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Add material' }));
    await waitFor(() => expect(api.createFileMaterial).toHaveBeenCalled());
    const call = api.createFileMaterial.mock.calls[0][0];
    expect(call.file).toBe(file);
    expect(call.fields).toEqual({ title: 'Cells notes', description: null, subject_id: 'sci', grade_level: null });
  });

  it('no double submit: while saving, Save is busy and disabled, and a second click sends nothing', async () => {
    await show();
    let resolve;
    api.createLinkMaterial.mockReturnValue(new Promise((r) => { resolve = r; }));
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    const d = dialog('Add material');
    fireEvent.click(within(d).getByRole('button', { name: 'Link' }));
    fireEvent.change(within(d).getByLabelText('Link'), { target: { value: 'https://e.org' } });
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: 'E' } });
    const save = within(d).getByRole('button', { name: 'Add material' });
    fireEvent.click(save);
    await waitFor(() => expect(within(d).getByRole('button', { name: 'Saving…' }).disabled).toBe(true));
    fireEvent.submit(d.querySelector('form'));
    expect(api.createLinkMaterial).toHaveBeenCalledTimes(1);
    expect(within(d).getByRole('button', { name: 'Cancel' }).disabled).toBe(true);
    await act(async () => resolve({ ok: false, error: 'The material could not be saved. Check your connection and try again.' }));
    expect(within(d).getByRole('alert').textContent).toMatch(/could not be saved/);
  });

  it('unsaved changes: Cancel asks before discarding', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    fireEvent.change(within(dialog('Add material')).getByLabelText('Title'), { target: { value: 'Draft' } });
    fireEvent.click(within(dialog('Add material')).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Unsaved changes' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add material' })).toBeNull());
  });

  it('Edit: starts from the row (file not replaceable) and saves the shared fields', async () => {
    await show();
    fireEvent.click(within(card('Reading list')).getByRole('button', { name: 'Edit Reading list' }));
    const d = dialog('Edit material');
    expect(within(d).getByLabelText('Title').value).toBe('Reading list');
    expect(within(d).getByLabelText(/^Subject/).value).toBe('eng');
    expect(d.querySelector('#material-file')).toBeNull();
    expect(within(d).getByText(/list\.pdf · PDF · 3\.0 MB/)).toBeTruthy();
    api.updateMaterial.mockResolvedValue({ ok: true, row: { ...ROWS[2], title: 'Reading list (Q2)' } });
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: 'Reading list (Q2)' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(card('Reading list (Q2)')).toBeTruthy());
    expect(api.updateMaterial.mock.calls[0][0].row).toBe(ROWS[2]);
  });

  it('Delete needs a confirm; a file left behind is reported', async () => {
    await show();
    fireEvent.click(within(card('Cell diagram')).getByRole('button', { name: 'Edit Cell diagram' }));
    fireEvent.click(within(dialog('Edit material')).getByRole('button', { name: 'Delete' }));
    const confirm = dialog('Delete this material?');
    expect(confirm.textContent).toMatch(/together with its file/);
    expect(api.deleteMaterial).not.toHaveBeenCalled();
    api.deleteMaterial.mockResolvedValue({ ok: true, orphan: true });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete material' }));
    await waitFor(() => expect(card('Cell diagram')).toBeUndefined());
    expect(api.deleteMaterial).toHaveBeenCalledWith({ row: ROWS[0] });
    await waitFor(() => expect(document.activeElement?.textContent).toBe(' Add material'));
    expect((await screen.findByRole('alert', {}, { timeout: 2000 })).textContent).toMatch(/could not be removed automatically/);
  });

  it('when the subjects cannot be loaded, the form says so and offers Retry', async () => {
    h.assign = { assignmentRows: [], loadState: 'error', retry: vi.fn() };
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    const d = dialog('Add material');
    expect(within(d).getByText(/Your subjects could not be loaded/)).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: 'Retry' }));
    expect(h.assign.retry).toHaveBeenCalled();
  });
});
