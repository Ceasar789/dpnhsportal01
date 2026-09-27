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
import { School, Facebook, BookOpen, Globe, Users, MapPin, Mail, Phone } from 'lucide-react';

const LINK = 'block mb-3 py-1 font-public text-sm text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FEB300]';

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
          <Link to="/faculty-login" className={LINK} style={{ color: '#cbd5e1' }}>
            Faculty Portal
          </Link>
          {/* No route exists for these yet, so they stay text rather than
              pretending to be links that go nowhere. */}
          {['Alumni', 'Privacy Policy', 'Terms of Service'].map(label => (
            <p key={label} className="font-public text-sm mb-3" style={{ color: '#cbd5e1' }}>
              {label}
            </p>
          ))}
        </div>

        <div>
          <h5 className="font-work font-bold text-xs tracking-widest mb-5" style={{ color: '#FEB300' }}>
            CONTACT US
          </h5>
          {[[MapPin, 'Brgy. Dela Paz, Binan City'], [Mail, 'admissions@delapaznhs.edu.ph'], [Phone, '(02) 8642-1234']]
            .map(([Icon, text]) => (
              <div key={text} className="flex items-start gap-2 mb-3">
                <Icon size={16} color="#b6c2d1" aria-hidden="true" className="shrink-0 mt-0.5" />
                <span className="font-public text-sm break-words" style={{ color: '#cbd5e1' }}>{text}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="border-t mb-6 max-w-[1280px] mx-auto" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />

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
};

export default PublicFooter;
