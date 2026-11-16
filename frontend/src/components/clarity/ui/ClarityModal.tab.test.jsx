// @vitest-environment jsdom
// U3: the ClarityModal keyboard trap fix. An ordinary Tab between controls
// is left to the browser (it used to be cancelled and focus jumped to the
// panel, where it stayed); the two ends still wrap; with nothing measurable
// focus stays on the panel.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ClarityModal from './ClarityModal';

let original;
beforeAll(() => {
  original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentElement; } });
});
afterAll(() => {
  if (original) Object.defineProperty(HTMLElement.prototype, 'offsetParent', original);
  else delete HTMLElement.prototype.offsetParent;
});
afterEach(cleanup);

const show = () => render(
  <ClarityModal title="Check" onClose={() => {}} footer={<><button type="button">Two</button><button type="button">Three</button></>}>
    <button type="button">One</button>
  </ClarityModal>,
);
const btn = name => screen.getByRole('button', { name });
// Simulate the browser: if our handler did not prevent the Tab, move focus
// to the next/previous focusable control itself.
const tab = (shift = false) => {
  const all = [...screen.getByRole('dialog').querySelectorAll('button')];
  const ok = fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: shift });
  if (ok) {
    const i = all.indexOf(document.activeElement);
    all[i + (shift ? -1 : 1)]?.focus();
  }
};

describe('ClarityModal Tab cycle', () => {
  it('Tab walks One -> Two -> Three and wraps to One (focus never parks on the panel)', () => {
    show();
    expect(document.activeElement).toBe(btn('One'));
    tab();
    expect(document.activeElement).toBe(btn('Two'));
    tab();
    expect(document.activeElement).toBe(btn('Three'));
    tab();
    expect(document.activeElement).toBe(btn('One'));
  });

  it('Shift+Tab walks One -> Three -> Two', () => {
    show();
    tab(true);
    expect(document.activeElement).toBe(btn('Three'));
    tab(true);
    expect(document.activeElement).toBe(btn('Two'));
  });

  it('an ordinary Tab is not prevented', () => {
    show();
    const notPrevented = fireEvent.keyDown(btn('One'), { key: 'Tab' });
    expect(notPrevented).toBe(true);
  });

  it('with nothing measurable inside, focus stays on the panel', () => {
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return null; } });
    try {
      show();
      const panel = screen.getByRole('dialog');
      const notPrevented = fireEvent.keyDown(panel, { key: 'Tab' });
      expect(notPrevented).toBe(false);
      expect(document.activeElement).toBe(panel);
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentElement; } });
    }
  });
});
