// ============================================
// FILE: src/pages/public/Home.jsx
// PURPOSE: Home/Landing page - EXACT match to Flutter HomePage
// DESIGN: Hero carousel, vision card, auto-slide, footer
// ============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { School, Facebook, BookOpen, Globe, Users, MapPin, Mail, Phone, Pause, Play } from 'lucide-react';

const Home = () => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  // Two rows on a phone (brand over links), one row on a desktop.
  const navHeight = isMobile ? 124 : 90;
  const [paused, setPaused] = useState(false);
  const autoSlideRef = useRef(null);

  // The carousel advances on its own, so it must honour a reduced-motion
  // preference and it must be stoppable - WCAG 2.2.2 (Pause, Stop, Hide).
  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const carouselImages = [
    '/capstonebackground.jpg',
    '/capstoneimage1.jpg',
    '/capstoneimage2.jpg',
    '/capstoneimage3.jpg',
  ];

  // Check mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1100);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto slide carousel - FIXED: uses useCallback for stable reference
  const startAutoSlide = useCallback(() => {
    if (reduceMotion || paused) return;
    autoSlideRef.current = setTimeout(() => {
      setCurrentPage((prev) => (prev + 1) % carouselImages.length);
    }, 4000);
  }, [carouselImages.length, reduceMotion, paused]);

  useEffect(() => {
    startAutoSlide();
    return () => clearTimeout(autoSlideRef.current);
  }, [currentPage, startAutoSlide]);

  // ============================================
  // TOP NAVIGATION BAR - UPDATED: EduScribe Theme
  // ============================================
  const Brand = ({ logo, title, subtitle }) => (
    <button
      type="button"
      onClick={() => navigate('/')}
      aria-label="EduScribe home"
      className="flex items-center rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FEB300] focus-visible:ring-offset-2 focus-visible:ring-offset-[#003b7a]"
    >
      <img src="/capstonelogo.png" alt="" style={{ height: logo, borderRadius: '50%' }} />
      <span className="ml-3 flex flex-col justify-center">
        <span className={`font-work font-bold tracking-tight leading-none ${title}`}>
          <span style={{ color: '#FEB300' }}>Edu</span>
          <span style={{ color: '#00D4FF' }}>Scribe</span>
        </span>
        <span className={`font-work mt-0.5 ${subtitle}`} style={{ color: 'rgba(255,255,255,0.85)' }}>
          Dela Paz National High School
        </span>
      </span>
    </button>
  );

  const LoginButton = ({ className }) => (
    <button
      onClick={() => navigate('/login')}
      className={`font-work font-semibold text-white rounded-lg hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#003b7a] ${className}`}
      style={{ backgroundColor: '#22c55e' }}
    >
      Login
    </button>
  );

  const TopNavBar = () => (
    <nav
      className="fixed top-0 left-0 right-0 z-50"
      style={{ height: navHeight, backgroundColor: '#003b7a' }}
    >
      {isMobile ? (
        // Two rows rather than a hamburger: the three destinations stay on
        // screen instead of hiding behind an icon the visitor has to guess at.
        <div className="flex h-full flex-col justify-center gap-2 px-5">
          <Brand logo="40px" title="text-xl" subtitle="text-[11px]" />
          <div className="flex items-center gap-1">
            <NavLink title="Home" isActive={true} route="/" />
            <NavLink title="News" isActive={false} route="/news" />
            <NavLink title="Calendar" isActive={false} route="/calendar" />
            <LoginButton className="ml-auto px-5 py-1.5 text-sm" />
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-between px-8">
          <Brand logo="60px" title="text-2xl" subtitle="text-xs" />
          <div className="flex items-center gap-8">
            <NavLink title="Home" isActive={true} route="/" />
            <NavLink title="News" isActive={false} route="/news" />
            <NavLink title="Calendar" isActive={false} route="/calendar" />
            <LoginButton className="px-8 py-2.5" />
          </div>
        </div>
      )}
    </nav>
  );

  // ============================================
  // NAV LINK COMPONENT - UPDATED: White text
  // ============================================
  const NavLink = ({ title, isActive, route }) => (
    <button
      onClick={() => navigate(route)}
      className="px-1 py-2 flex flex-col items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FEB300] focus-visible:ring-offset-2 focus-visible:ring-offset-[#003b7a]"
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
  // HERO SECTION - FIXED CAROUSEL
  // ============================================
  const HeroSection = () => (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: `min(870px, calc(100vh - ${navHeight}px))`, minHeight: '560px' }}
    >
      {/* Carousel Images - FIXED: minWidth instead of w-full, removed overflow-hidden from track */}
      <div 
        className="absolute inset-0 flex transition-transform duration-700 ease-in-out"
        style={{ 
          transform: `translateX(-${currentPage * 100}%)`,
          willChange: 'transform'
        }}
      >
        {carouselImages.map((img, index) => (
          <div 
            key={index}
            className="h-full flex-shrink-0"
            style={{ 
              minWidth: '100%',        // FIXED: ensures each slide is exactly 100% width
              backgroundImage: `url(${img})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          />
        ))}
      </div>

      {/* Gradient Overlay */}
      <div 
        className="absolute inset-0"
        style={{
          background: isMobile
            ? 'linear-gradient(to bottom, rgba(0,29,78,0.30) 0%, rgba(0,29,78,0.72) 45%, rgba(0,29,78,0.88) 100%)'
            : 'linear-gradient(to right, rgba(0,29,78,0.9) 0%, rgba(0,29,78,0.4) 50%, transparent 100%)'
        }}
      />

      {/* Hero Content */}
      <div 
        className="relative z-10 flex flex-col justify-center h-full"
        style={{ paddingLeft: isMobile ? '24px' : '60px', paddingRight: isMobile ? '24px' : '60px' }}
      >
        {/* Headline - UPDATED */}
        <h2 
          className="font-work font-bold text-white leading-tight tracking-tight text-[34px] sm:text-[44px] lg:text-[72px]"
          style={{ letterSpacing: '-0.03em' }}
        >
          Welcome to<br />
          <span style={{ color: '#FEB300' }}>Edu</span>
          <span style={{ color: '#00D4FF' }}>Scribe</span>
          {' '}Portal
        </h2>

        {/* Spacer */}
        <div style={{ height: isMobile ? '32px' : '76px' }} />

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4">
          <button
            onClick={() => navigate('/student-login')}
            className="font-work font-bold text-sm tracking-widest px-8 py-4 rounded hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            style={{ 
              backgroundColor: '#FEB300', 
              color: '#6A4800',
              width: isMobile ? '100%' : '250px',
              height: '58px',
              boxShadow: '0 20px 25px rgba(126,87,0,0.2)'
            }}
          >
            Student Portal
          </button>

          <button
            onClick={() => document.getElementById('vision')?.scrollIntoView({
              behavior: reduceMotion ? 'auto' : 'smooth'
            })}
            className="flex items-center justify-center gap-2 px-5 py-4 rounded border-2 border-white text-white font-work font-bold tracking-widest hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            style={{ height: '58px', width: isMobile ? '100%' : undefined }}
          >
            About us
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      {/* Carousel Indicators */}
      <div 
        className="absolute bottom-30 z-20 flex items-center gap-1"
        style={{ left: isMobile ? '20px' : '60px', bottom: '120px' }}
        role="group"
        aria-label="Carousel controls"
      >
        {carouselImages.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => {
              clearTimeout(autoSlideRef.current);
              setCurrentPage(index);
            }}
            aria-label={`Show slide ${index + 1} of ${carouselImages.length}`}
            aria-current={currentPage === index ? 'true' : undefined}
            className="grid h-6 w-6 place-items-center rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          >
            <span
              className="block h-2 rounded-full transition-all duration-300"
              style={{
                width: currentPage === index ? '20px' : '8px',
                backgroundColor: currentPage === index ? '#FEB300' : 'rgba(255,255,255,0.5)'
              }}
            />
          </button>
        ))}

        {!reduceMotion && (
          <button
            type="button"
            onClick={() => setPaused(p => !p)}
            aria-label={paused ? 'Resume the slideshow' : 'Pause the slideshow'}
            className="ml-2 grid h-6 w-6 place-items-center rounded-full text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}
          >
            {paused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
          </button>
        )}
      </div>

      {/* Vision Card (Desktop only) */}
      {!isMobile && <VisionCard floating />}
    </div>
  );

  // ============================================
  // VISION CARD (Desktop only)
  // ============================================
  const VisionCard = ({ floating = false }) => (
    <div
      id="vision"
      className={floating
        ? 'absolute right-0 bottom-0 bg-white p-10'
        : 'relative bg-white p-8 mx-5 my-10 rounded-lg shadow-sm'}
      style={floating ? { width: '447px', minHeight: '438px' } : undefined}
    >
      <h3 className="font-work font-bold text-xs tracking-widest mb-8" style={{ color: '#7E5700' }}>
        OUR VISION
      </h3>

      <div className="flex gap-2.5">
        <span className="font-work font-black text-4xl leading-none" style={{ color: '#001D4E' }} aria-hidden="true">“</span>
        <p className="font-public text-lg leading-relaxed" style={{ color: '#505050' }}>
          We dream of Filipinos who passionately love their country and whose values and competencies enable them to realize their full potential and contribute meaningfully to building the nation.
          <br /><br />
          As a learner-centered public institution, the Department of Education continuously improves itself to better serve its stakeholders.
        </p>
      </div>

      <div className="absolute bottom-10 left-10 w-12 h-1" style={{ backgroundColor: '#FEB300' }} />
    </div>
  );

  // ============================================
  // FOOTER - UPDATED: Dark blue theme
  // ============================================
  const Footer = () => (
    <footer className="w-full" style={{ backgroundColor: '#003b7a', padding: '65px 48px 32px' }}>
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 mb-14 max-w-[1280px] mx-auto">
        {/* Brand */}
        <div>
          <School size={40} color="#b6c2d1" aria-hidden="true" />
          <h4 className="font-work font-bold text-lg mt-4 mb-4" style={{ color: '#FFFFFF' }}>
            DELA PAZ NHS
          </h4>
          <p className="font-public text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>
            Inspiring excellence and shaping futures through quality secondary education in a nurturing environment.
          </p>
        </div>

        {/* Navigation */}
        <div>
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
        <div>
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
        <div>
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
      <div className="border-t mb-8 max-w-[1280px] mx-auto" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />

      {/* Bottom */}
      <div className="flex flex-wrap justify-between items-center gap-4 max-w-[1280px] mx-auto">
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
    <div className="min-h-screen" style={{ backgroundColor: '#FAF8FF' }}>
      <TopNavBar />

      <main style={{ paddingTop: navHeight }}>
        <HeroSection />
        {isMobile && <VisionCard />}
        <Footer />
      </main>
    </div>
  );
};

export default Home;