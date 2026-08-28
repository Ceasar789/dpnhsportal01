// ============================================
// FILE: src/pages/dashboards/teacher/tabs/AnnouncementsTab.jsx
// ANNOUNCEMENTS TAB — Full Supabase CRUD
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { Calendar, Clock, Megaphone, Plus, Search, Trash2, Edit, X, Check, Loader2 } from 'lucide-react';
import { useTheme, useToast } from '../hooks';
import { Card, Input, Modal, Badge, Btn } from '../shared/ui';

const AnnouncementsTab = () => {
  const { dark } = useTheme();
  const { userData } = useAuth();
  const { toast, showToast } = useToast();
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const fetchNews = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .eq('status', 'Published')
      .order('created_at', { ascending: false });
    
    if (error) {
      showToast('Error loading news: ' + error.message, 'error');
    } else {
      const teacherNews = (data || []).filter(item => {
        const targets = (item.target_roles || 'all').split(',').map(t => t.trim().toLowerCase());
        return targets.includes('all') || targets.includes('teacher') || targets.includes('faculty') || targets.includes('staff');
      });
      setNews(teacherNews);
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    fetchNews();
    const channel = supabase
      .channel('teacher-news')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'news' }, fetchNews)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchNews]);

  const filtered = news.filter(item => {
    const matchesSearch = item.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.content?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'All' || 
                          (activeFilter === 'Important' && item.priority === 'High') ||
                          (activeFilter === 'General' && item.priority !== 'High');
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-white font-semibold z-50 ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.msg}
        </div>
      )}
      
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <h1 className="text-xl font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>Announcements</h1>
        <div className="flex gap-2">
          {['All', 'Important', 'General'].map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: activeFilter === f ? '#1e3a5f' : (dark ? '#1e293b' : '#ffffff'),
                border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
                color: activeFilter === f ? '#ffffff' : (dark ? '#94a3b8' : '#64748b')
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mb-6">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }} />
        <input 
          type="text" 
          placeholder="Search announcements..." 
          value={searchQuery} 
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full h-10 pl-10 pr-4 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          style={{ backgroundColor: dark ? '#1e293b' : '#ffffff', border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`, color: dark ? '#f1f5f9' : '#1a2b4a' }}
        />
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div>
        ) : filtered.map((item, idx) => (
          <Card key={item.id} className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: item.priority === 'High' ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)' }}>
                <Megaphone size={20} style={{ color: item.priority === 'High' ? '#ef4444' : '#3b82f6' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-bold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>{item.title}</h3>
                  {item.priority === 'High' && (
                    <Badge color="#ef4444" bg="rgba(239,68,68,0.12)">Important</Badge>
                  )}
                </div>
                <p className="text-sm mb-3 line-clamp-3" style={{ color: dark ? '#cbd5e1' : '#475569' }}>{item.content}</p>
                <div className="flex items-center gap-4 text-xs" style={{ color: dark ? '#64748b' : '#94a3b8' }}>
                  <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(item.created_at).toLocaleDateString()}</span>
                  <span className="flex items-center gap-1"><Clock size={12} /> {new Date(item.created_at).toLocaleTimeString()}</span>
                  <span>By {item.author_name || 'Admin'}</span>
                  <Badge color="#64748b" bg={dark ? '#0f172a' : '#f8fafc'}>
                    {(item.target_roles || 'all').split(',').map(t => t.trim()).join(', ')}
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {!loading && filtered.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-base font-semibold" style={{ color: dark ? '#f1f5f9' : '#1a2b4a' }}>No announcements have been published yet.</p>
            <p style={{ color: dark ? '#64748b' : '#94a3b8' }}>Use the admin portal or news tools to post academic notices, reminders, and event updates.</p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AnnouncementsTab;
