// @vitest-environment jsdom
// U-PDF-S (design p10): the three Scores cards from real rows only: Overall
// average (with the "not an official grade" caption), Released, and Highest
// (the single highest released score and its subject).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ graph: null, loading: false, refresh: null }));
vi.mock('../../../pages/dashboards/student/StudentDataContext', () => ({ useStudentData: () => state }));

import ClarityScoresTab from './ClarityScoresTab';

const sheet = (id, subjectId) => ({ id, title: `Task ${id}`, subject: subjectId, task_type: 'quiz', subject_id: subjectId, items: 10, instructions: '' });
const graphOf = (released) => ({
  assignees: ['w1', 'w2', 'w3'].map(id => ({ task_id: id, section_id: 'sec', due_at: null, assigned_at: null })),
  sheetById: new Map([['w1', sheet('w1', 'sci')], ['w2', sheet('w2', 'sci')], ['w3', sheet('w3', 'math')]]),
  subjectsById: new Map([['sci', 'Science'], ['math', 'Mathematics']]),
  submissionStates: released.map(([id]) => ({ id: `s-${id}`, worksheet_id: id, status: 'checked', released: true })),
  releasedScores: released.map(([id, score]) => ({ worksheet_id: id, score, total_points: 10 })),
  enrolments: [], subjects: [], attendance: [], fatalError: null,
});
const stats = () => [...document.querySelectorAll('.x-sc-stat')].map(c => [...c.querySelectorAll('p')].map(p => p.textContent));
afterEach(() => { cleanup(); Object.assign(state, { graph: null }); });

describe('U-PDF-S Scores cards', () => {
  it('Overall average, Released and Highest with its subject', () => {
    state.graph = graphOf([['w1', 7], ['w2', 6], ['w3', 10]]);
    render(<MemoryRouter><ClarityScoresTab /></MemoryRouter>);
    expect(stats()).toEqual([
      ['Overall average', '77%', 'Released scores only. Not an official grade.'],
      ['Released', '3', 'scores'],
      ['Highest', '100%', 'Mathematics'],
    ]);
  });

  it('Highest is the top score wherever it is in the list (not the first subject)', () => {
    state.graph = graphOf([['w1', 10], ['w3', 5]]); // Mathematics (listed first) 50%, Science 100%
    render(<MemoryRouter><ClarityScoresTab /></MemoryRouter>);
    expect(stats()[2]).toEqual(['Highest', '100%', 'Science']);
  });

  it('one released score says "score"; none says so without inventing a number', () => {
    state.graph = graphOf([['w1', 8]]);
    render(<MemoryRouter><ClarityScoresTab /></MemoryRouter>);
    expect(stats()[1]).toEqual(['Released', '1', 'score']);
    cleanup();
    state.graph = graphOf([]);
    render(<MemoryRouter><ClarityScoresTab /></MemoryRouter>);
    expect(stats()).toEqual([
      ['Overall average', '—', 'Released scores only. Not an official grade.'],
      ['Released', '0', 'scores'],
      ['Highest', '—', 'No released scores'],
    ]);
  });
});
