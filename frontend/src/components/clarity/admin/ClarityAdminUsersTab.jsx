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
// The user dialog is the shared pages/dashboards/admin/shared/UserFormDialog
// (U3), the same component the classic tab renders, so the two cannot drift.
// TEMPORARY word-for-word copy from pages/dashboards/admin/tabs/UsersTab.jsx
// (parity-tested in ClarityAdminUsersTab.test.jsx):
//   - the resend-invitation click body (no row click to stop here)
// ============================================

import { useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, Plus, Search } from 'lucide-react';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';
import { roleLabel } from '../../../pages/dashboards/admin/shared/helpers';
import UserFormDialog from '../../../pages/dashboards/admin/shared/UserFormDialog';
import { inviteChipLabel } from '../../../pages/dashboards/admin/shared/userForm';
import Avatar from '../../Avatar';
import { useSignedPhotoUrl } from '../../../hooks/useSignedPhotoUrl';
import { focusAfterRemoval } from '../../../lib/focusAfterRemoval';
import { formatDate } from '../../../lib/formatDate';
import { centerSelectedInRow } from '../../../lib/scrollRow';
import { Skeleton, SkeletonCircle, SkeletonGroup, SkeletonTable } from '../../ui/Skeleton';


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
  if (u.onboarding_status === 'invitation_pending') return [inviteChipLabel(u), u.invite_link_state === 'link_stale' ? 'er' : 'wa'];
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
    deleteUser, restoreUser, fetchUsers, filteredUsers = [], openCreateUser, openEditUser, resendInvitation, roleFilter = '', setRoleFilter,
    setStatusFilter, setShowArchived, setUserSearch,
    showArchived, statusFilter = '', userSearch = '', users = [], usersLoading, usersError
  } = useAdminContext();

  // V2a: the selected role tab stays in view when the row scrolls sideways.
  const roleTabsRef = useRef(null);
  useEffect(() => { centerSelectedInRow(roleTabsRef.current); }, [roleFilter]);

  const [selId, setSelId] = useState(null);
  // V2b: on one-column layouts the profile is below the list; bring it into
  // view and put focus on its name, so a tap visibly opens it.
  const detailRef = useRef(null);
  const [reveal, setReveal] = useState(0);
  const pick = (id) => {
    setSelId(id);
    if (window.matchMedia?.('(max-width: 1099.98px)')?.matches) setReveal(n => n + 1);
  };
  // After the chosen user is on screen (also when the same name is tapped again).
  useEffect(() => {
    if (!reveal) return;
    detailRef.current?.scrollIntoView?.({ block: 'start' });
    detailRef.current?.querySelector('h2')?.focus({ preventScroll: true });
  }, [reveal]);
  // Selection only: nothing shows until a row is picked. Nothing is called.
  const sel = filteredUsers.find(u => u.id === selId) || null;

  const [resendingId, setResendingId] = useState(null);

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
            <p className="x-sub">Add teachers, students and admins, and manage their accounts.</p>
          </div>
          <div className="x-act">
            <button type="button" className="x-btn pri" onClick={openCreateUser}>
              <Plus size={16} aria-hidden="true" /> Create user
            </button>
          </div>
        </div>

        <div ref={roleTabsRef} className="x-usr-tabs" role="group" aria-label="Filter users by role">
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
              <>
                <p className="x-sr" role="status">Loading users…</p>
                <SkeletonGroup className="x-usr-scroll">
                  <table className="x-table x-usr-table">
                    <thead><tr>{[48, 36, 44, 48].map((w, i) => <th key={i} scope="col"><Skeleton inline h="0.8em" w={w} /></th>)}</tr></thead>
                    <tbody>
                      <SkeletonTable rows={6} cols={4} cell={c => (c === 0 ? (
                        <span className="x-usr-pick nm"><SkeletonCircle size={32} /><span className="x-usr-name"><Skeleton inline h="0.8em" w={120} /></span></span>
                      ) : c === 2 ? <Skeleton inline h="0.8em" w="80%" /> : <Skeleton inline h={22} w={64} className="sk-round" />)} />
                    </tbody>
                  </table>
                </SkeletonGroup>
              </>
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
                      <tr key={u.id} className={sel?.id === u.id ? 'o-sel' : undefined} onClick={() => pick(u.id)}>
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
                      <tr><td colSpan={4} className="x-empty">
                        <p>No users found</p>
                        {users.length === 0 && !showArchived ? (
                          <>
                            <p className="x-cs">Add the first teacher, student or admin.</p>
                            <button type="button" className="x-btn pri" style={{ marginTop: 12 }} onClick={openCreateUser}>Create the first user</button>
                          </>
                        ) : <p className="x-cs">Try another search, role or status.</p>}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <p className="x-cs x-usr-foot">Showing {filteredUsers.length} of {users.length} users</p>
          </div>

          <section ref={detailRef} className="x-card x-pad x-usr-detail" aria-label="Selected user">
            {sel ? (
              <>
                <UserPhoto user={sel} size={96} big />
                <h2 className="x-ct x-usr-dname" tabIndex={-1}>{sel.name || '—'}</h2>
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
                  {/* G7: a student's emergency contact, from the same profiles row. */}
                  {sel.role === 'student' && filled(sel.emergency_contact_name) && <div><dt>Emergency contact</dt><dd>{filled(sel.emergency_contact_name)}</dd></div>}
                  {sel.role === 'student' && filled(sel.emergency_contact_relationship) && <div><dt>Relationship</dt><dd>{filled(sel.emergency_contact_relationship)}</dd></div>}
                  {sel.role === 'student' && filled(sel.emergency_contact_phone) && <div><dt>Contact number</dt><dd>{filled(sel.emergency_contact_phone)}</dd></div>}
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

      {/* USER MODAL: the shared dialog (U3), the same component as classic. */}
      <UserFormDialog />
    </>
  );
};

export default ClarityAdminUsersTab;
