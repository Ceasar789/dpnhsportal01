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
//   - isExpired, the status-change state and
//     focusAfterDelete, :23-64 (focusAfterDelete looks for this tab's Delete
//     button class instead of the classic one)
//   - the audience label, :94-96
//   - U4: the post dialog with the staged-image handling is now the shared NewsFormDialog
//     (pages/dashboards/admin/shared), rendered by this tab and the classic one
//     (its staged-image alt text keeps this tab's wording, without "preview")
// ============================================

import { useRef, useState } from 'react';
import { Archive, ArchiveRestore, Plus, Search } from 'lucide-react';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';
import NewsFormDialog from '../../../pages/dashboards/admin/shared/NewsFormDialog';
import { TARGET_ROLES } from '../../../pages/dashboards/admin/shared/helpers';
import { formatDate } from '../../../lib/formatDate';
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton';

const STATUS_VIEWS = [['', 'All'], ['Published', 'Published'], ['Draft', 'Draft'], ['Archived', 'Archived']];
const TONE = { Published: 'ok', Draft: 'wa', Archived: '' };
const CATEGORIES = ['Academics', 'Events', 'Scholarships', 'Announcements', 'Sports'];
const postTime = n => new Date(n.published_at || n.created_at || 0).getTime();

const ClarityAdminNewsTab = () => {
  const {
    deleteNewsItem, filteredNews = [], 
    fetchNews, newsCatF, newsError = '', newsItems = [], newsLoading, newsSearch, newsStatF, openEditNews,
    openNewPost, 
    setNewsCatF, setNewsSearch, setNewsStatF, updateNewsStatus
  } = useAdminContext();

  // ---- TEMPORARY copy (NewsTab.jsx:23-64) ----

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
          <>
            <p className="x-sr" role="status">Loading posts…</p>
            <SkeletonGroup>
              <div className="x-card x-news-hero">
                <div className="x-news-art"><Skeleton w="100%" h="100%" r={0} /></div>
                <div className="x-news-body">
                  <div className="x-news-pills"><Skeleton inline h={22} w={72} className="sk-round" /><Skeleton inline h={22} w={64} className="sk-round" /></div>
                  <p className="x-news-title"><Skeleton inline h="0.8em" w="70%" /></p>
                  <p className="x-news-excerpt"><Skeleton inline h="0.8em" w="95%" /> <Skeleton inline h="0.8em" w="80%" /></p>
                  <p className="x-news-meta"><Skeleton inline h="0.8em" w={160} /></p>
                  <div className="x-news-act">{[84, 84, 64].map((w, i) => <span key={i} className="x-btn gh"><Skeleton inline h="0.8em" w={w - 32} /></span>)}</div>
                </div>
              </div>
              <div className="x-news-grid">
                {[0, 1, 2].map(i => (
                  <div key={i} className="x-card x-news-card">
                    <div className="x-news-pills"><Skeleton inline h={22} w={72} className="sk-round" /></div>
                    <p className="x-news-ctitle"><Skeleton inline h="0.8em" w="75%" /></p>
                    <p className="x-news-cexcerpt"><Skeleton inline h="0.8em" w="95%" /> <Skeleton inline h="0.8em" w="60%" /></p>
                    <div className="x-news-foot"><span className="x-news-aud"><Skeleton inline h="0.8em" w={64} /></span></div>
                  </div>
                ))}
              </div>
            </SkeletonGroup>
          </>
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

            {filteredNews.length === 0 && !newsError && (
              <div className="x-empty">
                <p>No posts found</p>
                {newsItems.length === 0 ? (
                  <button type="button" className="x-btn pri" style={{ marginTop: 12 }} onClick={openNewPost}>Write the first post</button>
                ) : <p className="x-cs">Try another search, category or status.</p>}
              </div>
            )}
          </>
        )}
        {(!newsError || newsItems.length > 0) && (
          <p className="x-cs x-news-count">
            {newsItems.length} total posts · {newsItems.filter(x => x.status === 'Published').length} published · {newsItems.filter(x => x.status === 'Draft').length} drafts · {newsItems.filter(x => x.status === 'Archived').length} archived
          </p>
        )}
      </div>

      <NewsFormDialog />

    </>
  );
};

export default ClarityAdminNewsTab;
