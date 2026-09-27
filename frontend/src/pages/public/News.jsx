// ============================================
// FILE: src/pages/public/News.jsx
// PURPOSE: News page - EXACT match to Flutter NewsPage
// DESIGN: Hero article, latest news grid, newsletter, footer
// DATA: Live from Supabase 'news' table (admin-managed)
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicHeader, { PUBLIC_HEADER_HEIGHT } from '../../components/PublicHeader';
import { ArrowRight, ExternalLink, Facebook, Globe, Mail, School, BookOpen, Users, MapPin, Phone, AlertTriangle } from 'lucide-react';
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
  const [heroExpanded, setHeroExpanded] = useState(false);
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
      .order('published_at', { ascending: false });
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

  // Hero = most recent article, rest = remaining
  const hero = newsItems[0] || null;
  const rest = newsItems.slice(1);

  // ============================================
  // HERO SECTION
  // ============================================
  const HeroSection = () => (
    <div className="w-full pt-6 pb-4 lg:pt-10 lg:pb-10 px-5 lg:px-[100px] max-w-[1280px] mx-auto">
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <div className={hero?.featured_image_url ? 'lg:flex-[3]' : 'w-full'}>
          <HeroText />
        </div>
        {hero?.featured_image_url && (
          <div className="lg:flex-[2]">
            <HeroImage />
          </div>
        )}
      </div>
    </div>
  );

  const HeroText = () => (
    <div>
      {/* Category Badge */}
      <p className="font-work font-bold text-xs tracking-widest mb-3" style={{ color: '#7E5700' }}>
        {hero.category?.toUpperCase() || 'GENERAL'}
      </p>

      {/* Date */}
      <p className="font-public text-sm mb-4" style={{ color: '#64748B' }}>
        {hero.published_at
          ? new Date(hero.published_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
          : ''}
      </p>

      {/* Headline */}
      <h2
        className="font-work font-extrabold leading-tight mb-5 text-[32px] lg:text-[48px]"
        style={{
          color: '#1E3A8A',
          letterSpacing: '-0.02em'
        }}
      >
        {hero.title}
      </h2>

      {/* Description */}
      <p
        className="font-public text-base leading-relaxed mb-5 lg:mb-8"
        style={{ color: '#64748B', maxWidth: '500px' }}
      >
        {heroExpanded ? hero.content : `${hero.content?.slice(0, 220) || ''}${hero.content?.length > 220 ? '...' : ''}`}
      </p>

      {/* Read More Button */}
      {hero.content?.length > 220 && (
        <button
          type="button"
          onClick={() => setHeroExpanded(v => !v)}
          aria-expanded={heroExpanded}
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded font-work font-bold text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:ring-offset-2"
          style={{ backgroundColor: '#FEB300', color: '#6A4800' }}
        >
          {heroExpanded ? 'Show less' : 'Read the full Story'}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const HeroImage = () => (
    <img
      src={hero.featured_image_url}
      alt=""
      className="w-full object-cover rounded-lg h-[250px] lg:h-[400px]"
      onError={e => { e.target.src = '/capstoneimage1.jpg'; }}
    />
  );

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
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map(item => (
          <NewsCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );

  const NewsCard = ({ item }) => {
    const expanded = expandedIds.has(item.id);
    const body = item.content || '';
    const isLong = body.length > 160;

    const toggle = () => setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
      return next;
    });

    return (
      <article className="flex flex-col">
        {item.featured_image_url && (
          <img
            src={item.featured_image_url}
            alt=""
            className="w-full object-cover rounded-lg mb-4 aspect-[3/2]"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
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
        <h4 className="font-work font-bold text-lg leading-snug mb-2" style={{ color: '#1E3A8A' }}>
          {item.title}
        </h4>
        <p className="font-public text-sm leading-relaxed" style={{ color: '#64748B' }}>
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
      </article>
    );
  };

  // ============================================
  // FOOTER — EduScribe Dark Blue Theme
  // ============================================
  const Footer = () => (
    <footer className="w-full" style={{ backgroundColor: '#003b7a', padding: '65px 48px 32px' }}>
      <div className="flex flex-wrap justify-center gap-24 mb-15">
        {/* Brand */}
        <div style={{ width: '260px' }}>
          <School size={40} color="#b6c2d1" aria-hidden="true" />
          <h4 className="font-work font-bold text-lg mt-4 mb-4" style={{ color: '#FFFFFF' }}>
            DELA PAZ NHS
          </h4>
          <p className="font-public text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>
            Inspiring excellence and shaping futures through quality secondary education in a nurturing environment.
          </p>
        </div>

        {/* Navigation */}
        <div style={{ width: '150px' }}>
          <h5 className="font-work font-bold text-xs tracking-widest mb-6" style={{ color: '#FEB300' }}>
            NAVIGATION
          </h5>
          {[['Home', '/'], ['News', '/news'], ['Calendar', '/calendar']].map(([link, route]) => (
            <button
              key={link}
              type="button"
              onClick={() => navigate(route)}
              className="block mb-3 py-1 font-public text-sm text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FEB300] rounded"
              style={{ color: '#cbd5e1' }}
            >
              {link}
            </button>
          ))}
        </div>

        {/* Resources */}
        <div style={{ width: '150px' }}>
          <h5 className="font-work font-bold text-xs tracking-widest mb-6" style={{ color: '#FEB300' }}>
            RESOURCES
          </h5>
          <button
            type="button"
            onClick={() => navigate('/faculty-login')}
            className="block mb-3 py-1 font-public text-sm text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FEB300] rounded"
            style={{ color: '#cbd5e1' }}
          >
            Faculty Portal
          </button>
          {['Alumni', 'Privacy Policy', 'Terms of Service'].map(link => (
            <p key={link} className="font-public text-sm mb-4" style={{ color: '#cbd5e1' }}>
              {link}
            </p>
          ))}
        </div>

        {/* Contact */}
        <div style={{ width: '260px' }}>
          <h5 className="font-work font-bold text-xs tracking-widest mb-6" style={{ color: '#FEB300' }}>
            CONTACT US
          </h5>
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} color="#b6c2d1" aria-hidden="true" />
            <span className="font-public text-sm" style={{ color: '#cbd5e1' }}>Brgy. Dela Paz, Binan City</span>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Mail size={16} color="#b6c2d1" aria-hidden="true" />
            <span className="font-public text-sm" style={{ color: '#cbd5e1' }}>admissions@delapaznhs.edu.ph</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone size={16} color="#b6c2d1" aria-hidden="true" />
            <span className="font-public text-sm" style={{ color: '#cbd5e1' }}>(02) 8642-1234</span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t mb-8" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />

      {/* Bottom */}
      <div className="flex justify-between items-center">
        <p className="font-public text-xs" style={{ color: '#b6c2d1' }}>
          © {new Date().getFullYear()} Dela Paz National High School. All rights reserved.
        </p>
        <div className="flex gap-4" aria-hidden="true">
          <Facebook size={18} color="#b6c2d1" />
          <BookOpen size={18} color="#b6c2d1" />
          <Globe size={18} color="#b6c2d1" />
          <Users size={18} color="#b6c2d1" />
        </div>
      </div>
    </footer>
  );

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
            <HeroSection />
            {rest.length > 0 && <LatestNewsSection />}
          </>
        )}
        <Footer />
      </main>
    </div>
  );
};

export default News;