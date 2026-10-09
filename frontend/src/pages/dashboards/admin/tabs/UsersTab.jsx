// ============================================
// FILE: src/pages/dashboards/admin/tabs/UsersTab.jsx
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// Includes the USER MODAL, which only this tab opens.
// ============================================

import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Mail, Pencil, Trash2 } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import { avatarColor, roleBadge, roleLabel } from '../shared/helpers';
import Modal from '../../../../components/ui/Modal';
import { focusAfterRemoval } from '../../../../lib/focusAfterRemoval';
import Button from '../../../../components/ui/Button';
import { useSignedPhotoUrl } from '../../../../hooks/useSignedPhotoUrl';
import Avatar from '../../../../components/Avatar';
import RowSheet from '../../../../components/ui/RowSheet';
import { useMediaQuery } from '../../../../lib/useMediaQuery';

// One per row so each user's photo path resolves to its own signed URL
// without breaking the rules of hooks inside .map().
const UserAvatarCell = ({ user }) => {
  const photoUrl = useSignedPhotoUrl(user.photo_url);
  return <Avatar className="avatar" src={photoUrl} name={user.name || user.email || ''} size={34} fontSize="var(--font-size-12)" bg={avatarColor(user.name || user.email || '')} />;
};

const UsersTab = () => {
  const {
    closeModal, deleteUser, restoreUser, editUser, fetchUsers, filteredUsers, modal, openCreateUser, openEditUser, resendInvitation, roleFilter, saveUser, setRoleFilter,
    setStatusFilter, setShowArchived, setUEmail, setUName, setURole, setUStatus, setUserSearch,
    showArchived, statusFilter, uDept, setUDept, uEmail, uName, uRole, uSaving, uStatus, userSearch, users, usersLoading, usersError, onlineUsers
  } = useAdminContext();

  // UX-062: the form mixed required and optional fields and distinguished
  // them nowhere, so the only way to learn which was which was to submit.
  // R5. 123 rows of five columns is the worst table here on a phone.
  // The card switches to mobile rows at 560px. RowSheet behavior follows
  // that same boundary so a table row never competes with its action buttons.
  const narrow = useMediaQuery('(max-width: 560px)');
  const [sheetUser, setSheetUser] = useState(null);

  const [tried, setTried] = useState(false);
  const [resendingId, setResendingId] = useState(null);
  // Reset on CLOSE, not on open. Modal is a child, so its snapshot
  // effect runs before this one — clearing a stale confirm value on open
  // would change a field after the snapshot was taken and the modal would
  // report a form the admin has not touched as dirty.
  useEffect(() => {
    if (modal !== 'user') {
      setTried(false);
    }
  }, [modal]);
  const missingName = tried && !uName.trim();
  const missingEmail = tried && !uEmail.trim();

  return (
    <>
            <div>
              <div className="page-header-bar">
                <div className="page-title">User Management</div>
                <div className="page-sub">Create accounts and assign roles across the portal</div>
              </div>
              <div className="toolbar">
                <input type="search" name="portal-user-search" autoComplete="new-password" autoCorrect="off" spellCheck="false" placeholder="Search users..." value={userSearch} onChange={e => setUserSearch(e.target.value)} style={{ flex:1, maxWidth:280 }} />
                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ width:'auto' }} aria-label="Filter users by role">
                  <option value="">Role: All</option>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="faculty">Faculty</option>
                  <option value="registrar">Registrar</option>
                  <option value="main_admin">Admin</option>
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width:'auto' }} aria-label="Filter users by status">
                  <option value="">Status: All</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                </select>
                <button className="btn btn-primary" onClick={openCreateUser}>+ Create User</button>
                <button className={`archive-toggle ${showArchived ? 'active' : ''}`} type="button" title={showArchived ? 'Show active users' : 'View archive history'} aria-label={showArchived ? 'Show active users' : 'View archive history'} onClick={() => setShowArchived(!showArchived)}>
                  {showArchived ? <ArchiveRestore size={17} /> : <Archive size={17} />}
                </button>
              </div>
              <div className="table-card">
                {usersLoading
                  ? <div className="loading-row"><div className="spin"></div></div>
                  : usersError
                    ? <div className="loading-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-12)' }}>
                      <span>Unable to load users.</span>
                      <Button variant="ghost" onClick={fetchUsers}>Retry</Button>
                    </div>
                  : <table>
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                      {filteredUsers.map(u => (
                        <tr
                          key={u.id}
                          {...(narrow ? {
                            role: 'button',
                            tabIndex: 0,
                            'aria-label': `Open ${u.name || u.email}`,
                            onClick: () => setSheetUser(u),
                            onKeyDown: (e) => {
                              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheetUser(u); }
                            },
                          } : {})}
                        >
                          <td data-cell="identity">
                            <div style={{ display:'flex', alignItems:'center', gap: 'var(--space-12)' }}>
                              <UserAvatarCell user={u} />
                              <div>
                                <div style={{ fontWeight:600 }}>{u.name || '—'}</div>
                                <div style={{ fontSize: 'var(--font-size-12)', color:'var(--text-muted)' }}>{roleLabel(u.role)}</div>
                              </div>
                            </div>
                          </td>
                          <td data-cell="detail" style={{ color:'var(--text-muted)' }}>{u.email}</td>
                          <td data-cell="value"><span className={`badge ${roleBadge(u.role)}`}>{roleLabel(u.role)}</span></td>
                          <td data-cell="state">{showArchived
                            ? <span className="badge badge-yellow archive-status-badge"><Archive size={12} />Archived</span>
                            : u.onboarding_status === 'invitation_pending'
                              ? <span className="badge badge-yellow">Invitation Pending</span>
                              : <span className={`badge ${onlineUsers.has(u.id) ? 'badge-green' : 'badge-grey'}`}><span className={`dot ${onlineUsers.has(u.id) ? 'dot-green' : 'dot-neutral'}`} style={{ marginRight: 'var(--space-4)' }}></span>{onlineUsers.has(u.id) ? 'Online' : 'Offline'}</span>}
                          </td>
                          <td data-cell="actions">
                            <button className="icon-action edit-action" title="Edit user" aria-label={`Edit ${u.name || u.email}`} onClick={(e) => { e.stopPropagation(); openEditUser(u); }}><Pencil size={16} /></button>
                            {!showArchived && u.can_resend_invitation && (
                              <button
                                className="icon-action edit-action"
                                title="Resend invitation"
                                aria-label={`Resend invitation to ${u.name || u.email}`}
                                disabled={resendingId === u.id}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setResendingId(u.id);
                                  try { await resendInvitation(u); } finally { setResendingId(null); }
                                }}
                              ><Mail size={16} /></button>
                            )}
                            <button
                              className={`icon-action ${showArchived ? 'edit-action restore-action' : 'archive-action'}`}
                              title={showArchived ? 'Restore user' : 'Archive user'}
                              aria-label={`${showArchived ? 'Restore' : 'Archive'} ${u.name || u.email}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                // UX-025 — decide where focus goes before the
                                // row that holds it is unmounted.
                                const settle = focusAfterRemoval(
                                  e.currentTarget, 'table', showArchived ? '.restore-action' : '.archive-action', 'h2, .page-title',
                                );
                                (showArchived ? restoreUser : deleteUser)(u.id, settle);
                              }}
                            >{showArchived ? <ArchiveRestore size={16} /> : <Trash2 size={16} />}</button>
                          </td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr><td colSpan={5} style={{ textAlign:'center', color:'var(--text-muted)', padding: 'var(--space-32)' }}>No users found</td></tr>
                      )}
                    </tbody>
                  </table>
                }
                {/* UX-049: the four page buttons that used to sit here were
                    decoration - no handler, no page state, and the table
                    rendered every row regardless. A control that looks like
                    it works and does not is worse than no control, so they
                    are gone and the honest count stays.
                    TODO: a real roster outgrows one scroll. Add paging (or a
                    virtualised list) here when the row count justifies it. */}
                <div className="pagination">
                  <span>Showing {filteredUsers.length} of {users.length} users</span>
                </div>
              </div>
            </div>

      <RowSheet
        open={Boolean(sheetUser)}
        title={sheetUser?.name || sheetUser?.email || ''}
        details={[
          ['Email', sheetUser?.email],
          ['Role', sheetUser ? roleLabel(sheetUser.role) : ''],
          ['Department', sheetUser?.department],
          ['Status', sheetUser
            ? (showArchived ? 'Archived' : sheetUser.onboarding_status === 'invitation_pending'
              ? 'Invitation Pending' : (onlineUsers.has(sheetUser.id) ? 'Online' : 'Offline'))
            : ''],
        ]}
        actions={sheetUser && (
          <>
            <Button variant="ghost" onClick={() => { const u = sheetUser; setSheetUser(null); openEditUser(u); }}>Edit</Button>
            {!showArchived && sheetUser.can_resend_invitation && (
              <Button variant="ghost" onClick={async () => { const u = sheetUser; setSheetUser(null); await resendInvitation(u); }}>
                Resend Invitation
              </Button>
            )}
            <Button
              variant={showArchived ? 'primary' : 'danger'}
              onClick={() => {
                const u = sheetUser;
                setSheetUser(null);
                (showArchived ? restoreUser : deleteUser)(u.id);
              }}
            >
              {showArchived ? 'Restore' : 'Archive'}
            </Button>
          </>
        )}
        onClose={() => setSheetUser(null)}
      />

      {/* USER MODAL — first migration to <Modal>. Fixes UX-098 (no focus
          contract) and UX-026 (every close path discarded the form). The
          fields are untouched; labels and validation are Phase 2 and 3. */}
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
              <option value="faculty">Faculty</option>
              <option value="registrar">Registrar</option>
              <option value="main_admin">Admin</option>
            </select>
            {editUser?.onboarding_status === 'invitation_pending' && <div className="form-hint">The assigned role is locked until password setup completes.</div>}
          </div>
          {(uRole === 'teacher' || uRole === 'faculty') && (
            <div className="form-row">
              <label className="form-label" htmlFor="users-department-subject">Department / Subject</label>
              <input id="users-department-subject" className="form-input" value={uDept} onChange={e => setUDept(e.target.value)} placeholder="e.g. Mathematics" />
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

export default UsersTab;
