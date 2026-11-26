// @vitest-environment jsdom
// 4e (design p20): the teacher's own materials by grade, with counts. Harness from ClarityTeacherMaterialsTab.test.jsx.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

const show = async (rows = ROWS) => {
  api.listMaterials.mockResolvedValue(rows);
  render(<ClarityTeacherMaterialsTab />);
  await screen.findByRole('heading', { level: 1, name: 'Learning Materials' });
  await waitFor(() => expect(screen.queryByText('Loading learning materials…')).toBeNull());
};
// U-PDF-T-FIX-B (design p20, filter version): a Grade dropdown replaces the grade cards.
const cards = () => [...document.querySelectorAll('.x-tlm-table tbody tr')];
const titles = () => cards().map(c => c.querySelector('.x-tlm-tname').textContent);
const pickGrade = level => fireEvent.change(screen.getByRole('combobox', { name: 'Filter by grade' }), { target: { value: level } });

beforeEach(() => {
  h.assign = { assignmentRows: ASSIGNMENTS, loadState: 'ready', retry: () => {} }; api.loadOfficialSchoolYear.mockResolvedValue('2026-2027');
  api.listMaterialClasses.mockResolvedValue([]); api.loadTeacherSections.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Grade filter (4e)', () => {
  it('no grade cards: a Grade dropdown with All grades and Grade 7-10 (design p20, filter version)', async () => {
    await show();
    expect(document.querySelector('.x-tlm-gcard')).toBeNull();
    expect([...screen.getByRole('combobox', { name: 'Filter by grade' }).options].map(o => o.textContent))
      .toEqual(['All grades', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']);
    expect(screen.getByText('3 materials')).toBeTruthy();
  });
  it('a grade lists that grade only (a material with no grade only under All grades); All grades brings everything back', async () => {
    await show();
    pickGrade('Grade 8');
    expect(titles()).toEqual(['Cell diagram']);
    expect(screen.getByText('1 material')).toBeTruthy();
    pickGrade('');
    expect(titles()).toHaveLength(3);
  });
  it('a grade with nothing yet: no match, with Clear filters', async () => {
    await show([ROWS[0]]);
    pickGrade('Grade 9');
    expect(screen.getByText('No materials match your search or filters.')).toBeTruthy();
    expect(titles()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(titles()).toEqual(['Cell diagram']);
  });
});

describe('Student Learning Materials stays off (4e)', () => {
  it('without the flag the student menu and pages are unchanged', async () => {
    const { readFileSync } = await import('node:fs');
    const layout = readFileSync('src/components/clarity/student/ClarityStudentLayout.jsx', 'utf8');
    expect(layout).toMatch(/\.\.\.\(studentMaterialsFlagEnabled\(\) \? \{ '\/student-dashboard\/materials': ClarityStudentMaterialsTab \} : \{\}\)/);
    expect(layout).toMatch(/\.\.\.\(studentMaterialsFlagEnabled\(\) \? \[\{ path: '\/student-dashboard\/materials'/);
    const { studentMaterialsFlagEnabled } = await import('../student/studentMaterials');
    expect(studentMaterialsFlagEnabled()).toBe(false);
  });
});
