// ============================================
// FILE: src/pages/public/CalendarPage.jsx
// PUBLIC CALENDAR — Events from Supabase with filtering
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../config/supabase';
import { Calendar, ChevronLeft, ChevronRight, Clock, MapPin, Tag, AlertCircle, Loader2, Megaphone, Search, Menu, School, Facebook, BookOpen, Globe, Users } from 'lucide-react';

const CalendarPage = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [filterType, setFilterType] = useState('All');
  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1100);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .order('event_date', { ascending: true });
      
      if (error) throw error;
      
      // Public events: all events are public, but we can filter by visibility if needed
      setEvents(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const channel = supabase
      .channel('public-calendar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, fetchEvents)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchEvents]);

  // Calendar logic
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getEventsForDate = (date) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    return events.filter(e => {
      const eventDate = e.event_date?.split('T')[0];
      return dateStr === eventDate;
    });
  };

  const eventTypes = {
    Academic: { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    Exam: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    Holiday: { color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
    Event: { color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
    Meeting: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  };

  const allTypes = ['All', ...new Set(events.map(e => e.type || 'Event').filter(Boolean))];

  const filteredEvents = filterType === 'All' ? events : events.filter(e => (e.type || 'Event') === filterType);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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
          <NavLink title="Calendar" isActive={true} route="/calendar" />
          
          <button
            onClick={() => navigate('/login')}
            className="font-work font-semibold text-white px-8 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#22c55e' }}
          >
            Login
          </button>
        </div>
      ) : (
        <div className="relative">
          <button onClick={() => setMenuOpen(open => !open)} className="p-2" aria-label="Toggle navigation menu" aria-expanded={menuOpen}>
            <Menu size={28} color="#FFFFFF" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-14 w-52 rounded-xl bg-white p-2 shadow-xl">
              {[['Home', '/'], ['News', '/news'], ['Calendar', '/calendar']].map(([title, route]) => (
                <button key={route} onClick={() => { setMenuOpen(false); navigate(route); }} className="block w-full rounded-lg px-4 py-3 text-left font-work text-sm text-slate-700 hover:bg-slate-100">{title}</button>
              ))}
              <button onClick={() => { setMenuOpen(false); navigate('/login'); }} className="mt-1 w-full rounded-lg bg-green-500 px-4 py-3 text-left font-work text-sm font-semibold text-white">Login</button>
            </div>
          )}
        </div>
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

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <TopNavBar />
      
      <main className="pt-[90px]">
        {/* Header */}
        <header className="bg-[#1e3a5f] text-white py-12 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-2 mb-4 text-[#FEB300]">
              <Calendar size={20} />
              <span className="text-sm font-semibold uppercase tracking-wider">Academic Calendar</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-4">School Events & Schedule</h1>
            <p className="text-blue-200 max-w-2xl">View academic calendar, holidays, exams, and school events for the current school year.</p>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 text-red-600 mb-6">
            <AlertCircle size={18} />
            <span className="text-sm">Error loading calendar: {error}</span>
          </div>
        )}

        {/* Filter & Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronLeft size={20} className="text-gray-600" />
            </button>
            <h2 className="text-xl font-bold text-[#1a2b4a]">{monthNames[month]} {year}</h2>
            <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ChevronRight size={20} className="text-gray-600" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {allTypes.map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: filterType === type ? (eventTypes[type]?.color || '#1e3a5f') : '#ffffff',
                  color: filterType === type ? '#ffffff' : '#64748b',
                  border: '1px solid #e2e8f0'
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#1e3a5f]" size={32} /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar Grid */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-xs font-semibold text-gray-400 py-2">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }, (_, i) => (
                  <div key={`empty-${i}`} className="h-24 rounded-lg" />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const date = i + 1;
                  const dateEvents = getEventsForDate(date);
                  const isToday = new Date().toDateString() === new Date(year, month, date).toDateString();
                  
                  return (
                    <div 
                      key={date} 
                      className="h-24 rounded-lg border border-gray-100 p-1.5 transition-colors hover:bg-gray-50 cursor-pointer"
                      style={{ backgroundColor: isToday ? '#eff6ff' : undefined, borderColor: isToday ? '#3b82f6' : undefined }}
                      onClick={() => dateEvents.length > 0 && setSelectedEvent(dateEvents[0])}
                    >
                      <span className={`text-sm font-semibold ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>{date}</span>
                      <div className="mt-1 space-y-0.5">
                        {dateEvents.slice(0, 3).map((evt, idx) => (
                          <div 
                            key={idx} 
                            className="text-[10px] px-1.5 py-0.5 rounded truncate font-medium"
                            style={{ 
                              backgroundColor: eventTypes[evt.type]?.bg || 'rgba(59,130,246,0.12)',
                              color: eventTypes[evt.type]?.color || '#3b82f6'
                            }}
                          >
                            {evt.title}
                          </div>
                        ))}
                        {dateEvents.length > 3 && (
                          <div className="text-[10px] text-gray-400 px-1.5">+{dateEvents.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upcoming Events List */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">Upcoming Events</h3>
              {filteredEvents.slice(0, 10).map(event => (
                <div 
                  key={event.id} 
                  className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedEvent(event)}
                >
                  <div className="flex items-start gap-3">
                    <div 
                      className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: eventTypes[event.type]?.bg || 'rgba(59,130,246,0.12)' }}
                    >
                      <Calendar size={20} style={{ color: eventTypes[event.type]?.color || '#3b82f6' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-[#1a2b4a] mb-1 truncate">{event.title}</h4>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Clock size={12} />
                          <span>{new Date(event.event_date).toLocaleDateString()}</span>
                          {event.start_time && (
                            <span> at {event.start_time}</span>
                          )}
                        </div>
                        {event.location && (
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <MapPin size={12} /> {event.location}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span 
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ 
                        backgroundColor: eventTypes[event.type]?.bg || 'rgba(59,130,246,0.12)',
                        color: eventTypes[event.type]?.color || '#3b82f6'
                      }}
                    >
                      {event.type || 'Event'}
                    </span>
                  </div>
                </div>
              ))}
              
              {filteredEvents.length === 0 && (
                <div className="text-center py-8">
                  <Calendar size={32} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm text-gray-400">No events found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* News Link */}
        <div className="mt-12 p-6 bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] rounded-xl text-white text-center">
          <h3 className="text-xl font-bold mb-2">Latest School News</h3>
          <p className="text-blue-200 mb-4">Read the latest announcements and updates from Dela Paz National High School</p>
          <Link 
            to="/news" 
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#1e3a5f] rounded-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            <Megaphone size={18} /> View News
          </Link>
        </div>
        </div>
      </main>

      {/* FOOTER — EduScribe Dark Blue Theme */}
      <footer className="w-full" style={{ backgroundColor: '#003b7a', padding: '65px 48px 32px' }}>
        <div className="flex flex-wrap justify-center gap-24 mb-16">
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

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: eventTypes[selectedEvent.type]?.bg || 'rgba(59,130,246,0.12)' }}
              >
                <Calendar size={20} style={{ color: eventTypes[selectedEvent.type]?.color || '#3b82f6' }} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#1a2b4a]">{selectedEvent.title}</h3>
                <span 
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ 
                    backgroundColor: eventTypes[selectedEvent.type]?.bg || 'rgba(59,130,246,0.12)',
                    color: eventTypes[selectedEvent.type]?.color || '#3b82f6'
                  }}
                >
                  {selectedEvent.type || 'Event'}
                </span>
              </div>
            </div>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock size={16} className="text-gray-400" />
                <span>{new Date(selectedEvent.event_date).toLocaleDateString()}</span>
                {selectedEvent.start_time && <span className="ml-1">at {selectedEvent.start_time}</span>}
              </div>
              {selectedEvent.end_time && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Clock size={16} className="text-gray-400" />
                  <span>Ends at: {selectedEvent.end_time}</span>
                </div>
              )}
              {selectedEvent.location && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin size={16} className="text-gray-400" />
                  <span>{selectedEvent.location}</span>
                </div>
              )}
              {selectedEvent.description && (
                <p className="text-sm text-gray-600 mt-2">{selectedEvent.description}</p>
              )}
            </div>
            
            <button 
              onClick={() => setSelectedEvent(null)}
              className="w-full h-10 rounded-lg bg-[#1e3a5f] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Close 
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;