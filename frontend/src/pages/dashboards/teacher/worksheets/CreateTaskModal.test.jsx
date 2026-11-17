// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import CreateTaskModal from './CreateTaskModal';

afterEach(cleanup);

const show = (props = {}) => {
  const onSave = props.onSave || vi.fn(async () => ({ ok: true }));
  render(<CreateTaskModal subjectPicker={<p>Subject: English</p>} subjectReady saving={false}
    onSave={onSave} onClose={vi.fn()} {...props} />);
  return onSave;
};
const type = value => fireEvent.change(screen.getByLabelText('Type'), { target: { value } });
const title = value => fireEvent.change(screen.getByLabelText('Title'), { target: { value } });
const directions = value => fireEvent.change(screen.getByLabelText(/^Directions/), { target: { value } });
const create = () => screen.getByRole('button', { name: 'Create' });
// U5: Create is never disabled. A blocked form saves nothing when Create is pressed; a valid one saves.
const press = async () => { await act(async () => { fireEvent.click(create()); }); };
const blocked = async onSave => { expect(create().disabled).toBe(false); await press(); expect(onSave).not.toHaveBeenCalled(); };
const allowed = async onSave => { await press(); expect(onSave).toHaveBeenCalledTimes(1); };
const radio = name => screen.getByRole('radio', { name: new RegExp(`^${name}`) });

describe('fields per type', () => {
  it('Activity: no checking choice, directions required', async () => {
    const onSave = show();
    expect(screen.getByLabelText('Type').value).toBe('activity');
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText(/Required for an Activity/)).toBeTruthy();
    title('Map the conflict');
    await blocked(onSave);
    expect(screen.getAllByText('Add the directions students will read.').length).toBeGreaterThan(0);
    directions('   ');
    await blocked(onSave);
    directions('Work in pairs.');
    await allowed(onSave);
  });

  it('Quiz: Auto-check by default, can switch to Manual, directions optional', async () => {
    const onSave = show();
    type('quiz');
    expect(radio('Auto-check').checked).toBe(true);
    expect(radio('Auto-check').disabled).toBe(false);
    fireEvent.click(radio('Manual check'));
    expect(radio('Manual check').checked).toBe(true);
    title('Conflict quiz');
    expect(screen.getByText('Optional')).toBeTruthy();
    await allowed(onSave);
  });

  it('Assignment: forced to Manual, disabled, with the reason', async () => {
    const onSave = show();
    type('assignment');
    expect(radio('Manual check').checked).toBe(true);
    expect(radio('Manual check').disabled).toBe(true);
    expect(radio('Auto-check').disabled).toBe(true);
    expect(screen.getByText('Assignments are answered in writing and checked by you.')).toBeTruthy();
    title('Essay on conflict');
    await allowed(onSave);
  });

  it('shows the directions count', () => {
    show();
    directions('Hello');
    expect(screen.getByText(/5 \/ 2000/)).toBeTruthy();
  });
});

describe('limits', () => {
  it('a blank title blocks Create', async () => {
    const onSave = show();
    type('quiz');
    title('    ');
    await blocked(onSave);
    expect(screen.getAllByText('Enter a title.').length).toBeGreaterThan(0);
  });

  it('a title over 150 characters is blocked', async () => {
    const onSave = show();
    type('quiz');
    title('x'.repeat(151));
    expect(screen.getByText('Keep the title within 150 characters.')).toBeTruthy();
    await blocked(onSave);
    title('x'.repeat(150));
    await allowed(onSave);
  });

  it('directions over 2,000 characters are blocked', async () => {
    const onSave = show();
    type('quiz');
    title('Quiz');
    directions('x'.repeat(2001));
    expect(screen.getByText('Keep the directions within 2000 characters.')).toBeTruthy();
    await blocked(onSave);
  });

  it('without a ready subject Create is blocked', async () => {
    const onSave = show({ subjectReady: false });
    type('quiz');
    title('Quiz');
    await blocked(onSave);
    expect(screen.getAllByText('Choose the subject and grade from your teaching load.').length).toBeGreaterThan(0);
  });
});

describe('saving', () => {
  it('sends the trimmed title, the type, the directions and the mode', async () => {
    const onSave = show();
    type('quiz');
    title('  Conflict quiz  ');
    directions('Answer all.');
    fireEvent.click(radio('Manual check'));
    await act(async () => { fireEvent.click(create()); });
    expect(onSave).toHaveBeenCalledWith({ title: 'Conflict quiz', taskType: 'quiz', directions: 'Answer all.', checkingMode: 'manual' });
  });

  it('an Assignment is always sent as Manual', async () => {
    const onSave = show();
    type('quiz');
    type('assignment');
    title('Essay');
    await act(async () => { fireEvent.click(create()); });
    expect(onSave.mock.calls[0][0].checkingMode).toBe('manual');
  });

  it('a double click sends one save', async () => {
    let finish;
    const onSave = show({ onSave: vi.fn(() => new Promise(resolve => { finish = resolve; })) });
    type('quiz');
    title('Quiz');
    fireEvent.click(create());
    fireEvent.click(create());
    await act(async () => { finish({ ok: true }); });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('while saving, Create is busy and ignores a press', () => {
    const onSave = show({ saving: true });
    const busy = screen.getByRole('button', { name: /Creating/ });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(busy);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a failed save keeps the dialog and shows the message as text', async () => {
    show({ onSave: vi.fn(async () => ({ ok: false, message: 'Could not <b>save</b>.' })) });
    type('quiz');
    title('Quiz');
    await act(async () => { fireEvent.click(create()); });
    expect(screen.getByRole('alert').textContent).toBe('Could not <b>save</b>.');
    expect(document.querySelector('[role="alert"] b')).toBeNull();
    expect(screen.getByLabelText('Title').value).toBe('Quiz');
  });
});
