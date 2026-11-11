// @vitest-environment jsdom
// ClarityModal is a real dialog: labelled, focus in and back, trapped,
// Escape, scrim, inert outside, footer pinned in its own region.
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import ClarityModal from './ClarityModal';

let originalOffsetParent;
beforeEach(() => {
  originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentElement; } });
});
afterEach(() => {
  cleanup();
  if (originalOffsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', originalOffsetParent);
  else delete HTMLElement.prototype.offsetParent;
});

const Harness = ({ onClose = vi.fn(), closeDisabled = false, dismissible = true }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Open it</button>
      <p data-testid="outside">Page behind</p>
      {open && (
        <ClarityModal title="Log out of EduScribe?" description="Are you sure?" closeDisabled={closeDisabled} dismissible={dismissible}
          onClose={() => { onClose(); setOpen(false); }}
          footer={<><button type="button">Cancel</button><button type="button">Log out</button></>}>
          <p>Body text</p>
        </ClarityModal>
      )}
    </div>
  );
};
const open = () => { const b = screen.getByRole('button', { name: 'Open it' }); b.focus(); fireEvent.click(b); return b; };

describe('ClarityModal', () => {
  it('is a modal dialog labelled by its title and described by its description', () => {
    render(<Harness />);
    open();
    const dialog = screen.getByRole('dialog', { name: 'Log out of EduScribe?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')).textContent).toBe('Are you sure?');
    expect(dialog.className).toBe('x-modal');
    expect(dialog.closest('.x-back')).toBeTruthy();
  });

  it('moves focus in, keeps Tab inside, and returns focus on close', () => {
    render(<Harness />);
    const opener = open();
    const [cancel, logout] = screen.getAllByRole('button').filter(b => ['Cancel', 'Log out'].includes(b.textContent));
    expect(document.activeElement).toBe(cancel);
    logout.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(logout);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('makes the page behind inert while open, and restores it', () => {
    render(<Harness />);
    open();
    const outside = screen.getByTestId('outside').parentElement;
    expect(outside.inert || [...outside.children].some(c => c.inert)).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(document.querySelectorAll('[inert]').length).toBe(0);
  });

  it('Escape and the scrim do nothing while closing is disabled', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} closeDisabled />);
    open();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.mouseDown(document.querySelector('.x-back'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('a press on the scrim closes it when dismissible; a press inside does not', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    open();
    fireEvent.mouseDown(screen.getByText('Body text'));
    expect(onClose).not.toHaveBeenCalled();
    act(() => { fireEvent.mouseDown(document.querySelector('.x-back')); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the footer is its own region after the scrolling body (pinned by the CSS)', () => {
    render(<Harness />);
    open();
    const dialog = screen.getByRole('dialog');
    expect([...dialog.children].map(c => c.className)).toEqual(['x-mh', 'x-mb', 'x-mf']);
  });
});
