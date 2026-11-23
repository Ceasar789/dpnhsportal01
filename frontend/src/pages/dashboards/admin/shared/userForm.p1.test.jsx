// @vitest-environment jsdom
// P1: the invite 409 wording, the Resend cooldown sentence, the status chip,
// and Resend offered from the Create User dialog for a pending invite.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';

vi.mock('../AdminContext', async () => {
  const { createContext, useContext } = await import('react');
  const FakeAdminContext = createContext(null);
  return { FakeAdminContext, useAdminContext: () => useContext(FakeAdminContext) };
});
import { FakeAdminContext } from '../AdminContext';
import UserFormDialog from './UserFormDialog';
import { INVITE_SERVER_MESSAGES, USER_FIELDS, inviteChipLabel, resendInviteError, userSaveError } from './userForm';

const backend = (message) => Object.assign(new Error(message), { name: 'BackendRequestError', kind: 'response' });

describe('invite 409 wording', () => {
  it('a pending invite: use Resend instead, on the email field', () => {
    expect(userSaveError(backend(INVITE_SERVER_MESSAGES.invitePending)))
      .toEqual({ fieldId: USER_FIELDS.email, message: 'This person was already invited. Use Resend instead.' });
  });
  it('an active account: it already has an account', () => {
    expect(userSaveError(backend(INVITE_SERVER_MESSAGES.emailTaken)))
      .toEqual({ fieldId: USER_FIELDS.email, message: 'An account with this email already exists.' });
  });
  it('the Resend cooldown is shown as written', () => {
    expect(resendInviteError(backend(INVITE_SERVER_MESSAGES.resendCooldown)))
      .toBe('A link was sent less than a minute ago. Wait a minute, then try again.');
  });
});

describe('status chip', () => {
  it('Invited / Link expired or used', () => {
    expect(inviteChipLabel({ invite_link_state: 'invited' })).toBe('Invited');
    expect(inviteChipLabel({ invite_link_state: 'link_stale' })).toBe('Link expired or used');
    expect(inviteChipLabel({})).toBe('Invited');
  });
});

let original;
beforeAll(() => {
  original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode; } });
});
afterAll(() => { if (original) Object.defineProperty(HTMLElement.prototype, 'offsetParent', original); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const PENDING = { id: 'u9', name: 'Pia Reyes', email: 'pia@school.test', can_resend_invitation: true };
function Host({ saveUser, resendInvitation, users = [PENDING] }) {
  const [s, setS] = useState({ modal: 'user', uName: 'Pia Reyes', uEmail: 'Pia@School.test', uRole: 'teacher', uDept: '', uLrn: '', uStatus: 'active' });
  const set = k => v => setS(p => ({ ...p, [k]: v }));
  const ctx = {
    ...s, editUser: null, users, resendInvitation,
    setUName: set('uName'), setUEmail: set('uEmail'), setURole: set('uRole'), setUDept: set('uDept'), setULrn: set('uLrn'), setUStatus: set('uStatus'),
    closeModal: () => setS(p => ({ ...p, modal: null })),
    saveUser,
  };
  return <FakeAdminContext.Provider value={ctx}><UserFormDialog /></FakeAdminContext.Provider>;
}

describe('Create User: Resend offered for a pending invite', () => {
  const pendingSave = vi.fn(async () => ({ ok: false, fieldErrors: [{ fieldId: USER_FIELDS.email, message: 'This person was already invited. Use Resend instead.' }] }));

  it('shows the message and a Resend button that resends to that person and closes', async () => {
    const resendInvitation = vi.fn(async () => {});
    render(<Host saveUser={pendingSave} resendInvitation={resendInvitation} />);
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send invite' })); });
    expect(screen.getByRole('dialog').textContent).toContain('This person was already invited. Use Resend instead.');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resend invitation to Pia Reyes' })); });
    expect(resendInvitation).toHaveBeenCalledWith(PENDING);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('no Resend button for an active account, or when the person is not in the loaded list', async () => {
    const takenSave = vi.fn(async () => ({ ok: false, fieldErrors: [{ fieldId: USER_FIELDS.email, message: 'An account with this email already exists.' }] }));
    render(<Host saveUser={takenSave} resendInvitation={vi.fn()} />);
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send invite' })); });
    expect(screen.queryByRole('button', { name: /Resend invitation/ })).toBeNull();
    cleanup();
    render(<Host saveUser={pendingSave} resendInvitation={vi.fn()} users={[]} />);
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send invite' })); });
    expect(screen.getByRole('dialog').textContent).toContain('Use Resend instead.');
    expect(screen.queryByRole('button', { name: /Resend invitation/ })).toBeNull();
    cleanup();
    render(<Host saveUser={pendingSave} resendInvitation={vi.fn()} users={[{ ...PENDING, can_resend_invitation: false }]} />);
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send invite' })); });
    expect(screen.queryByRole('button', { name: /Resend invitation/ })).toBeNull();
  });
});
