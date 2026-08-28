// ============================================
// FILE: src/pages/dashboards/admin/tabs/CalendarTab.jsx
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// Includes the EVENT MODAL, which only this tab opens.
// ============================================

import React from 'react';
import { Sun } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import { MONTHS, EVENT_TYPES } from '../shared/helpers';

const CalendarTab = () => {
  const {
    calEvents, calFilter, calGrid, calMonth, calYear, closeModal,
    deleteEvent, editEvent, evDate, evDesc, evEnd, evSaving, evTitle,
    evType, handleOverlayClick, modal, nextMonth, openCreateEvent,
    openEditEvent, prevMonth, saveEvent, setCalFilter, setEvDate,
    setEvDesc, setEvEnd, setEvTitle, setEvType, today, typeClass,
    typeColor, upcomingEvents
  } = useAdminContext();

  return (
    <>
            <div>
              <div className="page-title">Calendar Management</div>
              <div className="page-sub">Manage academic events, deadlines, and announcements</div>
              <div style={{ display:'flex', gap:16 }}>
                <div style={{ flex:1 }}>
                  <div className="cal-toolbar">
                    <button className="cal-nav" onClick={prevMonth}>‹</button>
                    <span className="cal-title">{MONTHS[calMonth]} {calYear}</span>
                    <button className="cal-nav" onClick={nextMonth}>›</button>
                    <select style={{ marginLeft:8, width:'auto' }}><option>Month</option><option>Week</option></select>
                    <button className="btn btn-primary" style={{ marginLeft:'auto' }} onClick={openCreateEvent}>+ Add Event</button>
                    <select value={calFilter} onChange={e => setCalFilter(e.target.value)} style={{ width:'auto' }}>
                      <option value="">Filter type</option>
                      {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="cal-grid">
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="cal-head">{d}</div>)}
                    {calGrid.map((cell, i) => {
                      const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(cell.d).padStart(2,'0')}`;
                      const isToday = cell.cur && cell.d===today.getDate() && calMonth===today.getMonth() && calYear===today.getFullYear();
                      const evs = calEvents.filter(e => {
                        if (!cell.cur) return false;
                        if (calFilter && e.event_type !== calFilter) return false;
                        if (e.end_date) return ds >= e.event_date && ds <= e.end_date;
                        return e.event_date === ds;
                      });
                      return (
                        <div key={i} className={`cal-cell ${isToday ? 'today' : ''} ${!cell.cur ? 'other-month' : ''}`}>
                          <div className="cal-day">{cell.d}</div>
                          {evs.map((e, j) => (
                            <div key={j} className={`cal-event ${typeClass(e.event_type)}`} onClick={() => openEditEvent(e)} title="Click to edit">
                              {e.title}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  <div className="legend">
                    {[['Enrollment','#3b82f6'],['Exams','#f59e0b'],['Holiday','#22c55e'],['Meetings','#a78bfa'],['Activity','#2dd4bf']].map(([l,c]) => (
                      <div key={l} className="legend-item"><div className="legend-dot" style={{ background:c }}></div>{l}</div>
                    ))}
                  </div>
                </div>
                <div className="cal-sidebar">
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:12, color:'var(--text-muted)' }}>Upcoming</div>
                  {upcomingEvents.length === 0
                    ? <div style={{ fontSize:12, color:'var(--text-dim)' }}>No upcoming events</div>
                    : upcomingEvents.map((e, i) => (
                      <div key={i} className="upcoming-item" style={{ borderColor: typeColor(e.event_type) }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>{e.title}</div>
                        <div style={{ fontSize:12, color:'var(--text-muted)' }}>{new Date(e.event_date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
                        <div style={{ display:'flex', gap:8, marginTop:4 }}>
                          <button className="news-action" style={{ fontSize:11 }} onClick={() => openEditEvent(e)}>Edit</button>
                          <button className="news-action red" style={{ fontSize:11 }} onClick={() => deleteEvent(e.id)}>Remove</button>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>

      {/* EVENT MODAL */}
      <div className={`modal-overlay ${modal === 'event' ? 'open' : ''}`} onClick={handleOverlayClick}>
        <div className="modal">
          <div className="modal-title">{editEvent ? 'Edit Event' : 'Add Calendar Event'}</div>
          <div className="form-row">
            <label className="form-label">Title</label>
            <input className="form-input" value={evTitle} onChange={e => setEvTitle(e.target.value)} placeholder="Event title" />
          </div>
          <div className="form-row">
            <label className="form-label">Start Date</label>
            <input className="form-input" type="date" value={evDate} onChange={e => setEvDate(e.target.value)} />
          </div>
          <div className="form-row">
            <label className="form-label">End Date (optional)</label>
            <input className="form-input" type="date" value={evEnd} onChange={e => setEvEnd(e.target.value)} />
          </div>
          <div className="form-row">
            <label className="form-label">Type</label>
            <select className="form-input" value={evType} onChange={e => setEvType(e.target.value)}>
              {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} value={evDesc} onChange={e => setEvDesc(e.target.value)} placeholder="Event details..." />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={saveEvent} disabled={evSaving}>
              {evSaving ? <span className="spin" style={{width:16,height:16,marginRight:6}}></span> : null}
              {editEvent ? 'Update' : 'Add Event'}
            </button>
          </div>
        </div>
      </div>

    </>
  );
};

export default CalendarTab;
