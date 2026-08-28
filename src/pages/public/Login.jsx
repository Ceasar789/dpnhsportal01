// ============================================
// FILE: src/pages/public/Login.jsx
// PURPOSE: Login page - Original design with EduScribe navbar & footer
// DESIGN: Split layout preserved, EduScribe theme navbar/footer only
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Facebook, BookOpen, Globe, Users, School, Camera, MessageCircle, Search } from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth > 900);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1100);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth > 900);
      setIsMobile(window.innerWidth < 1100);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
          <NavLink title="Home" isActive={false} route="/" />
          <NavLink title="News" isActive={false} route="/news" />
          <NavLink title="Calendar" isActive={false} route="/calendar" />
          
        </div>
      ) : (
        <button className="p-2">
          <Menu size={28} color="#FFFFFF" />
        </button>
      )}
    </nav>
  );

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
  // LEFT PANEL — ORIGINAL with background image
  // ============================================
  const LeftPanel = () => (
    <div 
      className="relative flex flex-col justify-between p-10 text-white"
      style={{
        backgroundImage: 'url(/capstonebackground.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: isDesktop ? 'calc(100vh - 90px)' : '400px'
      }}
    >
      {/* Dark overlay */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.5))'
        }}
      />

      {/* Top Content */}
      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
            <School size={30} color="#1a5276" />
          </div>
          <div>
            <p className="font-semibold text-base">Dela Paz</p>
            <p className="font-normal text-sm">National High School</p>
          </div>
        </div>
      </div>

      {/* Center Logo */}
      <div className="relative z-20 flex flex-col items-center justify-center">
        <div 
          className="rounded-full bg-cover bg-center mb-8"
          style={{ 
            width: '380px',
            height: '380px',
            backgroundImage: 'url(/capstonelogo.png)'
          }}
        />
        <h2 className="text-4xl font-bold leading-tight mb-4 text-center">
          Welcome Back.
        </h2>
        <p className="text-base leading-relaxed text-white/90 text-center">
          Access your academic progress, resources,<br />
          and campus news through the unified student<br />
          portal.
        </p>
      </div>

      {/* Bottom Content */}
      <div className="relative z-10 flex items-center gap-2">
        <div className="w-8 h-8 bg-white/20 rounded-md flex items-center justify-center">
          <Facebook size={16} color="white" />
        </div>
        <div className="w-8 h-8 bg-white/20 rounded-md flex items-center justify-center">
          <Camera size={16} color="white" />
        </div>
        <div className="w-8 h-8 bg-white/20 rounded-md flex items-center justify-center">
          <MessageCircle size={16} color="white" />
        </div>
        <div className="w-4" />
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20">
          <Users size={16} color="white" />
          <span className="text-xs font-medium">JOIN 5,550+ ACTIVE STUDENTS</span>
        </div>
      </div>
    </div>
  );

  // ============================================
  // RIGHT PANEL — ORIGINAL design preserved
  // ============================================
  const RightPanel = () => (
    <div className="flex flex-col items-center justify-center px-8 py-10" style={{ backgroundColor: '#F8F9FA', minHeight: isDesktop ? 'calc(100vh - 90px)' : 'auto' }}>
      <div className="w-full max-w-sm bg-white p-8" style={{ borderRadius: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <div className="w-full">
        {/* Title and description */}
        <div className="flex flex-col items-center mb-8">
          <h2 className="text-3xl font-bold mb-3" style={{ 
            background: 'linear-gradient(90deg, #FEB300 0%, #00D4FF 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Hi, DPNHSian!
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="text-sm" style={{ color: '#6B7280' }}>↓</span>
            <span className="text-sm" style={{ color: '#6B7280' }}>
              Please click or tap your destination.
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-4 mt-10">
          <button
            onClick={() => navigate('/student-login')}
            className="w-full h-10 rounded-3xl font-medium text-lg text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#007bff' }}
          >
            Student
          </button>

          <button
            onClick={() => navigate('/faculty-login')}
            className="w-full h-10 rounded-3xl font-medium text-lg hover:opacity-90 transition-opacity"
            style={{ backgroundColor: 'rgb(246, 242, 14)', color: '#2c3e50' }}
          >
            Faculty
          </button>
        </div>

        {/* Terms */}
        <p className="text-center text-xs leading-relaxed mt-8" style={{ color: '#6B7280' }}>
          By using this service, you understood and agree to the Dela Paz Online Services{' '}
          <span className="font-medium" style={{ color: '#007bff' }}>Terms of Use</span>
          {' '}and{' '}
          <span className="font-medium" style={{ color: '#007bff' }}>Privacy Statement</span>
        </p>
      </div>
      </div>
    </div>
  );

  // ============================================
  // FOOTER — EduScribe Dark Blue Theme, original text
  // ============================================
  const Footer = () => (
    <footer className="w-full" style={{ backgroundColor: '#003b7a', padding: '65px 48px 32px' }}>
      <div className="flex flex-wrap justify-between gap-8 mb-10">
        <div style={{ width: '200px' }}>
          <h4 className="font-work font-bold text-lg mb-4" style={{ color: '#FFFFFF' }}>
            Dela Paz National High School
          </h4>
          <p className="font-public text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>
            Dedicated to excellence in education and community empowerment since its founding.
          </p>
        </div>

        <div style={{ width: '150px' }}>
          <h5 className="font-work font-bold text-xs tracking-widest mb-6" style={{ color: '#FEB300' }}>
            RESOURCES
          </h5>
          {['Faculty Portal', 'Alumni', 'Careers'].map(link => (
            <p key={link} className="font-public text-sm mb-4" style={{ color: '#cbd5e1' }}>
              {link}
            </p>
          ))}
        </div>

        <div style={{ width: '150px' }}>
          <h5 className="font-work font-bold text-xs tracking-widest mb-6" style={{ color: '#FEB300' }}>
            SUPPORT
          </h5>
          {['Privacy Policy', 'Terms of Service'].map(link => (
            <p key={link} className="font-public text-sm mb-4" style={{ color: '#cbd5e1' }}>
              {link}
            </p>
          ))}
        </div>

        <div style={{ width: '260px' }}>
          <h5 className="font-work font-bold text-xs tracking-widest mb-6" style={{ color: '#FEB300' }}>
            CONTACT
          </h5>
          <div className="flex items-center gap-2 mb-3">
            <span style={{ color: '#94a3b8' }}>📍</span>
            <span className="font-public text-sm" style={{ color: '#cbd5e1' }}>R. Dela Paz St., Pasig City</span>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span style={{ color: '#94a3b8' }}>📞</span>
            <span className="font-public text-sm" style={{ color: '#cbd5e1' }}>(02) 8641-XXXX</span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: '#94a3b8' }}>✉</span>
            <span className="font-public text-sm" style={{ color: '#cbd5e1' }}>info@delapaz.edu.ph</span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t mb-8" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />

      {/* Bottom */}
      <div className="flex justify-between items-center flex-wrap gap-4">
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
    <div className="min-h-screen flex flex-col">
      <TopNavBar />
      
      <main className="flex-1 pt-[90px]">
        {isDesktop ? (
          <div className="flex">
            <div className="flex-1">
              <LeftPanel />
            </div>
            <div className="flex-1">
              <RightPanel />
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <LeftPanel />
            <RightPanel />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Login;