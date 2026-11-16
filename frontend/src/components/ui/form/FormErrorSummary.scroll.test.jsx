// @vitest-environment jsdom
// V1: focus() alone only brings a field into the scroll area, where a sticky
// dialog footer can still cover it on a phone. Moving to the first invalid
// field also centres it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import FormErrorSummary from './FormErrorSummary';

const ERRORS = [{ fieldId: 'v1-name', message: 'Enter the full name.' }, { fieldId: 'v1-email', message: 'Enter an email.' }];

function Form({ focusTo }) {
  const [attempt, setAttempt] = useState(0);
  const [errors, setErrors] = useState([]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); setErrors(ERRORS); setAttempt(a => a + 1); }}>
      <FormErrorSummary errors={errors} attempt={attempt} focusTo={focusTo} />
      <input id="v1-name" aria-label="Full name" />
      <input id="v1-email" aria-label="Email" />
      <button type="submit">Save</button>
    </form>
  );
}

const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
afterEach(() => {
  cleanup();
  if (original) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', original);
  else delete HTMLElement.prototype.scrollIntoView;
});
const spy = () => {
  const fn = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: fn });
  return fn;
};

describe('FormErrorSummary centres the field it moves to', () => {
  it("focusTo='first-field': the first invalid field is focused and scrolled to the centre", () => {
    const scroll = spy();
    render(<Form focusTo="first-field" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const field = screen.getByLabelText('Full name');
    expect(document.activeElement).toBe(field);
    expect(scroll).toHaveBeenCalledWith({ block: 'center' });
    expect(scroll.mock.contexts.at(-1)).toBe(field);
  });

  it('following a link in the summary centres that field too', () => {
    const scroll = spy();
    render(<Form />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('link', { name: 'Enter an email.' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Email'));
    expect(scroll.mock.contexts.at(-1)).toBe(screen.getByLabelText('Email'));
    expect(scroll).toHaveBeenLastCalledWith({ block: 'center' });
  });

  it('still focuses the field where scrollIntoView does not exist', () => {
    delete HTMLElement.prototype.scrollIntoView;
    if (Element.prototype.scrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: undefined });
    render(<Form focusTo="first-field" />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Save' }))).not.toThrow();
    expect(document.activeElement).toBe(screen.getByLabelText('Full name'));
  });
});
