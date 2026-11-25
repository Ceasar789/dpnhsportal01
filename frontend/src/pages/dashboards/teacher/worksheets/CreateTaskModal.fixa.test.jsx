// @vitest-environment jsdom
// U-PDF-T-FIX-A: Create Worksheet uses the Generate worksheet frame (large, two columns, full screen
// on phones; "Worksheet options" card + info cards). Footer: Cancel, Generate with AI instead (only
// when the tab passes it), Create worksheet. Fields, rules and onSave are unchanged.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../hooks', () => ({ useTheme: () => ({ dark: false }) }));
vi.mock('./useDialogSafety', () => ({ default: ({ onClose }) => ({ requestClose: onClose, routeBlocker: null, busyNotice: '' }) }));
import CreateTaskModal from './CreateTaskModal';

afterEach(cleanup);
const show = (props = {}) => render(<CreateTaskModal subjectPicker={<p>Subject: Mathematics</p>} subjectReady saving={false}
  onSave={vi.fn(async () => ({ ok: true }))} onClose={vi.fn()} {...props} />);

describe('CreateTaskModal frame', () => {
  it('large dialog, full screen on phones, Worksheet options card and the info cards', () => {
    show({ onGenerateInstead: vi.fn() });
    const dialog = screen.getByRole('dialog', { name: 'Create Worksheet' });
    expect(dialog.className).toContain('max-w-5xl');
    const options = within(dialog).getByRole('region', { name: 'Worksheet options' });
    for (const label of ['Title', 'Type', 'Directions']) expect(within(options).getByLabelText(new RegExp(`^${label}`))).toBeTruthy();
    expect(within(options).getByText('Subject: Mathematics')).toBeTruthy();
    const aside = within(dialog).getByRole('complementary', { name: 'About this worksheet' });
    expect(within(aside).getByRole('heading', { name: 'What happens next' })).toBeTruthy();
    expect(within(aside).getByRole('heading', { name: 'From a lesson plan' })).toBeTruthy();
    expect(dialog.textContent).not.toContain('Powered by Gemini');
  });

  it('footer: Cancel, Generate with AI instead, Create worksheet (in that order)', () => {
    const onGenerateInstead = vi.fn();
    show({ onGenerateInstead });
    const buttons = screen.getAllByRole('button').map(b => b.textContent.trim()).filter(t => ['Cancel', 'Generate with AI instead', 'Create worksheet'].includes(t));
    expect(buttons).toEqual(['Cancel', 'Generate with AI instead', 'Create worksheet']);
    fireEvent.click(screen.getByRole('button', { name: 'Generate with AI instead' }));
    expect(onGenerateInstead).toHaveBeenCalledTimes(1);
  });

  it('without the Generate handler: no Generate with AI instead and no From a lesson plan card', () => {
    show();
    expect(screen.queryByRole('button', { name: 'Generate with AI instead' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'From a lesson plan' })).toBeNull();
  });

  it('Create worksheet still runs the same checks and onSave', async () => {
    const onSave = vi.fn(async () => ({ ok: true }));
    show({ onSave });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create worksheet' })); });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Fractions' } });
    fireEvent.change(screen.getByLabelText(/^Directions/), { target: { value: 'Read and answer.' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create worksheet' })); });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Fractions', taskType: 'activity', directions: 'Read and answer.' }));
  });

  it('What happens next lists adding questions only for question tasks', () => {
    show();
    const next = () => screen.getByRole('region', { name: 'What happens next' }).textContent;
    expect(next()).not.toContain('Add the questions');
    fireEvent.change(screen.getByLabelText(/^Type/), { target: { value: 'quiz' } });
    expect(next()).toContain('Add the questions and their points.');
  });
});
