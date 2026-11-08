// @vitest-environment jsdom
// The browser zone is set far from Manila, so a date shown in local time is caught.
globalThis.process.env.TZ = 'America/New_York';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import WorksheetsTab from './WorksheetsTab';

const { hook, worksheetRows, auth } = vi.hoisted(() => ({ hook: { state: {}, args: null, bump: null }, worksheetRows: { value: [] },
  auth: { userData: { uid: 'teacher-1' } } }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  from: table => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      then: resolve => Promise.resolve({ data: table === 'worksheets' ? worksheetRows.value : [], error: null }).then(resolve),
    };
    return query;
  },
} }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));
vi.mock('../worksheets/useWorksheetAssessment', async () => {
  const { useReducer } = await import('react');
  // One stable base, so effects that depend on these values do not re-run every render.
  const base = { mySubjects: [], schoolYear: '2030-2031', subjectLoading: false, subjectError: false,
    postings: [], postingsError: false, fetchMySubject: vi.fn(), fetchAssigneeCounts: vi.fn(), fetchPostings: vi.fn(),
    mySections: [{ id: 'sec-1', name: 'Rizal', isAdviser: true }], sectionsError: false, fetchMySections: vi.fn(),
    loadClassList: vi.fn(), loadAssignees: vi.fn(), loadSubmissions: vi.fn(), distributeTask: vi.fn(async () => ({ ok: true })), loadItems: vi.fn(async () => ({ items: [], keys: {} })) };
  return { useWorksheetAssessment: (...args) => {
    const [, bump] = useReducer(x => x + 1, 0);
    hook.args = args;
    hook.bump = bump;
    return { ...base, ...hook.state };
  } };
});
vi.mock('../worksheets/useDialogSafety', () => ({ default: () => ({ requestClose: vi.fn(), routeBlocker: null, busyNotice: '' }) }));
vi.mock('../worksheets/QuestionBuilderModal', () => ({ default: () => null }));
vi.mock('../worksheets/CheckSubmissionsModal', () => ({ default: () => null }));
vi.mock('../worksheets/EncodeScoresModal', () => ({ default: () => null }));
vi.mock('../worksheets/DistributeModal', () => ({ default: props => <section aria-label="Mock distribute">
  <p>Distributing {props.task.title}</p>
  <p>{props.sections.map(section => section.name).join(',')}</p>
  <p>{[props.loadClassList, props.loadAssignees, props.loadSubmissions, props.distributeTask, props.onClose,
    props.showToast, props.onRetrySections].every(fn => typeof fn === 'function') ? 'All wired' : 'Missing props'}</p>
  <button onClick={() => props.distributeTask(props.task.id, 'sec-1', ['s1'], '2026-03-09T17:00', 'manual')}>Mock send</button>
  <button onClick={props.onClose}>Mock close</button>
</section> }));

const MARCH_1_UTC = Date.UTC(2026, 2, 1, 17, 30);
const quiz = { id: 'q1', title: 'Cells quiz', subject: 'Science', task_type: 'quiz', items: 5 };
const activity = { id: 'a1', title: 'Cells activity', subject: 'Science', task_type: 'worksheet', items: 0, instructions: 'Draw a cell.' };
const counts = (assigneeCounts, firstAssignedAt = {}, extra = {}) => {
  hook.state = { assigneeCounts, firstAssignedAt, assigneeCountsLoading: false, assigneeCountsError: false, ...extra };
};
const show = async (rows) => {
  worksheetRows.value = rows;
  render(<WorksheetsTab />);
  await screen.findByText(rows[0].title);
};
const menu = (title) => {
  const open = screen.queryByRole('menu', { name: `Actions for ${title}` });
  if (open) return open;
  fireEvent.click(screen.getByRole('button', { name: `More actions for ${title}` }));
  return screen.getByRole('menu', { name: `Actions for ${title}` });
};
const item = (title, name) => within(menu(title)).getByRole('menuitem', { name: new RegExp(`^${name}`) });

beforeEach(() => { counts({}); hook.args = null; });
afterEach(cleanup);

describe('real app wiring', () => {
  it('creates the hook with distribution turned on', async () => {
    await show([quiz]);
    expect(hook.args[1]).toEqual({ distributionEnabled: true });
  });
});

describe('Distributed on date', () => {
  it('shows nothing for a task with no assignees', async () => {
    counts({}, { q1: MARCH_1_UTC });
    await show([quiz]);
    expect(screen.queryByText(/^Distributed on/)).toBeNull();
  });

  it('shows the Manila date when the browser date is a day earlier', async () => {
    counts({ q1: 3 }, { q1: MARCH_1_UTC });
    await show([quiz]);
    expect(new Date(MARCH_1_UTC).getDate()).toBe(1);
    expect(screen.getByText('Distributed on Mar 2, 2026')).toBeTruthy();
  });

  it('shows no date while loading, after a failed read, or with no known date', async () => {
    counts({ q1: 3 }, { q1: MARCH_1_UTC }, { assigneeCountsLoading: true });
    await show([quiz]);
    expect(screen.queryByText(/^Distributed on/)).toBeNull();
    cleanup();
    counts({ q1: 3 }, { q1: MARCH_1_UTC }, { assigneeCountsError: true });
    await show([quiz]);
    expect(screen.queryByText(/^Distributed on/)).toBeNull();
    cleanup();
    counts({ q1: 3 }, {});
    await show([quiz]);
    expect(screen.queryByText(/^Distributed on/)).toBeNull();
  });
});

describe('locks', () => {
  it('a task with no assignees keeps Delete enabled with no reason, and has no Questions', async () => {
    await show([quiz]);
    expect(within(menu('Cells quiz')).queryByRole('menuitem', { name: /^Questions/ })).toBeNull();
    expect(item('Cells quiz', 'Delete').disabled).toBe(false);
    expect(screen.queryByText('Already distributed')).toBeNull();
  });

  it('a distributed task locks Delete with the reason, and keeps the rest', async () => {
    counts({ q1: 2 }, { q1: MARCH_1_UTC });
    await show([quiz]);
    const actions = menu('Cells quiz');
    expect(within(actions).queryByRole('menuitem', { name: /^Questions/ })).toBeNull();
    for (const name of ['Delete']) {
      const control = within(actions).getByRole('menuitem', { name: new RegExp(`^${name}`) });
      expect(control.disabled).toBe(true);
      expect(control.textContent).toContain('Already distributed');
    }
    expect(within(actions).getByRole('menuitem', { name: /^Distribute/ }).disabled).toBe(false);
    expect(within(actions).getByRole('menuitem', { name: /^Check submissions/ }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Preview' }).disabled).toBe(false);
  });

  it.each([['loading', { assigneeCountsLoading: true }], ['failed', { assigneeCountsError: true }]])(
    'while the count is %s, Delete stays locked with no reason', async (_name, extra) => {
      counts({}, {}, extra);
      await show([quiz]);
      expect(item('Cells quiz', 'Delete').disabled).toBe(true);
      expect(screen.queryByText('Already distributed')).toBeNull();
      expect(item('Cells quiz', 'Distribute').disabled).toBe(false);
    });
});

describe('Distribute in the menu', () => {
  it('opens the modal for the chosen task, fully wired, with no stub toast', async () => {
    await show([quiz, activity]);
    fireEvent.click(item('Cells activity', 'Distribute'));
    const modal = screen.getByRole('region', { name: 'Mock distribute' });
    expect(within(modal).getByText('Distributing Cells activity')).toBeTruthy();
    expect(within(modal).getByText('Rizal')).toBeTruthy();
    expect(within(modal).getByText('All wired')).toBeTruthy();
    expect(screen.queryByText(/Distribution is unavailable/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mock close' }));
    expect(screen.queryByRole('region', { name: 'Mock distribute' })).toBeNull();
  });

  it.each([
    ['no questions and no directions', { id: 'x', title: 'Empty', task_type: 'worksheet', items: 0, instructions: '  ' }, 'No questions or directions yet'],
    ['a quiz with directions but no questions', { id: 'x', title: 'Empty', task_type: 'quiz', items: 0, instructions: 'Read.' }, 'No questions or directions yet'],
    ['a collection row', { id: 'x', title: 'Empty', task_type: 'quiz', items: 5, collection_id: 'c1', day_of_week: null }, 'Part of a weekly collection'],
  ])('%s: Distribute is disabled with a reason', async (_name, row, reason) => {
    await show([row]);
    const control = item('Empty', 'Distribute');
    expect(control.disabled).toBe(true);
    expect(control.textContent).toContain(reason);
    fireEvent.click(control);
    expect(screen.queryByRole('region', { name: 'Mock distribute' })).toBeNull();
  });

  it('a quiz with questions and an activity with directions can be distributed', async () => {
    await show([quiz, activity]);
    expect(item('Cells quiz', 'Distribute').disabled).toBe(false);
    expect(item('Cells activity', 'Distribute').disabled).toBe(false);
    expect(screen.queryByText(/No questions or directions yet/)).toBeNull();
  });
});

describe('after a successful distribution', () => {
  it('the card shows the date and locks without a reload', async () => {
    hook.state.distributeTask = vi.fn(async () => {
      counts({ q1: 1 }, { q1: MARCH_1_UTC }, { distributeTask: hook.state.distributeTask });
      hook.bump();
      return { ok: true };
    });
    await show([quiz]);
    expect(item('Cells quiz', 'Delete').disabled).toBe(false);
    fireEvent.click(item('Cells quiz', 'Distribute'));
    fireEvent.click(screen.getByRole('button', { name: 'Mock send' }));
    expect(await screen.findByText('Distributed on Mar 2, 2026')).toBeTruthy();
    expect(screen.getByText('Distributed · 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mock close' }));
    await waitFor(() => expect(item('Cells quiz', 'Delete').disabled).toBe(true));
  });
});

describe('plain text', () => {
  it('renders a title with an HTML tag as text', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    counts({ q1: 1 }, { q1: MARCH_1_UTC });
    await show([{ ...quiz, title: `Q ${attack}` }]);
    expect(document.body.textContent).toContain(`Q ${attack}`);
    fireEvent.click(item(`Q ${attack}`, 'Distribute'));
    expect(screen.getByText(`Distributing Q ${attack}`)).toBeTruthy();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});
