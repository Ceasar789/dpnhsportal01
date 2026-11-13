// ============================================
// FILE: src/components/clarity/admin/ClarityAdminMemosTab.jsx
// The Admin Memos tab in Clarity (final design, real data only). A memo has
// no draft or acknowledged status in this app (saving one sends it), and no
// per-person recipient list (only the group it is addressed to). So the
// board has a single "Sent" column, and there are no avatar bubbles.
// Selecting a memo shows it in full with Edit and Delete, as before.
//
// TEMPORARY word-for-word copies from pages/dashboards/admin/tabs/MemosTab.jsx
// (parity-tested in ClarityAdminMemosTab.test.jsx); after the defense the
// classic tab and this one should share them:
//   - the recipient lists and focusAfterDelete, :22-38 (focusAfterDelete
//     looks for this tab's memo cards instead of the classic list items)
//   - the memo dialog, :119-155 (the shared Modal, unchanged)
// ============================================

import { useRef } from 'react';
import { Plus, Search } from 'lucide-react';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';
import { composeOptions, filterOptions } from '../../../lib/memoRecipients';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import { formatDate, formatDateTime } from '../../../lib/formatDate';
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton';

// Sender and audience as stored. A missing part is left out (no dash and no
// assumed "All"); the arrow shows only when both are there.
const stored = v => String(v ?? '').trim();
const audience = m => [m.from_office, m.recipient].map(stored).filter(Boolean).join(' → ');

const ClarityAdminMemosTab = () => {
  const {
    closeModal, deleteMemo, editMemo, filteredMemos = [], mBody, mFrom, mSaving, mSubj, mTo, memoFilter, memoSearch, memos = [],
    fetchMemos, memosError = '', memosLoading, modal, openCompose, openEditMemo, saveMemo, selMemo,
    setMBody, setMFrom, setMSubj, setMTo, setMemoFilter, setMemoSearch,
    setSelMemo, users = []
  } = useAdminContext();

  // ---- TEMPORARY copy (MemosTab.jsx:22-38) ----
  // 7D. Both of these lists used to be hardcoded, twice over, and the
  // two departments in them — "Science Dept" and "Math Dept" — match
  // nothing in profiles.department, where the real values are "Science"
  // and "Mathematics". A memo addressed through that form went to a
  // department with no members, and nobody found out.
  const recipientOptions = composeOptions(users);
  // The filter offers what the memos actually hold, so it can never be
  // set to a group that matches nothing — and an old memo addressed to a
  // department since renamed stays findable.
  const recipientFilters = filterOptions(memos);
  const pageHeadingRef = useRef(null);
  const pageRootRef = useRef(null);
  const focusAfterDelete = () => {
    const nextMemo = pageRootRef.current?.querySelector('.x-memo-card');
    if (nextMemo) nextMemo.focus();
    else pageHeadingRef.current?.focus();
  };
  // ---- end of the copy ----

  return (
    <>
      <div ref={pageRootRef} className="x-memo">
        <div className="x-head x-ov-head">
          <div style={{ minWidth: 0 }}>
            <h1 className="x-h1" ref={pageHeadingRef} tabIndex={-1}>Memos</h1>
            <p className="x-sub">See where every memo stands at a glance.</p>
          </div>
          <div className="x-act">
            <button type="button" className="x-btn pri" onClick={openCompose}>
              <Plus size={16} aria-hidden="true" /> New memo
            </button>
          </div>
        </div>

        <div className="x-news-tools">
          <label className="x-search">
            <Search size={16} aria-hidden="true" />
            <span className="x-sr">Search memos</span>
            <input value={memoSearch} onChange={e => setMemoSearch(e.target.value)} placeholder="Search memos..." />
          </label>
          <label className="x-sr" htmlFor="x-memo-filter">Filter by recipient</label>
          <select id="x-memo-filter" className="x-select" value={memoFilter} onChange={e => setMemoFilter(e.target.value)}>
            <option value="">All Recipients</option>
            {recipientFilters.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>

        {memosError && (
          <div className="x-card x-pad x-rail" role="alert" style={{ marginBottom: 16 }}>
            <span>{memosError}</span>
            <button type="button" className="x-btn" onClick={fetchMemos}>Retry</button>
          </div>
        )}

        <div className="x-memo-layout">
          <section className="x-memo-col" aria-labelledby="x-memo-sent">
            <div className="x-sec-colhead">
              <h2 id="x-memo-sent">Sent</h2>
              <span className={memosLoading ? undefined : 'x-memo-count'}>{memosLoading ? '' : filteredMemos.length}<span className="x-sr"> {filteredMemos.length === 1 ? 'memo' : 'memos'}</span></span>
            </div>
            {memosLoading ? (
              <>
                <p className="x-sr" role="status">Loading memos…</p>
                <SkeletonGroup>
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="x-card x-memo-card">
                      <b><Skeleton inline h="0.8em" w="65%" /></b>
                      <span className="x-memo-aud"><Skeleton inline h="0.8em" w={90} /></span>
                      <span className="x-memo-date"><Skeleton inline h="0.8em" w={80} /></span>
                    </div>
                  ))}
                </SkeletonGroup>
              </>
            ) : filteredMemos.length === 0 && !memosError ? (
              <p className="x-card x-empty">No memos found</p>
            ) : filteredMemos.map(m => (
              <button key={m.id} type="button" className={`x-card x-memo-card${selMemo?.id === m.id ? ' on' : ''}`}
                aria-current={selMemo?.id === m.id ? 'true' : undefined} onClick={() => setSelMemo(m)}>
                <b>{m.subject}</b>
                {audience(m) && <span className="x-memo-aud">{audience(m)}</span>}
                <span className="x-memo-date">{formatDate(m.created_at)}</span>
              </button>
            ))}
          </section>

          <section className="x-card x-pad x-memo-detail" aria-label="Selected memo">
            {selMemo ? (
              <>
                <h2 className="x-ct" style={{ overflowWrap: 'anywhere' }}>{selMemo.subject}</h2>
                <dl className="x-memo-fields">
                  {stored(selMemo.from_office) && <div><dt>From</dt><dd>{stored(selMemo.from_office)}</dd></div>}
                  {stored(selMemo.recipient) && <div><dt>To</dt><dd>{stored(selMemo.recipient)}</dd></div>}
                  <div><dt>Date</dt><dd>{formatDateTime(selMemo.created_at)}</dd></div>
                </dl>
                <p className="x-memo-body">{selMemo.content}</p>
                <div className="x-news-act">
                  <button type="button" className="x-btn" onClick={() => openEditMemo(selMemo)}>Edit</button>
                  <button type="button" className="x-btn dng" onClick={() => deleteMemo(selMemo.id, focusAfterDelete)}>Delete</button>
                </div>
              </>
            ) : (
              <p className="x-empty">Select a memo to view</p>
            )}
            <p className="x-cs x-memo-stats">
              {memos.length} total · {memos.filter(m => m.recipient === 'All Faculty').length} to All Faculty · {memos.filter(m => m.recipient === 'All Students').length} to All Students
            </p>
          </section>
        </div>
      </div>

      {/* ---- TEMPORARY copy (MemosTab.jsx:119-155): MEMO MODAL ---- */}
      <Modal
        open={modal === 'memo'}
        title={editMemo ? 'Edit Memo' : 'Compose Memo'}
        onClose={closeModal}
        footer={(requestClose) => (
          <>
            <Button variant="ghost" onClick={requestClose}>Cancel</Button>
            <Button onClick={saveMemo} busy={mSaving} busyLabel={editMemo ? 'Updating…' : 'Sending…'}>
              {editMemo ? 'Update' : 'Send'}
            </Button>
          </>
        )}
      >
          <div className="form-row">
            <label className="form-label" htmlFor="memos-from-office">From Office</label>
            <input id="memos-from-office" className="form-input" value={mFrom} onChange={e => setMFrom(e.target.value)} placeholder="e.g. Principal's Office" />
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="memos-recipient">Recipient</label>
            <select id="memos-recipient" className="form-input" value={mTo} onChange={e => setMTo(e.target.value)}>
              {/* A memo being EDITED may be addressed to something no
                  longer offered — a renamed department, say. Keep its own
                  value selectable so opening the form does not silently
                  re-address it. */}
              {mTo && !recipientOptions.includes(mTo) && <option>{mTo}</option>}
              {recipientOptions.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="memos-subject">Subject</label>
            <input id="memos-subject" className="form-input" value={mSubj} onChange={e => setMSubj(e.target.value)} placeholder="Memo subject" aria-required="true" />
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="memos-body">Body</label>
            <textarea id="memos-body" className="form-input" rows={6} value={mBody} onChange={e => setMBody(e.target.value)} placeholder="Write your memo..." />
          </div>
      </Modal>
    </>
  );
};

export default ClarityAdminMemosTab;
