// ============================================
// FILE: src/components/clarity/admin/ClarityAdminUsersTab.jsx
// The Admin User Management tab in Clarity (final design, real data only).
// A table of the same filtered users the classic tab lists, and a detail
// card for the selected one. Clicking anywhere on a row (or its first-cell
// button, the keyboard control) only selects it; nothing is preselected. Every action
// (create, edit, resend invitation, archive, restore, the archive view)
// goes through the same context handlers with the same arguments.
//
// Status pills show only stored states: Archived, Invitation pending,
// Inactive, Active. The classic tab's Online/Offline badge is not drawn
// (owner rule); its status filter is kept as a select, with the classic
// values and labels (UsersTab.jsx:76-80). The context applies it to
// filteredUsers, so nothing is filtered here.
// The directory has no last sign-in field, so there is no "Last active".
// The card shows only fields the GET /api/admin/users row holds (profiles.*,
// plus lrn from the students table); an empty one is left out, and LRN shows
// for students only.
//
// TEMPORARY word-for-word copies from pages/dashboards/admin/tabs/UsersTab.jsx
// (parity-tested in ClarityAdminUsersTab.test.jsx); after the defense the
// classic tab and this one should share them:
//   - ASSIGNABLE_ROLES, :14
//   - the tried / resendingId state and the reset-on-close effect, :45-59
//   - the resend-invitation click body, :137-138 (no row click to stop here)
//   - the user dialog, :216-296 (the shared Modal, unchanged)
// ============================================

import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Plus, Search } from 'lucide-react';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';
import { roleLabel } from '../../../pages/dashboards/admin/shared/helpers';
import { LRN_PATTERN, LRN_REQUIRED, lrnInput } from '../../../pages/dashboards/admin/shared/lrn';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import Avatar from '../../Avatar';
import { useSignedPhotoUrl } from '../../../hooks/useSignedPhotoUrl';
import { focusAfterRemoval } from '../../../lib/focusAfterRemoval';
import { formatDate } from '../../../lib/formatDate';

// ---- TEMPORARY copy (UsersTab.jsx:14) ----
// The roles an admin can give an account.
const ASSIGNABLE_ROLES = ['student', 'teacher', 'main_admin'];
// ---- end of the copy ----

// The classic role filter's options, as tabs.
const ROLE_TABS = [['', 'All'], ['student', 'Students'], ['teacher', 'Teachers'], ['main_admin', 'Admins']];
const ROLE_TONE = { student: 'in', teacher: 'ok', main_admin: 'wa' };

const nameOf = u => u.name || u.email;
const filled = value => (typeof value === 'string' ? value.trim() : value) || null;
// A DATE column ('2010-05-14') is read as that local day, not UTC midnight.
const dayOf = value => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);

// Only what the record holds. The archive view lists archived accounts.
const statusOf = (u, showArchived) => {
  if (showArchived || (u.status || '').toLowerCase() === 'archived') return ['Archived', ''];
  if (u.onboarding_status === 'invitation_pending') return ['Invitation pending', 'wa'];
  if ((u.status || 'active').toLowerCase() === 'inactive') return ['Inactive', ''];
  return ['Active', 'ok'];
};

const RolePill = ({ role }) => <span className={`x-badge ${ROLE_TONE[role] || ''}`}>{roleLabel(role)}</span>;
const StatusPill = ({ user, showArchived }) => {
  const [label, tone] = statusOf(user, showArchived);
  return <span className={`x-badge ${tone}`}><i aria-hidden="true" />{label}</span>;
};

// One per row so each photo path resolves to its own signed URL (as classic).
const UserPhoto = ({ user, size, big }) => {
  const photoUrl = useSignedPhotoUrl(user.photo_url);
  const name = user.name || user.email || '';
  return big
    ? <Avatar className="x-usr-ava big" src={photoUrl} name={name} size={size} bg="#fac543" color="#1b1466" />
    : <Avatar className="x-usr-ava" src={photoUrl} name={name} size={size} bg="var(--cl-ac-s)" color="var(--cl-ac)" fontSize={12} />;
};

const ClarityAdminUsersTab = () => {
  const {
    closeModal, deleteUser, restoreUser, editUser, fetchUsers, filteredUsers = [], modal, openCreateUser, openEditUser, resendInvitation, roleFilter = '', saveUser, setRoleFilter,
    setStatusFilter, setShowArchived, setUEmail, setUName, setURole, setUStatus, setUserSearch,
    showArchived, statusFilter = '', uDept, setUDept, uEmail = '', uLrn = '', setULrn, uName = '', uRole = 'student', uSaving, uStatus, userSearch = '', users = [], usersLoading, usersError
  } = useAdminContext();

  const [selId, setSelId] = useState(null);
  // Selection only: nothing shows until a row is picked. Nothing is called.
  const sel = filteredUsers.find(u => u.id === selId) || null;

  // ---- TEMPORARY copy (UsersTab.jsx:45-59) ----
  const [tried, setTried] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  // Reset on CLOSE, not on open. Modal is a child, so its snapshot
  // effect runs before this one — clearing a stale confirm value on open
  // would change a field after the snapshot was taken and the modal would
  // report a form the admin has not touched as dirty.
  useEffect(() => {
    if (modal !== 'user') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- word-for-word copy of the classic reset
      setTried(false);
    }
  }, [modal]);
  const missingName = tried && !uName.trim();
  const missingEmail = tried && !uEmail.trim();
  // A student's LRN: required to create one; on edit only checked when filled in.
  const badLrn = tried && uRole === 'student' && (!editUser || uLrn.trim() !== '') && !LRN_PATTERN.test(uLrn.trim());
  // ---- end of the copy ----

  // Archive / Restore sit in the detail card, so focus is handed over from the
  // selected row's button: next row, else previous, else the page heading.
  const archiveOrRestore = (u) => {
    const rowButton = [...document.querySelectorAll('.x-usr-table .x-usr-pick')].find(b => b.dataset.userId === String(u.id));
    const settle = focusAfterRemoval(rowButton, 'table', '.x-usr-pick', '.x-h1');
    (showArchived ? restoreUser : deleteUser)(u.id, settle);
  };

  return (
    <>
      <div className="x-usr">
        <div className="x-head x-ov-head">
          <div style={{ minWidth: 0 }}>
            <h1 className="x-h1" tabIndex={-1}>User Management</h1>
            <p className="x-sub">Create accounts and assign roles across the portal</p>
          </div>
          <div className="x-act">
            <button type="button" className="x-btn pri" onClick={openCreateUser}>
              <Plus size={16} aria-hidden="true" /> Create user
            </button>
          </div>
        </div>

        <div className="x-usr-tabs" role="group" aria-label="Filter users by role">
          {ROLE_TABS.map(([value, label]) => (
            <button key={label} type="button" className={roleFilter === value ? 'on' : ''}
              aria-pressed={roleFilter === value} onClick={() => setRoleFilter(value)}>{label}</button>
          ))}
        </div>

        <div className="x-news-tools">
          <label className="x-search">
            <Search size={16} aria-hidden="true" />
            <span className="x-sr">Search users</span>
            <input type="search" name="portal-user-search" autoComplete="new-password" autoCorrect="off" spellCheck="false" placeholder="Search users..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
          </label>
          {/* The classic status filter (UsersTab.jsx:76-80), same values and labels. */}
          <select className="x-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter users by status">
            <option value="">Status: All</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
          <button type="button" className="x-btn" aria-label={showArchived ? 'Show active users' : 'View archive history'} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
            {showArchived ? 'Active users' : 'Archive'}
          </button>
        </div>

        <div className="x-usr-layout">
          <div className="x-card x-usr-list">
            {usersLoading ? (
              <p className="x-empty" role="status">Loading users…</p>
            ) : usersError ? (
              <div className="x-empty" role="alert">
                <span>Unable to load users.</span>{' '}
                <button type="button" className="x-btn" onClick={fetchUsers}>Retry</button>
              </div>
            ) : (
              <div className="x-usr-scroll">
                <table className="x-table x-usr-table">
                  <caption className="x-sr">{showArchived ? 'Archived users' : 'Users'}</caption>
                  <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Email</th><th scope="col">Status</th></tr></thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr key={u.id} className={sel?.id === u.id ? 'o-sel' : undefined} onClick={() => setSelId(u.id)}>
                        <td>
                          <button type="button" className="x-usr-pick nm" data-user-id={u.id}
                            aria-pressed={sel?.id === u.id}>
                            <UserPhoto user={u} size={32} />
                            <span className="x-usr-name">{u.name || '—'}</span>
                          </button>
                        </td>
                        <td><RolePill role={u.role} /></td>
                        <td>{u.email}</td>
                        <td><StatusPill user={u} showArchived={showArchived} /></td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={4} className="x-empty">No users found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <p className="x-cs x-usr-foot">Showing {filteredUsers.length} of {users.length} users</p>
          </div>

          <section className="x-card x-pad x-usr-detail" aria-label="Selected user">
            {sel ? (
              <>
                <UserPhoto user={sel} size={96} big />
                <h2 className="x-ct x-usr-dname">{sel.name || '—'}</h2>
                <p className="x-cs x-usr-demail">{sel.email}</p>
                <div className="x-news-pills x-usr-dpills"><RolePill role={sel.role} /><StatusPill user={sel} showArchived={showArchived} /></div>
                <dl className="x-usr-info">
                  {sel.department && <div><dt>Department</dt><dd>{sel.department}</dd></div>}
                  {sel.created_at && <div><dt>Created</dt><dd>{formatDate(sel.created_at)}</dd></div>}
                  {sel.role === 'student' && filled(sel.lrn) && <div><dt>LRN</dt><dd>{filled(sel.lrn)}</dd></div>}
                  {filled(sel.phone) && <div><dt>Phone</dt><dd>{filled(sel.phone)}</dd></div>}
                  {formatDate(dayOf(filled(sel.date_of_birth)), '') && <div><dt>Date of birth</dt><dd>{formatDate(dayOf(filled(sel.date_of_birth)))}</dd></div>}
                  {filled(sel.address) && <div><dt>Address</dt><dd>{filled(sel.address)}</dd></div>}
                  {filled(sel.bio) && <div><dt>About me</dt><dd className="x-usr-bio">{filled(sel.bio)}</dd></div>}
                </dl>
                <div className="x-usr-dact">
                  <button type="button" className="x-btn x-usr-edit" aria-label={`Edit ${nameOf(sel)}`} onClick={() => openEditUser(sel)}>Edit</button>
                  {!showArchived && sel.can_resend_invitation && (
                    <button
                      type="button"
                      className="x-btn"
                      aria-label={`Resend invitation to ${nameOf(sel)}`}
                      disabled={resendingId === sel.id}
                      onClick={async () => {
                        // ---- TEMPORARY copy (UsersTab.jsx:137-138) ----
                        const u = sel;
                        setResendingId(u.id);
                        try { await resendInvitation(u); } finally { setResendingId(null); }
                      }}
                    >Resend invitation</button>
                  )}
                  <button type="button" className={`x-btn ${showArchived ? 'pri' : 'dng'}`}
                    aria-label={`${showArchived ? 'Restore' : 'Archive'} ${nameOf(sel)}`} onClick={() => archiveOrRestore(sel)}>
                    {showArchived ? 'Restore' : 'Archive'}
                  </button>
                </div>
              </>
            ) : (
              <p className="x-empty">Select a user to see their profile.</p>
            )}
          </section>
        </div>
      </div>

      {/* ---- TEMPORARY copy (UsersTab.jsx:216-296): USER MODAL ---- */}
      <Modal
        open={modal === 'user'}
        title={editUser ? 'Edit User' : 'Create User'}
        onClose={closeModal}
        footer={(requestClose) => (
          <>
            <Button variant="ghost" onClick={requestClose}>Cancel</Button>
            <Button
              onClick={() => {
                setTried(true);
                saveUser();
              }}
              busy={uSaving}
              busyLabel={editUser ? 'Updating…' : 'Sending…'}
            >
              {editUser ? 'Update' : 'Send Invitation'}
            </Button>
          </>
        )}
      >
          <div className="form-legend"><span className="form-req" aria-hidden="true">*</span> Required</div>
          <div className="form-row">
            <label className="form-label" htmlFor="users-full-name">Full Name<span className="form-req" aria-hidden="true">*</span></label>
            <input id="users-full-name" className={`form-input${missingName ? ' is-invalid' : ''}`} value={uName} onChange={e => setUName(e.target.value)} placeholder="Juan dela Cruz"
              aria-required="true" aria-invalid={missingName || undefined} aria-describedby={missingName ? 'users-full-name-error' : undefined} />
            {missingName && <div className="field-error" id="users-full-name-error">Full name is required.</div>}
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="users-email">Email{!editUser && <span className="form-req" aria-hidden="true">*</span>}</label>
            <input id="users-email" className={`form-input${missingEmail ? ' is-invalid' : ''}`} value={uEmail} onChange={e => setUEmail(e.target.value)} placeholder="user@school.edu" disabled={!!editUser}
              aria-required={editUser ? undefined : 'true'} aria-invalid={missingEmail || undefined}
              aria-describedby={editUser ? 'users-email-hint' : missingEmail ? 'users-email-error' : undefined} />
            {/* UX-058: disabled with nothing saying why, or what would make
                it editable. */}
            {editUser && <div className="form-hint" id="users-email-hint">An account's email address is its login and cannot be changed here. Archive the account and create a new one to move someone to a different address.</div>}
            {missingEmail && <div className="field-error" id="users-email-error">Email is required.</div>}
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="users-role">Role</label>
            <select id="users-role" className="form-input" value={uRole} onChange={e => setURole(e.target.value)} disabled={editUser?.onboarding_status === 'invitation_pending'}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="main_admin">Admin</option>
              {/* An account still holding a role the app no longer uses
                  (faculty, registrar) shows that role instead of silently
                  reading as Student. It cannot be chosen again. */}
              {!ASSIGNABLE_ROLES.includes(uRole) && (
                <option value={uRole} disabled>{`${roleLabel(uRole)} (no longer used)`}</option>
              )}
            </select>
            {editUser?.onboarding_status === 'invitation_pending' && <div className="form-hint">The assigned role is locked until password setup completes.</div>}
          </div>
          {(uRole === 'teacher' || uRole === 'faculty') && (
            <div className="form-row">
              <label className="form-label" htmlFor="users-department-subject">Department / Subject</label>
              <input id="users-department-subject" className="form-input" value={uDept} onChange={e => setUDept(e.target.value)} placeholder="e.g. Mathematics" />
            </div>
          )}
          {uRole === 'student' && (
            <div className="form-row">
              <label className="form-label" htmlFor="users-lrn">LRN{!editUser && <span className="form-req" aria-hidden="true">*</span>}</label>
              <input id="users-lrn" className={`form-input${badLrn ? ' is-invalid' : ''}`} value={uLrn} onChange={e => setULrn(lrnInput(e.target.value))} placeholder="12 digits"
                inputMode="numeric" maxLength={12} autoComplete="off"
                aria-required={editUser ? undefined : 'true'} aria-invalid={badLrn || undefined} aria-describedby={badLrn ? 'users-lrn-error' : undefined} />
              {badLrn && <div className="field-error" id="users-lrn-error">{LRN_REQUIRED}</div>}
            </div>
          )}
          {editUser && <div className="form-row">
            <label className="form-label" htmlFor="users-account-status">Account Status</label>
            <select id="users-account-status" className="form-input" value={uStatus} onChange={e => setUStatus(e.target.value)} disabled={editUser.onboarding_status === 'invitation_pending'}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {editUser.onboarding_status === 'invitation_pending' && <div className="form-hint">This account becomes active after the user creates a password.</div>}
          </div>}
          {!editUser && (
            <div className="form-hint" role="note">
              The account will remain pending until the user follows the Supabase invitation and creates their own password. No password is shown to or sent by the administrator.
            </div>
          )}
      </Modal>
    </>
  );
};

export default ClarityAdminUsersTab;
