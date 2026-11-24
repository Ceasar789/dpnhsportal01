// @vitest-environment jsdom
// R39 (4h, design p15): "Type of assessment" Formative / Summative / Essay over the task types.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../../../lib/backendApi', () => ({ backendRequest: mock.request }));

import { ThemeContext } from '../hooks';
import GenerateDayTaskModal from './GenerateDayTaskModal';

const plan = { id: 'plan-1', title: 'Cells' };
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(day => ({ day, objective: `Describe ${day} cells` }));
const click = name => fireEvent.click(screen.getByRole('button', { name }));
const open = () => render(<ThemeContext.Provider value={{ dark: false }}><GenerateDayTaskModal plan={plan} days={days} onClose={vi.fn()} /></ThemeContext.Provider>);
const group = () => screen.getByRole('group', { name: 'Type of assessment' });
const purpose = name => within(group()).getByRole('button', { name: new RegExp(`^${name}`) });
const typeButton = name => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const body = () => JSON.parse(mock.request.mock.calls[0][1].body);

beforeEach(() => { mock.request.mockReset(); mock.request.mockImplementation(() => new Promise(() => {})); });
afterEach(cleanup);

describe('Type of assessment (4h)', () => {
  it('appears once a task type is chosen, with the design labels, none picked', () => {
    open();
    click(/^Tuesday/);
    expect(screen.queryByRole('group', { name: 'Type of assessment' })).toBeNull();
    click(/^Quiz/);
    expect(within(group()).getAllByRole('button').map(b => b.textContent))
      .toEqual(['FormativeShort checks during the lesson', 'SummativeEnd-of-topic assessment', 'EssayWritten response with rubric']);
    expect(within(group()).getAllByRole('button').every(b => b.getAttribute('aria-pressed') === 'false')).toBe(true);
  });
  it('a chosen purpose is sent with the request', async () => {
    open();
    click(/^Tuesday/); click(/^Quiz/);
    fireEvent.click(purpose('Summative'));
    await act(async () => { click('Generate'); });
    expect(body()).toMatchObject({ lessonPlanId: 'plan-1', day: 'Tuesday', taskType: 'quiz', purpose: 'summative' });
  });
  it('Essay switches the task to Assignment; Activity clears a purpose that no longer fits', () => {
    open();
    click(/^Tuesday/); click(/^Quiz/);
    fireEvent.click(purpose('Essay'));
    expect(typeButton('Assignment').getAttribute('aria-pressed')).toBe('true');
    expect(purpose('Essay').getAttribute('aria-pressed')).toBe('true');
    click(/^Activity/);
    expect(within(group()).getAllByRole('button').every(b => b.getAttribute('aria-pressed') === 'false')).toBe(true);
  });
  it('without a purpose the request is exactly as before', async () => {
    open();
    click(/^Tuesday/); click(/^Activity/);
    await act(async () => { click('Generate'); });
    expect(body()).toEqual({ lessonPlanId: 'plan-1', day: 'Tuesday', taskType: 'activity' });
  });
});
