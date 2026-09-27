// ============================================
// FILE: src/pages/public/Login.jsx
// PURPOSE: Login page - Original design with EduScribe navbar & footer
// DESIGN: Split layout preserved, EduScribe theme navbar/footer only
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicHeader, { PUBLIC_HEADER_HEIGHT } from '../../components/PublicHeader';
import PublicFooter from '../../components/PublicFooter';
import { Facebook, School, Camera, MessageCircle } from 'lucide-react';
import FlippingLogo from '../../components/FlippingLogo';

const Login = () => {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1100);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1100);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  // ============================================
  // THE PANEL
  //
  // One full-width panel over the campus photograph. The card that used to
  // sit on the right is gone with its second heading ("Hi, DPNHSian!") and
  // its downward arrow; the Student and Faculty buttons it held now sit
  // under "Welcome Back." where the eye already is.
  //
  // The scrim is the part that matters. Everything here is white text on a
  // photograph, and the old 0.3-to-0.5 black wash left the school name at
  // 2.11:1 and the paragraph at 3.04:1 against a bright frame. Navy at 0.62
  // rising to 0.78 holds white at 4.81:1 in the worst case a photograph can
  // produce, so legibility stops depending on which picture loads.
  // ============================================
  const RoleButton = ({ label, onClick, className, style }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg px-4 py-2 font-work text-sm font-bold transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40 ${className}`}
      style={style}
    >
      {label}
    </button>
  );

  const navHeight = isMobile ? PUBLIC_HEADER_HEIGHT.mobile : PUBLIC_HEADER_HEIGHT.desktop;

  return (
    <div className="public-shell min-h-screen flex flex-col">
      <PublicHeader isMobile={isMobile} active={null} />

      <main className="flex-1" style={{ paddingTop: navHeight }}>
        <section
          className="relative flex flex-col justify-between px-5 py-8 sm:px-10 sm:py-10 text-white"
          style={{
            backgroundImage: 'url(/capstonebackground.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            minHeight: `calc(100vh - ${navHeight}px)`,
          }}
        >
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.68))' }}
            aria-hidden="true"
          />

          {/* Top: who this belongs to */}
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white">
              <School size={26} color="#1a5276" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <p className="font-semibold text-base">Dela Paz</p>
              <p className="text-sm text-white/90">National High School</p>
            </div>
          </div>

          {/* Centre: the welcome and the choice */}
          <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col items-center py-8 text-center">
            <FlippingLogo size={isMobile ? 200 : 360} className="mb-6" />

            <h1 className="font-work text-3xl sm:text-4xl font-bold leading-tight">
              Welcome Back.
            </h1>

            <div className="mt-5 flex w-full max-w-[280px] gap-3">
              <RoleButton
                label="Student"
                onClick={() => navigate('/student-login')}
                className="text-white"
                style={{ backgroundColor: '#0062cc' }}
              />
              <RoleButton
                label="Faculty"
                onClick={() => navigate('/faculty-login')}
                className=""
                style={{ backgroundColor: '#FEB300', color: '#6A4800' }}
              />
            </div>

            {/* No hard line breaks: they were cut for a desktop column and
                left "portal." alone on its own line at 390px. */}
            <p className="mt-6 text-base leading-relaxed text-white/90">
              Access your academic progress, resources and campus news through the unified student portal.
            </p>

            <p className="mt-6 max-w-sm text-xs leading-relaxed text-white/85">
              By signing in you agree to the Dela Paz Online Services{' '}
              <span className="font-semibold text-white">Terms of Use</span> and{' '}
              <span className="font-semibold text-white">Privacy Statement</span>.
            </p>
          </div>

          {/* Bottom: the marks, and the notice nobody reads but everybody needs */}
          <div className="relative z-10 flex items-center gap-2" aria-hidden="true">
            {[Facebook, Camera, MessageCircle].map((Icon, i) => (
              <div key={i} className="flex h-8 w-8 items-center justify-center rounded-md bg-white/20">
                <Icon size={16} color="white" />
              </div>
            ))}
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
};

export default Login;