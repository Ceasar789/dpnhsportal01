// ============================================
// FILE: src/components/PublicHeader.jsx
// The header for the four public pages.
//
// It lived four times over — once in Home, News, Calendar and Login — which
// is why the same fix kept being applied four times, and why rebuilding it
// on Home alone left the other three with a hamburger and a 90px bar while
// Home had neither. One copy, one height, one set of links.
// ============================================

import React from 'react';
import { Link, useLocation } from 'react-router-dom';

// A phone gets two rows: the brand, then the links. No hamburger — the three
// destinations stay on screen rather than hiding behind an icon.
export const PUBLIC_HEADER_HEIGHT = { mobile: 118, desktop: 90 };

// Links, not buttons: this is the only navigation left on the public pages
// now that the footer's copy is gone, so it has to be openable in a new tab
// and readable as navigation by a screen reader.
const NavLink = ({ title, route, active, compact = false }) => (
  <Link
    to={route}
    aria-current={active ? 'page' : undefined}
    className={`${compact ? 'px-1.5' : 'px-1'} py-2 flex flex-col items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FEB300] focus-visible:ring-offset-2 focus-visible:ring-offset-[#003b7a]`}
  >
    <span className={`font-work text-white ${compact ? 'text-xs' : 'text-sm'}`} style={{ fontWeight: active ? 700 : 500 }}>
      {title}
    </span>
    {active && <div className="mt-0.5 h-0.5 w-5 rounded-full" style={{ backgroundColor: '#FEB300' }} />}
  </Link>
);

const PublicHeader = ({ isMobile, active }) => {
  // The Login link points at /login. On /login it points at the page the
  // visitor is already reading, so it is not offered there.
  const onLoginPage = useLocation().pathname === '/login';

  const Brand = ({ logo, title, subtitle }) => (
    <Link
      to="/"
      aria-label="EduScribe home"
      className="flex shrink-0 items-center rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FEB300] focus-visible:ring-offset-2 focus-visible:ring-offset-[#003b7a]"
    >
      <img src="/capstonelogo.png" alt="" style={{ height: logo, borderRadius: '50%' }} />
      <span className="ml-2 flex flex-col justify-center sm:ml-3">
        <span className={`font-work font-bold tracking-tight leading-none ${title}`}>
          <span style={{ color: '#FEB300' }}>Edu</span>
          <span style={{ color: '#00D4FF' }}>Scribe</span>
        </span>
        {subtitle && (
          <span className={`font-work mt-0.5 ${subtitle}`} style={{ color: 'rgba(255,255,255,0.85)' }}>
            Dela Paz National High School
          </span>
        )}
      </span>
    </Link>
  );

  const LoginButton = ({ className }) => (
    <Link
      to="/login"
      className={`font-work font-semibold text-white rounded-lg text-center hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#003b7a] ${className}`}
      style={{ backgroundColor: '#22c55e' }}
    >
      Login
    </Link>
  );

  const links = [['Home', '/'], ['News', '/news'], ['Calendar', '/calendar']];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        height: isMobile ? PUBLIC_HEADER_HEIGHT.mobile : PUBLIC_HEADER_HEIGHT.desktop,
        backgroundColor: '#003b7a',
      }}
    >
      {isMobile ? (
        <div className="flex h-full flex-col justify-center gap-1.5 px-4">
          <Brand logo="38px" title="text-lg" subtitle="text-[11px]" />
          <div className="flex items-center gap-1">
            {links.map(([title, route]) => (
              <NavLink key={route} title={title} route={route} active={active === title} compact />
            ))}
            {!onLoginPage && <LoginButton className="ml-auto px-4 py-1 text-xs" />}
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-between px-8">
          <Brand logo="60px" title="text-2xl" subtitle="text-xs" />
          <div className="flex items-center gap-8">
            {links.map(([title, route]) => (
              <NavLink key={route} title={title} route={route} active={active === title} />
            ))}
            {!onLoginPage && <LoginButton className="px-8 py-2.5" />}
          </div>
        </div>
      )}
    </nav>
  );
};

export default PublicHeader;
