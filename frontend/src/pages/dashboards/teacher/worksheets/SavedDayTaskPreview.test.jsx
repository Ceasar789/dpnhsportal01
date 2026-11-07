// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeContext } from '../hooks';
import SavedDayTaskPreview from './SavedDayTaskPreview';

const worksheet = { id: 'worksheet-1', title: 'Cells - Tuesday Activity', subject: 'Science', grade_level: 'Grade 7', task_type: 'worksheet',
  instructions: 'Objective: Describe cells.\nGrouping: Pairs' };
const quizItems = [
  { id: 'item-2', position: 2, question: 'Cells are alive.', item_type: 'true_false', options: null, points: 1 },
  { id: 'item-1', position: 1, question: 'Which controls the cell?', item_type: 'multiple_choice',
    options: ['Nucleus', 'Wall', 'Vacuole', 'Ribosome'], points: 1 },
  { id: 'item-3', position: 3, question: 'List two cell types.', item_type: 'enumeration', options: null, points: 2 },
];
const quiz = { ...worksheet, title: 'Cells - Tuesday Quiz', task_type: 'quiz', instructions: 'Answer every item.' };
const quizKeys = { 'item-1': { correct_answer: 'Nucleus' }, 'item-2': { correct_answer: 'True' },
  'item-3': { correct_answer: ['plant', 'animal'] } };

const show = (loadItems, props = {}) => render(<ThemeContext.Provider value={{ dark: false }}>
  <SavedDayTaskPreview worksheet={worksheet} loadItems={loadItems} onClose={vi.fn()} {...props} />
</ThemeContext.Provider>);
const studentDocument = () => screen.findByRole('article', { name: 'Student-facing worksheet' });
const toggle = () => screen.getByRole('checkbox', { name: 'Show teacher answer key' });

afterEach(cleanup);

describe('SavedDayTaskPreview', () => {
  it('shows loading first, and asks for the worksheet once', async () => {
    const loadItems = vi.fn().mockResolvedValue({ items: [], keys: {} });
    show(loadItems);
    expect(screen.getByRole('status').textContent).toBe('Loading this task...');
    await studentDocument();
    expect(loadItems).toHaveBeenCalledTimes(1);
    expect(loadItems).toHaveBeenCalledWith('worksheet-1');
  });

  it('renders an Activity with zero items as a structured document with no error', async () => {
    show(vi.fn().mockResolvedValue({ items: [], keys: {} }));
    const document = await studentDocument();
    expect(within(document).getByRole('heading', { name: 'ACTIVITY' })).toBeTruthy();
    expect(document.textContent).toContain('Cells - Tuesday Activity');
    expect(document.textContent).toContain('Science');
    expect(document.textContent).toContain('Grade 7');
    expect(document.textContent).not.toContain('Total points');
    expect(document.textContent).toContain('Student name:');
    expect([...document.querySelectorAll('.activity-fields dt')].map(node => node.textContent)).toEqual(['Objective', 'Grouping']);
    expect([...document.querySelectorAll('.activity-fields dd')].map(node => node.textContent)).toEqual(['Describe cells.', 'Pairs']);
    expect(document.querySelector('.worksheet-draft-directions')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/could not/i)).toBeNull();
  });

  it('labels a Quiz and keeps its questions and Directions paragraph', async () => {
    show(vi.fn().mockResolvedValue({ items: quizItems, keys: quizKeys }), { worksheet: quiz });
    const document = await studentDocument();
    expect(within(document).getByRole('heading', { name: 'QUIZ' })).toBeTruthy();
    expect(document.querySelectorAll('.worksheet-draft-question-heading')).toHaveLength(3);
    expect(document.querySelector('.worksheet-draft-directions').textContent).toBe('Directions: Answer every item.');
    expect(document.querySelector('.activity-body')).toBeNull();
    expect(document.textContent).toContain('Total points: 4');
    fireEvent.click(toggle());
    expect(within(screen.getByRole('article', { name: 'Teacher answer key' })).getByRole('heading', { name: 'TEACHER ANSWER KEY' })).toBeTruthy();
  });

  it('labels an Assignment, and an unknown type keeps the plain heading', async () => {
    const essay = [{ id: 'e', position: 1, question: 'Explain: why?', item_type: 'essay', options: null, points: 5 }];
    show(vi.fn().mockResolvedValue({ items: essay, keys: {} }), { worksheet: { ...quiz, task_type: 'assignment', instructions: 'Objective: write' } });
    const assignment = await studentDocument();
    expect(within(assignment).getByRole('heading', { name: 'ASSIGNMENT' })).toBeTruthy();
    expect(assignment.querySelector('.activity-body')).toBeNull();
    cleanup();
    show(vi.fn().mockResolvedValue({ items: [], keys: {} }), { worksheet: { ...quiz, task_type: undefined } });
    expect(within(await studentDocument()).getByRole('heading', { name: 'WORKSHEET' })).toBeTruthy();
  });

  it('opens in the wider max-w-4xl dialog', async () => {
    show(vi.fn().mockResolvedValue({ items: [], keys: {} }));
    await studentDocument();
    expect(screen.getByRole('dialog').className).toContain('max-w-4xl');
    expect(screen.getByRole('dialog').className).not.toContain('max-w-3xl');
  });

  it('offers no answer key for an Activity, since it has nothing to answer', async () => {
    show(vi.fn().mockResolvedValue({ items: [], keys: {} }));
    await studentDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('renders a Quiz in position order with options and hides answers from the student copy', async () => {
    show(vi.fn().mockResolvedValue({ items: quizItems, keys: quizKeys }));
    const document = await studentDocument();
    const questions = document.querySelectorAll('.worksheet-draft-question-heading');
    expect([...questions].map(node => node.firstChild.textContent))
      .toEqual(['Which controls the cell?', 'Cells are alive.', 'List two cell types.']);
    for (const option of ['Nucleus', 'Wall', 'Vacuole', 'Ribosome']) expect(within(document).getByText(option)).toBeTruthy();
    expect(document.textContent).toContain('Total points: 4');
    expect(document.textContent).not.toContain('plant, animal');
    expect(screen.queryByRole('article', { name: 'Teacher answer key' })).toBeNull();
  });

  it('the teacher toggle shows and hides the answers', async () => {
    show(vi.fn().mockResolvedValue({ items: quizItems, keys: quizKeys }));
    await studentDocument();
    fireEvent.click(toggle());
    const key = screen.getByRole('article', { name: 'Teacher answer key' });
    expect(within(key).getByRole('heading', { name: 'TEACHER ANSWER KEY' })).toBeTruthy();
    expect(key.textContent).toContain('Answer: Nucleus');
    expect(key.textContent).toContain('Answer: True');
    expect(key.textContent).toContain('Answer: plant, animal');
    expect(screen.getByRole('article', { name: 'Student-facing worksheet' })).toBeTruthy();
    fireEvent.click(toggle());
    expect(screen.queryByRole('article', { name: 'Teacher answer key' })).toBeNull();
  });

  it('an essay with no key shows as teacher-scored', async () => {
    show(vi.fn().mockResolvedValue({ items: [{ id: 'e', position: 1, question: 'Explain.', item_type: 'essay', options: null, points: 5 }], keys: {} }));
    await studentDocument();
    fireEvent.click(toggle());
    expect(screen.getByRole('article', { name: 'Teacher answer key' }).textContent).toContain('Answer: Teacher-scored');
  });

  it('shows the safe error when loading returns null, rejects, or has no item list', async () => {
    for (const loadItems of [vi.fn().mockResolvedValue(null), vi.fn().mockRejectedValue(new Error('RAW-DB-TEXT')),
      vi.fn(() => { throw new Error('RAW-DB-TEXT'); }), vi.fn().mockResolvedValue({ keys: {} })]) {
      show(loadItems);
      expect((await screen.findByRole('alert')).textContent).toBe('This task could not be loaded. Close this preview and try again.');
      expect(document.body.textContent).not.toContain('RAW-DB-TEXT');
      expect(screen.queryByRole('article')).toBeNull();
      cleanup();
    }
  });

  it('renders script text as literal text in every field', async () => {
    const attack = '<script>alert(1)</script>';
    show(vi.fn().mockResolvedValue({ keys: { a: { correct_answer: `K ${attack}` } }, items: [
      { id: 'a', position: 1, question: `Q ${attack}`, item_type: 'multiple_choice', options: [`O ${attack}`, 'B', 'C', 'D'], points: 1 },
    ] }), { worksheet: { ...worksheet, title: `T ${attack}`, instructions: `I ${attack}`, subject: `S ${attack}` } });
    const student = await studentDocument();
    fireEvent.click(toggle());
    for (const value of [`T ${attack}`, `I ${attack}`, `S ${attack}`, `Q ${attack}`, `O ${attack}`]) expect(student.textContent).toContain(value);
    expect(screen.getByRole('article', { name: 'Teacher answer key' }).textContent).toContain(`K ${attack}`);
    expect(document.querySelector('script')).toBeNull();
  });

  it('a slow response for an earlier worksheet cannot replace a newer one', async () => {
    let finishFirst;
    const loadItems = vi.fn((id) => (id === 'worksheet-1'
      ? new Promise((resolve) => { finishFirst = resolve; }) : Promise.resolve({ items: [], keys: {} })));
    const tree = row => <ThemeContext.Provider value={{ dark: false }}>
      <SavedDayTaskPreview worksheet={row} loadItems={loadItems} onClose={vi.fn()} />
    </ThemeContext.Provider>;
    const view = render(tree(worksheet));
    await waitFor(() => expect(loadItems).toHaveBeenCalledWith('worksheet-1'));
    view.rerender(tree({ ...worksheet, id: 'worksheet-2', title: 'Newer task' }));
    expect((await studentDocument()).textContent).toContain('Newer task');
    await act(async () => { finishFirst({ items: [], keys: {} }); });
    expect(screen.getByRole('article', { name: 'Student-facing worksheet' }).textContent).toContain('Newer task');
  });

  it('closes through the dialog button', async () => {
    const onClose = vi.fn();
    show(vi.fn().mockResolvedValue({ items: [], keys: {} }), { onClose });
    await studentDocument();
    fireEvent.click(screen.getByRole('button', { name: `Close Preview: ${worksheet.title}` }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
