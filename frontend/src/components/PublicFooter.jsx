// ============================================
// FILE: src/components/PublicFooter.jsx
// The footer for the four public pages.
//
// Like the header, it was pasted into each of them, and the copies had
// drifted: Home carried a grid while News, Calendar and Login still floated
// fixed-width columns with justify-center, so on a phone the columns stacked
// at different left edges — NAVIGATION at x=120, CONTACT US at x=65 — and
// read as a zigzag. Login had its own third column too.
// ============================================

import React from 'react';
import { Link } from 'react-router-dom';
import { School, Facebook, MapPin, Mail, Phone } from 'lucide-react';
import '../styles/phone-tap.css';

const LINK = 'block mb-3 py-1 font-public text-sm text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FEB300]';
// A contact line that is a link: the same focus ring, and a 40px tap height on phones.
const CONTACT_LINK = 'flex items-start gap-2 mb-3 max-md:min-h-10 max-md:items-center hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FEB300]';
const FACEBOOK_URL = 'https://www.facebook.com/DelaPazNationalHS';
const MAP_URL = 'https://share.google/sRx85lq4zhIe5o27t';
const SCHOOL_EMAIL = '307915@deped.gov.ph';

const PublicFooter = () => {
  return (
    <footer
      className="w-full"
      style={{
        backgroundColor: '#002a57',
        borderTop: '1px solid rgba(255,255,255,0.14)',
        padding: '48px 24px 32px',
      }}
    >
      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3 mb-12 max-w-[1280px] mx-auto">
        <div>
          <School size={40} color="#b6c2d1" aria-hidden="true" />
          <h4 className="font-work font-bold text-lg mt-4 mb-4" style={{ color: '#FFFFFF' }}>
            DELA PAZ NHS
          </h4>
          <p className="font-public text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>
            Inspiring excellence and shaping futures through quality secondary education in a nurturing environment.
          </p>
        </div>

        <div>
          <h5 className="font-work font-bold text-xs tracking-widest mb-5" style={{ color: '#FEB300' }}>
            RESOURCES
          </h5>
          {/* A 44px tap area from an invisible ::before (it fits the 12px gaps); the line itself does not move. */}
          <Link to="/about" className={`${LINK} relative before:absolute before:inset-x-0 before:top-[calc(50%-22px)] before:h-11 before:content-['']`} style={{ color: '#cbd5e1' }}>
            About us
          </Link>
          <Link to="/faculty-login" className={LINK} style={{ color: '#cbd5e1' }}>
            Faculty Portal
          </Link>
          {/* Alumni has no page yet, so it stays text rather than pretending
              to be a link that goes nowhere. */}
          <p className="font-public text-sm mb-3" style={{ color: '#cbd5e1' }}>
            Alumni
          </p>
          <Link to="/privacy" className={LINK} style={{ color: '#cbd5e1' }}>
            Privacy Policy
          </Link>
          <Link to="/terms" className={LINK} style={{ color: '#cbd5e1' }}>
            Terms of Service
          </Link>
        </div>

        <div>
          <h5 className="font-work font-bold text-xs tracking-widest mb-5" style={{ color: '#FEB300' }}>
            CONTACT US
          </h5>
          <a href={MAP_URL} target="_blank" rel="noopener noreferrer" className={CONTACT_LINK}>
            <MapPin size={16} color="#b6c2d1" aria-hidden="true" className="shrink-0 mt-0.5 max-md:mt-0" />
            <span className="font-public text-sm break-words" style={{ color: '#cbd5e1' }}>
              Dela Paz National High School{' '}<span className="sr-only">(opens in a new tab)</span>
            </span>
          </a>
          <a href={`mailto:${SCHOOL_EMAIL}`} className={CONTACT_LINK}>
            <Mail size={16} color="#b6c2d1" aria-hidden="true" className="shrink-0 mt-0.5 max-md:mt-0" />
            <span className="font-public text-sm break-words" style={{ color: '#cbd5e1' }}>{SCHOOL_EMAIL}</span>
          </a>
          <div className="flex items-start gap-2 mb-3">
            <Phone size={16} color="#b6c2d1" aria-hidden="true" className="shrink-0 mt-0.5" />
            <span className="font-public text-sm break-words" style={{ color: '#cbd5e1' }}>(02) 8642-1234</span>
          </div>
        </div>
      </div>

      <div className="border-t mb-6 max-w-[1280px] mx-auto" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />

      <div className="flex flex-wrap justify-between items-center gap-4 max-w-[1280px] mx-auto">
        <p className="font-public text-xs" style={{ color: '#b6c2d1' }}>
          © {new Date().getFullYear()} Dela Paz National High School. All rights reserved.
        </p>
        <div className="flex gap-4">
          <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer"
            aria-label="Dela Paz NHS on Facebook (opens in a new tab)"
            className="inline-flex h-10 w-10 md:h-6 md:w-6 items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FEB300]">
            <Facebook size={18} color="#b6c2d1" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default PublicFooter;
