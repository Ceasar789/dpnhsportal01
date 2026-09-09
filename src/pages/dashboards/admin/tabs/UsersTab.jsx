// ============================================
// FILE: src/pages/dashboards/admin/tabs/UsersTab.jsx
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// Includes the USER MODAL, which only this tab opens.
// ============================================

import React from 'react';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import { initials, avatarColor, roleBadge, roleLabel } from '../shared/helpers';

const UsersTab = () => {
  const {
    closeModal, deleteUser, editUser, filteredUsers, handleOverlayClick,
    modal, openCreateUser, openEditUser, roleFilter, saveUser, setRoleFilter,
    setStatusFilter, setShowArchived, setUEmail, setUName, setUPass, setURole, setUStatus, setUserSearch,
    showArchived, statusFilter, uEmail, uName, uPass, uRole, uSaving, uStatus, userSearch, users, usersLoading, onlineUsers
  } = useAdminContext();

  return (
    <>
            <div>
              <div className="page-title">User Management</div>
              <div className="page-sub">Create accounts and assign roles across the portal</div>
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
                        <tr key={u.id}>
                          <td>
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <div className="avatar" style={{ background: avatarColor(u.name || u.email || '') }}>
                                {initials(u.name || u.email)}
                              </div>
                              <div>
                                <div style={{ fontWeight:600 }}>{u.name || '—'}</div>
                                <div style={{ fontSize:11, color:'var(--text-muted)' }}>{roleLabel(u.role)}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ color:'var(--text-muted)' }}>{u.email}</td>
                          <td><span className={`badge ${roleBadge(u.role)}`}>{roleLabel(u.role)}</span></td>
                          <td>{showArchived
                            ? <span className="badge badge-yellow archive-status-badge"><Archive size={12} />Archived</span>
                            : <span className={`badge ${onlineUsers.has(u.id) ? 'badge-green' : 'badge-red'}`}><span className={`dot ${onlineUsers.has(u.id) ? 'dot-green' : 'dot-red'}`} style={{ marginRight: 5 }}></span>{onlineUsers.has(u.id) ? 'Online' : 'Offline'}</span>}
                          </td>
                          <td>
                            <button className="icon-action edit-action" title="Edit user" aria-label={`Edit ${u.name || u.email}`} onClick={() => openEditUser(u)}><Pencil size={16} /></button>
                            <button className="icon-action archive-action" title="Archive user" aria-label={`Archive ${u.name || u.email}`} onClick={() => deleteUser(u.id)}><Trash2 size={16} /></button>
                          </td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr><td colSpan={5} style={{ textAlign:'center', color:'var(--text-muted)', padding:30 }}>No users found</td></tr>
                      )}
                    </tbody>
                  </table>
                }
                <div className="pagination">
                  <span>Showing {filteredUsers.length} of {users.length} users</span>
                  <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
                    <button className="page-btn">‹</button>
                    <button className="page-btn active">1</button>
                    <button className="page-btn">2</button>
                    <button className="page-btn">›</button>
                  </div>
                </div>
              </div>
            </div>

      {/* USER MODAL */}
      <div className={`modal-overlay ${modal === 'user' ? 'open' : ''}`} onClick={handleOverlayClick}>
        <div className="modal">
          <div className="modal-title">{editUser ? 'Edit User' : 'Create User'}</div>
          <div className="form-row">
            <label className="form-label">Full Name</label>
            <input className="form-input" value={uName} onChange={e => setUName(e.target.value)} placeholder="Juan dela Cruz" />
          </div>
          <div className="form-row">
            <label className="form-label">Email</label>
            <input className="form-input" value={uEmail} onChange={e => setUEmail(e.target.value)} placeholder="user@school.edu" disabled={!!editUser} />
          </div>
          <div className="form-row">
            <label className="form-label">Role</label>
            <select className="form-input" value={uRole} onChange={e => setURole(e.target.value)}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="faculty">Faculty</option>
              <option value="registrar">Registrar</option>
              <option value="main_admin">Admin</option>
            </select>
          </div>
          {editUser && <div className="form-row">
            <label className="form-label">Account Status</label>
            <select className="form-input" value={uStatus} onChange={e => setUStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>}
          {!editUser && (
            <div className="form-row">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" value={uPass} onChange={e => setUPass(e.target.value)} placeholder="Min 6 characters" />
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={saveUser} disabled={uSaving}>
              {uSaving ? <span className="spin" style={{width:16,height:16,marginRight:6}}></span> : null}
              {editUser ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>

    </>
  );
};

export default UsersTab;
