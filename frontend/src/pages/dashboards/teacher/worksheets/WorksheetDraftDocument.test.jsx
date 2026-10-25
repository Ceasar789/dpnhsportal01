// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import WorksheetDraftDocument from './WorksheetDraftDocument';

afterEach(cleanup);

const draft = {
  title: 'Synthetic cells worksheet', subjectName: 'Science', gradeLevel: 'Grade 7',
  questions: [
    { localId: 'q1', question: 'Identify the cell structure.', item_type: 'identification', options: [], points: 2 },
    { localId: 'q2', question: 'Explain the diagram.', item_type: 'essay', options: [], points: 3 },
  ],
  answerKey: [{ localId: 'q1', correct_answer: 'Nucleus' }],
};

describe('local Worksheet document presentation', () => {
  it('uses trusted school branding and excludes the Teacher key from the student document', () => {
    render(<WorksheetDraftDocument draft={draft} />);
    const document = screen.getByRole('article', { name: 'Student-facing worksheet' });
    expect(within(document).getByAltText('Department of Education logo')).toBeTruthy();
    expect(within(document).getByAltText('Dela Paz National High School seal')).toBeTruthy();
    expect(within(document).getByAltText('EduScribe logo')).toBeTruthy();
    expect(within(document).getByText('Synthetic cells worksheet')).toBeTruthy();
    expect(document.textContent).toContain('Total points: 5');
    expect(document.textContent).toContain('Directions: Not provided');
    expect(document.textContent).toContain('Student name:');
    expect(document.textContent).not.toContain('Nucleus');
    expect(document.textContent).not.toContain('Answer:');
    expect(document.textContent).not.toContain('Monday');
  });

  it('keeps a separate Teacher answer key with the recorded answer', () => {
    render(<WorksheetDraftDocument draft={draft} audience="teacher" />);
    const key = screen.getByRole('article', { name: 'Teacher answer key' });
    expect(key.textContent).toContain('Nucleus');
    expect(key.textContent).toContain('Teacher-scored');
  });

  it('places each section’s multiline directions before its questions without exposing answers', () => {
    const grouped = { ...draft, sections: [
      { id: 'first', title: 'Identify', directions: 'Name the part.\nWrite clearly.' },
      { id: 'second', title: 'Explain', directions: 'Use complete sentences.' },
    ], questions: [
      { ...draft.questions[0], sectionId: 'first' },
      { ...draft.questions[1], sectionId: 'second' },
    ] };
    render(<WorksheetDraftDocument draft={grouped} />);
    const student = screen.getByRole('article', { name: 'Student-facing worksheet' });
    expect(within(student).getByRole('region', { name: 'Identify' }).textContent).toContain('Name the part.');
    expect(within(student).getByRole('region', { name: 'Explain' }).querySelector('ol').start).toBe(2);
    expect(student.textContent).not.toContain('Nucleus');
    expect(student.textContent).not.toContain('Answer:');
  });

  it('recalculates total points from current questions in either preview', () => {
    const { rerender } = render(<WorksheetDraftDocument draft={draft} />);
    expect(screen.getByRole('article', { name: 'Student-facing worksheet' }).textContent)
      .toContain('Total points: 5');
    const edited = { ...draft, questions: [{ ...draft.questions[0], points: '1.5' },
      { ...draft.questions[1], points: '2.25' }] };
    rerender(<WorksheetDraftDocument draft={edited} audience="teacher" />);
    expect(screen.getByRole('article', { name: 'Teacher answer key' }).textContent)
      .toContain('Total points: 3.75');
  });
});
