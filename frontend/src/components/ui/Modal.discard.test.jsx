// @vitest-environment jsdom
// U3: the admin Modal's two optional props. Without them nothing changes
// (window.confirm, the Modal answers Escape and Tab); with them a caller's
// in-app confirm takes over, and the Modal steps aside while it is open.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Modal from './Modal';

let original;
beforeAll(() => {
  original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode; } });
});
afterAll(() => { if (original) Object.defineProperty(HTMLElement.prototype, 'offsetParent', original); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const show = (props = {}) => render(
  <Modal open title="Edit thing" onClose={props.onClose || vi.fn()} isDirty={() => true} {...props}
    footer={close => <><button type="button" onClick={close}>Cancel</button><button type="button">Save</button></>}>
    <input aria-label="Name" />
  </Modal>,
);

describe('Modal without the new props (unchanged behaviour)', () => {
  it('a dirty close still asks window.confirm("Discard changes?")', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onClose = vi.fn();
    show({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledWith('Discard changes?');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape still closes through the same guard', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onClose = vi.fn();
    show({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('onDiscardRequest', () => {
  it('a dirty close calls it with proceed, and never window.confirm', () => {
    const confirm = vi.spyOn(window, 'confirm');
    const onClose = vi.fn();
    const onDiscardRequest = vi.fn();
    show({ onClose, onDiscardRequest });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onDiscardRequest).toHaveBeenCalledOnce();
    onDiscardRequest.mock.calls[0][0]();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('an untouched form closes at once without asking', () => {
    const onClose = vi.fn();
    const onDiscardRequest = vi.fn();
    show({ onClose, onDiscardRequest, isDirty: () => false });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDiscardRequest).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('keysSuspended', () => {
  it('while true the Modal ignores Escape and Tab; when false it answers again', () => {
    const onDiscardRequest = vi.fn();
    const { rerender } = show({ onDiscardRequest, keysSuspended: true });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDiscardRequest).not.toHaveBeenCalled();
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(save);   // not wrapped by the Modal
    rerender(
      <Modal open title="Edit thing" onClose={vi.fn()} isDirty={() => true} onDiscardRequest={onDiscardRequest} keysSuspended={false}
        footer={close => <><button type="button" onClick={close}>Cancel</button><button type="button">Save</button></>}>
        <input aria-label="Name" />
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDiscardRequest).toHaveBeenCalledOnce();
  });
});
