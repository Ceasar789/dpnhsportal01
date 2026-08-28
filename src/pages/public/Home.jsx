// ============================================
// FILE: src/pages/public/Home.jsx
// PURPOSE: Home/Landing page - EXACT match to Flutter HomePage
// DESIGN: Hero carousel, vision card, auto-slide, footer
// ============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, School, Facebook, BookOpen, Globe, Users } from 'lucide-react';

const Home = () => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const autoSlideRef = useRef(null);

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
    autoSlideRef.current = setTimeout(() => {
      setCurrentPage((prev) => (prev + 1) % carouselImages.length);
    }, 4000);
  }, [carouselImages.length]);

  useEffect(() => {
    startAutoSlide();
    return () => clearTimeout(autoSlideRef.current);
  }, [currentPage, startAutoSlide]);

  // ============================================
  // TOP NAVIGATION BAR - UPDATED: EduScribe Theme
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
          <NavLink title="Home" isActive={true} route="/" />
          <NavLink title="News" isActive={false} route="/news" />
          <NavLink title="Calendar" isActive={false} route="/calendar" />
          
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

  // ============================================
  // NAV LINK COMPONENT - UPDATED: White text
  // ============================================
  const NavLink = ({ title, isActive, route }) => (
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
  // HERO SECTION - FIXED CAROUSEL
  // ============================================
  const HeroSection = () => (
    <div className="relative w-full overflow-hidden" style={{ height: '870px' }}>
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
          background: 'linear-gradient(to right, rgba(0,29,78,0.9) 0%, rgba(0,29,78,0.4) 50%, transparent 100%)'
        }}
      />

      {/* Hero Content */}
      <div 
        className="relative z-10 flex flex-col justify-center h-full"
        style={{ paddingLeft: isMobile ? '20px' : '60px', paddingRight: isMobile ? '20px' : '60px' }}
      >
        {/* Headline - UPDATED */}
        <h2 
          className="font-work font-bold text-white leading-none tracking-tight"
          style={{ fontSize: isMobile ? '48px' : '72px', letterSpacing: '-3.6px' }}
        >
          Welcome to<br />Edu Scribe Portal
        </h2>

        {/* Spacer */}
        <div className="h-19" style={{ height: '76px' }} />

        {/* CTA Buttons */}
        <div className="flex flex-wrap gap-4">
          <button
            onClick={() => navigate('/admission')}
            className="font-work font-bold text-sm tracking-widest px-8 py-4 rounded hover:opacity-90 transition-opacity"
            style={{ 
              backgroundColor: '#FEB300', 
              color: '#6A4800',
              width: '250px',
              height: '58px',
              boxShadow: '0 20px 25px rgba(126,87,0,0.2)'
            }}
          >
            Apply for Admission
          </button>

          <button
            onClick={() => navigate('/academics')}
            className="flex items-center gap-2 px-5 py-4 rounded border-2 border-white text-white font-work font-bold tracking-widest hover:bg-white/10 transition-colors"
            style={{ height: '58px' }}
          >
            About us
            <span>→</span>
          </button>
        </div>
      </div>

      {/* Carousel Indicators */}
      <div 
        className="absolute bottom-30 flex gap-2"
        style={{ left: isMobile ? '20px' : '60px', bottom: '120px' }}
      >
        {carouselImages.map((_, index) => (
          <button
            key={index}
            onClick={() => {
              clearTimeout(autoSlideRef.current);
              setCurrentPage(index);
            }}
            className="h-2 rounded-full transition-all duration-300 cursor-pointer"
            style={{
              width: currentPage === index ? '24px' : '8px',
              backgroundColor: currentPage === index ? '#FEB300' : 'rgba(255,255,255,0.5)'
            }}
          />
        ))}
      </div>

      {/* Vision Card (Desktop only) */}
      {!isMobile && <VisionCard />}
    </div>
  );

  // ============================================
  // VISION CARD (Desktop only)
  // ============================================
  const VisionCard = () => (
    <div 
      className="absolute right-0 bottom-0 bg-white p-10"
      style={{ width: '447px', height: '438px' }}
    >
      <h3 className="font-work font-bold text-xs tracking-widest mb-8" style={{ color: '#7E5700' }}>
        OUR VISION
      </h3>

      <div className="flex gap-2.5">
        <span className="font-work font-black text-2xl" style={{ color: '#001D4E' }}>II</span>
        <p className="font-lato text-lg leading-relaxed" style={{ color: '#505050' }}>
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
    <div className="min-h-screen" style={{ backgroundColor: '#FAF8FF' }}>
      <TopNavBar />

      <main className="pt-[90px]">
        <HeroSection />
        <Footer />
      </main>
    </div>
  );
};

export default Home;