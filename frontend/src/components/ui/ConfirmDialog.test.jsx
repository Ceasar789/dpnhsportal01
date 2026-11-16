// @vitest-environment jsdom
// U2 form kit: the in-app confirm dialog (replaces window.confirm).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

// jsdom has no layout, so offsetParent is always null and the focus trap
// would see nothing focusable. Give every element a parent, as a browser does.
let original;
beforeAll(() => {
  original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode; } });
});
afterAll(() => { if (original) Object.defineProperty(HTMLElement.prototype, 'offsetParent', original); });
afterEach(cleanup);

function Page({ onConfirm = () => {}, ...props }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Close form</button>
      <p data-testid="behind">Form behind</p>
      {open && <ConfirmDialog {...props} onCancel={() => setOpen(false)} onConfirm={() => { onConfirm(); setOpen(false); }} />}
    </>
  );
}

const open = () => {
  const opener = screen.getByRole('button', { name: 'Close form' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
};

describe('ConfirmDialog', () => {
  it('an alertdialog named and described, with the safe button focused', () => {
    render(<Page />);
    open();
    const dialog = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')).textContent).toBe('What you typed has not been saved.');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep editing' }));
  });

  it('Keep editing / Discard changes wording, cancel first, destructive style by default', () => {
    render(<Page />);
    open();
    const buttons = screen.getByRole('alertdialog').querySelectorAll('button');
    expect([...buttons].map(b => b.textContent)).toEqual(['Keep editing', 'Discard changes']);
    expect(buttons[1].className).toContain('fk-danger');
  });

  it('labels and a neutral style come from props', () => {
    render(<Page title="Sign out?" message="You will need to sign in again." confirmLabel="Sign out" cancelLabel="Stay" destructive={false} />);
    open();
    expect(screen.getByRole('alertdialog', { name: 'Sign out?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' }).className).toContain('fk-primary');
    expect(screen.getByRole('button', { name: 'Stay' })).toBeTruthy();
  });

  it('Escape cancels, does not bubble, and focus returns to the opener', () => {
    const outer = vi.fn();
    render(<div onKeyDown={outer}><Page /></div>);
    const opener = open();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
  });

  it('confirm runs onConfirm, and focus returns to the opener', () => {
    const onConfirm = vi.fn();
    render(<Page onConfirm={onConfirm} />);
    const opener = open();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
  });

  it('Tab and Shift+Tab stay inside the dialog', () => {
    render(<Page />);
    open();
    const keep = screen.getByRole('button', { name: 'Keep editing' });
    const discard = screen.getByRole('button', { name: 'Discard changes' });
    discard.focus();
    fireEvent.keyDown(discard, { key: 'Tab' });
    expect(document.activeElement).toBe(keep);
    fireEvent.keyDown(keep, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(discard);
  });

  it('a normal Tab between the two buttons is left to the browser (not pulled back to the panel)', () => {
    render(<Page />);
    open();
    const keep = screen.getByRole('button', { name: 'Keep editing' });
    const event = fireEvent.keyDown(keep, { key: 'Tab' });
    expect(event).toBe(true); // not prevented
    expect(document.activeElement).toBe(keep);
  });

  it('the page behind is inert while open and live again after', () => {
    render(<Page />);
    open();
    expect(screen.getByTestId('behind').inert).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByTestId('behind').inert).toBe(false);
  });

  it('clicking the backdrop does nothing (it must be answered)', () => {
    render(<Page />);
    open();
    fireEvent.mouseDown(document.querySelector('.fk-confirm-back'));
    fireEvent.click(document.querySelector('.fk-confirm-back'));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });
});
