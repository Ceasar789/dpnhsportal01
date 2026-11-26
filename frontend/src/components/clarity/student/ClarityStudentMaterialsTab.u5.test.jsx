// @vitest-environment jsdom
// U-S5 (design p21): Student Learning Materials: the "only your section and
// subjects" note, subject chips with counts, cards with subject, title,
// description, teacher and date, Download for files and Open link for links.
// Teacher names come only from the proposed U-S5 function; without it, none.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ rows: [], rpc: null, signed: [],
  graph: { fatalError: null, enrolments: [{ sections: { grade_level: 'Grade 8', name: 'Rizal' } }], cardSubjectIds: new Set(['math', 'sci']) } }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({
  useStudentData: () => ({ loading: false, graph: h.graph }),
}));
vi.mock('../../../config/supabase', () => ({ supabase: {
  from() {
    const q = new Proxy({}, { get: (_, prop) => (prop === 'then' ? (ok, bad) => Promise.resolve({ data: h.rows, error: null }).then(ok, bad) : () => q) });
    return q;
  },
  rpc: (...args) => (h.rpc ? h.rpc(...args) : Promise.resolve({ data: null, error: { message: 'missing function' } })),
  storage: { from: () => ({ createSignedUrl: async (...args) => { h.signed.push(args); return { data: { signedUrl: 'https://x.invalid/f' }, error: null }; } }) },
} }));

import ClarityStudentMaterialsTab from './ClarityStudentMaterialsTab';
import { listMaterialTeachers } from './studentMaterials';

const ROWS = [
  { id: 'm1', teacher_id: 't1', title: 'Linear Equations Slides', description: 'Step-by-step examples.', kind: 'file', file_path: 't1/m1.pdf', file_name: 'slides.pdf', subject_id: 'math', grade_level: 'Grade 8', created_at: '2026-11-18T02:00:00Z', subjects: { id: 'math', name: 'Mathematics' } },
  { id: 'm2', teacher_id: 't1', title: 'Khan Academy', description: null, kind: 'link', link_url: 'https://example.org/k', subject_id: 'math', grade_level: 'Grade 8', created_at: '2026-11-12T02:00:00Z', subjects: { id: 'math', name: 'Mathematics' } },
  { id: 'm3', teacher_id: 't2', title: 'Cell Diagram', description: 'Labelled.', kind: 'file', file_path: 't2/m3.png', file_name: 'cells.png', subject_id: 'sci', grade_level: 'Grade 8', created_at: '2026-11-09T02:00:00Z', subjects: { id: 'sci', name: 'Science' } },
];
afterEach(() => { cleanup(); h.rows = []; h.rpc = null; h.signed = []; vi.restoreAllMocks(); });
const card = title => screen.getByRole('heading', { level: 2, name: title }).closest('li');

describe('U-S5 student Learning Materials', () => {
  it('note, subtitle with grade and section, chips with counts', async () => {
    h.rows = ROWS;
    render(<ClarityStudentMaterialsTab />);
    await screen.findByText('Cell Diagram');
    expect(screen.getByText('You only see materials your teachers shared with your class.')).toBeTruthy();
    expect(screen.getByText('Slides, notes and links from your teachers · Grade 8 · Rizal')).toBeTruthy();
    const chips = within(screen.getByRole('group', { name: 'Filter by subject' })).getAllByRole('button').map(b => b.textContent);
    expect(chips).toEqual(['All 3', 'Mathematics 2', 'Science 1']);
    fireEvent.click(screen.getByRole('button', { name: 'Science 1' }));
    expect(screen.queryByText('Khan Academy')).toBeNull();
  });

  it('cards: subject, title, description, teacher · date; Download for files, Open link for links', async () => {
    h.rows = ROWS;
    h.rpc = async (name) => (name === 'eduscribe_student_material_teachers'
      ? { data: [{ id: 't1', name: "Ma'am Reyes" }, { id: 't2', name: '  ' }], error: null } : { data: null, error: { message: 'x' } });
    render(<ClarityStudentMaterialsTab />);
    await screen.findByText("Ma'am Reyes · Nov 18");
    const slides = card('Linear Equations Slides');
    expect(within(slides).getByText('Mathematics')).toBeTruthy();
    expect(within(slides).getByText('Step-by-step examples.')).toBeTruthy();
    expect(within(card('Cell Diagram')).getByText('Nov 09')).toBeTruthy();
    expect(within(card('Khan Academy')).getByRole('link', { name: 'Open link Khan Academy (opens in a new tab)' }).getAttribute('href')).toBe('https://example.org/k');
    const tab = { opener: 'x', location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab);
    fireEvent.click(within(slides).getByRole('button', { name: 'Download Linear Equations Slides' }));
    await vi.waitFor(() => expect(tab.location.href).toBe('https://x.invalid/f'));
    expect(h.signed[0]).toEqual(['t1/m1.pdf', 300, { download: 'slides.pdf' }]);
    expect(tab.opener).toBeNull();
  });

  it('without the teacher-name function the cards show only the date, never a made-up name', async () => {
    h.rows = ROWS;
    render(<ClarityStudentMaterialsTab />);
    await screen.findByText('Nov 18');
    expect(screen.queryByText(/Reyes|Teacher/)).toBeNull();
    expect(await listMaterialTeachers({})).toEqual(new Map());
    expect(await listMaterialTeachers({ rpc: () => { throw new Error('boom'); } })).toEqual(new Map());
  });
});
