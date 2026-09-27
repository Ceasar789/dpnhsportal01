// ============================================
// FILE: src/pages/public/CalendarPage.jsx
// PUBLIC CALENDAR — Events from Supabase with filtering
// ============================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PublicHeader, { PUBLIC_HEADER_HEIGHT } from '../../components/PublicHeader';
import { supabase } from '../../config/supabase';
import { Calendar, ChevronLeft, ChevronRight, Clock, MapPin, Tag, AlertCircle, Loader2, Megaphone, School, Facebook, BookOpen, Globe, Users, Mail, Phone } from 'lucide-react';

const CalendarPage = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [filterType, setFilterType] = useState('All');
  const [isMobile, setIsMobile] = useState(false);

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
  }, [fetchEvents]);

  // Calendar logic
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getEventType = (event) => event.event_type || event.type || 'Event';

  const getEventsForDate = (date) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    return events.filter(e => {
      const eventDate = e.event_date?.split('T')[0];
      if (e.end_date) return dateStr >= eventDate && dateStr <= e.end_date.split('T')[0];
      return dateStr === eventDate;
    });
  };

  // A dialog has to be dismissible from the keyboard, and it has to own the
  // keyboard while it is open. Escape alone was not enough: focus stayed on
  // the day cell behind the overlay, so Tab walked straight out into the page
  // underneath while the dialog claimed aria-modal="true".
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!selectedEvent) return undefined;

    // Remember what to give the keyboard back to when this closes.
    returnFocusRef.current = document.activeElement;

    const node = dialogRef.current;
    const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    node?.querySelector(FOCUSABLE)?.focus() ?? node?.focus();

    const onKey = e => {
      if (e.key === 'Escape') { setSelectedEvent(null); return; }
      if (e.key !== 'Tab' || !node) return;

      const items = [...node.querySelectorAll(FOCUSABLE)];
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];

      // Wrap at both ends so Tab can never leave the dialog.
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Without this the browser drops focus to <body> and a keyboard user
      // restarts from the top of the page.
      const back = returnFocusRef.current;
      if (back && typeof back.focus === 'function' && document.contains(back)) back.focus();
    };
  }, [selectedEvent]);

  const eventTypes = {
    Event: { color: '#1d4ed8', bg: '#dbeafe' },
    Deadline: { color: '#92400e', bg: '#fef3c7' },
    Holiday: { color: '#b91c1c', bg: '#fee2e2' },
    Other: { color: '#0f766e', bg: '#ccfbf1' },
  };

  const allTypes = ['All', ...new Set(events.map(getEventType).filter(Boolean))];

  const filteredEvents = filterType === 'All' ? events : events.filter(e => getEventType(e) === filterType);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];


  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <PublicHeader isMobile={isMobile} active="Calendar" />
      
      <main style={{ paddingTop: isMobile ? PUBLIC_HEADER_HEIGHT.mobile : PUBLIC_HEADER_HEIGHT.desktop }}>
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
          <div role="alert" className="flex items-center gap-2 p-4 rounded-lg bg-red-50 text-red-600 mb-6">
            <AlertCircle size={18} />
            <span className="text-sm flex-1">Error loading calendar: {error}</span>
            <button
              type="button"
              onClick={fetchEvents}
              className="rounded px-3 py-1.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ backgroundColor: '#003b7a' }}
            >
              Try again
            </button>
          </div>
        )}

        {/* Filter & Controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button type="button" onClick={prevMonth} aria-label="Previous month" className="p-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a5f]">
              <ChevronLeft size={20} className="text-gray-600" aria-hidden="true" />
            </button>
            <h2 className="text-xl font-bold text-[#1a2b4a]">{monthNames[month]} {year}</h2>
            <select value={year} onChange={e => setCurrentDate(new Date(Number(e.target.value), month, 1))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Calendar year">
              {[...Array(11)].map((_, i) => { const optionYear = new Date().getFullYear() - 5 + i; return <option key={optionYear} value={optionYear}>{optionYear}</option>; })}
            </select>
            <button type="button" onClick={nextMonth} aria-label="Next month" className="p-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a5f]">
              <ChevronRight size={20} className="text-gray-600" aria-hidden="true" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {allTypes.map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(type)}
                aria-pressed={filterType === type}
                className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a5f] focus-visible:ring-offset-1"
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
                  // Weekend and holiday both used to be pink and nothing else.
                  const isWeekend = [0, 6].includes(new Date(year, month, date).getDay());
                  const isHoliday = dateEvents.some(event => getEventType(event) === 'Holiday');
                  const dayLabel = `${monthNames[month]} ${date}${isToday ? ', today' : ''}${isHoliday ? ', holiday' : isWeekend ? ', weekend' : ''}`;

                  return (
                    <div 
                      key={date} 
                      role="group"
                      aria-label={dateEvents.length
                        ? `${dayLabel}: ${dateEvents.length} event${dateEvents.length === 1 ? '' : 's'}`
                        : dayLabel}
                      className="h-24 rounded-lg border border-gray-100 p-1.5 transition-colors"
                      style={{ backgroundColor: isToday ? '#eff6ff' : isHoliday ? '#fef2f2' : isWeekend ? '#f1f5f9' : '#ffffff', borderColor: isToday ? '#3b82f6' : isHoliday ? '#fca5a5' : '#e5e7eb' }}
                    >
                      <span className="flex items-center gap-1">
                        <span className={`text-sm font-semibold ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>{date}</span>
                        {isHoliday && (
                          <span className="text-[11px] font-bold leading-none" style={{ color: '#b91c1c' }} aria-hidden="true">H</span>
                        )}
                      </span>
                      <div className="mt-1 space-y-0.5 overflow-y-auto" style={{ maxHeight: '60px' }}>
                        {dateEvents.map((evt, idx) => (
                          <button
                            type="button"
                            key={evt.id ?? idx}
                            title={evt.title}
                            aria-label={`Open ${evt.title}`}
                            onClick={() => setSelectedEvent(evt)}
                            className="block w-full text-left text-xs px-1.5 py-0.5 rounded truncate font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a5f]"
                            style={{ 
                              backgroundColor: eventTypes[getEventType(evt)]?.bg || '#dbeafe',
                              color: eventTypes[getEventType(evt)]?.color || '#1d4ed8'
                            }}
                          >
                            {evt.title}
                          </button>
                        ))}
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
                      style={{ backgroundColor: eventTypes[getEventType(event)]?.bg || '#dbeafe' }}
                    >
                      <Calendar size={20} style={{ color: eventTypes[getEventType(event)]?.color || '#1d4ed8' }} />
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
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <MapPin size={12} aria-hidden="true" /> {event.location}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span 
                      className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ 
                        backgroundColor: eventTypes[getEventType(event)]?.bg || '#dbeafe',
                        color: eventTypes[getEventType(event)]?.color || '#1d4ed8'
                      }}
                    >
                      {getEventType(event)}
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
        <div className="mt-12 p-6 rounded-xl text-white text-center" style={{ backgroundColor: '#003b7a' }}>
          <h3 className="text-xl font-bold mb-2">Latest School News</h3>
          <p className="mb-4" style={{ color: '#cbd5e1' }}>Read the latest announcements and updates from Dela Paz National High School</p>
          <Link 
            to="/news" 
            className="inline-flex items-center gap-2 px-6 py-3 bg-white rounded-lg font-semibold hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#003b7a]"
            style={{ color: '#003b7a' }}
          >
            <Megaphone size={18} aria-hidden="true" /> View News
          </Link>
        </div>
        </div>
      </main>

      {/* FOOTER — EduScribe Dark Blue Theme */}
      <footer className="w-full" style={{ backgroundColor: '#003b7a', padding: '65px 48px 32px' }}>
        <div className="flex flex-wrap justify-center gap-24 mb-16">
          {/* Brand */}
          <div style={{ width: '260px' }}>
            <School size={40} color="#b6c2d1" aria-hidden="true" />
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
          <div style={{ width: '150px' }}>
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
          <div style={{ width: '260px' }}>
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
        <div className="border-t mb-8" style={{ borderColor: 'rgba(255,255,255,0.15)' }} />

        {/* Bottom */}
        <div className="flex justify-between items-center">
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

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEvent(null)}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-dialog-title"
            tabIndex={-1}
            className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl focus:outline-none"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: eventTypes[getEventType(selectedEvent)]?.bg || '#dbeafe' }}
              >
                <Calendar size={20} aria-hidden="true" style={{ color: eventTypes[getEventType(selectedEvent)]?.color || '#1d4ed8' }} />
              </div>
              <div>
                <h3 id="event-dialog-title" className="text-lg font-bold text-[#1a2b4a]">{selectedEvent.title}</h3>
                <span 
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ 
                    backgroundColor: eventTypes[getEventType(selectedEvent)]?.bg || '#dbeafe',
                    color: eventTypes[getEventType(selectedEvent)]?.color || '#1d4ed8'
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
              type="button"
              className="w-full h-10 rounded-lg bg-[#1e3a5f] text-white text-sm font-semibold hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1e3a5f] focus-visible:ring-offset-2"
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