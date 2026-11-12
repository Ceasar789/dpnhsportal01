// ============================================
// FILE: src/components/clarity/admin/ClarityAdminNewsTab.jsx
// The Admin News tab in Clarity (final design): the newest published post
// as a wide card (a presentation rule, not a "featured" flag: the data has
// none), then the other posts as cards. Data comes only from
// useAdminContext(). Real statuses are Published, Draft and Archived; there
// is no Important / General / Featured / Scheduled field, so none is shown.
//
// TEMPORARY word-for-word copies from pages/dashboards/admin/tabs/NewsTab.jsx
// (parity-tested in ClarityAdminNewsTab.test.jsx); after the defense the
// classic tab and this one should share them:
//   - the staged-image handling, isExpired, the status-change state and
//     focusAfterDelete, :23-64 (focusAfterDelete looks for this tab's Delete
//     button class instead of the classic one)
//   - the audience label, :94-96
//   - the post dialog, :143-256 (the shared Modal, unchanged), with ONE
//     wording change: the staged image's alt text no longer uses the word
//     "preview" (owner rule: that word is never shown)
// ============================================

import { useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, Plus, Search } from 'lucide-react';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';
import Modal from '../../ui/Modal';
import { TARGET_ROLES } from '../../../pages/dashboards/admin/shared/helpers';
import Button from '../../ui/Button';
import { formatDate } from '../../../lib/formatDate';

const STATUS_VIEWS = [['', 'All'], ['Published', 'Published'], ['Draft', 'Draft'], ['Archived', 'Archived']];
const TONE = { Published: 'ok', Draft: 'wa', Archived: '' };
const CATEGORIES = ['Academics', 'Events', 'Scholarships', 'Announcements', 'Sports'];
const postTime = n => new Date(n.published_at || n.created_at || 0).getTime();

const ClarityAdminNewsTab = () => {
  const {
    closeModal, deleteNewsItem, editNews, filteredNews = [], modal, nAuthor, nCat, nContent, nCustomTarget, nExpiresDate, nImageFile, nImageUrl, nSaving, nStatus, nTarget, nTitle, newsReadOnly,
    fetchNews, newsCatF, newsError = '', newsItems = [], newsLoading, newsSearch, newsStatF, openEditNews,
    openNewPost, saveNews, saveNewsExpiry, setNAuthor, setNCat, setNContent, setNExpiresDate, setNStatus,
    setNCustomTarget, setNImageFile, setNTarget, setNTitle, setNewsCatF, setNewsSearch, setNewsStatF, updateNewsStatus
  } = useAdminContext();

  // ---- TEMPORARY copy (NewsTab.jsx:23-64) ----
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
    const nextDelete = pageRootRef.current?.querySelector('.x-news-del');
    if (nextDelete) nextDelete.focus();
    else pageHeadingRef.current?.focus();
  };
  const changeStatus = async (id, status) => {
    setStatusBusy(id);
    try { await updateNewsStatus(id, status); } finally { setStatusBusy(null); }
  };
  // ---- end of the copy ----

  // TEMPORARY copy (NewsTab.jsx:94-96).
  // An audience the app no longer offers (e.g. an old
  // 'faculty' post) shows its stored value, not "All Users".
  const audienceOf = n => (n.target_roles?.startsWith('custom:')
    ? n.target_roles.slice(7)
    : TARGET_ROLES.find(t => t.value === n.target_roles)?.label || n.target_roles || 'All Users');

  // The wide card: the newest published post in the current list.
  const hero = [...filteredNews].filter(n => n.status === 'Published').sort((a, b) => postTime(b) - postTime(a))[0] || null;
  const rest = filteredNews.filter(n => n !== hero);

  const pills = n => (
    <>
      <span className={`x-badge ${TONE[n.status] || ''}`.trim()}>{n.status}</span>
      {isExpired(n) && <span className="x-badge er">Expired</span>}
      {n.category && <span className="x-badge in">{n.category}</span>}
    </>
  );
  // The actions the classic card offers for each status, same handlers.
  const actions = n => (
    <>
      {n.status === 'Published' && (
        <>
          <button type="button" className="x-btn gh" aria-label={`View ${n.title}`} onClick={() => openEditNews(n)}>View</button>
          <button type="button" className="x-btn gh" aria-label={`Archive ${n.title}`} aria-busy={statusBusy === n.id || undefined} onClick={() => changeStatus(n.id, 'Archived')}>
            <Archive size={14} aria-hidden="true" /> {statusBusy === n.id ? 'Archiving…' : 'Archive'}
          </button>
        </>
      )}
      {n.status === 'Draft' && (
        <>
          <button type="button" className="x-btn gh" aria-label={`Edit ${n.title}`} onClick={() => openEditNews(n)}>Edit</button>
          <button type="button" className="x-btn gh" aria-label={`Publish ${n.title}`} aria-busy={statusBusy === n.id || undefined} onClick={() => changeStatus(n.id, 'Published')}>
            {statusBusy === n.id ? 'Publishing…' : 'Publish'}
          </button>
        </>
      )}
      {n.status === 'Archived' && (
        <button type="button" className="x-btn gh" aria-label={`Restore ${n.title}`} aria-busy={statusBusy === n.id || undefined} onClick={() => changeStatus(n.id, 'Published')}>
          <ArchiveRestore size={14} aria-hidden="true" /> {statusBusy === n.id ? 'Restoring…' : 'Restore'}
        </button>
      )}
      <button type="button" className="x-btn gh x-news-del" aria-label={`Delete ${n.title}`} onClick={() => deleteNewsItem(n.id, focusAfterDelete)}>Delete</button>
    </>
  );

  return (
    <>
      <div ref={pageRootRef} className="x-news">
        <div className="x-head x-ov-head">
          <div style={{ minWidth: 0 }}>
            <h1 className="x-h1" ref={pageHeadingRef} tabIndex={-1}>News</h1>
            <p className="x-sub">What the school community is reading right now.</p>
          </div>
          <div className="x-act">
            <div className="x-seg" role="group" aria-label="Show posts">
              {STATUS_VIEWS.map(([value, label]) => (
                <button key={label} type="button" className={newsStatF === value || (!newsStatF && !value) ? 'on' : undefined}
                  aria-pressed={newsStatF === value || (!newsStatF && !value)} onClick={() => setNewsStatF(value)}>{label}</button>
              ))}
            </div>
            <button type="button" className="x-btn pri" onClick={openNewPost}>
              <Plus size={16} aria-hidden="true" /> New post
            </button>
          </div>
        </div>

        <div className="x-news-tools">
          <label className="x-search">
            <Search size={16} aria-hidden="true" />
            <span className="x-sr">Search articles</span>
            <input value={newsSearch} onChange={e => setNewsSearch(e.target.value)} placeholder="Search articles..." />
          </label>
          <label className="x-sr" htmlFor="x-news-cat">Filter news by category</label>
          <select id="x-news-cat" className="x-select" value={newsCatF} onChange={e => setNewsCatF(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        {newsError && (
          <div className="x-card x-pad x-rail" role="alert" style={{ marginBottom: 16 }}>
            <span>{newsError}</span>
            <button type="button" className="x-btn" onClick={fetchNews}>Retry</button>
          </div>
        )}

        {newsLoading ? (
          <p className="x-empty" role="status">Loading posts…</p>
        ) : (
          <>
            {hero && (
              <article className="x-card x-news-hero" aria-labelledby={`x-news-${hero.id}`}>
                <div className="x-news-art">
                  {hero.image_url ? <img src={hero.image_url} alt={`Image for ${hero.title}`} /> : null}
                </div>
                <div className="x-news-body">
                  <div className="x-news-pills">{pills(hero)}</div>
                  <h2 id={`x-news-${hero.id}`} className="x-news-title">{hero.title}</h2>
                  {hero.content && <p className="x-news-excerpt">{hero.content}</p>}
                  <p className="x-news-meta">{formatDate(hero.published_at || hero.created_at)} · {audienceOf(hero)}</p>
                  <div className="x-news-act">
                    <button type="button" className="x-btn pri" aria-label={`View ${hero.title}`} onClick={() => openEditNews(hero)}>View post</button>
                    <button type="button" className="x-btn gh" aria-label={`Archive ${hero.title}`} aria-busy={statusBusy === hero.id || undefined} onClick={() => changeStatus(hero.id, 'Archived')}>
                      <Archive size={14} aria-hidden="true" /> {statusBusy === hero.id ? 'Archiving…' : 'Archive'}
                    </button>
                    <button type="button" className="x-btn gh x-news-del" aria-label={`Delete ${hero.title}`} onClick={() => deleteNewsItem(hero.id, focusAfterDelete)}>Delete</button>
                  </div>
                </div>
              </article>
            )}

            {rest.length > 0 && (
              <div className="x-news-grid">
                {rest.map(n => (
                  <article key={n.id} className={`x-card x-news-card ${TONE[n.status] || 'ar'}`} aria-labelledby={`x-news-${n.id}`}>
                    <span className="x-news-bar" aria-hidden="true" />
                    <div className="x-news-pills">{pills(n)}<span className="x-news-date">{formatDate(n.created_at)}</span></div>
                    <h3 id={`x-news-${n.id}`} className="x-news-ctitle">{n.title}</h3>
                    {n.content && <p className="x-news-cexcerpt">{n.content}</p>}
                    <div className="x-news-foot">
                      <span className="x-news-aud">{audienceOf(n)}</span>
                      <div className="x-news-cact">{actions(n)}</div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {filteredNews.length === 0 && !newsError && <p className="x-empty">No posts found</p>}
          </>
        )}
        {(!newsError || newsItems.length > 0) && (
          <p className="x-cs x-news-count">
            {newsItems.length} total posts · {newsItems.filter(x => x.status === 'Published').length} published · {newsItems.filter(x => x.status === 'Draft').length} drafts · {newsItems.filter(x => x.status === 'Archived').length} archived
          </p>
        )}
      </div>

      {/* ---- TEMPORARY copy (NewsTab.jsx:143-256): NEWS MODAL ---- */}
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
              {/* An old post's audience the app no longer offers stays selected
                  (and is saved unchanged) instead of reading as the first
                  option. It cannot be chosen for a new post. */}
              {nTarget && !TARGET_ROLES.some(t => t.value === nTarget) && (
                <option value={nTarget} disabled>{`${nTarget} (no longer offered)`}</option>
              )}
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
                  alt={nImageFile ? `Chosen image: ${nImageFile.name || 'the chosen image'}` : 'The image currently on this post'}
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

export default ClarityAdminNewsTab;
