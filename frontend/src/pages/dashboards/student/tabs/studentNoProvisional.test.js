import { describe, expect, it } from 'vitest';
import { submittedMessage } from './studentAnswers';

// Provisional marks are for the teacher only. No student-facing code may name the table.
const sources = {
  ...import.meta.glob(['../**/*.{js,jsx}', '!../**/*.test.{js,jsx}'], { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob(['../../../../lib/student*.{js,jsx}', '!../../../../lib/*.test.{js,jsx}'], { query: '?raw', import: 'default', eager: true }),
};

describe('student code and provisional marks', () => {
  it('scans the student files', () => {
    expect(Object.keys(sources)).toEqual(expect.arrayContaining(['./TasksTab.jsx', './studentAnswers.js', '../../../../lib/studentTaskGraph.js']));
  });

  it('never references worksheet_provisional_marks', () => {
    const hits = Object.entries(sources).filter(([, text]) => text.includes('worksheet_provisional_marks')).map(([file]) => file);
    expect(hits).toEqual([]);
  });
});

describe('submittedMessage', () => {
  it('names a score only for a released row with both numbers', () => {
    expect(submittedMessage({ released: true }, { score: 3, total_points: 4 })).toBe('Submitted. Your score: 3/4.');
    expect(submittedMessage({ released: true }, null)).toBe('Submitted.');
    expect(submittedMessage({ released: false }, { score: 3, total_points: 4 })).toBe('Submitted. Your teacher will check your answers.');
    expect(submittedMessage({ released: false }, null, { auto: true, hasEssay: true })).toBe('Submitted. Your teacher will check the essay questions.');
    expect(submittedMessage({ released: false }, null, { auto: false, hasEssay: true })).toBe('Submitted. Your teacher will check your answers.');
    expect(submittedMessage(null, { score: 3, total_points: 4 })).toBe('Submitted.');
  });
});
