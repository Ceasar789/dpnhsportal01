// ============================================
// FILE: src/pages/dashboards/admin/shared/UserFormDialog.jsx
// U3: the admin Create User / Edit User dialog, on the U2 form kit. One
// component used by BOTH the classic UsersTab and the Clarity
// ClarityAdminUsersTab, so the two can never drift apart. The data and the
// API calls are unchanged: every field still reads and writes the admin
// context (useAdminLogic), and saving still goes through saveUser.
//
//   - labels above the fields; "Optional" on optional ones (D2)
//   - validation on blur (after a change) and on submit (D1); after a failed
//     submit an error summary lists the problems and focus goes to the first
//     invalid field; no toast repeats a field error
//   - LRN: digits only, 12, typed letters are not silently dropped (a
//     "Digits only" note says so), paste of 1081-2345-6789 is cleaned
//   - role as a segmented choice (D6)
//   - server errors through userSaveError (friendlyError): never raw text
//   - the primary button is never disabled; it shows "Sending…"/"Saving…",
//     and a double press is ignored
//   - "Send and add another" (D4) keeps the role, clears the rest, focuses
//     Full name and announces "User created"
//   - unsaved changes: the in-app ConfirmDialog, rendered INSIDE the Modal,
//     with the Modal's own keys suspended while it is open
//   - phones: primary on top (D7), sticky footer, 16px inputs, 44px targets
// ============================================

import { useEffect, useRef, useState } from 'react';
import Modal from '../../../../components/ui/Modal';
import ConfirmDialog from '../../../../components/ui/ConfirmDialog';
import Field from '../../../../components/ui/form/Field';
import FormErrorSummary from '../../../../components/ui/form/FormErrorSummary';
import SegmentedChoice from '../../../../components/ui/form/SegmentedChoice';
import { lrnInput } from '../../../../lib/formRules';
import { useAdminContext } from '../AdminContext';
import { roleLabel } from './helpers';
import { ASSIGNABLE_ROLES, USER_FIELDS, USER_MESSAGES, validateEmail, validateLrn, validateName, validateUserForm } from './userForm';

const ROLE_OPTIONS = ASSIGNABLE_ROLES.map(value => ({ value, label: roleLabel(value) }));
const snapshot = v => JSON.stringify([v.uName, v.uEmail, v.uRole, v.uDept, v.uLrn, v.uStatus]);

function UserForm() {
  const {
    closeModal, editUser, saveUser, setUDept, setUEmail, setULrn, setUName, setURole, setUStatus,
    uDept = '', uEmail = '', uLrn = '', uName = '', uRole = 'student', uSaving = false, uStatus = 'active',
    users = [], resendInvitation,
  } = useAdminContext();
  const editing = Boolean(editUser);
  const pending = editUser?.onboarding_status === 'invitation_pending';

  const values = { uName, uEmail, uRole, uDept, uLrn, uStatus };
  const baseline = useRef(snapshot(values));
  const busy = useRef(false);
  const [errors, setErrors] = useState({});
  const [attempt, setAttempt] = useState(0);
  const [lrnNote, setLrnNote] = useState('');
  const [confirming, setConfirming] = useState(null);
  const [announce, setAnnounce] = useState('');
  // Bumped after "Send and add another": the fields remount, so their own
  // "changed" and blur state start fresh (an emptied Email must not flag
  // itself as missing when focus leaves it), then focus goes to Full name.
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (round) document.getElementById(USER_FIELDS.name)?.focus();
  }, [round]);

  const fieldError = id => errors[id] || undefined;
  // P1: the server said this email is a pending invite. Offer Resend for
  // that person (when they are in the loaded list) instead of a new invite.
  const pendingMatch = !editing && errors[USER_FIELDS.email] === USER_MESSAGES.invitePending && typeof resendInvitation === 'function'
    ? users.find(u => (u.email || '').toLowerCase() === uEmail.trim().toLowerCase() && u.can_resend_invitation)
    : null;
  const [resending, setResending] = useState(false);
  const resendInstead = async () => {
    if (resending || !pendingMatch) return;
    setResending(true);
    try { await resendInvitation(pendingMatch); closeModal(); } catch { /* resendInvitation showed the message */ } finally { setResending(false); }
  };
  const clearError = id => message => { if (!message) setErrors(e => (e[id] ? { ...e, [id]: undefined } : e)); };

  const roleOptions = ASSIGNABLE_ROLES.includes(uRole)
    ? ROLE_OPTIONS
    // An account still holding a role the app no longer uses shows it,
    // checked and not selectable again.
    : [...ROLE_OPTIONS, { value: uRole, label: `${roleLabel(uRole)} (no longer used)`, disabled: true }];

  const onLrnChange = (event) => {
    const r = lrnInput(event.target.value);
    setULrn(r.value);
    setLrnNote(r.separators ? USER_MESSAGES.lrnSeparators : r.dropped ? USER_MESSAGES.lrnDigitsOnly : r.truncated ? USER_MESSAGES.lrnTruncated : '');
  };

  // The LRN box keeps only the cleaned digits, so a typed or pasted value is
  // checked the same way: a pasted 1081-2345-6789 must not flash "Digits
  // only" while the field is being corrected.
  const checkLrn = value => validateLrn(editing)(lrnInput(value).value);
  // A press on a footer button keeps focus in the field. Otherwise the
  // field's blur re-check could add or remove a message, the dialog would
  // shrink or grow, and the button would move out from under the pointer
  // before the click lands. Keyboard use is unchanged.
  const keepFocus = event => event.preventDefault();

  const submit = async (addAnother) => {
    if (busy.current) return;
    setAnnounce('');
    const problems = validateUserForm({ name: uName, email: uEmail, role: uRole, lrn: uLrn, editing });
    if (problems.length) {
      setErrors(Object.fromEntries(problems.map(p => [p.fieldId, p.message])));
      setAttempt(a => a + 1);
      return;
    }
    setErrors({});
    busy.current = true;
    try {
      const result = await saveUser({ addAnother });
      if (!result?.ok) {
        if (result?.fieldErrors?.length) {
          setErrors(Object.fromEntries(result.fieldErrors.map(p => [p.fieldId, p.message])));
          setAttempt(a => a + 1);
        }
        return;
      }
      if (addAnother) {
        // saveUser cleared everything but the role; that is the new baseline.
        baseline.current = snapshot({ uName: '', uEmail: '', uRole, uDept: '', uLrn: '', uStatus });
        setLrnNote('');
        setAnnounce('User created. You can add the next one.');
        setRound(r => r + 1);
      }
    } finally {
      busy.current = false;
    }
  };

  const summary = Object.entries(errors).filter(([, m]) => m).map(([fieldId, message]) => ({ fieldId, message }));
  const order = Object.values(USER_FIELDS);
  summary.sort((a, b) => order.indexOf(a.fieldId) - order.indexOf(b.fieldId));

  return (
    <Modal
      open
      title={editing ? 'Edit User' : 'Create User'}
      onClose={closeModal}
      isDirty={() => snapshot(values) !== baseline.current}
      onDiscardRequest={proceed => setConfirming(() => proceed)}
      keysSuspended={Boolean(confirming)}
      footer={requestClose => (
        <div className="fk-footer">
          <button type="button" className="fk-btn" onMouseDown={keepFocus} onClick={requestClose}>Cancel</button>
          {!editing && (
            <button type="button" className="fk-btn" aria-busy={uSaving || undefined} onMouseDown={keepFocus} onClick={() => submit(true)}>
              Send and add another
            </button>
          )}
          <button type="button" className="fk-btn fk-primary" aria-busy={uSaving || undefined} onMouseDown={keepFocus} onClick={() => submit(false)}>
            {uSaving ? (editing ? 'Saving…' : 'Sending…') : (editing ? 'Save changes' : 'Send invite')}
          </button>
        </div>
      )}
    >
      <p className="fk-help" style={{ margin: '0 0 16px' }}>
        {editing ? 'Changes apply the next time they sign in.' : "We'll email them a link to set their own password."}
      </p>
      <FormErrorSummary id="users-form-summary" errors={summary} attempt={attempt} focusTo="first-field" />
      <p className="fk-sr" role="status">{announce}</p>

      <div key={round}>
      <Field label="Full name" id={USER_FIELDS.name} error={fieldError(USER_FIELDS.name)} validate={validateName} onValidate={clearError(USER_FIELDS.name)}>
        <input value={uName} onChange={e => setUName(e.target.value)} autoComplete="off" />
      </Field>

      <Field label="Email" id={USER_FIELDS.email} error={fieldError(USER_FIELDS.email)}
        help={editing ? 'The email is the sign-in name and cannot be changed here.' : undefined}
        validate={editing ? undefined : validateEmail} onValidate={clearError(USER_FIELDS.email)}>
        <input type="email" inputMode="email" value={uEmail} onChange={e => setUEmail(e.target.value)} disabled={editing}
          autoComplete="off" autoCapitalize="none" spellCheck={false} />
      </Field>
      {pendingMatch && (
        <button type="button" className="fk-btn" style={{ margin: '-8px 0 16px' }} aria-busy={resending || undefined} onClick={resendInstead}>
          {resending ? 'Sending…' : `Resend invitation to ${pendingMatch.name || pendingMatch.email}`}
        </button>
      )}

      <SegmentedChoice id={USER_FIELDS.role} legend="Role" name={USER_FIELDS.role} options={roleOptions} value={uRole} onChange={setURole}
        disabled={pending} help={pending ? 'Locked until they finish setting up their account.' : undefined} />

      {uRole === 'student' && (
        <Field label="LRN" id={USER_FIELDS.lrn} optional={editing} helpLive
          help={lrnNote || '12 digits, from the student\'s school records.'}
          error={fieldError(USER_FIELDS.lrn)} validate={checkLrn} onValidate={clearError(USER_FIELDS.lrn)}>
          <input value={uLrn} onChange={onLrnChange} inputMode="numeric" autoComplete="off" />
        </Field>
      )}

      {(uRole === 'teacher' || uRole === 'faculty') && (
        <Field label="Department or subject" id={USER_FIELDS.dept} optional help="Shown on their profile.">
          <input value={uDept} onChange={e => setUDept(e.target.value)} autoComplete="off" />
        </Field>
      )}

      {editing && (
        <Field label="Account status" id={USER_FIELDS.status}
          help={pending ? 'This account becomes active after they create a password.' : undefined}>
          <select value={uStatus} onChange={e => setUStatus(e.target.value)} disabled={pending}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      )}

      </div>

      {confirming && (
        <ConfirmDialog
          onCancel={() => setConfirming(null)}
          onConfirm={() => { const proceed = confirming; setConfirming(null); proceed(); }}
        />
      )}
    </Modal>
  );
}

/** The dialog; it mounts fresh each time it opens, so no state carries over. */
export default function UserFormDialog() {
  const { modal } = useAdminContext();
  return modal === 'user' ? <UserForm /> : null;
}
