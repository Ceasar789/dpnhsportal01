// ============================================
// FILE: src/pages/dashboards/student/tabs/AnnouncementsTab.jsx
// ANNOUNCEMENTS TAB — published school news, read when the tab opens or on Refresh.
// Split from the original monolithic StudentDashboard.jsx (1,123 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { Loader2, Megaphone, Search } from 'lucide-react';
import { useToast, Card, Badge } from '../hooks';
import { withRetry } from '../../../../lib/supabaseRetry';
import { Btn } from '../../teacher/shared/ui';
import PageHeader from '../PageHeader';
import { INFO, RED } from '../badgeTones';
import { isNewAnnouncement } from '../announcementAge';
import { localNowTimestamp } from '../../../../lib/taskFormatting';

const AnnouncementsTab = () => {
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

  return (
    <div className="p-6">
      <Toast />

      <PageHeader title="Announcements" subtitle="News and reminders from your school."
        onRefresh={fetchAnnouncements} refreshLabel="Refresh announcements">
        <div className="relative w-full sm:w-auto">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input 
            type="search"
            aria-label="Search announcements"
            placeholder="Search announcements..." 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)}
            className="h-11 pl-9 pr-3 rounded-lg text-sm w-full sm:w-64"
            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
      </PageHeader>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" size={32} style={{ color: 'var(--text-muted)' }} /></div>
      ) : loadError ? (
        <Card className="p-8 text-center">
          <p role="alert" className="text-base font-semibold mb-1" style={{ color: 'var(--text)' }}>Could not load announcements.</p>
          <p className="mb-3" style={{ color: 'var(--text-muted)' }}>This is a loading problem, not an empty list. Check your connection and try again.</p>
          <div className="flex justify-center">
            <Btn className="min-h-11" onClick={fetchAnnouncements}>Retry</Btn>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <Megaphone size={40} className="mx-auto mb-3" style={{ color: 'var(--text-dim)' }} />
          <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>No announcements are available right now.</p>
          <p style={{ color: 'var(--text-muted)' }}>Your school administrators will post important academic updates and reminders here soon.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((announcement, i) => (
            <Card key={announcement.id || i} className="p-5">
              <div className="flex items-center gap-2 mb-2">
                {isNewAnnouncement(announcement.created_at, now) && <Badge color={INFO.color} bg={INFO.bg}>NEW</Badge>}
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {new Date(announcement.created_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
                {announcement.priority === 'high' && (
                  <Badge color={RED.color} bg={RED.bg}>Important</Badge>
                )}
              </div>
              <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text)' }}>{announcement.title}</h3>
              <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>{announcement.content}</p>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: 'var(--card2)', color: 'var(--text-muted)' }}>
                  {(announcement.from || 'A')[0].toUpperCase()}
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>From: {announcement.from || 'School Admin'}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};


export default AnnouncementsTab;
