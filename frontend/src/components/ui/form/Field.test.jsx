// @vitest-environment jsdom
// U2 form kit: Field wiring (label, Optional, help, error, aria), and
// validation on blur (D1) that stays quiet until the field was changed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import Field from './Field';
import { email } from '../../../lib/formRules';

afterEach(cleanup);

const describedBy = el => (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
const textOf = ids => ids.map(id => document.getElementById(id)?.textContent);

describe('label, Optional, help and ids', () => {
  it('the label sits above and names the control; a required field has no mark but aria-required', () => {
    render(<Field label="Full name"><input /></Field>);
    const input = screen.getByLabelText('Full name');
    expect(input.tagName).toBe('INPUT');
    expect(input.className).toContain('fk-control');
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(screen.queryByText('Optional')).toBeNull();
    expect(document.querySelector('.fk-label').compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('an optional field says "Optional" after the label and is not aria-required', () => {
    render(<Field label="Department" optional><input /></Field>);
    const input = screen.getByLabelText(/Department/);
    expect(screen.getByText('Optional').className).toBe('fk-optional');
    expect(input.getAttribute('aria-required')).toBeNull();
  });

  it('keeps the child\'s own id, className and describedby, and adds help', () => {
    render(<Field label="LRN" help="12 digits from the student's report card."><input id="users-lrn" className="mine" aria-describedby="other" /></Field>);
    const input = screen.getByLabelText('LRN');
    expect(input.id).toBe('users-lrn');
    expect(input.className).toBe('fk-control mine');
    expect(describedBy(input)).toEqual(['other', 'users-lrn-help']);
    expect(textOf(['users-lrn-help'])).toEqual(["12 digits from the student's report card."]);
  });

  it('generates a unique id when none is given, for select and textarea too', () => {
    render(<><Field label="Role"><select><option>Student</option></select></Field><Field label="Bio" optional><textarea /></Field></>);
    const select = screen.getByLabelText('Role');
    const area = screen.getByLabelText(/Bio/);
    expect(select.id).toMatch(/^fk/);
    expect(area.id).toMatch(/^fk/);
    expect(select.id).not.toBe(area.id);
  });
});

describe('errors from the parent (after submit)', () => {
  it('error text is linked by aria-describedby (error first) and the control is aria-invalid', () => {
    render(<Field label="Email" help="Their sign-in name." error="Email is required." id="em"><input /></Field>);
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(input)).toEqual(['em-error', 'em-help']);
    expect(textOf(['em-error'])).toEqual(['Email is required.']);
  });

  it('without an error: no aria-invalid, no error id in describedby, an empty live region kept for announcements', () => {
    render(<Field label="Email" id="em"><input /></Field>);
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
    const region = document.getElementById('em-error');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
  });
});

describe('validation on blur (D1)', () => {
  const Controlled = ({ onValidate, validate = email() }) => {
    const [v, setV] = useState('');
    return <Field label="Email" id="em" validate={validate} onValidate={onValidate}><input value={v} onChange={e => setV(e.target.value)} /></Field>;
  };

  it('tabbing past an untouched field stays quiet', () => {
    const onValidate = vi.fn();
    render(<Controlled onValidate={onValidate} />);
    const input = screen.getByLabelText('Email');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onValidate).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('after a change, blur shows the message; typing a fix clears it live', () => {
    const onValidate = vi.fn();
    render(<Controlled onValidate={onValidate} />);
    const input = screen.getByLabelText('Email');
    fireEvent.change(input, { target: { value: 'ana@' } });
    expect(input.getAttribute('aria-invalid')).toBeNull();
    fireEvent.blur(input);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById('em-error').textContent).toBe('Enter a valid email address, for example JuanDelacruz@gmail.com.');
    expect(onValidate).toHaveBeenLastCalledWith('Enter a valid email address, for example JuanDelacruz@gmail.com.');
    fireEvent.change(input, { target: { value: 'ana@school.edu' } });
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(onValidate).toHaveBeenLastCalledWith(null);
  });

  it('calls the child\'s own onChange and onBlur too', () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    render(<Field label="Name"><input onChange={onChange} onBlur={onBlur} /></Field>);
    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onBlur).toHaveBeenCalledOnce();
  });

  it('the parent error wins over a blur message', () => {
    render(<Field label="Email" id="em" error="Email is required." validate={() => 'blur says no'}><input defaultValue="" /></Field>);
    const input = screen.getByLabelText('Email');
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.blur(input);
    expect(document.getElementById('em-error').textContent).toBe('Email is required.');
  });

  it('a render-function child receives the wired props', () => {
    render(<Field label="Code" id="cd" error="Bad">{p => <span><input {...p} /></span>}</Field>);
    const input = screen.getByLabelText('Code');
    expect(input.id).toBe('cd');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(input)).toEqual(['cd-error']);
  });
});
