// @vitest-environment jsdom
// 4e (Student #25, design p21): Student Learning Materials stays OFF until its policy exists; when on it asks only for
// the student's grade and scheduled subjects, and shows files and safe links.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ calls: [], reply: { data: [], error: null }, graph: null }));
vi.mock('../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({ useStudentData: () => ({ graph: h.graph, loading: false }) }));
vi.mock('../../../config/supabase', () => ({ supabase: { from(table) {
  const calls = [table]; h.calls.push(calls);
  const q = new Proxy({}, { get: (_, prop) => (prop === 'then' ? (ok, bad) => Promise.resolve(h.reply).then(ok, bad)
    : (...args) => { calls.push([prop, ...args]); return q; }) });
  return q;
}, storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: { message: 'no' } }) }) } } }));

import ClarityStudentMaterialsTab from './ClarityStudentMaterialsTab';
import { listStudentMaterials, studentMaterialsFlagEnabled } from './studentMaterials';

const graph = { fatalError: null, enrolments: [{ sections: { grade_level: 'Grade 8' } }], cardSubjectIds: new Set(['sci', 'eng']) };
afterEach(() => { cleanup(); h.calls = []; h.reply = { data: [], error: null }; });

describe('Student Learning Materials (4e)', () => {
  it('the flag is off unless exactly "1"', () => {
    expect(studentMaterialsFlagEnabled({})).toBe(false);
    expect(studentMaterialsFlagEnabled({ VITE_STUDENT_LEARNING_MATERIALS_ENABLED: 'true' })).toBe(false);
    expect(studentMaterialsFlagEnabled({ VITE_STUDENT_LEARNING_MATERIALS_ENABLED: '1' })).toBe(true);
  });
  it('U-PDF-T-FIX-B: one read with no grade or subject filter (row level security returns the class\'s rows)', async () => {
    await listStudentMaterials();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0][0]).toBe('learning_materials');
    expect(h.calls[0].filter(c => Array.isArray(c) && (c[0] === 'eq' || c[0] === 'in'))).toEqual([]);
    expect(h.calls[0]).toEqual(expect.arrayContaining([['order', 'created_at', { ascending: false }]]));
  });
  it('lists materials; an unsafe link is not made clickable', async () => {
    h.graph = graph;
    h.reply = { data: [
      { id: 'm1', title: 'Cell diagram', kind: 'file', file_path: 't/m1-cell.pdf', subject_id: 'sci', grade_level: 'Grade 8', subjects: { id: 'sci', name: 'Science' } },
      { id: 'm2', title: 'Bad link', kind: 'link', link_url: 'javascript:alert(1)', subject_id: 'eng', grade_level: 'Grade 8', subjects: { id: 'eng', name: 'English' } },
    ], error: null };
    render(<ClarityStudentMaterialsTab />);
    expect(await screen.findByText('Cell diagram')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download Cell diagram' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Bad link/ })).toBeNull();
  });
  it('a failed read is an error with Retry, never the empty state', async () => {
    h.graph = graph;
    h.reply = { data: null, error: { message: 'denied' } };
    render(<ClarityStudentMaterialsTab />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('No learning materials yet.')).toBeNull();
  });
});
