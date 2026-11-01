// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { ThemeContext } from '../hooks';
import { Btn, ConfirmDialog, Modal, Toast } from './ui';

const DialogHarness = ({ dismissible = false }) => {
  const [open, setOpen] = useState(false);
  return <ThemeContext.Provider value={{ dark: false }}>
    <button onClick={() => setOpen(true)}>Open worksheet dialog</button>
    <Toast toast={null} />
    {open && <Modal title="Create Worksheet" onClose={() => setOpen(false)} dismissible={dismissible}>
      <input aria-label="Worksheet title" />
      <button type="button">Last action</button>
    </Modal>}
  </ThemeContext.Provider>;
};

describe('Teacher shared feedback', () => {
  let offsetParent;
  beforeEach(() => {
    offsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() { return this.parentElement; },
    });
  });
  afterEach(() => {
    cleanup();
    if (offsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParent);
    else delete HTMLElement.prototype.offsetParent;
  });

  it('names and traps an editable dialog without discarding it on Escape or backdrop', () => {
    render(<DialogHarness />);
    const opener = screen.getByRole('button', { name: 'Open worksheet dialog' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Create Worksheet' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Worksheet title' }));
    expect(opener.inert).toBe(true);
    expect(screen.getByRole('alert').inert).not.toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Create Worksheet' })).toBe(dialog);
    fireEvent.mouseDown(dialog.parentElement);
    fireEvent.click(dialog.parentElement);
    expect(screen.getByRole('dialog', { name: 'Create Worksheet' })).toBe(dialog);
    screen.getByRole('button', { name: 'Last action' }).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close Create Worksheet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Create Worksheet' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener.inert).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('allows Escape for an explicitly dismissible dialog', () => {
    render(<DialogHarness dismissible />);
    const opener = screen.getByRole('button', { name: 'Open worksheet dialog' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('allows a backdrop click only for an explicitly dismissible dialog', () => {
    render(<DialogHarness dismissible />);
    const opener = screen.getByRole('button', { name: 'Open worksheet dialog' });
    opener.focus();
    fireEvent.click(opener);
    const overlay = screen.getByRole('dialog', { name: 'Create Worksheet' }).parentElement;
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('requires explicit confirmation and restores focus after cancellation', () => {
    const confirm = vi.fn();
    const Harness = () => {
      const [open, setOpen] = useState(false);
      return <ThemeContext.Provider value={{ dark: false }}>
        <button onClick={() => setOpen(true)}>Delete draft</button>
        {open && <ConfirmDialog title="Delete worksheet draft" message="This cannot be undone."
          confirmLabel="Delete permanently" onCancel={() => setOpen(false)}
          onConfirm={() => { confirm(); setOpen(false); }} />}
      </ThemeContext.Provider>;
    };
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Delete draft' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Delete worksheet draft' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(confirm).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('keeps stable, separate success and error live regions', () => {
    const { rerender } = render(<Toast toast={null} />);
    const status = screen.getByRole('status');
    const alert = screen.getByRole('alert');
    rerender(<Toast toast={{ msg: 'Saved', type: 'success' }} />);
    expect(status.textContent).toBe('Saved');
    expect(alert.textContent).toBe('');
    rerender(<Toast toast={{ msg: 'Save failed', type: 'error' }} />);
    expect(status.textContent).toBe('');
    expect(alert.textContent).toBe('Save failed');
  });

  it('keeps an async button focused and blocks repeat requests while busy', async () => {
    let finish;
    const onClick = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const { rerender } = render(<Btn onClick={onClick}>Save</Btn>);
    const button = screen.getByRole('button', { name: 'Save' });
    button.focus();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<Btn onClick={onClick} busy>Saving…</Btn>);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(false);
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    finish();
    rerender(<Btn onClick={onClick}>Save</Btn>);
    await waitFor(() => {
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalledTimes(2);
    });
  });
});
