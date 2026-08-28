// ============================================
// FILE: src/pages/dashboards/student/tabs/AnnouncementsTab.jsx
// ANNOUNCEMENTS TAB — Supabase + Real-time
// Split from the original monolithic StudentDashboard.jsx (1,123 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { Loader2, Megaphone, Search } from 'lucide-react';
import { useTheme, useToast, Card, Badge } from '../hooks';

const AnnouncementsTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { showToast, Toast } = useToast();

  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (err) {
      showToast('Error fetching announcements', 'error');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAnnouncements();

    const channel = supabase
      .channel('student-announcements')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, fetchAnnouncements)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchAnnouncements]);

  const filtered = announcements.filter(a => 
    a.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    a.content?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Toast />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <h1 className="text-xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Announcements</h1>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: dark ? '#64748b' : '#94a3b8' }} />
          <input 
            type="text" 
            placeholder="Search announcements..." 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)}
            className="h-9 pl-9 pr-3 rounded-lg text-sm outline-none w-full sm:w-64"
            style={{ backgroundColor: dark ? '#0f172a' : '#f8fafc', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, color: dark ? '#f1f5f9' : '#1a2b4a' }}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" size={32} style={{ color: dark ? '#64748b' : '#94a3b8' }} /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <Megaphone size={40} className="mx-auto mb-3" style={{ color: dark ? '#334155' : '#cbd5e1' }} />
          <p className="text-base font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>No announcements are available right now.</p>
          <p style={{ color: dark ? '#64748b' : '#94a3b8' }}>Your school administrators will post important academic updates and reminders here soon.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((announcement, i) => (
            <Card key={announcement.id || i} className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Badge color="#6A4800" bg="#FEB300">NEW</Badge>
                <span className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                  {new Date(announcement.created_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
                {announcement.priority === 'high' && (
                  <Badge color="#dc2626" bg="rgba(220,38,38,0.12)">Important</Badge>
                )}
              </div>
              <h3 className="font-semibold text-sm mb-1" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{announcement.title}</h3>
              <p className="text-sm mb-3" style={{ color: dark ? '#94a3b8' : '#64748b' }}>{announcement.content}</p>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: '#1e3a5f' }}>
                  {(announcement.from || 'A')[0].toUpperCase()}
                </div>
                <p className="text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>From: {announcement.from || 'School Admin'}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};


export default AnnouncementsTab;
