// ============================================
// FILE: src/pages/public/News.jsx
// PURPOSE: News page - EXACT match to Flutter NewsPage
// DESIGN: one list of news, newest first, in a responsive grid
// DATA: Live from Supabase 'news' table (admin-managed)
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicHeader, { PUBLIC_HEADER_HEIGHT } from '../../components/PublicHeader';
import PublicFooter from '../../components/PublicFooter';
import { ArrowRight, ExternalLink, AlertTriangle } from 'lucide-react';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { localNowTimestamp } from '../../lib/taskFormatting';

const News = () => {
  const navigate = useNavigate();
  const { userData } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [newsItems, setNewsItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1100);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetchNews();
  }, [userData?.role]);

  const canViewNews = (item, role) => {
    const targets = (item.target_roles || 'all').split(',').map(target => target.trim().toLowerCase());
    return targets.includes('all') || targets.includes(role) || (targets.includes('staff') && ['teacher', 'faculty', 'registrar', 'main_admin'].includes(role));
  };

  const fetchNews = async () => {
    setLoading(true);
    // An expired post must not cross the wire at all — filtered in the
    // query (PostgREST .or), not in JS after the fact. expires_at IS NULL
    // (never expires) is always included.
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .eq('status', 'Published')
      .or(`expires_at.is.null,expires_at.gt.${localNowTimestamp()}`)
      .order('published_at', { ascending: false, nullsFirst: false });
    if (error) {
      setLoadError(error.message || 'The news could not be loaded.');
      setNewsItems([]);
    } else {
      setLoadError(null);
      setNewsItems((data || []).filter(item => canViewNews(item, userData?.role || 'guest')));
    }
    setLoading(false);
  };

  // News History is a deliberate look-back at posts the admin has already
  // archived — a different axis from expiry. An archived post got there by
  // explicit admin action, not by the clock, and readers who open History
  // are asking to see old news on purpose. Expiry exists to auto-hide a
  // post from the *live* feed; it is not applied here, so archiving a post
  // never loses it from the historical record even if its expires_at (set
  // back when it was still live) has since passed.
  const fetchHistory = async () => {
    const { data, error } = await supabase.from('news').select('*').eq('status', 'Archived').order('updated_at', { ascending: false });
    if (error) {
      setHistoryError(error.message || 'The archive could not be loaded.');
      setHistoryItems([]);
      return;
    }
    setHistoryError(null);
    setHistoryItems((data || []).filter(item => canViewNews(item, userData?.role || 'guest')));
  };

  const toggleHistory = async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next) await fetchHistory();
  };

  // Newest first; the first card is the lead and spans two columns.

  // ============================================
  // LATEST NEWS SECTION
  // ============================================
  const LatestNewsSection = () => (
    <div className="w-full py-8 lg:py-[60px] px-5 lg:px-[100px] max-w-[1280px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-end mb-6 lg:mb-10">
        <div>
          <div className="w-10 h-1 mb-4" style={{ backgroundColor: '#FEB300' }} />
          <h3 className="font-work font-extrabold text-3xl tracking-tight" style={{ color: '#1E3A8A' }}>
            Latest News
          </h3>
        </div>
        <button
          type="button"
          onClick={toggleHistory}
          aria-expanded={showHistory}
          className="flex items-center gap-1.5 rounded px-1 py-1 font-work font-bold text-xs tracking-widest focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:ring-offset-2"
          style={{ color: '#475569' }}
        >
          {showHistory ? 'HIDE NEWS HISTORY' : 'NEWS HISTORY'}
          <ExternalLink size={14} aria-hidden="true" />
        </button>
      </div>
      {showHistory && (
        <div className="mb-10 rounded-lg border border-slate-200 bg-white p-5">
          <h4 className="font-work font-bold text-lg" style={{ color: '#1E3A8A' }}>News History</h4>
          {historyError ? (
            <div className="mt-3 flex items-center gap-2" role="alert">
              <AlertTriangle size={16} aria-hidden="true" style={{ color: '#b91c1c' }} />
              <p className="text-sm" style={{ color: '#b91c1c' }}>The archive could not be loaded.</p>
              <button type="button" onClick={fetchHistory} className="text-sm font-semibold underline focus:outline-none focus-visible:ring-2 rounded" style={{ color: '#003b7a' }}>
                Try again
              </button>
            </div>
          ) : historyItems.length === 0 ? <p className="mt-3 text-sm text-slate-500">No archived news available.</p> : historyItems.map(item => (
            <div key={item.id} className="border-b border-slate-100 py-3 last:border-0">
              <div className="font-work font-bold" style={{ color: '#1E3A8A' }}>{item.title}</div>
              <div className="text-xs text-slate-500">{item.category || 'General'} · {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : ''}</div>
            </div>
          ))}
        </div>
      )}

      {/* News Grid */}
      <div className="grid grid-cols-1 items-start gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {newsItems.map((item, index) => (
          <NewsCard key={item.id} item={item} lead={index === 0} />
        ))}
      </div>
    </div>
  );

  const NewsCard = ({ item, lead = false }) => {
    const expanded = expandedIds.has(item.id);
    const body = item.content || '';
    const isLong = body.length > 160;

    const toggle = () => setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
      return next;
    });

    return (
      <article
        className={`flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ${
          lead ? 'sm:col-span-2 lg:col-span-3 border-2 border-[#FEB300]' : 'border border-slate-200'
        }`}
      >
        {item.featured_image_url && (
          <img
            src={item.featured_image_url}
            alt=""
            className={`w-full object-cover ${lead ? 'aspect-[2/1] max-h-[320px]' : 'aspect-[3/2]'}`}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <div className="flex flex-col p-5">
        {lead && (
          <span
            className="self-start mb-3 rounded-full px-2.5 py-1 font-work text-[11px] font-bold tracking-widest"
            style={{ backgroundColor: '#FEB300', color: '#6A4800' }}
          >
            LATEST
          </span>
        )}
        <div className="flex items-center gap-3 mb-3">
          {/* #FEB300 is 1.80:1 on white. The same gold darkened to #7E5700
              is 5.72:1 and still reads as the brand colour. */}
          <span className="font-work font-bold text-xs tracking-widest" style={{ color: '#7E5700' }}>
            {item.category?.toUpperCase() || 'GENERAL'}
          </span>
          <span className="font-public text-xs" style={{ color: '#64748B' }}>
            {item.published_at
              ? new Date(item.published_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
              : ''}
          </span>
        </div>
        <h4 className={`font-work font-bold leading-snug mb-2 ${lead ? 'text-xl sm:text-2xl' : 'text-lg'}`} style={{ color: '#1E3A8A' }}>
          {item.title}
        </h4>
        <p className="font-public text-sm leading-relaxed max-w-[62ch]" style={{ color: '#64748B' }}>
          {expanded || !isLong ? body : `${body.slice(0, 160)}...`}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            className="mt-3 self-start inline-flex items-center gap-1.5 font-work font-bold text-sm rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:ring-offset-2"
            style={{ color: '#003b7a' }}
          >
            {expanded ? 'Show less' : 'Read more'}
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
        </div>
      </article>
    );
  };

  // ============================================
  // FOOTER — EduScribe Dark Blue Theme
  // ============================================

  // ============================================
  // MAIN RENDER
  // ============================================
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8FAFC' }}>
      <PublicHeader isMobile={isMobile} active="News" />

      <main style={{ paddingTop: isMobile ? PUBLIC_HEADER_HEIGHT.mobile : PUBLIC_HEADER_HEIGHT.desktop }}>
        {loading ? (
          <div className="flex justify-center items-center" style={{ height: '400px' }}>
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col justify-center items-center gap-3" style={{ height: '400px' }} role="alert">
            <AlertTriangle size={28} aria-hidden="true" style={{ color: '#b91c1c' }} />
            <p className="font-public text-sm font-semibold" style={{ color: '#b91c1c' }}>
              The news could not be loaded.
            </p>
            <p className="font-public text-xs" style={{ color: '#475569' }}>{loadError}</p>
            <button
              type="button"
              onClick={fetchNews}
              className="mt-1 rounded px-4 py-2 font-work text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ backgroundColor: '#003b7a' }}
            >
              Try again
            </button>
          </div>
        ) : newsItems.length === 0 ? (
          <div className="flex justify-center items-center" style={{ height: '400px' }}>
            <p className="font-public text-sm" style={{ color: '#475569' }}>No published news yet.</p>
          </div>
        ) : (
          <>
            <LatestNewsSection />
          </>
        )}
        <PublicFooter />
      </main>
    </div>
  );
};

export default News;