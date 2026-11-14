// @vitest-environment jsdom
// S4: "Check submissions" opens the file/link review for an attachment task,
// and the unchanged answers dialog for every other task.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { existsSync, readFileSync } from 'node:fs';

const seen = vi.hoisted(() => ({ review: null }));
vi.mock('./AttachmentReviewModal', () => ({ default: (props) => { seen.review = props; return <div role="dialog" aria-label="Mock review" />; } }));

import CheckSubmissions from './CheckSubmissionsModal';

const loaders = () => ({
  loadItems: vi.fn(async () => ({ items: [], keys: {} })),
  loadSubmissions: vi.fn(async () => []),
  loadAnswers: vi.fn(async () => ({})),
  saveMarks: vi.fn(),
  releaseScore: vi.fn(),
  onClose: vi.fn(),
});
const show = (worksheet, props = loaders()) => {
  render(<MemoryRouter><CheckSubmissions worksheet={worksheet} {...props} /></MemoryRouter>);
  return props;
};

afterEach(() => { cleanup(); seen.review = null; });

describe('routing', () => {
  it('a file/link task opens the review with the task and onClose only; the answers loaders are never called', () => {
    const task = { id: 't1', title: 'Poster', submission_mode: 'attachment', max_points: 10 };
    const props = show(task);
    expect(screen.getByRole('dialog', { name: 'Mock review' })).toBeTruthy();
    expect(seen.review).toEqual({ worksheet: task, onClose: props.onClose });
    expect(props.loadItems).not.toHaveBeenCalled();
    expect(props.loadSubmissions).not.toHaveBeenCalled();
  });

  it.each([
    ['an answers worksheet', { submission_mode: 'answers', task_type: 'worksheet', items: 3 }],
    ['a quiz', { submission_mode: 'answers', task_type: 'quiz', items: 2, checking_mode: 'auto' }],
    ['an exam', { task_type: 'exam', items: 2, checking_mode: 'manual' }],
    ['an auto-checked task', { task_type: 'quiz', items: 2, checking_mode: 'auto' }],
    ['a handout', { task_type: 'worksheet', items: 0, instructions: 'Read.' }],
    ['a row read before the column existed', { task_type: 'worksheet', items: 1 }],
  ])('%s opens the original Submissions dialog with its own loaders', async (_name, over) => {
    const props = show({ id: 't2', title: 'Fractions', ...over });
    expect(await screen.findByRole('dialog', { name: 'Submissions — Fractions' })).toBeTruthy();
    expect(seen.review).toBeNull();
    expect(props.loadItems).toHaveBeenCalledWith('t2');
    expect(props.loadSubmissions).toHaveBeenCalledWith('t2');
  });
});

describe('entry points', () => {
  const read = rel => readFileSync([`src/${rel}`, `frontend/src/${rel}`].find(existsSync), 'utf8').replace(/\r\n/g, '\n');

  it.each([
    ['pages/dashboards/teacher/tabs/GradesTab.jsx', "import CheckSubmissionsModal from '../worksheets/CheckSubmissionsModal';"],
    ['components/clarity/teacher/ClarityTeacherGradingTab.jsx', "import CheckSubmissionsModal from '../../../pages/dashboards/teacher/worksheets/CheckSubmissionsModal';"],
    ['pages/dashboards/teacher/tabs/WorksheetsTab.jsx', "import CheckSubmissionsModal from '../worksheets/CheckSubmissionsModal';"],
  ])('%s opens Check submissions through the routing wrapper', (file, line) => {
    expect(read(file)).toContain(line);
  });

  it('the wrapper is the default export and the answers dialog is unchanged inside it', () => {
    const src = read('pages/dashboards/teacher/worksheets/CheckSubmissionsModal.jsx');
    expect(src).toContain("const CheckSubmissions = props => (props.worksheet?.submission_mode === 'attachment'");
    expect(src).toContain('  : <CheckSubmissionsModal {...props} />);');
    expect(src.trimEnd().endsWith('export default CheckSubmissions;')).toBe(true);
  });
});
