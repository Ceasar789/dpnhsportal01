// @vitest-environment jsdom
// U-PDF-S (design p21): the info banner, count bubbles on the chips, a search at
// the top right (title, description, subject) and a colour bar per subject.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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

const ROWS = [
  { id: 'm1', teacher_id: 't1', title: 'Linear Equations Slides', description: 'Step-by-step examples.', kind: 'file', file_path: 't1/m1.pdf', file_name: 'slides.pdf', subject_id: 'math', grade_level: 'Grade 8', created_at: '2026-11-18T02:00:00Z', subjects: { id: 'math', name: 'Mathematics' } },
  { id: 'm2', teacher_id: 't1', title: 'Khan Academy', description: null, kind: 'link', link_url: 'https://example.org/k', subject_id: 'math', grade_level: 'Grade 8', created_at: '2026-11-12T02:00:00Z', subjects: { id: 'math', name: 'Mathematics' } },
  { id: 'm3', teacher_id: 't2', title: 'Cell Diagram', description: 'Labelled.', kind: 'file', file_path: 't2/m3.png', file_name: 'cells.png', subject_id: 'sci', grade_level: 'Grade 8', created_at: '2026-11-09T02:00:00Z', subjects: { id: 'sci', name: 'Science' } },
];
afterEach(() => { cleanup(); h.rows = []; h.rpc = null; h.signed = []; });
const titles = () => screen.queryAllByRole('heading', { level: 2 }).map(x => x.textContent);

describe('U-PDF-S student Learning Materials', () => {
  it('banner, bubbles and one colour per subject', async () => {
    h.rows = ROWS;
    render(<ClarityStudentMaterialsTab />);
    await screen.findByText('Cell Diagram');
    const note = screen.getByRole('note');
    expect(note.textContent.trim()).toBe('You only see materials your teachers posted to your section and subjects.');
    expect(note.querySelector('svg')).toBeTruthy();
    expect([...document.querySelectorAll('.x-slm-n')].map(n => n.textContent)).toEqual(['3', '2', '1']);
    const bar = title => screen.getByRole('heading', { level: 2, name: title }).closest('li').querySelector('.x-slm-bar').className;
    expect(bar('Linear Equations Slides')).toBe(bar('Khan Academy'));
    expect(bar('Cell Diagram')).not.toBe(bar('Khan Academy'));
  });

  it('search matches title, description or subject, and combines with the chip; no match offers Clear search', async () => {
    h.rows = ROWS;
    render(<ClarityStudentMaterialsTab />);
    await screen.findByText('Cell Diagram');
    const search = screen.getByRole('searchbox', { name: 'Search materials' });
    fireEvent.change(search, { target: { value: 'labelled' } });
    expect(titles()).toEqual(['Cell Diagram']);
    fireEvent.change(search, { target: { value: 'science' } });
    expect(titles()).toEqual(['Cell Diagram']);
    fireEvent.change(search, { target: { value: 'khan' } });
    fireEvent.click(screen.getByRole('button', { name: /^Science/ }));
    expect(screen.getByText('No materials match your search.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(titles()).toHaveLength(3);
  });
});
