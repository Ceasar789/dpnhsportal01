// ============================================
// FILE: src/pages/dashboards/admin/tabs/UsersTab.jsx
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// Includes the USER MODAL, which only this tab opens.
// ============================================

import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import { avatarColor, roleBadge, roleLabel } from '../shared/helpers';
import Modal from '../../../../components/ui/Modal';
import { focusAfterRemoval } from '../../../../lib/focusAfterRemoval';
import Button from '../../../../components/ui/Button';
import { useSignedPhotoUrl } from '../../../../hooks/useSignedPhotoUrl';
import Avatar from '../../../../components/Avatar';
import RowSheet from '../../../../components/ui/RowSheet';
import { useIsNarrow } from '../../../../lib/useMediaQuery';

// One per row so each user's photo path resolves to its own signed URL
// without breaking the rules of hooks inside .map().
const UserAvatarCell = ({ user }) => {
  const photoUrl = useSignedPhotoUrl(user.photo_url);
  return <Avatar className="avatar" src={photoUrl} name={user.name || user.email || ''} size={34} fontSize="var(--font-size-12)" bg={avatarColor(user.name || user.email || '')} />;
};

const UsersTab = () => {
  const {
    closeModal, deleteUser, editUser, filteredUsers, modal, openCreateUser, openEditUser, roleFilter, saveUser, setRoleFilter,
    setStatusFilter, setShowArchived, setUEmail, setUName, setUPass, setURole, setUStatus, setUserSearch,
    showArchived, statusFilter, uDept, setUDept, uEmail, uName, uPass, uRole, uSaving, uStatus, userSearch, users, usersLoading, onlineUsers
  } = useAdminContext();

  // UX-062: the form mixed required and optional fields and distinguished
  // them nowhere, so the only way to learn which was which was to submit.
  // UX-075: the admin sets another person's password through one masked
  // field they can neither reveal nor re-enter. A typo becomes that
  // person's stored credential, and nobody finds out until they cannot log
  // in. The rules themselves are unchanged and still live in saveUser.
  // R5. 123 rows of five columns is the worst table here on a phone.
  const narrow = useIsNarrow();
  const [sheetUser, setSheetUser] = useState(null);

  const [tried, setTried] = useState(false);
  const [uPass2, setUPass2] = useState('');
  const [revealPass, setRevealPass] = useState(false);
  // Reset on CLOSE, not on open. Modal is a child, so its snapshot
  // effect runs before this one — clearing a stale confirm value on open
  // would change a field after the snapshot was taken and the modal would
  // report a form the admin has not touched as dirty.
  useEffect(() => { if (modal !== 'user') { setTried(false); setUPass2(''); setRevealPass(false); } }, [modal]);
  const missingName = tried && !uName.trim();
  const missingEmail = tried && !uEmail.trim();
  const passMismatch = tried && !editUser && !!uPass && uPass !== uPass2;

  return (
    <>
            <div>
              <div className="page-header-bar">
                <div className="page-title">User Management</div>
                <div className="page-sub">Create accounts and assign roles across the portal</div>
              </div>
              <div className="toolbar">
                <input type="search" name="portal-user-search" autoComplete="new-password" autoCorrect="off" spellCheck="false" placeholder="Search users..." value={userSearch} onChange={e => setUserSearch(e.target.value)} style={{ flex:1, maxWidth:280 }} />
                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ width:'auto' }}>
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
                            : <span className={`badge ${onlineUsers.has(u.id) ? 'badge-green' : 'badge-grey'}`}><span className={`dot ${onlineUsers.has(u.id) ? 'dot-green' : 'dot-neutral'}`} style={{ marginRight: 'var(--space-4)' }}></span>{onlineUsers.has(u.id) ? 'Online' : 'Offline'}</span>}
                          </td>
                          <td data-cell="actions">
                            <button className="icon-action edit-action" title="Edit user" aria-label={`Edit ${u.name || u.email}`} onClick={() => openEditUser(u)}><Pencil size={16} /></button>
                            <button
                              className="icon-action archive-action"
                              title="Archive user"
                              aria-label={`Archive ${u.name || u.email}`}
                              onClick={(e) => {
                                // UX-025 — decide where focus goes before the
                                // row that holds it is unmounted.
                                const settle = focusAfterRemoval(
                                  e.currentTarget, 'table', '.archive-action', 'h2, .page-title',
                                );
                                deleteUser(u.id);
                                settle();
                              }}
                            ><Trash2 size={16} /></button>
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
            ? (showArchived ? 'Archived' : (onlineUsers.has(sheetUser.id) ? 'Online' : 'Offline'))
            : ''],
        ]}
        actions={sheetUser && (
          <>
            <Button variant="ghost" onClick={() => { const u = sheetUser; setSheetUser(null); openEditUser(u); }}>Edit</Button>
            <Button variant="danger" onClick={() => { const u = sheetUser; setSheetUser(null); deleteUser(u.id); }}>Archive</Button>
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
                // The mismatch is reported on the field, so returning here
                // is not a silent failure. saveUser keeps its own checks.
                if (!editUser && uPass && uPass !== uPass2) return;
                saveUser();
              }}
              busy={uSaving}
              busyLabel={editUser ? 'Updating…' : 'Creating…'}
            >
              {editUser ? 'Update' : 'Create'}
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
            <select id="users-role" className="form-input" value={uRole} onChange={e => setURole(e.target.value)}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="faculty">Faculty</option>
              <option value="registrar">Registrar</option>
              <option value="main_admin">Admin</option>
            </select>
          </div>
          {(uRole === 'teacher' || uRole === 'faculty') && (
            <div className="form-row">
              <label className="form-label" htmlFor="users-department-subject">Department / Subject</label>
              <input id="users-department-subject" className="form-input" value={uDept} onChange={e => setUDept(e.target.value)} placeholder="e.g. Mathematics" />
            </div>
          )}
          {editUser && <div className="form-row">
            <label className="form-label" htmlFor="users-account-status">Account Status</label>
            <select id="users-account-status" className="form-input" value={uStatus} onChange={e => setUStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>}
          {!editUser && (
            <>
              <div className="form-row">
                <label className="form-label" htmlFor="users-password">Password<span className="form-req" aria-hidden="true">*</span></label>
                <div className="form-with-action">
                  <input id="users-password" className="form-input" type={revealPass ? 'text' : 'password'} value={uPass} onChange={e => setUPass(e.target.value)} placeholder="Min 12 chars, 1 uppercase, 1 number, 1 special char"
                    aria-required="true" aria-describedby="users-password-hint" />
                  {/* Reveal, not a permanent unmask: the admin is typing
                      someone else's credential and may be on a shared
                      screen, so it starts hidden. */}
                  <button type="button" className="btn btn-ghost btn-sm" aria-pressed={revealPass} onClick={() => setRevealPass(!revealPass)}>
                    {revealPass ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="form-hint" id="users-password-hint">This is the password the account holder will sign in with. Tell it to them, and ask them to change it.</div>
              </div>
              <div className="form-row">
                <label className="form-label" htmlFor="users-password-confirm">Confirm Password<span className="form-req" aria-hidden="true">*</span></label>
                <input id="users-password-confirm" className={`form-input${passMismatch ? ' is-invalid' : ''}`} type={revealPass ? 'text' : 'password'} value={uPass2} onChange={e => setUPass2(e.target.value)} placeholder="Type it again"
                  aria-required="true" aria-invalid={passMismatch || undefined} aria-describedby={passMismatch ? 'users-password-confirm-error' : undefined} />
                {passMismatch && <div className="field-error" id="users-password-confirm-error">The two passwords do not match.</div>}
              </div>
            </>
          )}
      </Modal>

    </>
  );
};

export default UsersTab;
