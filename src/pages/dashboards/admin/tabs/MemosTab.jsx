// ============================================
// FILE: src/pages/dashboards/admin/tabs/MemosTab.jsx
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// Includes the MEMO MODAL, which only this tab opens.
// ============================================

import React from 'react';
import { Search } from 'lucide-react';
import { useAdminContext } from '../AdminContext';

const MemosTab = () => {
  const {
    closeModal, deleteMemo, editMemo, filteredMemos, handleOverlayClick,
    mBody, mFrom, mSaving, mSubj, mTo, memoFilter, memoSearch, memos,
    memosLoading, modal, openCompose, openEditMemo, saveMemo, selMemo,
    setMBody, setMFrom, setMSubj, setMTo, setMemoFilter, setMemoSearch,
    setSelMemo, stats, users
  } = useAdminContext();

  return (
    <>
            <div>
              <div className="page-title">Memo Management</div>
              <div className="page-sub">Compose and distribute official memos to departments or all users</div>
              <div className="toolbar">
                <input placeholder="Search memos..." value={memoSearch} onChange={e => setMemoSearch(e.target.value)} style={{ flex:1, maxWidth:240 }} />
                <select value={memoFilter} onChange={e => setMemoFilter(e.target.value)} style={{ width:'auto' }}>
                  <option value="">All Recipients</option>
                  <option>All Faculty</option>
                  <option>All Students</option>
                  <option>All</option>
                  <option>Registrar Office</option>
                  <option>Science Dept</option>
                  <option>Math Dept</option>
                </select>
                <button className="btn btn-primary" onClick={openCompose}>+ Compose</button>
              </div>
              <div className="memo-layout">
                <div className="table-card">
                  {memosLoading
                    ? <div className="loading-row"><div className="spin"></div></div>
                    : filteredMemos.map(m => (
                      <div key={m.id} className={`memo-list-item ${selMemo?.id === m.id ? 'active' : ''}`} onClick={() => setSelMemo(m)}>
                        <div className="memo-title-item">{m.title}</div>
                        <div className="memo-meta">
                          <span>{m.from_office || '—'}</span>
                          <span>→</span>
                          <span>{m.recipient || 'All'}</span>
                          <span style={{ color:'var(--text-dim)' }}>{new Date(m.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="memo-snippet">{m.body?.slice(0,60)}...</div>
                      </div>
                    ))
                  }
                  {filteredMemos.length === 0 && !memosLoading && (
                    <div style={{ textAlign:'center', padding:30, color:'var(--text-muted)' }}>No memos found</div>
                  )}
                </div>
                <div>
                  {selMemo ? (
                    <div className="memo-preview">
                      <div className="memo-field">
                        <span className="memo-field-label">From</span>
                        <span className="memo-field-val">{selMemo.from_office || '—'}</span>
                      </div>
                      <div className="memo-field">
                        <span className="memo-field-label">To</span>
                        <span className="memo-field-val">{selMemo.recipient || 'All Faculty'}</span>
                      </div>
                      <div className="memo-field">
                        <span className="memo-field-label">Date</span>
                        <span className="memo-field-val">{new Date(selMemo.created_at).toLocaleString()}</span>
                      </div>
                      <div style={{ marginTop:16, lineHeight:1.6, fontSize:13, whiteSpace:'pre-wrap' }}>{selMemo.body}</div>
                      <div className="memo-actions">
                        <button className="btn btn-ghost" onClick={() => openEditMemo(selMemo)}>Edit</button>
                        <button className="btn btn-danger" onClick={() => deleteMemo(selMemo.id)}>Delete</button>
                      </div>
                    </div>
                  ) : (
                    <div className="memo-preview" style={{ textAlign:'center', color:'var(--text-muted)', padding:40 }}>
                      Select a memo to view
                    </div>
                  )}
                  <div className="memo-stats-bar">
                    <div><div className="memo-stat-val">{memos.length}</div><div className="memo-stat-label">Total</div></div>
                    <div><div className="memo-stat-val">{memos.filter(m=>m.recipient==='All Faculty').length}</div><div className="memo-stat-label">Faculty</div></div>
                    <div><div className="memo-stat-val">{memos.filter(m=>m.recipient==='All Students').length}</div><div className="memo-stat-label">Students</div></div>
                  </div>
                </div>
              </div>
            </div>

      {/* MEMO MODAL */}
      <div className={`modal-overlay ${modal === 'memo' ? 'open' : ''}`} onClick={handleOverlayClick}>
        <div className="modal">
          <div className="modal-title">{editMemo ? 'Edit Memo' : 'Compose Memo'}</div>
          <div className="form-row">
            <label className="form-label">From Office</label>
            <input className="form-input" value={mFrom} onChange={e => setMFrom(e.target.value)} placeholder="e.g. Principal's Office" />
          </div>
          <div className="form-row">
            <label className="form-label">Recipient</label>
            <select className="form-input" value={mTo} onChange={e => setMTo(e.target.value)}>
              <option>All Faculty</option>
              <option>All Students</option>
              <option>All</option>
              <option>Registrar Office</option>
              <option>Science Dept</option>
              <option>Math Dept</option>
            </select>
          </div>
          <div className="form-row">
            <label className="form-label">Subject</label>
            <input className="form-input" value={mSubj} onChange={e => setMSubj(e.target.value)} placeholder="Memo subject" />
          </div>
          <div className="form-row">
            <label className="form-label">Body</label>
            <textarea className="form-input" rows={6} value={mBody} onChange={e => setMBody(e.target.value)} placeholder="Write your memo..." />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={saveMemo} disabled={mSaving}>
              {mSaving ? <span className="spin" style={{width:16,height:16,marginRight:6}}></span> : null}
              {editMemo ? 'Update' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default MemosTab;
