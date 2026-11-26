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
  listMaterialClasses: vi.fn(), loadTeacherSections: vi.fn(), loadClassList: vi.fn(), shareMaterialToClass: vi.fn(),
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

// U-PDF-T-FIX-B: the teacher's real classes and the owner-readable shares.
const CLASSES = [
  { id: 's7', name: 'Rizal', grade_level: 'Grade 7' },
  { id: 's8', name: 'Mabini', grade_level: 'Grade 8' },
  { id: 's8b', name: 'Bonifacio', grade_level: 'Grade 8' },
];
const SHARES = [
  { material_id: 'r1', section_id: 's8', all_students: true, sections: CLASSES[1] },
  { material_id: 'r1', section_id: 's8b', all_students: true, sections: CLASSES[2] },
  { material_id: 'r3', section_id: 's7', all_students: true, sections: CLASSES[0] },
];

const show = async (rows = ROWS) => {
  api.listMaterials.mockResolvedValue(rows);
  render(<ClarityTeacherMaterialsTab />);
  await screen.findByRole('heading', { level: 1, name: 'Learning Materials' });
  await waitFor(() => expect(screen.queryByText('Loading learning materials…')).toBeNull());
};
// U-PDF-T-FIX-B: a table row per material (a stacked card on phones).
const cards = () => [...document.querySelectorAll('.x-tlm-table tbody tr')];
const card = title => cards().find(c => c.querySelector('.x-tlm-tname').textContent === title);
const titles = () => cards().map(c => c.querySelector('.x-tlm-tname').textContent);
const dialog = name => screen.getByRole('dialog', { name });

beforeEach(() => {
  h.assign = { assignmentRows: ASSIGNMENTS, loadState: 'ready', retry: vi.fn() };
  api.loadOfficialSchoolYear.mockResolvedValue('2026-2027');
  api.listMaterialClasses.mockResolvedValue(SHARES);
  api.loadTeacherSections.mockResolvedValue(CLASSES);
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

  it("no materials: an empty state about the teacher's own uploads, no search or filters, nothing invented", async () => {
    await show([]);
    expect(screen.getByText('You have not added your own materials yet.')).toBeTruthy();
    expect(screen.queryByText('No learning materials yet.')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Filter by subject' })).toBeNull();
    expect(cards()).toHaveLength(0);
  });
});

describe('cards', () => {
  it('U-PDF-T-FIX-B: a row is title, Class, Type and Posted, with Open, Edit and Repost', async () => {
    await show();
    expect(screen.getAllByRole('columnheader').map(c => c.textContent)).toEqual(['Title', 'Class', 'Type', 'Posted', 'Actions']);
    const cells = title => [...card(title).querySelectorAll('th, td')].slice(0, 4).map(c => c.textContent);
    expect(cells('Cell diagram')).toEqual(['Cell diagram', 'Grade 8 — Bonifacio +1', 'Image', 'Nov 10']);
    expect(cells('DepEd K to 12')).toEqual(['DepEd K to 12', 'Private (only me)', 'Link', 'Nov 9']);
    expect(cells('Reading list')).toEqual(['Reading list', 'Grade 7 — Rizal', 'PDF', 'Nov 8']);
    for (const name of ['Open Reading list (opens in a new tab)', 'Edit Reading list', 'Repost Reading list']) {
      expect(within(card('Reading list')).getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByText('3 materials')).toBeTruthy();
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

describe('search and the Grade, Section and Type filters (U-PDF-T-FIX-B)', () => {
  it('real classes and types only; a material with no grade is under All grades only; filters combine and can be cleared', async () => {
    await show();
    expect(screen.queryByRole('group', { name: 'Filter by subject' })).toBeNull();
    const grade = screen.getByRole('combobox', { name: 'Filter by grade' });
    const section = screen.getByRole('combobox', { name: 'Filter by section' });
    expect([...grade.options].map(o => o.textContent)).toEqual(['All grades', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']);
    expect([...section.options].map(o => o.textContent))
      .toEqual(['All sections', 'Grade 7 — Rizal', 'Grade 8 — Mabini', 'Grade 8 — Bonifacio', 'Private (only me)']);
    fireEvent.change(grade, { target: { value: 'Grade 8' } });
    expect(titles()).toEqual(['Cell diagram']);
    expect([...section.options].map(o => o.textContent)).toEqual(['All sections', 'Grade 8 — Mabini', 'Grade 8 — Bonifacio', 'Private (only me)']);
    fireEvent.change(grade, { target: { value: '' } });
    fireEvent.change(section, { target: { value: 'private' } });
    expect(titles()).toEqual(['DepEd K to 12']);
    fireEvent.change(section, { target: { value: 's7' } });
    expect(titles()).toEqual(['Reading list']);
    fireEvent.change(section, { target: { value: '' } });
    const type = screen.getByRole('combobox', { name: 'Filter by type' });
    expect([...type.options].map(o => o.textContent)).toEqual(['All types', 'Image', 'Link', 'PDF']);
    fireEvent.change(type, { target: { value: 'Link' } });
    expect(cards()).toHaveLength(1);
    expect(screen.getByText('1 material')).toBeTruthy();
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
    fireEvent.click(within(d).getByRole('radio', { name: 'Link' }));
    fireEvent.change(within(d).getByLabelText('Link address'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: 'Unsafe' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Add material' }));
    expect(within(d).getByRole('alert').textContent).toMatch(/http:\/\/ or https:\/\//);
    expect(api.createLinkMaterial).not.toHaveBeenCalled();

    const saved = { ...ROWS[1], id: 'new', title: 'Phet sims', link_url: 'https://phet.colorado.edu' };
    api.createLinkMaterial.mockResolvedValue({ ok: true, row: saved });
    fireEvent.change(within(d).getByLabelText('Link address'), { target: { value: 'https://phet.colorado.edu' } });
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: ' Phet sims ' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Add material' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.createLinkMaterial).toHaveBeenCalledWith({
      teacherId: UID, url: 'https://phet.colorado.edu', fields: { title: 'Phet sims', description: null, subject_id: null, grade_level: null },
    });
    expect(api.shareMaterialToClass).not.toHaveBeenCalled();
    expect(titles()[0]).toBe('Phet sims');
  });

  it('Add file: no Subject or Grade; Grade and section lists the teacher\'s classes; the chosen file is sent', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    const d = dialog('Add material');
    expect(within(d).queryByLabelText(/^Subject/)).toBeNull();
    const section = within(d).getByLabelText(/^Grade and section/);
    expect(section.value).toBe('');
    expect([...section.options].map(o => o.textContent))
      .toEqual(['Not shared (only me)', 'Grade 7 — Rizal', 'Grade 8 — Bonifacio', 'Grade 8 — Mabini']);
    const file = new File(['x'], 'Cells.docx', { type: '' });
    fireEvent.change(d.querySelector('#material-file'), { target: { files: [file] } });
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: 'Cells notes' } });
    api.createFileMaterial.mockResolvedValue({ ok: true, row: { ...ROWS[2], id: 'f9', title: 'Cells notes' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Add material' }));
    await waitFor(() => expect(api.createFileMaterial).toHaveBeenCalled());
    const call = api.createFileMaterial.mock.calls[0][0];
    expect(call.file).toBe(file);
    expect(call.fields).toEqual({ title: 'Cells notes', description: null, subject_id: null, grade_level: null });
  });

  it('no double submit: while saving, Save is busy (not disabled), and a second click sends nothing', async () => {
    await show();
    let resolve;
    api.createLinkMaterial.mockReturnValue(new Promise((r) => { resolve = r; }));
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    const d = dialog('Add material');
    fireEvent.click(within(d).getByRole('radio', { name: 'Link' }));
    fireEvent.change(within(d).getByLabelText('Link address'), { target: { value: 'https://e.org' } });
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: 'E' } });
    const save = within(d).getByRole('button', { name: 'Add material' });
    fireEvent.click(save);
    await waitFor(() => expect(within(d).getByRole('button', { name: 'Saving…' }).getAttribute('aria-busy')).toBe('true'));
    expect(within(d).getByRole('button', { name: 'Saving…' }).disabled).toBe(false);
    fireEvent.click(within(d).getByRole('button', { name: 'Saving…' }));
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
    expect(within(d).getByText('Shared with: Grade 7 — Rizal')).toBeTruthy();
    expect(within(d).queryByLabelText(/^Subject/)).toBeNull();
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

  it('when the classes cannot be loaded, the form says so and offers Retry', async () => {
    api.loadTeacherSections.mockResolvedValueOnce(null).mockResolvedValue(CLASSES);
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    const d = dialog('Add material');
    expect(within(d).getByText(/Your classes could not be loaded/)).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(api.loadTeacherSections).toHaveBeenCalledTimes(2));
  });
});

// T1-3: Material type is the kit toggle (native radios under a sliding thumb), and the
// link field is labelled "Link address" so it is never confused with the "Link" option.
describe('T1-3: the Material type toggle and the Link address field', () => {
  const openAdd = async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    return dialog('Add material');
  };

  it('Add: Material type is the toggle with File chosen first; no File/Link buttons are left', async () => {
    const d = await openAdd();
    const group = within(d).getByRole('group', { name: 'Material type' });
    expect(group.querySelector('.fk-tg')).toBeTruthy();
    expect(within(group).getAllByRole('radio').map(r => [r.value, r.checked])).toEqual([['file', true], ['link', false]]);
    expect(within(d).queryByRole('button', { name: 'File' })).toBeNull();
    expect(within(d).queryByRole('button', { name: 'Link' })).toBeNull();
    expect(within(d).queryByLabelText('Link address')).toBeNull();
  });

  it('choosing Link shows the "Link address" field and saves a link, never a file', async () => {
    const d = await openAdd();
    fireEvent.click(within(d).getByRole('radio', { name: 'Link' }));
    expect(within(d).getByRole('radio', { name: 'Link' }).checked).toBe(true);
    const field = within(d).getByLabelText('Link address');
    expect(field.getAttribute('type')).toBe('url');
    api.createLinkMaterial.mockResolvedValue({ ok: true, row: { ...ROWS[1], id: 'new', title: 'E', link_url: 'https://e.org' } });
    fireEvent.change(field, { target: { value: 'https://e.org' } });
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: 'E' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Add material' }));
    await waitFor(() => expect(api.createLinkMaterial).toHaveBeenCalledTimes(1));
    expect(api.createLinkMaterial.mock.calls[0][0].url).toBe('https://e.org');
    expect(api.createFileMaterial).not.toHaveBeenCalled();
  });

  it('while saving, both Material type options are disabled', async () => {
    const d = await openAdd();
    fireEvent.click(within(d).getByRole('radio', { name: 'Link' }));
    let resolve;
    api.createLinkMaterial.mockReturnValue(new Promise((r) => { resolve = r; }));
    fireEvent.change(within(d).getByLabelText('Link address'), { target: { value: 'https://e.org' } });
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: 'E' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Add material' }));
    await within(d).findByRole('button', { name: 'Saving…' });
    for (const name of ['File', 'Link']) expect(within(d).getByRole('radio', { name }).disabled).toBe(true);
    await act(async () => resolve({ ok: false, error: 'The material could not be saved. Check your connection and try again.' }));
  });

  it('Edit: the type cannot change (no toggle); a link shows its address under "Link address"', async () => {
    await show();
    fireEvent.click(within(card('DepEd K to 12')).getByRole('button', { name: 'Edit DepEd K to 12' }));
    const d = dialog('Edit material');
    expect(within(d).queryByRole('group', { name: 'Material type' })).toBeNull();
    expect(within(d).queryByRole('radio')).toBeNull();
    expect(within(d).getByLabelText('Link address').value).toBe('https://www.deped.gov.ph/k-to-12/');
  });
});
