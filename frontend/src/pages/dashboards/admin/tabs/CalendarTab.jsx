// ============================================
// FILE: src/pages/dashboards/admin/tabs/CalendarTab.jsx
// Split from the original monolithic AdminDashboard.jsx (1,980 lines)
// Includes the EVENT MODAL, which only this tab opens.
// ============================================

import React from 'react';
import { Sun } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import Modal from '../../../../components/ui/Modal';
import { useDelayedFlag } from '../../../../lib/useDelayedFlag';
import { MONTHS, EVENT_TYPES } from '../shared/helpers';
import Button from '../../../../components/ui/Button';
import { formatDateLong, formatDateRange } from '../../../../lib/formatDate';

const CalendarTab = () => {
  const {
    calEvents, calFilter, calGrid, calLoading, calMonth, calYear, closeModal,
    deleteEvent, editEvent, evDate, evDesc, evEnd, evSaving, evTitle,
    evCustomType, evType, modal, nextMonth, openCreateEvent,
    openEditEvent, prevMonth, saveEvent, setCalFilter, setEvCustomType, setEvDate,
    setCalYear, setEvDesc, setEvEnd, setEvTitle, setEvType, today, typeClass,
    typeColor, upcomingEvents
  } = useAdminContext();
  const slowCal = useDelayedFlag(calLoading);

  // CAL4. One rule for "what is on this day", used by both views, so the
  // grid and the agenda can never disagree about a month.
  const eventsOn = (ds) => calEvents.filter(e => {
    if (calFilter && e.event_type !== calFilter) return false;
    if (e.end_date) return ds >= e.event_date && ds <= e.end_date;
    return e.event_date === ds;
  });

  // Only days that have something. An agenda of 31 empty headings is a
  // worse month view than the grid it replaced.
  const agendaDays = calGrid
    .filter(cell => cell.cur)
    .map(cell => {
      const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(cell.d).padStart(2, '0')}`;
      return { ds, day: cell.d, events: eventsOn(ds) };
    })
    .filter(entry => entry.events.length > 0);

  return (
    <>
            <div>
              <div className="page-header-bar">
                <div className="page-title">Calendar Management</div>
                <div className="page-sub">Manage academic events, deadlines, and announcements</div>
              </div>
              <div className="cal-layout">
                <div className="cal-main">
                  <div className="cal-toolbar">
                    <button className="cal-nav" onClick={prevMonth}>‹</button>
                    <span className="cal-title">{MONTHS[calMonth]} {calYear}</span>
                    <select value={calYear} onChange={e => setCalYear(Number(e.target.value))} style={{ width:'auto' }} aria-label="Calendar year">
                      {[...Array(11)].map((_, i) => { const year = new Date().getFullYear() - 5 + i; return <option key={year} value={year}>{year}</option>; })}
                    </select>
                    <button className="cal-nav" onClick={nextMonth}>›</button>
                    <select style={{ marginLeft: 'var(--space-8)', width:'auto' }}><option>Month</option><option>Week</option></select>
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
                      const evs = cell.cur ? eventsOn(ds) : [];
                      const dayOfWeek = cell.cur ? new Date(calYear, calMonth, cell.d).getDay() : -1;
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                      const hasHoliday = evs.some(event => event.event_type === 'Holiday');
                      return (
                        <div key={i} className={`cal-cell ${isToday ? 'today' : ''} ${!cell.cur ? 'other-month' : ''} ${isWeekend ? 'weekend' : ''} ${hasHoliday ? 'holiday' : ''}`}>
                          <div className="cal-day">{cell.d}</div>
                          {evs.map((e, j) => (
                            <button
                              key={j}
                              type="button"
                              className={`ux-unbutton cal-event ${typeClass(e.event_type)}`}
                              onClick={() => openEditEvent(e)}
                              aria-label={`Edit ${e.title}`}
                              title="Click to edit"
                            >
                              {e.title}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  {/* CAL4. Seven columns give a day 43px on a phone,
                      which cannot hold a date and an event name. Below
                      768 this list replaces the grid (CSS decides which
                      one is shown, so neither view can go stale). */}
                  <div className="cal-agenda">
                    {calLoading ? (
                      <div className="cal-agenda-empty">{slowCal ? 'Loading events…' : ''}</div>
                    ) : agendaDays.length === 0 ? (
                      <div className="cal-agenda-empty">
                        {calFilter ? `No ${calFilter} events this month.` : 'No events this month.'}
                      </div>
                    ) : agendaDays.map(({ ds, day, events }) => {
                      const isToday = day === today.getDate()
                        && calMonth === today.getMonth() && calYear === today.getFullYear();
                      return (
                        <section className="cal-agenda-day" key={ds}>
                          <h3 className="cal-agenda-date">
                            {formatDateLong(ds)}
                            {isToday && <span className="cal-agenda-today"> · Today</span>}
                          </h3>
                          <ul className="cal-agenda-list">
                            {events.map((e, j) => (
                              <li key={j}>
                                <button
                                  type="button"
                                  className={`ux-unbutton cal-agenda-item ${typeClass(e.event_type)}`}
                                  onClick={() => openEditEvent(e)}
                                  aria-label={`Edit ${e.title}`}
                                >
                                  <span className="truncate-1" title={e.title}>{e.title}</span>
                                  {/* P3: a five-day event appears under all
                                      five days. Without the span it reads as
                                      five unrelated events with one name. */}
                                  {e.end_date && e.end_date !== e.event_date && (
                                    <span className="cal-agenda-range">
                                      {formatDateRange(e.event_date, e.end_date)}
                                    </span>
                                  )}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </section>
                      );
                    })}
                  </div>

                  <div className="legend">
                    {[['Event','#93c5fd'],['Deadline','#fcd34d'],['Holiday','#fca5a5'],['Other','#99f6e4']].map(([l,c]) => (
                      <div key={l} className="legend-item"><div className="legend-dot" style={{ background:c }}></div>{l}</div>
                    ))}
                  </div>
                </div>
                <div className="cal-sidebar">
                  <div style={{ fontSize: 'var(--font-size-13)', fontWeight:600, marginBottom: 'var(--space-12)', color:'var(--text-muted)' }}>Upcoming</div>
                  {/* UX-047: the grid and this list both rendered as a
                      fully-populated empty month for the whole fetch. */}
                  {calLoading
                    ? <div style={{ fontSize: 'var(--font-size-12)', color:'var(--text-dim)' }}>{slowCal ? 'Loading events…' : ''}</div>
                    : upcomingEvents.length === 0
                    ? <div style={{ fontSize: 'var(--font-size-12)', color:'var(--text-dim)' }}>No upcoming events</div>
                    : upcomingEvents.map((e, i) => (
                      <div key={i} className="upcoming-item" style={{ borderColor: typeColor(e.event_type) }}>
                        <div style={{ fontSize: 'var(--font-size-13)', fontWeight:600 }}>{e.title}</div>
                        <div style={{ fontSize: 'var(--font-size-12)', color:'var(--text-muted)' }}>{formatDateLong(e.event_date)}</div>
                        <div style={{ display:'flex', gap: 'var(--space-8)', marginTop: 'var(--space-4)' }}>
                          <button className="news-action" style={{ fontSize: 'var(--font-size-12)' }} onClick={() => openEditEvent(e)}>Edit</button>
                          <button className="news-action red" style={{ fontSize: 'var(--font-size-12)' }} onClick={() => deleteEvent(e.id)}>Remove</button>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>

      {/* EVENT MODAL */}
      <Modal
        open={modal === 'event'}
        title={editEvent ? 'Edit Event' : 'Add Calendar Event'}
        onClose={closeModal}
        footer={(requestClose) => (
          <>
            <Button variant="ghost" onClick={requestClose}>Cancel</Button>
            <Button onClick={saveEvent} busy={evSaving} busyLabel={editEvent ? 'Updating…' : 'Adding…'}>
              {editEvent ? 'Update' : 'Add Event'}
            </Button>
          </>
        )}
      >
          <div className="form-row">
            <label className="form-label" htmlFor="calendar-title">Title</label>
            <input id="calendar-title" className="form-input" value={evTitle} onChange={e => setEvTitle(e.target.value)} placeholder="Event title" />
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="calendar-start-date">Start Date</label>
            <input id="calendar-start-date" className="form-input" type="date" value={evDate} onChange={e => setEvDate(e.target.value)} />
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="calendar-end-date-optional">End Date (optional)</label>
            <input id="calendar-end-date-optional" className="form-input" type="date" value={evEnd} onChange={e => setEvEnd(e.target.value)} />
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="calendar-type">Type</label>
            <select id="calendar-type" className="form-input" value={evType} onChange={e => setEvType(e.target.value)}>
              {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          {evType === 'Custom Type' && (
            <div className="form-row">
              <label className="form-label" htmlFor="calendar-custom-event-type">Custom Event Type</label>
              <input id="calendar-custom-event-type" className="form-input" value={evCustomType} onChange={e => setEvCustomType(e.target.value)} placeholder="e.g. Foundation Day or Faculty Meeting" />
            </div>
          )}
          <div className="form-row">
            <label className="form-label" htmlFor="calendar-description">Description</label>
            <textarea id="calendar-description" className="form-input" rows={3} value={evDesc} onChange={e => setEvDesc(e.target.value)} placeholder="Event details..." />
          </div>
      </Modal>

    </>
  );
};

export default CalendarTab;
