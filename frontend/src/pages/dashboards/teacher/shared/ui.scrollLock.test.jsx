// @vitest-environment jsdom
// V1: the teacher Modal holds the page still while it is up and gives it
// back on close; its backdrop is lighter in light mode, stronger in dark.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ThemeContext } from '../hooks';
import { ConfirmDialog, Modal } from './ui';

const { body, documentElement } = document;

beforeEach(() => {
  body.removeAttribute('style');
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
  vi.spyOn(documentElement, 'clientWidth', 'get').mockReturnValue(1263);
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(40);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); body.removeAttribute('style'); });

const show = (dark = false) => render(
  <ThemeContext.Provider value={{ dark }}>
    <Modal title="Create Worksheet" onClose={() => {}}><input aria-label="Title" /></Modal>
  </ThemeContext.Provider>,
);

describe('teacher Modal', () => {
  it('locks and pads the body while mounted and restores it on unmount', () => {
    const { unmount } = show();
    expect(body.style).toMatchObject({ overflow: 'hidden', position: 'fixed', top: '-40px', paddingRight: '17px' });
    unmount();
    expect(body.getAttribute('style') || '').toBe('');
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 40);
  });

  it('nested: closing the confirm keeps the page locked; closing the dialog restores it', () => {
    const Outer = ({ confirm }) => (
      <ThemeContext.Provider value={{ dark: false }}>
        <Modal title="Create Worksheet" onClose={() => {}}>
          <input aria-label="Title" />
          {confirm && <ConfirmDialog title="Discard?" message="Sure?" onCancel={() => {}} onConfirm={() => {}} />}
        </Modal>
      </ThemeContext.Provider>
    );
    const { rerender } = render(<Outer confirm />);
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    rerender(<Outer confirm={false} />);
    expect(body.style).toMatchObject({ overflow: 'hidden', position: 'fixed', paddingRight: '17px' });
    cleanup();
    expect(body.getAttribute('style') || '').toBe('');
  });

  it('nested: "Discard" closes the dialog and its confirm in one commit, and the page is restored', () => {
    const { unmount } = render(
      <ThemeContext.Provider value={{ dark: false }}>
        <Modal title="Create Worksheet" onClose={() => {}}>
          <ConfirmDialog title="Discard?" message="Sure?" onCancel={() => {}} onConfirm={() => {}} />
        </Modal>
      </ThemeContext.Provider>,
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    unmount();
    expect(body.getAttribute('style') || '').toBe('');
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 40);
  });

  it.each([[false, 'bg-black/40'], [true, 'bg-black/55']])('dark=%s backdrop is %s', (dark, tint) => {
    show(dark);
    const overlay = screen.getByRole('dialog').parentElement;
    expect(overlay.className.split(' ')).toContain(tint);
    expect(overlay.className).not.toMatch(/bg-black\/60/);
  });
});
