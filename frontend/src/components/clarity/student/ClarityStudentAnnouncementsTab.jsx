// ============================================
// FILE: src/components/clarity/student/ClarityStudentAnnouncementsTab.jsx
// Student Announcements in Clarity (Student PDF p5): search, then one card
// per published announcement with its title, text, date, NEW (posted in the
// last 7 days) and Important (priority High) as before, the sender only when
// stored, and the audience only when stored.
//
// TEMPORARY word-for-word copy from pages/dashboards/student/tabs/AnnouncementsTab.jsx
// (source-parity tested in ClarityStudentS2a.test.jsx); after the defense they
// should share it. No substitutions:
//   - the state, read and search filter, :20-62
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { Megaphone, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../config/supabase';
import { withRetry } from '../../../lib/supabaseRetry';
import { localNowTimestamp } from '../../../lib/taskFormatting';
import { useToast } from '../../../pages/dashboards/student/hooks';
import { isNewAnnouncement } from '../../../pages/dashboards/student/announcementAge';
import { TARGET_ROLES } from '../../../pages/dashboards/admin/shared/helpers';
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton';

const stored = value => String(value ?? '').trim();
// The audience as the admin News tab names it; an unknown stored value shows as stored.
const audienceOf = (value) => {
  const text = stored(value);
  if (!text) return '';
  if (text.startsWith('custom:')) return text.slice(7);
  return TARGET_ROLES.find(t => t.value === text)?.label || text;
};
const postedOn = value => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};

const ClarityStudentAnnouncementsTab = () => {
  // The classic file has these two findings too; disabled around the copy, not inside it.
  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  // ---- TEMPORARY copy (AnnouncementsTab.jsx:20-62) ----
  const { userData } = useAuth();
  const { showToast, Toast } = useToast();

  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  // A failed read is its own state: it must never look like "no announcements".
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // "Now" for the NEW badge, fixed when the tab opens.
  const [now] = useState(() => new Date());

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await withRetry(
        () => supabase
          .from('news')
          .select('*')
          .eq('status', 'Published')
          .or(`expires_at.is.null,expires_at.gt.${localNowTimestamp()}`)
          .order('created_at', { ascending: false }),
        { label: 'Announcements fetch' }
      );

      if (error) throw error;
      setAnnouncements(data || []);
      setLoadError(false);
    } catch (err) {
      console.warn('Announcements fetch failed —', err?.message);
      setLoadError(true);
      showToast('Error fetching announcements', 'error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const filtered = announcements.filter(a => 
    a.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    a.content?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  // ---- end of the copy ----
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  void userData; // read by the classic tab too; kept so the copy stays word for word

  return (
    <div className="x-san">
      <Toast />
      <div className="x-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Announcements</h1>
          <p className="x-sub">News and reminders from your school.</p>
        </div>
        <div className="x-act">
          <button type="button" className="x-iconbtn" onClick={fetchAnnouncements} aria-label="Refresh announcements">
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <label className="x-search x-san-search">
        <Search size={16} aria-hidden="true" />
        <input type="search" aria-label="Search announcements" placeholder="Search announcements..."
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </label>

      {loading ? <>
        <p className="x-sr" role="status">Loading announcements…</p>
        <SkeletonGroup as="ul" className="x-san-list">
          {[0, 1, 2].map(i => (
            <li key={i} className="x-card x-san-item">
              <span className="x-san-ico"><Skeleton w="100%" h="100%" /></span>
              <div className="x-san-body">
                <div className="x-san-top"><p className="x-san-title"><Skeleton inline h="0.8em" w={200} /></p></div>
                <p className="x-san-text"><Skeleton inline h="0.8em" w="90%" /></p>
              </div>
            </li>
          ))}
        </SkeletonGroup>
      </>
        : loadError ? (
          <div className="x-card x-pad x-empty">
            <p role="alert" className="x-ct">Could not load announcements.</p>
            <p className="x-cs">This is a loading problem, not an empty list. Check your connection and try again.</p>
            <button type="button" className="x-btn" onClick={fetchAnnouncements}>Retry</button>
          </div>
        )
        : filtered.length === 0 ? (
          <div className="x-card x-pad x-empty">
            <p className="x-ct">No announcements are available right now.</p>
            <p className="x-cs">Your school administrators will post important academic updates and reminders here soon.</p>
          </div>
        ) : (
          <ul className="x-san-list" aria-label="Announcements">
            {filtered.map((announcement, i) => {
              const from = stored(announcement.from);
              const audience = audienceOf(announcement.target_roles);
              const day = postedOn(announcement.created_at);
              return (
                <li key={announcement.id || i} className="x-card x-san-item">
                  <span className="x-san-ico" aria-hidden="true"><Megaphone size={18} /></span>
                  <div className="x-san-body">
                    <div className="x-san-top">
                      <h2 className="x-san-title">{announcement.title}</h2>
                      <span className="x-news-pills">
                        {isNewAnnouncement(announcement.created_at, now) && <span className="x-badge in">NEW</span>}
                        {String(announcement.priority ?? '').trim().toLowerCase() === 'high' && <span className="x-badge er">Important</span>}
                      </span>
                    </div>
                    {stored(announcement.content) && <p className="x-san-text">{announcement.content}</p>}
                    {(day || from || audience) && (
                      <p className="x-san-meta">
                        {[day, from && `By ${from}`].filter(Boolean).join(' · ')}
                        {audience && <>{(day || from) ? ' · ' : ''}<span className="x-badge">{audience}</span></>}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
};

export default ClarityStudentAnnouncementsTab;
