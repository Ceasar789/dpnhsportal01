// @vitest-environment jsdom
// U-PDF-S2: the open task (Clarity) keeps the paper and Submit inside one
// labelled, focusable scroll area ("Worksheet"), with Details (then Your work)
// in one side column beside its top. The classic view renders as before. The
// CSS pins check the bounded height, overscroll containment, the sticky side
// column, the phone heights (dvh, bar-aware) and the print reset.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const state = vi.hoisted(() => ({ graph: null, items: {} }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'student-1', name: 'Sample Student' } }) }));
vi.mock('../StudentDataContext', () => ({ useStudentData: () => ({ graph: state.graph, loading: false, refresh: vi.fn() }) }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: fn => fn() }));
vi.mock('../../../../config/supabase', () => ({ supabase: { from(table) {
  let worksheetId = null;
  const q = new Proxy({}, { get: (_, prop) => {
    if (prop === 'then') {
      const data = table === 'worksheet_items' ? (state.items[worksheetId] || []) : table === 'worksheets' ? null : [];
      return (ok, bad) => Promise.resolve({ data, error: null }).then(ok, bad);
    }
    if (prop === 'eq') return (column, value) => { if (column === 'worksheet_id') worksheetId = value; return q; };
    return () => q;
  } });
  return q;
} } }));
vi.mock('../submissions/YourWorkPanel', () => ({ default: () => <section aria-label="Your work">panel</section> }));

import StudentTasksTab from './TasksTab';

const sheet = (id, extra = {}) => ({ id, title: `Task ${id}`, subject: 'English', subject_id: 'eng', task_type: 'quiz', items: 3, instructions: 'Answer.', checking_mode: 'manual', max_points: 3, ...extra });
const question = (id, i) => ({ id: `${id}-${i}`, position: i, question: `Question ${i + 1}`, item_type: 'identification', options: null, points: 1 });
const TASKS = [
  { sheet: sheet('long'), submission: { id: 's-long', status: 'in_progress', released: false } },
  { sheet: sheet('done'), submission: { id: 's-done', status: 'submitted', released: false } },
  { sheet: sheet('upload', { task_type: 'worksheet', submission_mode: 'attachment', items: 0 }) },
];
beforeEach(() => {
  state.items = { long: Array.from({ length: 3 }, (_, i) => question('long', i)), done: [question('done', 0)] };
  state.graph = {
    fatalError: null,
    enrolments: [{ section_id: 's1', sections: { name: 'Rizal', grade_level: '8', school_year: '2026-2027' } }],
    assignees: TASKS.map(t => ({ task_id: t.sheet.id, section_id: 's1', assigned_at: '2026-11-18T08:00:00', due_at: '2099-11-28T17:00:00' })),
    sheetById: new Map(TASKS.map(t => [t.sheet.id, t.sheet])),
    submissionStates: TASKS.filter(t => t.submission).map(t => ({ worksheet_id: t.sheet.id, ...t.submission })),
    releasedScores: [], subjectsById: new Map([['eng', 'English']]),
  };
});
afterEach(cleanup);
const open = async (id) => {
  render(<MemoryRouter><StudentTasksTab pdf /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: `Open Task ${id}` }));
  await screen.findByRole('article', { name: 'Worksheet test paper' });
};

describe('U-PDF-S2 open task scroll area', () => {
  it('the paper sits in a focusable region named "Worksheet", with Submit at its end', async () => {
    await open('long');
    const area = screen.getByRole('region', { name: 'Worksheet' });
    expect(area.className).toBe('x-std-scroll');
    expect(area.tabIndex).toBe(0);
    expect(area.firstElementChild).toBe(screen.getByRole('article', { name: 'Worksheet test paper' }));
    expect(area.lastElementChild.className).toContain('x-std-submit');
    expect(area.contains(screen.getByRole('button', { name: 'Submit' }))).toBe(true);
    expect(area.contains(screen.getAllByRole('textbox')[2])).toBe(true);
  });

  it('a submitted task keeps its "Submitted" message inside the area', async () => {
    await open('done');
    const area = screen.getByRole('region', { name: 'Worksheet' });
    expect(area.contains(screen.getByText('Submitted. You cannot change your answers now.'))).toBe(true);
  });

  it('Details then Your work in one side column right after the area (same grid row, top-aligned)', async () => {
    await open('upload');
    const area = screen.getByRole('region', { name: 'Worksheet' });
    const side = area.nextElementSibling;
    expect(side.className).toBe('x-std-side');
    expect([...side.children].map(c => c.className)).toEqual(['x-card x-std-details', 'x-std-work']);
    expect(side.firstElementChild).toBe(screen.getByRole('region', { name: 'Details' }));
    expect(side.lastElementChild.firstElementChild).toBe(screen.getByRole('region', { name: 'Your work' }));
  });

  it('a task without Your work still has Details first in the side column', async () => {
    await open('long');
    const side = screen.getByRole('region', { name: 'Worksheet' }).nextElementSibling;
    expect([...side.children].map(c => c.className)).toEqual(['x-card x-std-details']);
  });

  it('classic view: no scroll area, no side column, the paper stays a direct child', async () => {
    const only = id => ({ ...state.graph, assignees: state.graph.assignees.filter(a => a.task_id === id) });
    state.graph = only('long');
    render(<MemoryRouter><StudentTasksTab pdf={false} /></MemoryRouter>);
    fireEvent.click(screen.getAllByRole('button', { name: /^(Continue|Resume|Start|Open)/ })[0]);
    const paper = await screen.findByRole('article', { name: 'Worksheet test paper' });
    expect(screen.queryByRole('region', { name: 'Worksheet' })).toBeNull();
    expect(document.querySelector('.x-std-side, .x-std-scroll')).toBeNull();
    expect(paper.parentElement.className).toBe('mx-auto');
    expect(paper.nextElementSibling.className).toBe('mt-5 space-y-3');
  });
});

describe('U-PDF-S2 CSS pins', () => {
  const css = readFileSync(join(['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css'))), 'styles', 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n');
  const rule = (selector) => {
    const at = css.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('}', at));
  };
  const block = (head) => {
    const at = css.indexOf(head);
    expect(at, head).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf('\n}', at));
  };
  const T = `html.${['theme', 'clarity'].join('-')} .x-stk `;

  it('the area scrolls on its own: bounded, contained, quiet scrollbar, visible focus ring', () => {
    const area = rule(`${T}.x-std-scroll`);
    for (const part of ['overflow-y: auto', 'overscroll-behavior: contain', 'max-height: calc(100dvh - 96px)', 'scrollbar-width: thin', 'scroll-padding-block']) expect(area).toContain(part);
    expect(rule(`${T}.x-std-scroll:focus-visible`)).toContain('outline: 2px solid var(--cl-ac)');
  });

  it('the side column is top-aligned and sticky; on wide screens the grid fills the window', () => {
    const side = rule(`${T}.x-std-side`);
    for (const part of ['position: sticky', 'align-self: start', 'grid-area: side']) expect(side).toContain(part);
    expect(rule(`${T}.x-std-grid`)).toContain('"scroll side"');
    const wide = block('@media (min-width: 1024px) and (min-height: 560px)');
    expect(wide).toContain('height: calc(100dvh - 120px)');
    expect(wide).toContain('minmax(240px, 1fr)');
    expect(wide).toContain('overflow-y: auto');
  });

  it('phones: Details first, the area under it, bar-aware dvh heights; print shows the whole paper', () => {
    const narrow = block('@media (max-width: 1023px) {\n  ' + T + '.x-std-grid');
    expect(narrow).toContain('"back" "head" "steps" "details" "scroll" "work"');
    expect(narrow).toContain('display: contents');
    expect(block('@media (max-width: 767px) {\n  ' + T + '.x-std-steps')).toContain('100dvh - 144px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)');
    expect(block('@media (max-width: 1023px) and (max-height: 500px) {\n  ' + T + '.x-std-scroll')).toContain('100dvh - 120px');
    const print = block('@media print {\n  ' + T + '.x-std-grid');
    expect(print).toContain('max-height: none; overflow: visible');
  });
});
