// @vitest-environment jsdom
// U-T4: the page never says there are no materials while it lists the DepEd
// resources; the empty card is about the teacher's own uploads. A failed load
// is an error with Retry, never an empty state. Grade cards (design p20) show
// counts of the teacher's own materials; subject chips show their counts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ assign: { assignmentRows: [], loadState: 'ready', retry: () => {} } }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 't-1' } }) }));
vi.mock('../../../pages/dashboards/teacher/lessonPlans/useQuickCreateAssignments', () => ({ default: () => h.assign }));
vi.mock('./materials/materialsApi', () => ({
  listMaterials: vi.fn(), loadOfficialSchoolYear: vi.fn(), createFileMaterial: vi.fn(), createLinkMaterial: vi.fn(),
  updateMaterial: vi.fn(), deleteMaterial: vi.fn(), signedMaterialUrl: vi.fn(), openInNewTab: vi.fn(),
}));

import * as api from './materials/materialsApi';
import ClarityTeacherMaterialsTab from './ClarityTeacherMaterialsTab';

const M = (id, title, subject, grade) => ({ id, kind: 'link', title, description: null, subject_id: subject, subjects: { id: subject, name: subject === 'math' ? 'Mathematics' : 'Science' },
  grade_level: grade, link_url: 'https://example.org/x', created_at: '2026-11-10T08:00:00Z' });
const ROWS = [M('1', 'Slides', 'math', 'Grade 8'), M('2', 'Practice', 'math', 'Grade 8'), M('3', 'Cells', 'sci', 'Grade 8'), M('4', 'Ratio', 'math', 'Grade 7')];
beforeEach(() => { api.loadOfficialSchoolYear.mockResolvedValue('2026-2027'); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const settle = async () => {
  await screen.findByRole('heading', { level: 1, name: 'Learning Materials' });
  await waitFor(() => expect(screen.queryByText('Loading learning materials…')).toBeNull());
};
const deped = () => screen.getByRole('list', { name: 'DepEd learning resources by grade' });

describe('U-T4 the empty and error states', () => {
  it('no own materials: says so about the teacher\'s uploads only, while the DepEd resources are listed', async () => {
    api.listMaterials.mockResolvedValue([]);
    render(<ClarityTeacherMaterialsTab />); await settle();
    expect(deped()).toBeTruthy();
    expect(screen.queryByText('No learning materials yet.')).toBeNull();
    expect(screen.getByText('You have not added your own materials yet.')).toBeTruthy();
  });

  it('a failed load is an alert with Retry, never an empty state', async () => {
    api.listMaterials.mockRejectedValue(new Error('offline'));
    render(<ClarityTeacherMaterialsTab />); await settle();
    expect(screen.getAllByRole('alert').map(a => a.textContent)).toContain('Learning materials could not be loaded. Check your connection and try again.');
    expect(screen.queryByText(/have not added/)).toBeNull();
    expect(screen.queryByText('No learning materials yet.')).toBeNull();
    api.listMaterials.mockResolvedValue(ROWS);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Slides' })).toBeTruthy();
  });

  it('with own materials the empty card never shows (also while reloading)', async () => {
    api.listMaterials.mockResolvedValue(ROWS);
    render(<ClarityTeacherMaterialsTab />); await settle();
    expect(screen.queryByText(/have not added/)).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'My materials' })).toBeTruthy();
  });
});

describe('U-T4 grade cards and subject counts (design p20)', () => {
  it('Grade 7-10 cards with counts; Open shows that grade, its subject chips with counts', async () => {
    api.listMaterials.mockResolvedValue(ROWS);
    render(<ClarityTeacherMaterialsTab />); await settle();
    const cards = [...document.querySelectorAll('.x-tlm-gcard')].map(c => c.textContent);
    expect(cards).toEqual(['Grade 71 materialOpen', 'Grade 83 materialsOpen', 'Grade 90 materialsOpen', 'Grade 100 materialsOpen']);
    fireEvent.click(screen.getByRole('button', { name: 'Open Grade 8: 3 materials' }));
    expect(screen.getByRole('button', { name: 'Open Grade 8: 3 materials' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Grade 8 · Choose a subject')).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Filter by subject' })).getAllByRole('button').map(b => b.textContent))
      .toEqual(['All subjects 3', 'Mathematics 2', 'Science 1']);
    expect(screen.getByRole('heading', { level: 2, name: 'My materials · Grade 8' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'Ratio' })).toBeNull();
  });
});
