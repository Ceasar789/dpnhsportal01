// @vitest-environment jsdom
// U2 form kit: the error summary after a failed submit.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import FormErrorSummary from './FormErrorSummary';
import Field from './Field';

afterEach(cleanup);

const ERRORS = [{ fieldId: 'f-name', message: 'Enter the full name.' }, { fieldId: 'f-email', message: 'Enter an email address like name@school.edu.ph.' }];

function Form({ focusTo }) {
  const [attempt, setAttempt] = useState(0);
  const [errors, setErrors] = useState([]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); setErrors(ERRORS); setAttempt(a => a + 1); }}>
      <FormErrorSummary errors={errors} attempt={attempt} focusTo={focusTo} />
      <Field label="Full name" id="f-name" error={errors[0]?.message}><input /></Field>
      <Field label="Email" id="f-email" error={errors[1]?.message}><input /></Field>
      <button type="submit">Send invite</button>
    </form>
  );
}

describe('FormErrorSummary', () => {
  it('renders nothing before a failed submit', () => {
    render(<Form />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('after a failed submit: one role="alert" box with a count and links, focused', () => {
    render(<Form />);
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toContain('Please fix 2 things:');
    expect(document.activeElement).toBe(alerts[0]);
    const links = screen.getAllByRole('link');
    expect(links.map(l => l.textContent)).toEqual(ERRORS.map(e => e.message));
    expect(links.map(l => l.getAttribute('href'))).toEqual(['#f-name', '#f-email']);
  });

  it('a link moves focus to its field', () => {
    render(<Form />);
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    fireEvent.click(screen.getByRole('link', { name: ERRORS[1].message }));
    expect(document.activeElement).toBe(screen.getByLabelText('Email'));
  });

  it('focusTo="first-field" focuses the first invalid field instead', () => {
    render(<Form focusTo="first-field" />);
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Full name'));
  });

  it('a second failed submit moves focus again; a re-render without a new attempt does not', () => {
    const { rerender } = render(<FormErrorSummary errors={ERRORS} attempt={1} />);
    const box = screen.getByRole('alert');
    expect(document.activeElement).toBe(box);
    box.blur();
    rerender(<FormErrorSummary errors={ERRORS.slice(0, 1)} attempt={1} />);
    expect(document.activeElement).not.toBe(box);
    expect(screen.getByRole('alert').textContent).toContain('Please fix 1 thing:');
    rerender(<FormErrorSummary errors={ERRORS} attempt={2} />);
    expect(document.activeElement).toBe(screen.getByRole('alert'));
  });

  it('ignores incomplete entries and takes a custom title', () => {
    render(<FormErrorSummary errors={[{ fieldId: 'a' }, null, { message: 'x' }, { fieldId: 'b', message: 'Fix b.' }]} attempt={1} title="Check this:" />);
    expect(screen.getByRole('alert').textContent).toBe('Check this:Fix b.');
  });
});
