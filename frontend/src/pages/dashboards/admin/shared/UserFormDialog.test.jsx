// @vitest-environment jsdom
// U3: the shared admin Create / Edit User dialog on the form kit, driven by a
// controlled fake admin context (the real one is useAdminLogic; saveUser is
// faked here and tested on its own in useAdminLogic.users.test.jsx).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';

// The fake admin context is passed through a real React context, so the test
// host never writes to a shared object during render.
vi.mock('../AdminContext', async () => {
  const { createContext, useContext } = await import('react');
  const FakeAdminContext = createContext(null);
  return { FakeAdminContext, useAdminContext: () => useContext(FakeAdminContext) };
});
import { FakeAdminContext } from '../AdminContext';
import UserFormDialog from './UserFormDialog';
import { USER_FIELDS } from './userForm';

// jsdom has no layout; the Modal focus trap measures offsetParent.
let original;
beforeAll(() => {
  original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode; } });
});
afterAll(() => { if (original) Object.defineProperty(HTMLElement.prototype, 'offsetParent', original); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const OPEN = { modal: 'user', uName: '', uEmail: '', uRole: 'student', uDept: '', uLrn: '', uStatus: 'active' };

function Host({ saveUser = vi.fn(async () => ({ ok: true })), editUser = null, start = {}, saving = false }) {
  const [s, setS] = useState({ ...OPEN, ...start });
  const set = k => v => setS(p => ({ ...p, [k]: v }));
  const ctx = {
    ...s, editUser, uSaving: saving,
    setUName: set('uName'), setUEmail: set('uEmail'), setURole: set('uRole'), setUDept: set('uDept'), setULrn: set('uLrn'), setUStatus: set('uStatus'),
    closeModal: () => setS(p => ({ ...p, modal: null })),
    saveUser: async (opts) => saveUser(opts, setS),
  };
  return (
    <FakeAdminContext.Provider value={ctx}>
      <button type="button" onClick={() => setS(p => ({ ...p, modal: 'user' }))}>Open dialog</button>
      <UserFormDialog />
    </FakeAdminContext.Provider>
  );
}

const dialog = () => screen.getByRole('dialog');
const field = label => screen.getByLabelText(label);
const type = (label, value) => fireEvent.change(field(label), { target: { value } });
const press = name => fireEvent.click(within(dialog()).getByRole('button', { name }));

describe('open, labels and marks', () => {
  it('Create User: one-line purpose, focus on Full name, no password field, no asterisk legend', () => {
    render(<Host />);
    expect(screen.getByRole('dialog', { name: 'Create User' })).toBeTruthy();
    expect(dialog().textContent).toContain("We'll email them a link to set their own password.");
    expect(document.activeElement.id).toBe(USER_FIELDS.name);
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(dialog().textContent).not.toContain('* Required');
    expect(dialog().textContent).not.toContain('Supabase');
  });

  it('labels sit above the fields; required ones are aria-required with no mark; Department is Optional', () => {
    render(<Host start={{ uRole: 'teacher' }} />);
    for (const label of ['Full name', 'Email']) expect(field(label).getAttribute('aria-required')).toBe('true');
    expect(screen.getByText('Optional').closest('label').textContent).toBe('Department or subjectOptional');
    expect(field(/^Department or subject/).getAttribute('aria-required')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Role' }).getAttribute('aria-required')).toBe('true');
  });

  it('sensible input attributes: email is type/inputmode email; LRN numeric; autocomplete off for another person', () => {
    render(<Host />);
    expect(field('Email').getAttribute('type')).toBe('email');
    expect(field('Email').getAttribute('inputmode')).toBe('email');
    for (const label of ['Full name', 'Email', /^LRN/]) expect(field(label).getAttribute('autocomplete')).toBe('off');
    expect(field(/^LRN/).getAttribute('inputmode')).toBe('numeric');
    expect(field(/^LRN/).getAttribute('maxlength')).toBeNull();
  });

  it('Edit User: email locked with the reason, LRN Optional, account status shown, Save changes', () => {
    render(<Host editUser={{ id: 'u1', role: 'student', status: 'active' }} start={{ uName: 'Kid', uEmail: 'kid@school.test' }} />);
    expect(screen.getByRole('dialog', { name: 'Edit User' })).toBeTruthy();
    expect(field('Email').disabled).toBe(true);
    expect(document.getElementById(field('Email').getAttribute('aria-describedby')).textContent).toBe('The email is the sign-in name and cannot be changed here.');
    expect(field(/^LRN/).getAttribute('aria-required')).toBeNull();
    expect(field('Account status').value).toBe('active');
    expect(within(dialog()).getByRole('button', { name: 'Save changes' })).toBeTruthy();
    expect(within(dialog()).queryByRole('button', { name: 'Send and add another' })).toBeNull();
  });
});

describe('validation on blur (D1)', () => {
  it('tabbing past an untouched field stays quiet', () => {
    render(<Host />);
    fireEvent.blur(field('Full name'));
    fireEvent.blur(field('Email'));
    expect(field('Full name').getAttribute('aria-invalid')).toBeNull();
    expect(field('Email').getAttribute('aria-invalid')).toBeNull();
  });

  it('after a change, blur shows the friendly message next to the field; fixing it clears it live', () => {
    render(<Host />);
    type('Email', 'ana@');
    fireEvent.blur(field('Email'));
    expect(field('Email').getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(`${USER_FIELDS.email}-error`).textContent).toBe('Enter an email address like name@school.edu.ph.');
    type('Email', 'ana@school.edu.ph');
    expect(field('Email').getAttribute('aria-invalid')).toBeNull();
  });
});

describe('the LRN field never drops characters silently', () => {
  const note = () => document.getElementById(`${USER_FIELDS.lrn}-help`);

  it('letters are refused with a live "Digits only" note; blur says how many digits there are', () => {
    render(<Host />);
    type(/^LRN/, '12ab34');
    expect(field(/^LRN/).value).toBe('1234');
    expect(note().textContent).toBe('Digits only (0-9).');
    expect(note().getAttribute('aria-live')).toBe('polite');
    fireEvent.blur(field(/^LRN/));
    expect(document.getElementById(`${USER_FIELDS.lrn}-error`).textContent).toBe("The LRN must be 12 digits. You've entered 4.");
  });

  it('a pasted 1081-2345-6789 is cleaned to its 12 digits with a gentle note', () => {
    render(<Host />);
    type(/^LRN/, '1081-2345-6789');
    expect(field(/^LRN/).value).toBe('108123456789');
    expect(note().textContent).toBe('Spaces and dashes were removed.');
    fireEvent.blur(field(/^LRN/));
    expect(field(/^LRN/).getAttribute('aria-invalid')).toBeNull();
  });

  it('after a failed submit, pasting 1081-2345-6789 clears the LRN error at once (the cleaned value is checked, not the raw paste)', () => {
    render(<Host start={{ uName: 'Ana', uEmail: 'ana@school.edu.ph' }} />);
    press('Send invite');
    expect(field(/^LRN/).getAttribute('aria-invalid')).toBe('true');
    type(/^LRN/, '1081-2345-6789');
    expect(field(/^LRN/).getAttribute('aria-invalid')).toBeNull();
    expect(document.getElementById(`${USER_FIELDS.lrn}-error`).textContent).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a 13th digit is not kept, and the note says so', () => {
    render(<Host />);
    type(/^LRN/, '1081234567890');
    expect(field(/^LRN/).value).toBe('108123456789');
    expect(note().textContent).toBe('Only the first 12 digits were kept.');
  });
});

describe('submit', () => {
  it('invalid: summary of every problem, focus on the first invalid field, saveUser not called', () => {
    const saveUser = vi.fn();
    render(<Host saveUser={saveUser} start={{ uName: 'Ana' }} />);
    press('Send invite');
    expect(saveUser).not.toHaveBeenCalled();
    const summary = screen.getByRole('alert');
    expect(summary.textContent).toBe("Please fix 2 things:Enter the email address.Enter the student's 12-digit LRN.");
    expect(document.activeElement.id).toBe(USER_FIELDS.email);
    fireEvent.click(within(summary).getByRole('link', { name: "Enter the student's 12-digit LRN." }));
    expect(document.activeElement.id).toBe(USER_FIELDS.lrn);
  });

  it('valid: one save, even on a double press; the primary is never disabled', async () => {
    let resolve;
    const saveUser = vi.fn(() => new Promise(r => { resolve = r; }));
    render(<Host saveUser={saveUser} start={{ uName: 'Ana', uEmail: 'ana@school.edu.ph', uLrn: '108123456789' }} />);
    const send = within(dialog()).getByRole('button', { name: 'Send invite' });
    fireEvent.click(send);
    fireEvent.click(send);
    expect(saveUser).toHaveBeenCalledTimes(1);
    expect(saveUser).toHaveBeenCalledWith({ addAnother: false }, expect.any(Function));
    expect(send.disabled).toBe(false);
    await act(async () => { resolve({ ok: true }); });
  });

  it('pressing a footer button keeps focus in the field, so no blur re-check moves the button mid-click', () => {
    render(<Host start={{ uName: 'Ana' }} />);
    field('Email').focus();
    for (const name of ['Cancel', 'Send and add another', 'Send invite']) {
      const notPrevented = fireEvent.mouseDown(within(dialog()).getByRole('button', { name }));
      expect(notPrevented, name).toBe(false);
    }
    expect(document.activeElement).toBe(field('Email'));
  });

  it('while saving, the primary says Sending… / Saving… and is aria-busy, not disabled', () => {
    render(<Host saving start={{ uName: 'Ana', uEmail: 'ana@school.edu.ph', uLrn: '108123456789' }} />);
    const busy = within(dialog()).getByRole('button', { name: 'Sending…' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy.disabled).toBe(false);
    cleanup();
    render(<Host saving editUser={{ id: 'u1', role: 'teacher' }} start={{ uName: 'T', uRole: 'teacher' }} />);
    expect(within(dialog()).getByRole('button', { name: 'Saving…' })).toBeTruthy();
  });

  it('a server field error (duplicate LRN) lands on the field with the summary, and focus goes there', async () => {
    const saveUser = vi.fn(async () => ({ ok: false, fieldErrors: [{ fieldId: USER_FIELDS.lrn, message: 'This LRN is already used by another student.' }] }));
    render(<Host saveUser={saveUser} start={{ uName: 'Ana', uEmail: 'ana@school.edu.ph', uLrn: '108123456789' }} />);
    await act(async () => { press('Send invite'); });
    expect(field(/^LRN/).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('This LRN is already used by another student.');
    expect(document.activeElement.id).toBe(USER_FIELDS.lrn);
  });

  it('a duplicate email lands on the email field', async () => {
    const saveUser = vi.fn(async () => ({ ok: false, fieldErrors: [{ fieldId: USER_FIELDS.email, message: 'An account with this email already exists.' }] }));
    render(<Host saveUser={saveUser} start={{ uName: 'Ana', uEmail: 'ana@school.edu.ph', uLrn: '108123456789' }} />);
    await act(async () => { press('Send invite'); });
    expect(document.getElementById(`${USER_FIELDS.email}-error`).textContent).toBe('An account with this email already exists.');
  });

  it('any other failure: the dialog stays open with the values, and shows no field error', async () => {
    const saveUser = vi.fn(async () => ({ ok: false }));
    render(<Host saveUser={saveUser} start={{ uName: 'Ana', uEmail: 'ana@school.edu.ph', uLrn: '108123456789' }} />);
    await act(async () => { press('Send invite'); });
    expect(dialog()).toBeTruthy();
    expect(field('Full name').value).toBe('Ana');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Send and add another (D4)', () => {
  it('keeps the role, clears the rest, focuses Full name, announces, and stays open', async () => {
    const saveUser = vi.fn(async (opts, setS) => { setS(p => ({ ...p, uName: '', uEmail: '', uDept: '', uLrn: '' })); return { ok: true }; });
    render(<Host saveUser={saveUser} start={{ uRole: 'teacher' }} />);
    // Typed by hand, so the fields count as changed (their blur check is armed).
    type('Full name', 'Ana');
    type('Email', 'ana@school.edu.ph');
    field('Email').focus();
    await act(async () => { press('Send and add another'); });
    expect(saveUser).toHaveBeenCalledWith({ addAnother: true }, expect.any(Function));
    expect(dialog()).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Teacher' }).getAttribute('aria-checked')).toBe('true');
    expect(field('Full name').value).toBe('');
    expect(document.activeElement.id).toBe(USER_FIELDS.name);
    expect(screen.getByRole('status').textContent).toBe('User created. You can add the next one.');
    // The emptied fields start fresh: leaving them does not flag them as missing.
    fireEvent.blur(field('Email'));
    fireEvent.blur(field('Full name'));
    expect(field('Email').getAttribute('aria-invalid')).toBeNull();
    expect(field('Full name').getAttribute('aria-invalid')).toBeNull();
    // The cleared form is the new baseline: Cancel closes without asking.
    press('Cancel');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('role picker (D6)', () => {
  it('arrow keys change the role; the LRN field follows the role', () => {
    render(<Host />);
    const student = screen.getByRole('radio', { name: 'Student' });
    expect(field(/^LRN/)).toBeTruthy();
    fireEvent.keyDown(student, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Teacher' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByLabelText(/^LRN/)).toBeNull();
    expect(field(/^Department or subject/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Teacher' }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Admin' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Admin' }), { key: 'ArrowRight' });
    expect(student.getAttribute('aria-checked')).toBe('true');
  });

  it('locked with the reason while the invitation is pending', () => {
    render(<Host editUser={{ id: 'u2', role: 'student', onboarding_status: 'invitation_pending' }} start={{ uName: 'Ben', uEmail: 'ben@school.test', uStatus: 'inactive' }} />);
    const group = screen.getByRole('radiogroup', { name: 'Role' });
    expect(group.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(group.getAttribute('aria-describedby')).textContent).toBe('Locked until they finish setting up their account.');
    expect(field('Account status').disabled).toBe(true);
  });
});

describe('unsaved changes (in-app confirm inside the Modal)', () => {
  const dirty = () => type('Full name', 'Ana');

  it.each([
    ['Cancel', () => press('Cancel')],
    ['Escape', () => fireEvent.keyDown(document.activeElement, { key: 'Escape' })],
    ['the backdrop', () => { const back = document.querySelector('.modal-overlay'); fireEvent.mouseDown(back); fireEvent.click(back); }],
  ])('%s on a changed form asks with the in-app dialog, never window.confirm', (_, close) => {
    const confirm = vi.spyOn(window, 'confirm');
    render(<Host />);
    dirty();
    close();
    expect(screen.getByRole('alertdialog', { name: 'Discard your changes?' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Create User' })).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('Escape inside the confirm keeps editing: only the confirm closes', () => {
    render(<Host />);
    dirty();
    press('Cancel');
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Create User' })).toBeTruthy();
    expect(field('Full name').value).toBe('Ana');
  });

  it('Keep editing returns; Discard changes closes and focus goes back to the opener', () => {
    render(<Host start={{ modal: null }} />);
    const opener = screen.getByRole('button', { name: 'Open dialog' });
    opener.focus();
    fireEvent.click(opener);
    dirty();
    press('Cancel');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    press('Cancel');
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('an untouched form closes at once', () => {
    render(<Host />);
    press('Cancel');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
