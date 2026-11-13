// @vitest-environment jsdom
// Clarity G8: Student Scores layout (Student PDF p3). The Overall card is a
// compact first cell of the same grid; subject cards are equal height with
// the button pinned to the bottom on one line; the rings show only the
// percentage (no unreadable inner caption). Same data, same behaviour.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null, loading: false, refresh: null }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({ useStudentData: () => state }));

import ClarityScoresTab from './ClarityScoresTab';

const sheet = (id, subjectId, title) => ({ id, title, subject: subjectId, task_type: 'quiz', subject_id: subjectId, items: 10, instructions: '' });
const graphOf = () => ({
  assignees: ['w1', 'w2', 'w3'].map(id => ({ task_id: id, section_id: 'sec', due_at: '2030-03-20T23:59:00', assigned_at: '2030-03-01T08:00:00' })),
  sheetById: new Map([['w1', sheet('w1', 'sci', 'Cells')], ['w2', sheet('w2', 'sci', 'Plants')], ['w3', sheet('w3', 'math', 'Fractions')]]),
  subjectsById: new Map([['sci', 'Science'], ['math', 'Mathematics']]),
  submissionStates: [
    { id: 's1', worksheet_id: 'w1', status: 'submitted', released: true },
    { id: 's2', worksheet_id: 'w2', status: 'submitted', released: false },
    { id: 's3', worksheet_id: 'w3', status: 'submitted', released: true },
  ],
  releasedScores: [{ worksheet_id: 'w1', score: 8, total_points: 10 }, { worksheet_id: 'w3', score: 9, total_points: 10 }],
  enrolments: [], subjects: [], attendance: [], fatalError: null,
});
const show = () => render(<MemoryRouter><ClarityScoresTab /></MemoryRouter>);

afterEach(() => { cleanup(); Object.assign(state, { graph: null, loading: false, refresh: null }); });

describe('structure (p3)', () => {
  it('the Overall card is the first cell of the same grid as the subject cards', () => {
    state.graph = graphOf();
    const { container } = show();
    const grid = container.querySelector('.x-sc-grid');
    expect(grid.firstElementChild.getAttribute('aria-label')).toBe('Overall');
    expect([...grid.children].map(c => c.className)).toEqual([
      'x-card x-sc-card x-sc-overall', 'x-card x-sc-card', 'x-card x-sc-card',
    ]);
    expect(grid.firstElementChild.querySelector('.x-sc-name').textContent).toBe('Overall average');
    expect(within(grid.firstElementChild).getByText('2 released scores')).toBeTruthy();
  });

  it('each subject card: name, ring with "Average" beside it, Released N / M, the awaiting line only when it applies, then the button', () => {
    state.graph = graphOf();
    show();
    const science = screen.getByRole('article', { name: 'Science' });
    const order = [...science.querySelectorAll('.x-sc-name, .x-sc-ring, .x-sc-sub, .x-sc-rel, .x-sc-await, .x-sc-btn')].map(e => e.className.split(' ').pop());
    expect(order).toEqual(['x-sc-name', 'x-sc-ring', 'x-sc-sub', 'x-sc-rel', 'x-sc-await', 'x-sc-btn']);
    expect(within(science).getByText('Average')).toBeTruthy();
    expect(science.querySelector('.x-sc-num').textContent).toBe('1 / 2');
    expect(science.querySelector('.x-sc-await').textContent).toBe('1 awaiting results');
    const math = screen.getByRole('article', { name: 'Mathematics' });
    expect(math.querySelector('.x-sc-await')).toBeNull();
  });

  it('the rings show only the percentage: no inner "average" caption', () => {
    state.graph = graphOf();
    const { container } = show();
    expect(container.querySelectorAll('.x-ringlbl')).toHaveLength(0);
    expect([...container.querySelectorAll('.x-ringval')].map(t => t.textContent)).toEqual(['85%', '90%', '80%']);
  });

  it('Show / Hide released scores keeps its text and function', () => {
    state.graph = graphOf();
    show();
    const science = screen.getByRole('article', { name: 'Science' });
    const button = within(science).getByRole('button', { name: 'Show released scores (1)' });
    fireEvent.click(button);
    expect(button.textContent).toBe('Hide released scores');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(within(science).getByRole('list')).toBeTruthy();
  });
});

describe('layout rules', () => {
  const SRC = ['src', 'frontend/src'].find(p => existsSync(join(p, 'styles', 'clarity-components.css')));
  const css = readFileSync(join(SRC, 'styles', 'clarity-components.css'), 'utf8').replace(/\r\n/g, '\n');
  const P = `html.${['theme', 'clarity'].join('-')} `;
  it('equal-height cards: grid stretch, each card a flex column, the button pinned to the bottom', () => {
    expect(css).toContain(`${P}.x-sc-grid { align-items: stretch; }`);
    expect(css).toContain(`${P}.x-sc-card { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 20px; }`);
    expect(css).toContain(`${P}.x-sc-btn { margin-top: auto; width: 100%; padding: 0 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`);
  });
  it('the compact Overall card: sized to its content, a 72px ring', () => {
    expect(css).toContain(`${P}.x-sc-overall { align-self: start; }`);
    expect(css).toContain(`${P}.x-sc-overall .x-sc-ring { width: 72px; }`);
  });
  it('ring beside its label (grid areas), Released at 22px/700, the ring caption hidden from view', () => {
    expect(css).toContain(`${P}.x-sc-top { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "avg name" "avg sub";`);
    expect(css).toContain(`${P}.x-sc-num { font-size: 22px; font-weight: 700;`);
    expect(css).toContain(`${P}.x-sc-ring figcaption { position: absolute; width: 1px; height: 1px;`);
  });
});
