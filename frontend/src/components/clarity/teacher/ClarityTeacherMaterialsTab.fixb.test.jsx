// @vitest-environment jsdom
// U-PDF-T-FIX-B (design p20, filter version): Learning Materials shared by
// CLASS. The page header, filters and table, Add material with "Grade and
// section (optional)" (create, then share; a failed share keeps it Private and
// never loses the file), Edit's read-only "Shared with", and the Reuse and
// repost dialog (one class select, Already posted, Select all, one student
// column, NULL for everyone or the ticked ids, refresh after success).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const UID = '0b4e3c3a-1d2e-4f5a-8b9c-0d1e2f3a4b5c';
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: '0b4e3c3a-1d2e-4f5a-8b9c-0d1e2f3a4b5c' } }) }));
vi.mock('./materials/materialsApi', () => ({
  listMaterials: vi.fn(), loadOfficialSchoolYear: vi.fn(), createFileMaterial: vi.fn(), createLinkMaterial: vi.fn(),
  updateMaterial: vi.fn(), deleteMaterial: vi.fn(), signedMaterialUrl: vi.fn(), openInNewTab: vi.fn(),
  listMaterialClasses: vi.fn(), loadTeacherSections: vi.fn(), loadClassList: vi.fn(), shareMaterialToClass: vi.fn(),
}));

import * as api from './materials/materialsApi';
import ClarityTeacherMaterialsTab from './ClarityTeacherMaterialsTab';

const S7 = { id: 's7', name: 'Rizal', grade_level: 'Grade 7' };
const S8 = { id: 's8', name: 'Mabini', grade_level: 'Grade 8' };
const S8B = { id: 's8b', name: 'Bonifacio', grade_level: 'Grade 8' };
const CLASSES = [S7, S8B, S8];
const ROWS = [
  { id: 'r1', kind: 'link', title: 'Cell slides', description: null, subject_id: null, subjects: null, grade_level: 'Grade 8',
    link_url: 'https://example.org/cells', created_at: '2026-11-18T02:00:00Z' },
  { id: 'r2', kind: 'link', title: 'Study tips', description: null, subject_id: null, subjects: null, grade_level: null,
    link_url: 'https://example.org/tips', created_at: '2026-11-12T02:00:00Z' },
];
const SHARES = [{ material_id: 'r1', section_id: 's8', all_students: true, sections: S8 }];
const ROSTER = [{ id: 'p1', name: 'Ana Cruz' }, { id: 'p2', name: 'Ben Reyes' }, { id: 'p3', name: 'Carla Diaz' }];

const show = async () => {
  render(<ClarityTeacherMaterialsTab />);
  await screen.findByRole('heading', { level: 1, name: 'Learning Materials' });
  await waitFor(() => expect(screen.queryByText('Loading learning materials…')).toBeNull());
  await waitFor(() => expect(screen.getByRole('button', { name: 'Repost Cell slides' }).disabled).toBe(false));
};
const row = title => screen.getByRole('rowheader', { name: title }).closest('tr');
const dialog = name => screen.getByRole('dialog', { name });

beforeEach(() => {
  api.listMaterials.mockResolvedValue(ROWS);
  api.listMaterialClasses.mockResolvedValue(SHARES);
  api.loadTeacherSections.mockResolvedValue(CLASSES);
  api.loadClassList.mockResolvedValue(ROSTER);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('the page (design p20, filter version)', () => {
  it('header, subtitle with a period, Add material; no grade cards, chips or "My materials"; DepEd official resources below', async () => {
    await show();
    expect(screen.getByText('Your own files and links for teaching.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add material' })).toBeTruthy();
    expect(document.querySelector('.x-tlm-gcard, .x-tlm-chips[role="group"]')).toBeNull();
    expect(screen.queryByRole('heading', { name: /My materials/ })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'DepEd official resources' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'DepEd learning resources' })).toBeNull();
    const tools = document.querySelector('.x-tlm-filters');
    expect(within(tools).getByRole('searchbox', { name: 'Search learning materials' })).toBeTruthy();
    expect(within(tools).getAllByRole('combobox').map(c => c.closest('label').querySelector('.x-sr').textContent))
      .toEqual(['Filter by grade', 'Filter by section', 'Filter by type']);
    expect(screen.getByText('2 materials')).toBeTruthy();
  });

  it('the Class column: a class, or Private (only me)', async () => {
    await show();
    expect(within(row('Cell slides')).getByText('Grade 8 — Mabini')).toBeTruthy();
    expect(within(row('Study tips')).getByText('Private (only me)')).toBeTruthy();
  });

  it('when the classes cannot be read, the table still shows, with an alert and Retry; Repost waits', async () => {
    api.listMaterialClasses.mockRejectedValueOnce(new Error('x')).mockResolvedValue(SHARES);
    render(<ClarityTeacherMaterialsTab />);
    expect((await screen.findByText(/Your classes could not be loaded/)).getAttribute('role')).toBe('alert');
    expect(screen.getByRole('button', { name: 'Repost Cell slides' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Repost Cell slides' }).disabled).toBe(false));
    expect(screen.queryByText(/Your classes could not be loaded/)).toBeNull();
  });
});

describe('Add material: Grade and section (optional)', () => {
  const fill = async (sectionId) => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    const d = dialog('Add material');
    fireEvent.click(within(d).getByRole('radio', { name: 'Link' }));
    fireEvent.change(within(d).getByLabelText('Link address'), { target: { value: 'https://e.org' } });
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: 'Ratios' } });
    fireEvent.change(within(d).getByLabelText(/^Grade and section/), { target: { value: sectionId } });
    return d;
  };

  it('grouped by grade, Not shared first, with the helper text; no Subject or Grade fields', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    const d = dialog('Add material');
    const select = within(d).getByLabelText(/^Grade and section/);
    expect(select.options[0].textContent).toBe('Not shared (only me)');
    expect([...select.querySelectorAll('optgroup')].map(g => [g.label, [...g.children].map(o => o.textContent)]))
      .toEqual([['Grade 7', ['Grade 7 — Rizal']], ['Grade 8', ['Grade 8 — Bonifacio', 'Grade 8 — Mabini']]]);
    expect(document.getElementById(select.getAttribute('aria-describedby')).textContent).toBe('Pick one of your classes, for example Grade 7 — Rizal, '
      + 'and only its students can see this material. Leave it empty to keep it private. You can repost it to other classes later.');
    expect(within(d).queryByLabelText(/^Subject/)).toBeNull();
    expect(within(d).queryByLabelText(/^Grade$|^Grade level/)).toBeNull();
  });

  it('a class: the material takes its grade, then is shared with it (everyone), and the table refreshes', async () => {
    const d = await fill('s8');
    api.createLinkMaterial.mockResolvedValue({ ok: true, row: { ...ROWS[1], id: 'n1', title: 'Ratios', grade_level: 'Grade 8' } });
    api.shareMaterialToClass.mockResolvedValue({ ok: true });
    fireEvent.click(within(d).getByRole('button', { name: 'Add material' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.createLinkMaterial.mock.calls[0][0].fields).toEqual({ title: 'Ratios', description: null, subject_id: null, grade_level: 'Grade 8' });
    expect(api.shareMaterialToClass).toHaveBeenCalledWith({ materialId: 'n1', sectionId: 's8' });
    expect(await screen.findByText('Material added and shared with Grade 8 — Mabini.')).toBeTruthy();
    await waitFor(() => expect(api.listMaterialClasses).toHaveBeenCalledTimes(2));
  });

  it('a failed share: the material stays saved and Private, and the teacher is told to repost', async () => {
    const d = await fill('s7');
    api.createLinkMaterial.mockResolvedValue({ ok: true, row: { ...ROWS[1], id: 'n2', title: 'Ratios', grade_level: 'Grade 7' } });
    api.shareMaterialToClass.mockResolvedValue({ ok: false, error: 'You can only share with your own classes.' });
    fireEvent.click(within(d).getByRole('button', { name: 'Add material' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.createLinkMaterial).toHaveBeenCalledTimes(1);
    expect(api.deleteMaterial).not.toHaveBeenCalled();
    expect((await screen.findByRole('alert', {}, { timeout: 2000 })).textContent).toBe("Saved, but couldn't share it with the class. You can repost it.");
    expect(within(row('Ratios')).getByText('Private (only me)')).toBeTruthy();
  });

  it('a file whose save fails is never shared', async () => {
    const d = await fill('s7');
    api.createLinkMaterial.mockResolvedValue({ ok: false, error: 'The material could not be saved. Check your connection and try again.' });
    fireEvent.click(within(d).getByRole('button', { name: 'Add material' }));
    expect((await within(d).findByRole('alert')).textContent).toMatch(/could not be saved/);
    expect(api.shareMaterialToClass).not.toHaveBeenCalled();
  });
});

describe('Edit material', () => {
  it('no Subject, Grade or class select; a read-only "Shared with" line and the Repost hint; Delete stays', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Study tips' }));
    const d = dialog('Edit material');
    expect(within(d).getByText('Shared with: Private (only me)')).toBeTruthy();
    expect(within(d).getByText('Use Repost to share it with another class.')).toBeTruthy();
    expect(within(d).queryByRole('combobox')).toBeNull();
    expect(within(d).getByRole('button', { name: 'Delete' })).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Cell slides' }));
    expect(within(dialog('Edit material')).getByText('Shared with: Grade 8 — Mabini')).toBeTruthy();
  });
});

describe('Reuse and repost', () => {
  const open = async (title = 'Cell slides') => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: `Repost ${title}` }));
    return dialog('Reuse and repost');
  };
  const classSelect = d => within(d).getByLabelText('Post to which class?');

  it('subtitle; a graded material offers only classes of its grade; the posted one is marked and disabled; no radios', async () => {
    const d = await open();
    expect(d.textContent).toContain('Cell slides · posted to Grade 8 — Mabini');
    const options = [...classSelect(d).options].slice(1).map(o => [o.textContent, o.disabled]);
    expect(options).toEqual([['Grade 8 — Bonifacio', false], ['Grade 8 — Mabini (Already posted)', true]]);
    expect(within(d).queryByRole('radio')).toBeNull();
    expect(within(d).getByRole('button', { name: 'Repost' }).disabled).toBe(true);
  });

  it('a material with no grade offers every class; its subtitle says Private', async () => {
    const d = await open('Study tips');
    expect(d.textContent).toContain('Study tips · Private');
    expect([...classSelect(d).options].slice(1).map(o => o.textContent))
      .toEqual(['Grade 7 — Rizal', 'Grade 8 — Bonifacio', 'Grade 8 — Mabini']);
  });

  it('the class roster in one column, all ticked; Select all is indeterminate when partial; Repost needs one student', async () => {
    const d = await open();
    fireEvent.change(classSelect(d), { target: { value: 's8b' } });
    await within(d).findByText('Ana Cruz');
    expect(api.loadClassList).toHaveBeenCalledWith(expect.anything(), 's8b');
    const all = within(d).getByRole('checkbox', { name: /Select all/ });
    const boxes = within(within(d).getByRole('list')).getAllByRole('checkbox');
    expect(boxes.map(b => b.checked)).toEqual([true, true, true]);
    expect([all.checked, all.indeterminate]).toEqual([true, false]);
    expect(within(d).getByText('3 of 3 will see it')).toBeTruthy();
    expect(d.querySelectorAll('.x-tlm-avatar')[1].textContent).toBe('B');
    fireEvent.click(boxes[1]);
    expect([all.checked, all.indeterminate]).toEqual([false, true]);
    expect(within(d).getByText('2 of 3 will see it')).toBeTruthy();
    fireEvent.click(all);
    expect(boxes.map(b => b.checked)).toEqual([true, true, true]);
    fireEvent.click(all);
    expect(boxes.map(b => b.checked)).toEqual([false, false, false]);
    expect(within(d).getByRole('button', { name: 'Repost to Grade 8 — Bonifacio' }).disabled).toBe(true);
  });

  it('everyone ticked sends NULL; then the table is read again and a toast confirms', async () => {
    const d = await open();
    fireEvent.change(classSelect(d), { target: { value: 's8b' } });
    await within(d).findByText('Ana Cruz');
    api.shareMaterialToClass.mockResolvedValue({ ok: true });
    fireEvent.click(within(d).getByRole('button', { name: 'Repost to Grade 8 — Bonifacio' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.shareMaterialToClass).toHaveBeenCalledWith(expect.objectContaining({ materialId: 'r1', sectionId: 's8b', studentIds: null }));
    await waitFor(() => expect(api.listMaterialClasses).toHaveBeenCalledTimes(2));
    expect(api.listMaterials).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Posted to Grade 8 — Bonifacio.')).toBeTruthy();
  });

  it('some ticked sends their ids; a refused share shows the friendly sentence and keeps the dialog', async () => {
    const d = await open();
    fireEvent.change(classSelect(d), { target: { value: 's8b' } });
    await within(d).findByText('Ana Cruz');
    fireEvent.click(within(d).getByRole('checkbox', { name: /Ben Reyes/ }));
    let resolve;
    api.shareMaterialToClass.mockReturnValue(new Promise((r) => { resolve = r; }));
    const submit = within(d).getByRole('button', { name: 'Repost to Grade 8 — Bonifacio' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(api.shareMaterialToClass).toHaveBeenCalledTimes(1);
    expect(api.shareMaterialToClass.mock.calls[0][0].studentIds).toEqual(['p1', 'p3']);
    await act(async () => resolve({ ok: false, error: 'This material is already posted to that class.' }));
    expect(within(d).getByRole('alert').textContent).toBe('This material is already posted to that class.');
    expect(api.listMaterialClasses).toHaveBeenCalledTimes(1);
  });

  it('a roster that cannot be read says so with Retry', async () => {
    api.loadClassList.mockResolvedValueOnce(null).mockResolvedValue(ROSTER);
    const d = await open();
    fireEvent.change(classSelect(d), { target: { value: 's8b' } });
    expect((await within(d).findByText(/The class list could not be loaded/)).getAttribute('role')).toBe('alert');
    fireEvent.click(within(d).getByRole('button', { name: 'Retry' }));
    expect(await within(d).findByText('Ana Cruz')).toBeTruthy();
  });

  it('the classes are read for the signed-in teacher', async () => {
    await open();
    expect(api.loadTeacherSections).toHaveBeenCalledWith(expect.anything(), UID);
  });
});
