// @vitest-environment jsdom
// U4: the frame every admin form dialog shares (FormDialog + useFormDialog):
// summary and first-field focus, one save per press, a never-disabled primary
// with its busy label, server field errors on fields, the in-app discard
// question.
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Field from '../../../../components/ui/form/Field';
import FormDialog from './FormDialog';
import useFormDialog from './useFormDialog';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
afterEach(cleanup);

const ORDER = ['probe-name', 'probe-code'];
function Probe({ save, onClose = vi.fn(), saving = false }) {
  const form = useFormDialog(ORDER);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const problems = () => [
    !name && { fieldId: 'probe-name', message: 'Enter the name.' },
    !code && { fieldId: 'probe-code', message: 'Enter the code.' },
  ].filter(Boolean);
  return (
    <FormDialog title="Probe" onClose={onClose} summaryId="probe-summary" form={form}
      primaryLabel="Add probe" busyLabel="Saving…" saving={saving} onSubmit={() => form.submit(problems(), save)}>
      <Field label="Name" id="probe-name" error={form.fieldError('probe-name')}>
        <input value={name} onChange={e => setName(e.target.value)} />
      </Field>
      <Field label="Code" id="probe-code" optional error={form.fieldError('probe-code')}>
        <input value={code} onChange={e => setCode(e.target.value)} />
      </Field>
    </FormDialog>
  );
}
const primary = () => screen.getByRole('button', { name: /Add probe|Saving…/ });

describe('FormDialog', () => {
  it('a failed submit shows the summary in field order and focuses the first invalid field; nothing is saved', () => {
    const save = vi.fn();
    render(<Probe save={save} />);
    fireEvent.click(primary());
    const summary = screen.getByRole('alert');
    expect(summary.textContent).toContain('Please fix 2 things:');
    expect([...summary.querySelectorAll('a')].map(a => a.textContent)).toEqual(['Enter the name.', 'Enter the code.']);
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true');
    expect(save).not.toHaveBeenCalled();
  });

  it('a second press while the save is pending calls save once', async () => {
    let finish;
    const save = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    render(<Probe save={save} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(/^Code/), { target: { value: 'B' } });
    fireEvent.click(primary());
    fireEvent.click(primary());
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ ok: true }); });
    fireEvent.click(primary());
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('the primary is never disabled and shows its busy label while saving', () => {
    render(<Probe save={vi.fn()} saving />);
    const button = primary();
    expect(button.textContent).toBe('Saving…');
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('field errors from the save land on their fields, with the summary', async () => {
    const save = vi.fn(async () => ({ ok: false, fieldErrors: [{ fieldId: 'probe-code', message: 'Another probe already uses this code.' }] }));
    render(<Probe save={save} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText(/^Code/), { target: { value: 'B' } });
    await act(async () => { fireEvent.click(primary()); });
    expect(screen.getAllByText('Another probe already uses this code.')).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByLabelText(/^Code/));
  });

  it('an untouched form closes at once; an edited one asks in-app (Keep editing / Escape / Discard)', () => {
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, 'confirm');
    const { unmount } = render(<Probe save={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    render(<Probe save={vi.fn()} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const ask = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    expect(document.activeElement.textContent).toBe('Keep editing');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
    expect(ask).toBeTruthy();
    confirm.mockRestore();
  });
});
