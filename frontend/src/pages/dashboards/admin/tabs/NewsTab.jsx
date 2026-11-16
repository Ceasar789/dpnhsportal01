// ============================================
// FILE: src/pages/dashboards/admin/tabs/NewsTab.jsx
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// Includes the NEWS MODAL, which only this tab opens.
// ============================================

import { useRef, useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import NewsFormDialog from '../shared/NewsFormDialog';
import { TARGET_ROLES } from '../shared/helpers';
import { formatDate } from '../../../../lib/formatDate';

const NewsTab = () => {
  const {
    deleteNewsItem, filteredNews, 
    fetchNews, newsCatF, newsError = '', newsItems, newsLoading, newsSearch, newsStatF, openEditNews,
    openNewPost, 
    setNewsCatF, setNewsSearch, setNewsStatF, updateNewsStatus
  } = useAdminContext();


  const isExpired = (n) => !!n.expires_at && new Date(n.expires_at) < new Date();

  // UX-052: Archive, Publish and Restore each run a status mutation while
  // the card renders exactly as it did before, so a change in flight looks
  // like a press that did nothing. One id at a time is enough — these are
  // single-card actions, and the id is what tells the other cards apart.
  const [statusBusy, setStatusBusy] = useState(null);
  const pageHeadingRef = useRef(null);
  const pageRootRef = useRef(null);
  const focusAfterDelete = () => {
    const nextDelete = pageRootRef.current?.querySelector('.news-action.red');
    if (nextDelete) nextDelete.focus();
    else pageHeadingRef.current?.focus();
  };
  const changeStatus = async (id, status) => {
    setStatusBusy(id);
    try { await updateNewsStatus(id, status); } finally { setStatusBusy(null); }
  };

  return (
    <>
            <div ref={pageRootRef}>
              <div className="page-header-bar">
                <div className="page-title" ref={pageHeadingRef} tabIndex={-1}>News Management</div>
                <div className="page-sub">Create, edit, archive, and publish portal announcements</div>
              </div>
              <div className="toolbar">
                <input placeholder="Search articles..." value={newsSearch} onChange={e => setNewsSearch(e.target.value)} />
                <select value={newsCatF} onChange={e => setNewsCatF(e.target.value)} style={{ width:'auto' }} aria-label="Filter news by category">
                  <option value="">Category</option>
                  {['Academics','Events','Scholarships','Announcements','Sports'].map(c => <option key={c}>{c}</option>)}
                </select>
                <select value={newsStatF} onChange={e => setNewsStatF(e.target.value)} style={{ width:'auto' }} aria-label="Filter news by status">
                  <option value="">Status</option>
                  <option>Published</option><option>Draft</option><option>Archived</option>
                </select>
                <button className="btn btn-primary" onClick={openNewPost}>+ New Post</button>
              </div>
              {newsError && <div className="cal-load-error" role="alert"><span>{newsError}</span><button type="button" className="btn btn-ghost" onClick={fetchNews}>Retry</button></div>}
              {newsLoading
                ? <div className="loading-row"><div className="spin"></div></div>
                : <div className="news-grid">
                  {filteredNews.map(n => {
                    const topCls = n.status === 'Published' ? 'pub' : n.status === 'Draft' ? 'draft' : 'arch';
                    const sb     = n.status === 'Published' ? 'badge-green' : n.status === 'Draft' ? 'badge-yellow' : 'badge-red';
                    // An audience the app no longer offers (e.g. an old
                    // 'faculty' post) shows its stored value, not "All Users".
                    const targetLabel = n.target_roles?.startsWith('custom:')
                      ? n.target_roles.slice(7)
                      : TARGET_ROLES.find(t => t.value === n.target_roles)?.label || n.target_roles || 'All Users';
                    return (
                      <div key={n.id} className="news-card">
                        <div className={`news-card-top ${topCls}`}></div>
                        <div className="news-card-body">
                          <div className="news-meta">
                            <span className={`badge ${sb}`}>{n.status}</span>
                            {isExpired(n) && <span className="badge badge-red">Expired</span>}
                            {n.category && <span className="badge badge-purple">{n.category}</span>}
                            <span className="badge badge-blue">{targetLabel}</span>
                          </div>
                          <div className="news-title">{n.title}</div>
                          <div className="news-author">{n.author_id ? 'Admin' : '—'} · {formatDate(n.created_at)}</div>
                        </div>
                        <div className="news-actions">
                          {n.status === 'Published' && (
                            <>
                              <button className="news-action blue" aria-label={`View ${n.title}`} onClick={() => openEditNews(n)}>View</button>
                              <button className="news-action archive-news-action" aria-label={`Archive ${n.title}`} aria-busy={statusBusy === n.id || undefined} onClick={() => changeStatus(n.id,'Archived')}><Archive size={14} /> {statusBusy === n.id ? 'Archiving…' : 'Archive'}</button>
                            </>
                          )}
                          {n.status === 'Draft' && (
                            <>
                              <button className="news-action" aria-label={`Edit ${n.title}`} onClick={() => openEditNews(n)}>Edit</button>
                              <button className="news-action green" aria-label={`Publish ${n.title}`} aria-busy={statusBusy === n.id || undefined} onClick={() => changeStatus(n.id,'Published')}>{statusBusy === n.id ? 'Publishing…' : 'Publish'}</button>
                              <button className="news-action blue" style={{ marginLeft:'auto' }} aria-label={`Preview ${n.title}`} onClick={() => openEditNews(n)}>Preview</button>
                            </>
                          )}
                          {n.status === 'Archived' && (
                            <>
                                                            <button className="news-action green archive-news-action" aria-label={`Restore ${n.title}`} aria-busy={statusBusy === n.id || undefined} onClick={() => changeStatus(n.id,'Published')}><ArchiveRestore size={14} /> {statusBusy === n.id ? 'Restoring…' : 'Restore'}</button>
                            </>
                          )}
                          <button className="news-action red" style={{ marginLeft: n.status === 'Draft' ? 0 : 'auto' }} aria-label={`Delete ${n.title}`} onClick={() => deleteNewsItem(n.id, focusAfterDelete)}>Delete</button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredNews.length === 0 && !newsError && <div style={{ color:'var(--text-muted)', fontSize: 'var(--font-size-13)' }}>No posts found</div>}
                </div>
              }
              {(!newsError || newsItems.length > 0) && <div className="news-footer">
                {newsItems.length} total posts · {newsItems.filter(x=>x.status==='Published').length} published · {newsItems.filter(x=>x.status==='Draft').length} drafts · {newsItems.filter(x=>x.status==='Archived').length} archived
              </div>}
            </div>

      <NewsFormDialog />

    </>
  );
};

export default NewsTab;
