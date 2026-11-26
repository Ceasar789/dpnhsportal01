// @vitest-environment jsdom
// U-PDF-T-FIX-B: Student Learning Materials shows exactly the rows row level
// security returns (shared with the student's class): no grade or subject
// filter and no early return, even with no grade or scheduled subjects. Subject
// chips only from rows with a subject, and only with 2 or more. The note.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ rows: [], ops: [], graph: { fatalError: null, enrolments: [], cardSubjectIds: new Set() } }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({ useStudentData: () => ({ loading: false, graph: h.graph }) }));
vi.mock('../../../config/supabase', () => ({ supabase: {
  from(table) {
    h.ops.push(['from', table]);
    const q = new Proxy({}, { get: (_, prop) => (prop === 'then' ? (ok, bad) => Promise.resolve({ data: h.rows, error: null }).then(ok, bad)
      : (...args) => { h.ops.push([prop, ...args]); return q; }) });
    return q;
  },
  rpc: () => Promise.resolve({ data: null, error: { message: 'missing' } }),
  storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: { message: 'no' } }) }) },
} }));

import ClarityStudentMaterialsTab from './ClarityStudentMaterialsTab';

const R = (id, title, subject) => ({ id, teacher_id: 't1', title, description: null, kind: 'link', link_url: `https://example.org/${id}`,
  subject_id: subject?.id ?? null, subjects: subject, grade_level: 'Grade 8', created_at: '2026-11-18T02:00:00Z' });
const MATH = { id: 'math', name: 'Mathematics' };
const SCI = { id: 'sci', name: 'Science' };
afterEach(() => { cleanup(); h.rows = []; h.ops = []; });

describe('U-PDF-T-FIX-B student Learning Materials', () => {
  it('reads even with no grade or subjects, with no grade or subject filter, and lists every returned row', async () => {
    h.rows = [R('a', 'Shared notes', null), R('b', 'Ratios', MATH)];
    render(<ClarityStudentMaterialsTab />);
    expect(await screen.findByText('Shared notes')).toBeTruthy();
    expect(screen.getByText('Ratios')).toBeTruthy();
    expect(h.ops.filter(([op]) => op === 'eq' || op === 'in')).toEqual([]);
    expect(h.ops[0]).toEqual(['from', 'learning_materials']);
  });

  it('the note says materials are shared with the class', async () => {
    render(<ClarityStudentMaterialsTab />);
    expect((await screen.findByRole('note')).textContent.trim()).toBe('You only see materials your teachers shared with your class.');
  });

  it('subject chips: none with one subject (rows without a subject do not count)', async () => {
    h.rows = [R('a', 'Shared notes', null), R('b', 'Ratios', MATH), R('c', 'Graphs', MATH)];
    render(<ClarityStudentMaterialsTab />);
    await screen.findByText('Ratios');
    expect(screen.queryByRole('group', { name: 'Filter by subject' })).toBeNull();
  });

  it('subject chips: shown with two subjects, only from rows that have one', async () => {
    h.rows = [R('a', 'Shared notes', null), R('b', 'Ratios', MATH), R('c', 'Cells', SCI)];
    render(<ClarityStudentMaterialsTab />);
    const group = await screen.findByRole('group', { name: 'Filter by subject' });
    expect(group.textContent).toMatch(/Mathematics/);
    expect(group.textContent).toMatch(/Science/);
    expect(group.querySelectorAll('button')).toHaveLength(3);
  });
});
