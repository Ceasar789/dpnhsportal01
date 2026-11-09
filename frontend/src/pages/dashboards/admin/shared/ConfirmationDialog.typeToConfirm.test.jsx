// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ConfirmationDialog from './ConfirmationDialog';

afterEach(cleanup);

const Harness = ({ onConfirm, confirmName = '7-Rizal' }) => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Reopen</button>
      <ConfirmationDialog open={open} title="Delete Section?" description="This section will be permanently deleted."
        subject="7-Rizal" warning="This cannot be undone." confirmLabel="Yes, Delete" destructive
        details={['Its class list', 'All attendance records for this section']}
        counts={[{ label: 'Students in the class list', value: 3 }, { label: 'Attendance records', value: 'Could not be counted' }]}
        recommendation="To keep records, remove students and schedules first, or keep the section."
        confirmName={confirmName}
        onCancel={() => setOpen(false)} onConfirm={onConfirm} />
    </>
  );
};

describe('ConfirmationDialog optional section-delete props', () => {
  it('shows the details, counts and recommendation', () => {
    render(<Harness onConfirm={vi.fn()} />);
    expect(screen.getByText('Its class list')).toBeTruthy();
    expect(screen.getByText('All attendance records for this section')).toBeTruthy();
    expect(screen.getByText('Students in the class list').nextElementSibling.textContent).toBe('3');
    expect(screen.getByText('Attendance records').nextElementSibling.textContent).toBe('Could not be counted');
    expect(screen.getByText('To keep records, remove students and schedules first, or keep the section.')).toBeTruthy();
  });

  it('keeps Confirm disabled until the exact name is typed', () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const field = screen.getByLabelText('Type 7-Rizal to confirm');
    const confirm = screen.getByRole('button', { name: 'Yes, Delete' });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(field, { target: { value: '7-rizal' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(field, { target: { value: '7-Rizal ' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(field, { target: { value: '7-Rizal' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('clears the typed name when the dialog is closed and reopened', () => {
    render(<Harness onConfirm={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Type 7-Rizal to confirm'), { target: { value: '7-Rizal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(screen.getByLabelText('Type 7-Rizal to confirm').value).toBe('');
    expect(screen.getByRole('button', { name: 'Yes, Delete' }).disabled).toBe(true);
  });

  it('without confirmName, Confirm works at once (simple confirm)', () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} confirmName={null} />);
    expect(screen.queryByLabelText(/to confirm/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
