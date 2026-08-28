// ============================================
// FILE: src/pages/dashboards/admin/tabs/NewsTab.jsx
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// Includes the NEWS MODAL, which only this tab opens.
// ============================================

import React from 'react';
import { Search } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import { TARGET_ROLES } from '../shared/helpers';

const NewsTab = () => {
  const {
    closeModal, deleteNewsItem, editNews, filteredNews, handleOverlayClick,
    modal, nAuthor, nCat, nContent, nSaving, nStatus, nTarget, nTitle,
    newsCatF, newsItems, newsLoading, newsSearch, newsStatF, openEditNews,
    openNewPost, saveNews, setNAuthor, setNCat, setNContent, setNStatus,
    setNTarget, setNTitle, setNewsCatF, setNewsSearch, setNewsStatF, updateNewsStatus
  } = useAdminContext();

  return (
    <>
            <div>
              <div className="page-title">News Management</div>
              <div className="page-sub">Create, edit, archive, and publish portal announcements</div>
              <div className="toolbar">
                <input placeholder="Search articles..." value={newsSearch} onChange={e => setNewsSearch(e.target.value)} style={{ flex:1, maxWidth:260 }} />
                <select value={newsCatF} onChange={e => setNewsCatF(e.target.value)} style={{ width:'auto' }}>
                  <option value="">Category</option>
                  {['Academics','Events','Scholarships','Announcements','Sports'].map(c => <option key={c}>{c}</option>)}
                </select>
                <select value={newsStatF} onChange={e => setNewsStatF(e.target.value)} style={{ width:'auto' }}>
                  <option value="">Status</option>
                  <option>Published</option><option>Draft</option><option>Archived</option>
                </select>
                <button className="btn btn-primary" onClick={openNewPost}>+ New Post</button>
              </div>
              {newsLoading
                ? <div className="loading-row"><div className="spin"></div></div>
                : <div className="news-grid">
                  {filteredNews.map(n => {
                    const topCls = n.status === 'Published' ? 'pub' : n.status === 'Draft' ? 'draft' : 'arch';
                    const sb     = n.status === 'Published' ? 'badge-green' : n.status === 'Draft' ? 'badge-yellow' : 'badge-red';
                    const targetLabel = TARGET_ROLES.find(t => t.value === n.target_roles)?.label || 'All Users';
                    return (
                      <div key={n.id} className="news-card">
                        <div className={`news-card-top ${topCls}`}></div>
                        <div className="news-card-body">
                          <div className="news-meta">
                            <span className={`badge ${sb}`}>{n.status}</span>
                            {n.category && <span className="badge badge-purple">{n.category}</span>}
                            <span className="badge badge-blue">{targetLabel}</span>
                          </div>
                          <div className="news-title">{n.title}</div>
                          <div className="news-author">{n.author || '—'} · {new Date(n.created_at).toLocaleDateString()}</div>
                        </div>
                        <div className="news-actions">
                          {n.status === 'Published' && (
                            <>
                              <button className="news-action" onClick={() => openEditNews(n)}>Edit</button>
                              <button className="news-action" onClick={() => updateNewsStatus(n.id,'Archived')}>Archive</button>
                              <button className="news-action red" onClick={() => deleteNewsItem(n.id)}>Delete</button>
                              <button className="news-action blue" style={{ marginLeft:'auto' }}>↗ View</button>
                            </>
                          )}
                          {n.status === 'Draft' && (
                            <>
                              <button className="news-action" onClick={() => openEditNews(n)}>Edit</button>
                              <button className="news-action green" onClick={() => updateNewsStatus(n.id,'Published')}>Publish</button>
                              <button className="news-action red" onClick={() => deleteNewsItem(n.id)}>Delete</button>
                              <button className="news-action blue" style={{ marginLeft:'auto' }}>Preview</button>
                            </>
                          )}
                          {n.status === 'Archived' && (
                            <>
                                                            <button className="news-action green" onClick={() => updateNewsStatus(n.id,'Published')}>Restore</button>
                              <button className="news-action red" onClick={() => deleteNewsItem(n.id)}>Delete</button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filteredNews.length === 0 && <div style={{ color:'var(--text-muted)', fontSize:13 }}>No posts found</div>}
                </div>
              }
              <div className="news-footer">
                {newsItems.length} total posts · {newsItems.filter(x=>x.status==='Published').length} published · {newsItems.filter(x=>x.status==='Draft').length} drafts · {newsItems.filter(x=>x.status==='Archived').length} archived
              </div>
            </div>

      {/* NEWS MODAL */}
      <div className={`modal-overlay ${modal === 'news' ? 'open' : ''}`} onClick={handleOverlayClick}>
        <div className="modal">
          <div className="modal-title">{editNews ? 'Edit Post' : 'New Post'}</div>
          <div className="form-row">
            <label className="form-label">Title</label>
            <input className="form-input" value={nTitle} onChange={e => setNTitle(e.target.value)} placeholder="Post title" />
          </div>
          <div className="form-row">
            <label className="form-label">Category</label>
            <select className="form-input" value={nCat} onChange={e => setNCat(e.target.value)}>
              {['Academics','Events','Scholarships','Announcements','Sports'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label className="form-label">Target Audience</label>
            <select className="form-input" value={nTarget} onChange={e => setNTarget(e.target.value)}>
              {TARGET_ROLES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label className="form-label">Author</label>
            <input className="form-input" value={nAuthor} onChange={e => setNAuthor(e.target.value)} placeholder="Your name" />
          </div>
          <div className="form-row">
            <label className="form-label">Content</label>
            <textarea className="form-input" rows={5} value={nContent} onChange={e => setNContent(e.target.value)} placeholder="Write your announcement..." />
          </div>
          <div className="form-row">
            <label className="form-label">Status</label>
            <select className="form-input" value={nStatus} onChange={e => setNStatus(e.target.value)}>
              <option>Draft</option><option>Published</option>
            </select>
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={saveNews} disabled={nSaving}>
              {nSaving ? <span className="spin" style={{width:16,height:16,marginRight:6}}></span> : null}
              {editNews ? 'Update' : 'Publish'}
            </button>
          </div>
        </div>
      </div>

    </>
  );
};

export default NewsTab;
