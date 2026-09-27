// ============================================
// FILE: src/pages/public/Login.jsx
// PURPOSE: Login page - Original design with EduScribe navbar & footer
// DESIGN: Split layout preserved, EduScribe theme navbar/footer only
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicHeader, { PUBLIC_HEADER_HEIGHT } from '../../components/PublicHeader';
import PublicFooter from '../../components/PublicFooter';
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
  // THE CHOICE
  //
  // This page has one job: send a visitor to the student login or the
  // faculty login. It used to be a two-panel split — a photo, a 380px
  // flipping logo and a welcome on the left, the two buttons in a card on
  // the right — which on a 390px phone put the buttons at y=1067 against an
  // 844px screen. The entire purpose of the page was 223px below the fold.
  //
  // One centred card now, with the choice directly under the welcome. The
  // photograph becomes a backdrop rather than a column, so the text sits on
  // white instead of over whatever the picture happens to be: the old left
  // panel measured 2.11:1 to 3.04:1 against a bright photo.
  // ============================================
  const RoleButton = ({ label, detail, onClick, className, style }) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl px-5 py-3.5 text-left transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${className}`}
      style={style}
    >
      <span className="block font-work text-lg font-bold leading-tight">{label}</span>
      <span className="block text-xs opacity-80">{detail}</span>
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader isMobile={isMobile} active={null} />

      <main
        className="flex-1 relative flex items-center justify-center px-5 py-10 sm:py-14"
        style={{ paddingTop: (isMobile ? PUBLIC_HEADER_HEIGHT.mobile : PUBLIC_HEADER_HEIGHT.desktop) + 40 }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(/capstonebackground.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          aria-hidden="true"
        />
        {/* The card carries the text, so this scrim is for legibility of the
            card's edge against the photo, not for text on top of it. */}
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,29,78,0.72)' }} aria-hidden="true" />

        <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col items-center text-center">
            <FlippingLogo size={104} className="mb-4" />
            <h1 className="font-work text-2xl sm:text-3xl font-bold" style={{ color: '#1a2b4a' }}>
              Welcome Back.
            </h1>
            <p className="mt-2 text-sm" style={{ color: '#4B5563' }}>
              Choose where you are signing in.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <RoleButton
              label="Student"
              detail="Grades, tasks and announcements"
              onClick={() => navigate('/student-login')}
              className="text-white focus-visible:ring-[#0062cc]"
              style={{ backgroundColor: '#0062cc' }}
            />
            <RoleButton
              label="Faculty and staff"
              detail="Teachers, registrar and administrators"
              onClick={() => navigate('/faculty-login')}
              className="focus-visible:ring-[#1a2b4a]"
              style={{ backgroundColor: '#f1f5f9', color: '#1a2b4a', border: '1px solid #cbd5e1' }}
            />
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed" style={{ color: '#4B5563' }}>
            By using this service you agree to the Dela Paz Online Services
            {' '}<span className="font-semibold">Terms of Use</span>
            {' '}and{' '}<span className="font-semibold">Privacy Statement</span>.
          </p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

export default Login;