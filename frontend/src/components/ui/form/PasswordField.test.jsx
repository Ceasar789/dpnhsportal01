// @vitest-environment jsdom
// U2 form kit: PasswordField show/hide, autocomplete and the live checklist.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import PasswordField from './PasswordField';
import { passwordRules } from '../../../lib/formRules';

afterEach(cleanup);

const RULES = passwordRules({ minLength: 12, uppercase: true, number: true, special: true });

function Harness(props) {
  const [v, setV] = useState('');
  return <PasswordField label="New password" value={v} onChange={e => setV(e.target.value)} rules={RULES} {...props} />;
}

const items = () => within(screen.getByRole('list', { name: 'Password rules' })).getAllByRole('listitem');
const state = () => items().map(li => li.getAttribute('data-met'));

describe('PasswordField', () => {
  it('a password input with new-password autocomplete by default', () => {
    render(<Harness />);
    const input = screen.getByLabelText('New password');
    expect(input.type).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('new-password');
    expect(input.className).toContain('fk-control');
  });

  it('current-password for sign in, and no checklist without rules', () => {
    render(<PasswordField label="Password" autoComplete="current-password" value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('the toggle shows and hides, says what it will do, never submits, keeps focus', () => {
    render(<form onSubmit={() => { throw new Error('submitted'); }}><Harness /></form>);
    const input = screen.getByLabelText('New password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle.getAttribute('type')).toBe('button');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(input.id);
    toggle.focus();
    fireEvent.click(toggle);
    expect(input.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    expect(input.type).toBe('password');
  });

  it('the checklist is driven by the rules prop and updates live, in words as well as marks', () => {
    render(<Harness />);
    expect(items().map(li => li.textContent)).toEqual([
      '○At least 12 characters, not yet', '○One uppercase letter (A-Z), not yet', '○One number (0-9), not yet', '○One special character (like ! or #), not yet',
    ]);
    const input = screen.getByLabelText('New password');
    fireEvent.change(input, { target: { value: 'Abc1' } });
    expect(state()).toEqual(['false', 'true', 'true', 'false']);
    fireEvent.change(input, { target: { value: 'Abcdefghij1!' } });
    expect(state()).toEqual(['true', 'true', 'true', 'true']);
    expect(items()[0].textContent).toBe('✓At least 12 characters, done');
  });

  it('a different rules array gives a different checklist (nothing hard-coded)', () => {
    render(<PasswordField label="PIN" value="12" onChange={() => {}} rules={[{ id: 'four', label: 'Four digits', test: v => /^\d{4}$/.test(v) }]} />);
    expect(items().map(li => li.textContent)).toEqual(['○Four digits, not yet']);
  });

  it('the input is described by the checklist (and by an error, first, when there is one)', () => {
    render(<Harness id="pw" error="Your password does not meet all the rules yet." />);
    const input = screen.getByLabelText('New password');
    const ids = input.getAttribute('aria-describedby').split(' ');
    expect(ids[0]).toBe('pw-error');
    expect(document.getElementById(ids[1]).getAttribute('aria-label')).toBe('Password rules');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('disabled disables the input and the toggle', () => {
    render(<Harness disabled />);
    expect(screen.getByLabelText('New password').disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Show password' }).disabled).toBe(true);
  });
});
