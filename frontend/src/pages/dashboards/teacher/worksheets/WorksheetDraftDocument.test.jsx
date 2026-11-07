// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
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

describe('day-task variant', () => {
  const activity = { title: 'Conflict Activity', subjectName: 'English', gradeLevel: 'Grade 7', questions: [], answerKey: [],
    instructions: 'Objective: Find conflict.\nGrouping: Pairs\nMaterials:\n-Book\n- Pen\nProcedure:\n1. Read.\n2. Share.\nNotes follow here\n<script>alert(1)</script>' };
  const dayTask = props => <WorksheetDraftDocument draft={activity} variant="day-task" heading="ACTIVITY" structuredDirections {...props} />;
  const article = () => screen.getByRole('article');

  it('leaves the default render alone, even if a new prop is passed without the variant', () => {
    render(<WorksheetDraftDocument draft={{ ...draft, instructions: 'Objective: Keep.' }} heading="ACTIVITY" structuredDirections />);
    const document = article();
    expect(document.className).toBe('worksheet-draft-document');
    expect(within(document).getByRole('heading', { name: 'WORKSHEET' })).toBeTruthy();
    expect(document.querySelector('.worksheet-draft-directions').textContent).toBe('Directions: Objective: Keep.');
    expect(document.querySelector('.activity-body, .line, .short')).toBeNull();
    expect(document.querySelector('.worksheet-draft-student-fields').textContent).toContain('____________________________');
    render(<WorksheetDraftDocument draft={{ ...draft, questions: [], answerKey: [] }} />);
    expect(screen.getAllByRole('article')[1].textContent).toContain('Total points: 0');
  });

  it('renders the heading, field lines and structured body', () => {
    render(dayTask());
    const document = article();
    expect(document.className).toBe('worksheet-draft-document worksheet-draft-document--day-task');
    expect(within(document).getByRole('heading', { level: 3, name: 'ACTIVITY' })).toBeTruthy();
    expect(document.textContent).not.toContain('Total points');
    expect(document.textContent).not.toContain('Directions:');
    expect(document.textContent).not.toContain('___');
    const lines = document.querySelectorAll('.worksheet-draft-student-fields .line');
    expect([...lines].map(line => line.getAttribute('aria-hidden'))).toEqual(['true', 'true']);
    expect(document.querySelector('.worksheet-draft-student-fields p.short').textContent).toContain('Section:');
    const body = document.querySelector('.activity-body');
    expect([...body.querySelectorAll('dl.activity-fields dt')].map(node => node.textContent)).toEqual(['Objective', 'Grouping']);
    expect([...body.querySelectorAll('dl.activity-fields dd')].map(node => node.textContent)).toEqual(['Find conflict.', 'Pairs']);
    expect([...body.querySelectorAll('h4.activity-heading')].map(node => node.textContent)).toEqual(['Materials', 'Procedure']);
    expect([...body.querySelectorAll('ul.activity-list li')].map(node => node.textContent)).toEqual(['Book', 'Pen']);
    expect([...body.querySelectorAll('ol.activity-list li')].map(node => node.textContent)).toEqual(['Read.', 'Share.']);
    expect(body.querySelector('p.activity-para').textContent).toBe('Notes follow here');
  });

  it('never creates a script element from saved text', () => {
    render(dayTask());
    expect(article().textContent).toContain('<script>alert(1)</script>');
    expect(article().querySelector('script')).toBeNull();
  });

  it('keeps points above zero, and the Directions paragraph without structuredDirections', () => {
    render(dayTask({ draft: { ...draft, instructions: 'Answer all.' }, heading: 'QUIZ', structuredDirections: false }));
    const document = article();
    expect(document.textContent).toContain('Total points: 5');
    expect(document.querySelector('.worksheet-draft-directions').textContent).toBe('Directions: Answer all.');
    expect(document.querySelector('.activity-body')).toBeNull();
  });

  it('the teacher copy keeps its own heading and has no student fields', () => {
    render(dayTask({ audience: 'teacher', draft, heading: 'QUIZ' }));
    expect(within(article()).getByRole('heading', { name: 'TEACHER ANSWER KEY' })).toBeTruthy();
    expect(article().querySelector('.worksheet-draft-student-fields')).toBeNull();
  });

  describe('quiz', () => {
    const quiz = { title: 'Cells Quiz', subjectName: 'Science', gradeLevel: 'Grade 7', instructions: 'Answer every item.',
      questions: [
        { localId: 'a', question: 'Which controls the cell?', item_type: 'multiple_choice', options: ['Nucleus', 'Wall'], points: 1 },
        { localId: 'b', question: 'Cells are alive.', item_type: 'true_false', options: [], points: 1 },
        { localId: 'c', question: 'Name the powerhouse.', item_type: 'identification', options: [], points: 1 },
        { localId: 'd', question: 'List two cell types.', item_type: 'enumeration', options: [], points: 2 },
      ],
      answerKey: [{ localId: 'a', correct_answer: 'Nucleus' }, { localId: 'b', correct_answer: 'True' },
        { localId: 'c', correct_answer: 'mitochondrion' }, { localId: 'd', correct_answer: 'plant, animal' }] };
    const show = audience => render(<WorksheetDraftDocument draft={quiz} audience={audience} variant="day-task" heading="QUIZ" />);

    it('the student copy has the QUIZ heading, numbered list and options, and no answers', () => {
      show('student');
      const document = article();
      expect(within(document).getByRole('heading', { level: 3, name: 'QUIZ' })).toBeTruthy();
      expect(document.querySelectorAll('ol.worksheet-draft-questions > li')).toHaveLength(4);
      expect([...document.querySelectorAll('.worksheet-draft-options li')].map(node => node.textContent)).toEqual(['Nucleus', 'Wall']);
      expect(document.querySelectorAll('.worksheet-draft-answer-space')).toHaveLength(2);
      expect(document.textContent).toContain('Total points: 5');
      for (const hidden of ['Answer:', 'mitochondrion', 'plant, animal']) expect(document.textContent).not.toContain(hidden);
    });

    it('the teacher copy has its own heading and every answer', () => {
      show('teacher');
      const document = article();
      expect(within(document).getByRole('heading', { level: 3, name: 'TEACHER ANSWER KEY' })).toBeTruthy();
      for (const answer of ['Answer: Nucleus', 'Answer: True', 'Answer: mitochondrion', 'Answer: plant, animal'])
        expect(document.textContent).toContain(answer);
    });

    it('sets visible numbers for day tasks only, leaving the builder rules alone', () => {
      const documentCss = readFileSync('src/pages/dashboards/teacher/worksheets/WorksheetDraftDocument.css', 'utf8');
      expect(documentCss).toMatch(/--day-task \.worksheet-draft-questions \{[^}]*list-style: decimal/);
      expect(documentCss).toMatch(/^\.worksheet-draft-questions \{ margin: 0; padding-left: 24px; \}/m);
      expect(documentCss).not.toMatch(/^\.worksheet-draft-questions[^{]*\{[^}]*list-style/m);
    });
  });

  it('falls back to WORKSHEET with no heading, and to the empty directions note with no instructions', () => {
    render(dayTask({ draft: { ...activity, instructions: '   ' }, heading: undefined }));
    expect(within(article()).getByRole('heading', { name: 'WORKSHEET' })).toBeTruthy();
    expect(article().querySelector('.activity-body')).toBeNull();
    expect(article().textContent).toContain('Directions: Not provided');
  });
});
