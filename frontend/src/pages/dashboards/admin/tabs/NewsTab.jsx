// ============================================
// FILE: src/pages/dashboards/admin/tabs/NewsTab.jsx
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// Includes the NEWS MODAL, which only this tab opens.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import Modal from '../../../../components/ui/Modal';
import { TARGET_ROLES } from '../shared/helpers';
import Button from '../../../../components/ui/Button';
import { formatDate } from '../../../../lib/formatDate';

const NewsTab = () => {
  const {
    closeModal, deleteNewsItem, editNews, filteredNews, modal, nAuthor, nCat, nContent, nCustomTarget, nExpiresDate, nImageFile, nImageUrl, nSaving, nStatus, nTarget, nTitle, newsReadOnly,
    fetchNews, newsCatF, newsError = '', newsItems, newsLoading, newsSearch, newsStatF, openEditNews,
    openNewPost, saveNews, saveNewsExpiry, setNAuthor, setNCat, setNContent, setNExpiresDate, setNStatus,
    setNCustomTarget, setNImageFile, setNTarget, setNTitle, setNewsCatF, setNewsSearch, setNewsStatF, updateNewsStatus
  } = useAdminContext();

  // 7C. Until now the preview rendered nImageUrl — the image ALREADY
  // SAVED on the post — so choosing a replacement left the old one on
  // screen and the only sign anything had happened was the browser's own
  // filename text. On a new post there was no preview at all.
  //
  // The blob belongs to the visible preview, not to a render. Creating it
  // in an effect pairs every allocation with cleanup, including StrictMode
  // replay, replacement, and closing the modal while this tab stays mounted.
  const previewImageRef = useRef(null);
  useEffect(() => {
    if (modal !== 'news' || !nImageFile || !previewImageRef.current) return;
    const url = URL.createObjectURL(nImageFile);
    previewImageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [modal, nImageFile]);

  // The file input is uncontrolled, so clearing the state is not enough:
  // the element keeps showing the filename until its own value is reset.
  const imageInputRef = useRef(null);
  const clearStagedImage = () => {
    setNImageFile(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

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
                    const targetLabel = n.target_roles?.startsWith('custom:')
                      ? n.target_roles.slice(7)
                      : TARGET_ROLES.find(t => t.value === n.target_roles)?.label || 'All Users';
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

      {/* NEWS MODAL */}
      <Modal
        open={modal === 'news'}
        title={newsReadOnly ? 'View Published Post' : editNews ? 'Edit Post' : 'New Post'}
        onClose={closeModal}
        footer={(requestClose) => (
          <>
            <Button variant="ghost" onClick={requestClose}>Cancel</Button>
            <Button onClick={newsReadOnly ? saveNewsExpiry : saveNews} busy={nSaving}>
              {newsReadOnly ? 'Save Expiry' : editNews ? 'Update' : 'Publish'}
            </Button>
          </>
        )}
      >
          {newsReadOnly && (
            <div className="form-row" style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}>
              A published post's content is locked so it can't be quietly rewritten. You can still change or clear its expiry date below.
            </div>
          )}
          <div className="form-row">
            <label className="form-label" htmlFor="news-title">Title</label>
            <input id="news-title" className="form-input" value={nTitle} onChange={e => setNTitle(e.target.value)} placeholder="Post title" disabled={newsReadOnly} aria-required={newsReadOnly ? undefined : 'true'} />
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="news-category">Category</label>
            <select id="news-category" className="form-input" value={nCat} onChange={e => setNCat(e.target.value)} disabled={newsReadOnly}>
              {['Academics','Events','Scholarships','Announcements','Sports'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="news-target-audience">Target Audience</label>
            <select id="news-target-audience" className="form-input" value={nTarget} onChange={e => setNTarget(e.target.value)} disabled={newsReadOnly}>
              {TARGET_ROLES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {nTarget === 'custom' && (
            <div className="form-row">
              <label className="form-label" htmlFor="news-custom-audience">Custom Audience</label>
              <input
                id="news-custom-audience" className="form-input"
                value={nCustomTarget}
                onChange={e => setNCustomTarget(e.target.value)}
                placeholder="e.g. Grade 10 students or Science Department"
                disabled={newsReadOnly}
                aria-required={newsReadOnly ? undefined : 'true'}
              />
            </div>
          )}
          <div className="form-row">
            <label className="form-label" htmlFor="news-author">Author</label>
            <input id="news-author" className="form-input" value={nAuthor} onChange={e => setNAuthor(e.target.value)} placeholder="Your name" disabled={newsReadOnly} />
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="news-content">Content</label>
            <textarea id="news-content" className="form-input" rows={5} value={nContent} onChange={e => setNContent(e.target.value)} placeholder="Write your announcement..." disabled={newsReadOnly} />
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="news-attach-image">Attach Image</label>
            <input
              id="news-attach-image"
              ref={imageInputRef}
              className="form-input"
              type="file"
              accept="image/*"
              onChange={e => setNImageFile(e.target.files?.[0] || null)}
              disabled={newsReadOnly}
            />
            {(nImageFile || nImageUrl) && (
              <div className="news-image-preview">
                <img
                  ref={previewImageRef}
                  src={nImageFile ? undefined : nImageUrl}
                  alt={nImageFile ? `Preview of ${nImageFile.name || 'the chosen image'}` : 'The image currently on this post'}
                />
                <div className="news-image-preview-bar">
                  {/* Which image this is, said plainly: the old version
                      showed the saved one and called it the attachment. */}
                  <span className="news-image-preview-label">
                    {nImageFile
                      ? `${nImageFile?.name || 'New image'} — not saved yet`
                      : 'Current image'}
                  </span>
                  {nImageFile && !newsReadOnly && (
                    <button type="button" className="news-action" onClick={clearStagedImage}>
                      {nImageUrl ? 'Keep current' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="news-status">Status</label>
            <select id="news-status" className="form-input" value={nStatus} onChange={e => setNStatus(e.target.value)} disabled={newsReadOnly}>
              <option>Draft</option><option>Published</option>
            </select>
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="news-expires-on-optional">Expires on (optional)</label>
            {/* Expiry is a visibility control, not content — it stays
                editable even on a locked, already-published post. */}
            <input
              id="news-expires-on-optional" className="form-input"
              type="date"
              value={nExpiresDate}
              onChange={e => setNExpiresDate(e.target.value)}
            />
          </div>
      </Modal>

    </>
  );
};

export default NewsTab;
