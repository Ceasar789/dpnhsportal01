// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ConfirmationDialog from './ConfirmationDialog';

const Harness = ({ onConfirm = () => {}, destructive = true }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open confirmation</button>
      <ConfirmationDialog
        open={open}
        title={destructive ? 'Delete Post?' : 'Sign Out?'}
        description={destructive ? 'This post will be permanently deleted.' : 'Are you sure you want to sign out?'}
        subject={destructive ? 'Release notice' : undefined}
        warning={destructive ? 'This cannot be undone.' : undefined}
        confirmLabel={destructive ? 'Yes, Delete' : 'Sign Out'}
        destructive={destructive}
        onCancel={() => setOpen(false)}
        onConfirm={() => { setOpen(false); onConfirm(); }}
      />
    </>
  );
};

const originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');

beforeAll(() => {
  // jsdom has no layout and otherwise reports every control as hidden.
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return this.parentElement; },
  });
});

afterEach(cleanup);
afterAll(() => {
  if (originalOffsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', originalOffsetParent);
  else delete HTMLElement.prototype.offsetParent;
});

describe('Admin ConfirmationDialog', () => {
  it('takes focus, traps Tab, closes on Escape, and restores focus', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open confirmation' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Delete Post?' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Yes, Delete' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(cancel);

    cancel.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('uses a destructive action for deletes and a regular primary action for logout', () => {
    const onConfirm = vi.fn();
    const view = render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open confirmation' }));
    const deleteButton = screen.getByRole('button', { name: 'Yes, Delete' });
    expect(deleteButton.className).toContain('btn-danger-solid');
    fireEvent.click(deleteButton);
    expect(onConfirm).toHaveBeenCalledOnce();

    view.rerender(<Harness destructive={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open confirmation' }));
    const signOut = screen.getByRole('button', { name: 'Sign Out' });
    expect(signOut.className).toContain('btn-primary');
    expect(signOut.className).not.toContain('btn-danger-solid');
  });

  it('announces a busy delete and blocks cancellation until it settles', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmationDialog
        open
        title="Delete Schedule?"
        description="Delete this schedule."
        confirmLabel="Yes, Delete"
        destructive
        busy
        busyLabel="Deleting…"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );
    const busy = screen.getByRole('button', { name: 'Deleting…' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
