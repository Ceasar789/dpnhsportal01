// @vitest-environment jsdom
// V1: the admin Modal holds the page still while it is open (the shared
// lockScroll, as ClarityModal already did), pads for the scrollbar it
// removes, and gives everything back when it closes, also when nested.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import Modal from './Modal';

const { body, documentElement } = document;

beforeEach(() => {
  body.removeAttribute('style');
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
  vi.spyOn(documentElement, 'clientWidth', 'get').mockReturnValue(1272);
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(120);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); body.removeAttribute('style'); });

const dialog = (open, title = 'Create user') => (
  <Modal open={open} title={title} onClose={() => {}} footer={() => <button type="button">Cancel</button>}>
    <input aria-label={`${title} name`} />
  </Modal>
);

describe('admin Modal scroll lock', () => {
  it('locks and pads the body while open, and restores it on close', () => {
    const { rerender } = render(dialog(true));
    expect(body.style).toMatchObject({ overflow: 'hidden', position: 'fixed', top: '-120px', paddingRight: '8px' });
    rerender(dialog(false));
    expect(body.getAttribute('style') || '').toBe('');
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 120);
  });

  it('does nothing while closed', () => {
    render(dialog(false));
    expect(body.getAttribute('style') || '').toBe('');
  });

  it('restores the body when the open dialog unmounts', () => {
    const { unmount } = render(dialog(true));
    unmount();
    expect(body.getAttribute('style') || '').toBe('');
  });

  it('nested dialogs: the page stays locked until the outer one closes', () => {
    const Both = ({ inner }) => <>{dialog(true, 'Outer')}{dialog(inner, 'Inner')}</>;
    const { rerender } = render(<Both inner={false} />);
    rerender(<Both inner />);
    rerender(<Both inner={false} />);
    expect(body.style).toMatchObject({ overflow: 'hidden', position: 'fixed', paddingRight: '8px' });
    cleanup();
    expect(body.getAttribute('style') || '').toBe('');
  });
});
