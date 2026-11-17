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
const dialog = name => screen.getByRole('dialog', { name });

beforeEach(() => {
  h.assign = { assignmentRows: ASSIGNMENTS, loadState: 'ready', retry: vi.fn() };
  api.loadOfficialSchoolYear.mockResolvedValue('2026-2027');
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

// U5: Learning Materials problems sit on their fields (aria-invalid + linked
// message + summary), clear as they are fixed, and Save is never disabled.
describe('U5 Learning Materials: errors on the fields, Save not disabled while busy', () => {
  const openLink = async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    const d = dialog('Add material');
    fireEvent.click(within(d).getByRole('button', { name: 'Link' }));
    return d;
  };

  it('a press on an empty link form marks Link and Title, links each message, and saves nothing', async () => {
    const d = await openLink();
    fireEvent.click(within(d).getByRole('button', { name: 'Add material' }));
    for (const label of ['Link', 'Title']) {
      const input = within(d).getByLabelText(label);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      const message = document.getElementById(input.getAttribute('aria-describedby'));
      expect(message.textContent.length).toBeGreaterThan(0);
    }
    expect(within(d).getByLabelText('Title').getAttribute('aria-describedby')).toMatch(/-error$/);
    expect(document.getElementById(within(d).getByLabelText('Title').getAttribute('aria-describedby')).textContent).toBe('Enter a title.');
    expect(document.activeElement).toBe(within(d).getByLabelText('Link'));
    expect(api.createLinkMaterial).not.toHaveBeenCalled();
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: 'Phet sims' } });
    expect(within(d).getByLabelText('Title').getAttribute('aria-invalid')).toBeNull();
    expect(within(d).getByLabelText('Link').getAttribute('aria-invalid')).toBe('true');
  });

  it('a file material with no file: the file input is marked and described by the message', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    const d = dialog('Add material');
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: 'Worksheet scan' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Add material' }));
    const input = d.querySelector('#material-file');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby').split(' ')[0]).toBe('material-file-error');
    expect(document.getElementById('material-file-error').textContent.length).toBeGreaterThan(0);
    expect(api.createFileMaterial).not.toHaveBeenCalled();
  });

  it('while saving, Save stays enabled and busy, and more presses send nothing', async () => {
    const d = await openLink();
    let resolve;
    api.createLinkMaterial.mockReturnValue(new Promise((r) => { resolve = r; }));
    fireEvent.change(within(d).getByLabelText('Link'), { target: { value: 'https://e.org' } });
    fireEvent.change(within(d).getByLabelText('Title'), { target: { value: 'E' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Add material' }));
    const busy = await within(d).findByRole('button', { name: 'Saving…' });
    expect(busy.disabled).toBe(false);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(busy);
    fireEvent.click(busy);
    expect(api.createLinkMaterial).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: false, error: 'The material could not be saved. Check your connection and try again.' }));
  });
});
