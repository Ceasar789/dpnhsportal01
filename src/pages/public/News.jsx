// ============================================
// FILE: src/pages/public/News.jsx
// PURPOSE: News page - EXACT match to Flutter NewsPage
// DESIGN: Hero article, latest news grid, newsletter, footer
// DATA: Live from Supabase 'news' table (admin-managed)
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Menu, ArrowRight, ExternalLink, Facebook, Globe, Mail, School, BookOpen, Users } from 'lucide-react';
import { supabase } from '../../config/supabase';

const News = () => {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(false);
  const [newsItems, setNewsItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1100);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetchNews();

    // Real-time: auto-refresh when admin adds/edits/deletes news
    const channel = supabase
      .channel('public-news')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'news' }, () => {
        fetchNews();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const fetchNews = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .eq('status', 'Published')
      .order('published_at', { ascending: false });
    if (!error && data) setNewsItems(data);
    setLoading(false);
  };

  // Hero = most recent article, rest = remaining
  const hero = newsItems[0] || null;
  const rest = newsItems.slice(1);

  // ============================================
  // TOP NAVIGATION BAR — EduScribe Theme
  // ============================================
  const TopNavBar = () => (
    <nav 
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 lg:px-8" 
      style={{ 
        height: '90px', 
        backgroundColor: '#003b7a',
        paddingLeft: isMobile ? '16px' : '32px', 
        paddingRight: isMobile ? '16px' : '32px' 
      }}
    >
      {/* Logo + EduScribe Branding */}
      <div className="flex items-center cursor-pointer" onClick={() => navigate('/')}>
        <img 
          src="/capstonelogo.png" 
          alt="DPNHS Logo" 
          style={{ height: isMobile ? '50px' : '60px', borderRadius: '50%' }} 
        />
        {!isMobile && (
          <div className="ml-4 flex flex-col justify-center">
            <h1 className="font-work font-bold text-2xl tracking-tight leading-none">
              <span style={{ color: '#FEB300' }}>Edu</span>
              <span style={{ color: '#00D4FF' }}>Scribe</span>
            </h1>
            <span className="font-work text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.85)' }}>
              Dela Paz National High School
            </span>
          </div>
        )}
      </div>

      {/* Desktop Nav */}
      {!isMobile ? (
        <div className="flex items-center gap-8">
          <NavLink title="Home" route="/" isActive={false} />
          <NavLink title="News" route="/news" isActive={true} />
          <NavLink title="Calendar" route="/calendar" isActive={false} />
          
          <button
            onClick={() => navigate('/login')}
            className="font-work font-semibold text-white px-8 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#22c55e' }}
          >
            Login
          </button>
        </div>
      ) : (
        <button className="p-2">
          <Menu size={28} color="#FFFFFF" />
        </button>
      )}
    </nav>
  );

  const NavLink = ({ title, route, isActive }) => (
    <button
      onClick={() => navigate(route)}
      className="px-1 py-2 flex flex-col items-center"
    >
      <span
        className="font-work text-sm"
        style={{
          fontWeight: isActive ? 700 : 500,
          color: '#FFFFFF'
        }}
      >
        {title}
      </span>
      {isActive && (
        <div className="mt-0.5 h-0.5 w-5 rounded-full" style={{ backgroundColor: '#FEB300' }} />
      )}
    </button>
  );

  // ============================================
  // HERO SECTION
  // ============================================
  const HeroSection = () => (
    <div
      className="w-full pt-10 pb-10"
      style={{ paddingLeft: isMobile ? '20px' : '100px', paddingRight: isMobile ? '20px' : '100px' }}
    >
      {isMobile ? (
        <div className="flex flex-col">
          <HeroText />
          <div className="h-8" />
          <HeroImage />
        </div>
      ) : (
        <div className="flex gap-10">
          <div className="flex-[3]">
            <HeroText />
          </div>
          <div className="flex-[2]">
            <HeroImage />
          </div>
        </div>
      )}
    </div>
  );

  const HeroText = () => (
    <div>
      {/* Category Badge */}
      <div
        className="inline-block px-3 py-1 rounded-sm mb-4"
        style={{ backgroundColor: 'rgba(254,179,0,0.15)' }}
      >
        <span className="font-work font-bold text-xs tracking-widest" style={{ color: '#7E5700' }}>
          {hero.category?.toUpperCase() || 'CAMPUS LIFE'}
        </span>
      </div>

      {/* Date */}
      <p className="font-public text-sm mb-4" style={{ color: '#64748B' }}>
        {hero.published_at
          ? new Date(hero.published_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
          : ''}
      </p>

      {/* Headline */}
      <h2
        className="font-work font-extrabold leading-tight mb-5"
        style={{
          color: '#1E3A8A',
          fontSize: isMobile ? '32px' : '48px',
          letterSpacing: '-1.5px'
        }}
      >
        {hero.title}
      </h2>

      {/* Description */}
      <p
        className="font-public text-base leading-relaxed mb-8"
        style={{ color: '#64748B', maxWidth: '500px' }}
      >
        {hero.content?.slice(0, 220)}{hero.content?.length > 220 ? '...' : ''}
      </p>

      {/* Read More Button */}
      <button
        className="inline-flex items-center gap-2 px-6 py-3.5 rounded font-work font-bold text-sm"
        style={{ backgroundColor: '#FEB300', color: '#6A4800' }}
      >
        Read the full Story
        <ArrowRight size={16} />
      </button>
    </div>
  );

  const HeroImage = () => (
    <img
      src={hero.image_url || '/capstoneimage1.jpg'}
      alt={hero.title}
      className="w-full object-cover rounded-lg"
      style={{ height: isMobile ? '250px' : '400px' }}
      onError={e => { e.target.src = '/capstoneimage1.jpg'; }}
    />
  );

  // ============================================
  // LATEST NEWS SECTION
  // ============================================
  const LatestNewsSection = () => (
    <div
      className="w-full py-15"
      style={{
        paddingLeft: isMobile ? '20px' : '100px',
        paddingRight: isMobile ? '20px' : '100px',
        paddingTop: '60px',
        paddingBottom: '60px'
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-end mb-10">
        <div>
          <div className="w-10 h-1 mb-4" style={{ backgroundColor: '#FEB300' }} />
          <h3 className="font-work font-extrabold text-3xl tracking-tight" style={{ color: '#1E3A8A' }}>
            Latest News
          </h3>
        </div>
        <button className="flex items-center gap-1.5 font-work font-bold text-xs tracking-widest" style={{ color: '#64748B' }}>
          BROWSE ALL ARTICLES
          <ExternalLink size={14} />
        </button>
      </div>

      {/* News Grid */}
      {isMobile ? (
        <div className="flex flex-col gap-6">
          {rest.map(item => (
            <NewsCard
              key={item.id}
              image={item.image_url || '/capstoneimage1.jpg'}
              category={item.category?.toUpperCase() || 'GENERAL'}
              date={item.published_at ? new Date(item.published_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
              title={item.title}
              description={item.content?.slice(0, 160) + (item.content?.length > 160 ? '...' : '')}
            />
          ))}
        </div>
      ) : (
        <div className="flex gap-6">
          {rest.slice(0, 3).map(item => (
            <div key={item.id} className="flex-1">
              <NewsCard
                image={item.image_url || '/capstoneimage1.jpg'}
                category={item.category?.toUpperCase() || 'GENERAL'}
                date={item.published_at ? new Date(item.published_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
                title={item.title}
                description={item.content?.slice(0, 160) + (item.content?.length > 160 ? '...' : '')}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Exact original NewsCard design — props now come from Supabase
  const NewsCard = ({ image, category, date, title, description }) => (
    <div className="flex flex-col">
      <img
        src={image}
        alt={title}
        className="w-full object-cover rounded-lg mb-4"
        style={{ height: '200px' }}
        onError={e => { e.target.src = '/capstoneimage1.jpg'; }}
      />
      <div className="flex items-center gap-3 mb-3">
        <span className="font-work font-bold text-xs tracking-widest" style={{ color: '#FEB300' }}>
          {category}
        </span>
        <span className="font-public text-xs" style={{ color: '#94A3B8' }}>
          {date}
        </span>
      </div>
      <h4 className="font-work font-bold text-lg leading-snug mb-2" style={{ color: '#1E3A8A' }}>
        {title}
      </h4>
      <p className="font-public text-sm leading-relaxed" style={{ color: '#64748B' }}>
        {description}
      </p>
    </div>
  );

  // ============================================
  // STAY CONNECTED SECTION
  // ============================================
  const StayConnectedSection = () => (
    <div
      className="mx-auto mb-16 rounded-lg p-12"
      style={{
        marginLeft: isMobile ? '20px' : '100px',
        marginRight: isMobile ? '20px' : '100px',
        backgroundColor: '#001D4E'
      }}
    >
      {isMobile ? (
        <div className="flex flex-col">
          <StayConnectedText />
          <div className="h-8" />
          <NewsletterForm />
        </div>
      ) : (
        <div className="flex justify-between items-center">
          <div className="flex-[2]">
            <StayConnectedText />
          </div>
          <div className="flex-[3]">
            <NewsletterForm />
          </div>
        </div>
      )}
    </div>
  );

  const StayConnectedText = () => (
    <div>
      <h3 className="font-work font-extrabold text-2xl tracking-tight text-white mb-4">
        STAY CONNECTED.
      </h3>
      <p className="font-public text-sm leading-relaxed" style={{ color: '#94A3B8', maxWidth: '350px' }}>
        Subscribe to our weekly editorial digest to receive the latest academic journals, campus events, and administrative updates directly in your inbox.
      </p>
    </div>
  );

  const NewsletterForm = () => (
    <div className="flex gap-3">
      <div
        className="flex-1 h-12 px-4 rounded flex items-center"
        style={{
          backgroundColor: '#0F2D5E',
          border: '1px solid #1E3A8A'
        }}
      >
        <input
          type="email"
          placeholder="Enter your academic email"
          className="w-full bg-transparent text-white text-sm outline-none placeholder-gray-500"
        />
      </div>
      <button
        className="px-6 py-3.5 rounded font-work font-bold text-sm"
        style={{ backgroundColor: '#FEB300', color: '#6A4800' }}
      >
        Join Circular
      </button>
    </div>
  );

  // ============================================
  // FOOTER — EduScribe Dark Blue Theme
  // ============================================
  const Footer = () => (
    <footer className="w-full" style={{ backgroundColor: '#003b7a', padding: '65px 48px 32px' }}>
      <div className="flex flex-wrap justify-center gap-24 mb-15">
        {/* Brand */}
        <div style={{ width: '260px' }}>
          <School size={40} color="#94a3b8" />
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
          {['Home', 'News', 'Calendar'].map(link => (
            <p key={link} className="font-public text-sm mb-4" style={{ color: '#cbd5e1' }}>
              {link}
            </p>
          ))}
        </div>

        {/* Resources */}
        <div style={{ width: '150px' }}>
          <h5 className="font-work font-bold text-xs tracking-widest mb-6" style={{ color: '#FEB300' }}>
            RESOURCES
          </h5>
          {['Faculty Portal', 'Alumni', 'Privacy Policy', 'Terms of Service'].map(link => (
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
            <span style={{ color: '#94a3b8' }}>📍</span>
            <span className="font-public text-sm" style={{ color: '#cbd5e1' }}>Brgy. Dela Paz, Binan City</span>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span style={{ color: '#94a3b8' }}>✉</span>
            <span className="font-public text-sm" style={{ color: '#cbd5e1' }}>admissions@delapaznhs.edu.ph</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: '#94a3b8' }}>📞</span>
            <span className="font-public text-sm" style={{ color: '#cbd5e1' }}>(02) 8642-1234</span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t mb-8" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />

      {/* Bottom */}
      <div className="flex justify-between items-center">
        <p className="font-public text-xs" style={{ color: '#94a3b8' }}>
          © 2024 Dela Paz National High School. All rights reserved.
        </p>
        <div className="flex gap-4">
          <Facebook size={18} color="#94a3b8" />
          <BookOpen size={18} color="#94a3b8" />
          <Globe size={18} color="#94a3b8" />
          <Users size={18} color="#94a3b8" />
        </div>
      </div>
    </footer>
  );

  // ============================================
  // MAIN RENDER
  // ============================================
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8FAFC' }}>
      <TopNavBar />

      <main className="pt-[90px]">
        {loading ? (
          <div className="flex justify-center items-center" style={{ height: '400px' }}>
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : newsItems.length === 0 ? (
          <div className="flex justify-center items-center" style={{ height: '400px' }}>
            <p className="font-public text-sm" style={{ color: '#94A3B8' }}>No published news yet.</p>
          </div>
        ) : (
          <>
            <HeroSection />
            {rest.length > 0 && <LatestNewsSection />}
          </>
        )}
        <StayConnectedSection />
        <Footer />
      </main>
    </div>
  );
};

export default News;