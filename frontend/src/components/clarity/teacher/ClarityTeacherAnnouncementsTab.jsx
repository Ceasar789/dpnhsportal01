// ============================================
// FILE: src/components/clarity/teacher/ClarityTeacherAnnouncementsTab.jsx
// The Teacher Announcements tab in Clarity (final design, real data only).
// The same read as the classic AnnouncementsTab (published, not expired,
// addressed to teachers), the same search and the same All / Important /
// General filter (Important = the stored priority "High").
//
// TEMPORARY word-for-word copy from pages/dashboards/teacher/tabs/AnnouncementsTab.jsx
// :17-65 (the state, the read, the effect, search and filter), source-parity
// tested in ClarityTeacherT2Sources.test.js; after the defense the classic
// tab and this one should share it.
// ============================================
/* eslint-disable react-hooks/set-state-in-effect -- the TEMPORARY copies below are the classic tab's own code, word for word, which the linter flags the same way in the classic file (AnnouncementsTab.jsx:55). */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Megaphone, Search } from 'lucide-react';
import { supabase } from '../../../config/supabase';
import { withRetry } from '../../../lib/supabaseRetry';
import { localNowTimestamp } from '../../../lib/taskFormatting';
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton';

const ClarityTeacherAnnouncementsTab = () => {
  // ---- TEMPORARY copy (AnnouncementsTab.jsx:17-65) ----
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState(false);
  const readInFlightRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const fetchNews = useCallback(async () => {
    if (readInFlightRef.current) return;
    readInFlightRef.current = true;
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
      const teacherNews = (data || []).filter(item => {
        const targets = (item.target_roles || 'all').split(',').map(t => t.trim().toLowerCase());
        return targets.includes('all') || targets.includes('teacher') || targets.includes('faculty') || targets.includes('staff');
      });
      setNews(teacherNews);
      setReadError(false);
    } catch (error) {
      console.error('Announcements fetch failed:', error);
      setReadError(true);
    } finally {
      readInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const filtered = news.filter(item => {
    const matchesSearch = item.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.content?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'All' || 
                          (activeFilter === 'Important' && item.priority === 'High') ||
                          (activeFilter === 'General' && item.priority !== 'High');
    return matchesSearch && matchesFilter;
  });
  // ---- end of the copy ----

  return (
    <div className="x-tan">
      <div className="x-head x-ov-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Announcements</h1>
          <p className="x-sub">News and reminders from the school</p>
        </div>
        <div className="x-seg" role="group" aria-label="Filter announcements">
          {['All', 'Important', 'General'].map(f => (
            <button key={f} type="button" className={activeFilter === f ? 'on' : undefined}
              aria-pressed={activeFilter === f} onClick={() => setActiveFilter(f)}>{f}</button>
          ))}
        </div>
      </div>

      <label className="x-search x-tan-search">
        <Search size={16} aria-hidden="true" />
        <span className="x-sr">Search announcements</span>
        <input type="text" placeholder="Search announcements..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      </label>

      {loading ? (
        <>
          <p className="x-sr" role="status">{readError ? 'Retrying announcements…' : 'Loading announcements…'}</p>
          <SkeletonGroup as="ul" className="x-tan-list">
            {[0, 1, 2].map(i => (
              <li key={i} className="x-card x-pad x-tan-item">
                <span className="x-tan-ico"><Skeleton w="100%" h="100%" /></span>
                <div className="x-tan-body">
                  <div className="x-tan-top"><p className="x-tan-title"><Skeleton inline h="0.8em" w={220} /></p></div>
                  <p className="x-tan-text"><Skeleton inline h="0.8em" w="90%" /></p>
                  <p className="x-cs x-tan-meta"><Skeleton inline h="0.8em" w={260} /></p>
                </div>
              </li>
            ))}
          </SkeletonGroup>
        </>
      ) : readError ? (
        <div className="x-card x-pad x-rail">
          <span role="alert">Announcements could not be loaded. Check your connection and try again.</span>
          <button type="button" className="x-btn" onClick={fetchNews}>Retry announcements</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="x-card x-pad x-tan-none">
          <b>{news.length === 0 ? 'No announcements have been published yet.' : 'No announcements match your search or filter.'}</b>
          {news.length === 0 && <span className="x-cs">Use the admin portal or news tools to post academic notices, reminders, and event updates.</span>}
        </div>
      ) : (
        <ul className="x-tan-list">
          {filtered.map(item => (
            <li key={item.id} className="x-card x-pad x-tan-item">
              <span className={`x-tan-ico${item.priority === 'High' ? ' hi' : ''}`} aria-hidden="true"><Megaphone size={18} /></span>
              <div className="x-tan-body">
                <div className="x-tan-top">
                  <h2 className="x-tan-title">{item.title}</h2>
                  {item.priority === 'High' && <span className="x-badge er">Important</span>}
                </div>
                <p className="x-tan-text">{item.content}</p>
                <p className="x-cs x-tan-meta">
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                  <span aria-hidden="true">·</span>
                  <span>{new Date(item.created_at).toLocaleTimeString()}</span>
                  <span aria-hidden="true">·</span>
                  <span>By {item.author_name || 'Admin'}</span>
                  <span className="x-badge">{(item.target_roles || 'all').split(',').map(t => t.trim()).join(', ')}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ClarityTeacherAnnouncementsTab;
