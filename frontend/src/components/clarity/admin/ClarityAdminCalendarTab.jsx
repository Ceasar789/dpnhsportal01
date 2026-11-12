// ============================================
// FILE: src/components/clarity/admin/ClarityAdminCalendarTab.jsx
// The Admin Calendar tab in Clarity (final design): a Mon-Fri week view by
// default, with the classic month view one click away (Week | Month), so
// month navigation, the year picker, the type filter, the agenda and the
// Upcoming list all stay reachable.
//
// The app stores events as dates only (event_date, optional end_date): the
// event form has no time fields and saveEvent writes none. So the week view
// draws no hour grid and invents no times: each day lists its events as
// all-day blocks; a time is shown only if a row really carries one.
//
// TEMPORARY word-for-word copies from pages/dashboards/admin/tabs/CalendarTab.jsx
// (parity-tested in ClarityAdminCalendarTab.test.jsx); after the defense the
// classic tab and this one should share them:
//   - the range validation and the shared "events on a day" rule, :26-68
//   - the month view (toolbar, grid, agenda, legend, Upcoming), :79-222
//   - the event dialog, :226-282 (the shared Modal, unchanged)
// ============================================

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';
import Modal from '../../ui/Modal';
import { useDelayedFlag } from '../../../lib/useDelayedFlag';
import { MONTHS, EVENT_TYPES } from '../../../pages/dashboards/admin/shared/helpers';
import Button from '../../ui/Button';
import { formatDateLong, formatDateRange } from '../../../lib/formatDate';
import { agendaGroups, agendaTimeline } from '../../../lib/agenda';
import { isInvalidCalendarRange, matchesCalendarFilter } from '../../../lib/calendarRules';

// Local calendar dates, as the classic grid builds them (`${year}-${mm}-${dd}`).
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d) => { const day = d.getDay(); return addDays(d, day === 0 ? -6 : 1 - day); };
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const TONE = { Event: 'in', Deadline: 'wa', Holiday: 'er', Other: 'ok' };
const hhmm = value => String(value ?? '').slice(0, 5);

const ClarityAdminCalendarTab = () => {
  const {
    calError, calEvents = [], calFilter, calGrid = [], calLoading, calMonth, calYear, closeModal,
    deleteEvent, editEvent, evDate, evDesc, evEnd, evSaving, evTitle,
    evCustomType, evType, modal, nextMonth, openCreateEvent,
    openEditEvent, prevMonth, saveEvent, setCalFilter, setEvCustomType, setEvDate,
    setCalYear, setEvDesc, setEvEnd, setEvTitle, setEvType, today = new Date(), typeClass,
    typeColor, upcomingEvents = [], fetchCalEvents
  } = useAdminContext();

  // ---- TEMPORARY copy (CalendarTab.jsx:26-68) ----
  const slowCal = useDelayedFlag(calLoading);
  const endDateRef = useRef(null);
  const [rangeValidationShown, setRangeValidationShown] = useState(false);
  const rangeInvalid = isInvalidCalendarRange(evDate, evEnd);

  const beginCreate = () => {
    setRangeValidationShown(false);
    openCreateEvent();
  };

  const beginEdit = (event) => {
    setRangeValidationShown(false);
    openEditEvent(event);
  };

  const submitEvent = () => {
    if (rangeInvalid) {
      setRangeValidationShown(true);
      endDateRef.current?.focus();
      return;
    }
    setRangeValidationShown(false);
    saveEvent();
  };

  // CAL4. One rule for "what is on this day", used by both views, so the
  // grid and the agenda can never disagree about a month.
  const eventsOn = (ds) => calEvents.filter(e => {
    if (!matchesCalendarFilter(e, calFilter)) return false;
    if (e.end_date) return ds >= e.event_date && ds <= e.end_date;
    return e.event_date === ds;
  });

  // V1. The grid and the agenda answer different questions, so they no
  // longer share eventsOn. A cell asks "what is on this day" and a five
  // day exam week belongs in all five cells; the agenda is a list of
  // what is on this month, and listing that week five times cost nine
  // rows for two events. See lib/agenda.js.
  const agendaDays = agendaGroups(calEvents, calYear, calMonth, calFilter);
  // L3. Event groups keep their one-row-per-event contract. Today's position
  // is a presentation concern, so add a marker-only row only when no event
  // group already supplies today's heading.
  const agendaRows = agendaTimeline(agendaDays, calYear, calMonth, today);
  // ---- end of the copy ----

  // Week view: Mon-Fri of the visible week, plus a weekend day only when an
  // event is really on it. "Today" is the same `today` the classic grid uses.
  const [view, setView] = useState('Week');
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const todayKey = keyOf(today);
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(weekStart, i))
    .filter((d, i) => i < 5 || eventsOn(keyOf(d)).length > 0);
  const weekTitle = `Week of ${formatDateRange(keyOf(weekStart), keyOf(addDays(weekStart, 4)))}`;

  return (
    <>
      <div className="x-cal">
        <div className="x-head x-ov-head">
          <div style={{ minWidth: 0 }}>
            <h1 className="x-h1">Calendar</h1>
            <p className="x-sub">{view === 'Week' ? weekTitle : `${MONTHS[calMonth]} ${calYear}`}</p>
          </div>
          <div className="x-act">
            <div className="x-seg" role="group" aria-label="Calendar view">
              {['Week', 'Month'].map(option => (
                <button key={option} type="button" className={view === option ? 'on' : undefined}
                  aria-pressed={view === option} onClick={() => setView(option)}>{option}</button>
              ))}
            </div>
            {view === 'Week' && (
              <>
                <button type="button" className="x-iconbtn" aria-label="Previous week" onClick={() => setWeekStart(w => addDays(w, -7))}>
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <button type="button" className="x-btn" onClick={() => setWeekStart(mondayOf(today))}>This week</button>
                <button type="button" className="x-iconbtn" aria-label="Next week" onClick={() => setWeekStart(w => addDays(w, 7))}>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </>
            )}
            <button type="button" className="x-btn pri" onClick={beginCreate}>
              <Plus size={16} aria-hidden="true" /> Add event
            </button>
          </div>
        </div>

        {view === 'Week' ? (
          <>
            {calError && (
              <div className="x-card x-pad x-rail" role="alert" style={{ marginBottom: 16 }}>
                <span>Unable to load Calendar.</span>
                <button type="button" className="x-btn" onClick={fetchCalEvents}>Retry</button>
              </div>
            )}
            <div className="x-cal-tools">
              <label className="x-sr" htmlFor="x-cal-filter">Filter events by type</label>
              <select id="x-cal-filter" className="x-select" value={calFilter} onChange={e => setCalFilter(e.target.value)}>
                <option value="">All types</option>
                {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <section className="x-card x-cal-card" aria-label={weekTitle}>
              {calLoading ? (
                <p className="x-empty">{slowCal ? 'Loading events…' : ''}</p>
              ) : (
                <div className="x-tw">
                  <div className="x-cal-week" style={{ gridTemplateColumns: `repeat(${weekDays.length}, minmax(140px, 1fr))` }}>
                    {weekDays.map((d) => {
                      const ds = keyOf(d);
                      const isToday = ds === todayKey;
                      const events = eventsOn(ds);
                      return (
                        <section key={ds} className={`x-cal-day${isToday ? ' today' : ''}`} aria-labelledby={`x-cal-${ds}`}
                          aria-current={isToday ? 'date' : undefined}>
                          <h2 id={`x-cal-${ds}`} className="x-cal-dayhead">
                            {WEEKDAY.format(d)} {d.getDate()}{isToday && <span> · Today</span>}
                          </h2>
                          {events.length === 0 ? (
                            <p className="x-sr">No events</p>
                          ) : events.map(e => (
                            <button key={`${e.id}-${ds}`} type="button" className={`x-cal-ev ${TONE[e.event_type] || 'in'}`}
                              aria-label={`Edit ${e.title}`} onClick={() => beginEdit(e)}>
                              <b>{e.title}</b>
                              <span>
                                {e.event_type === 'Other' && e.custom_event_type ? e.custom_event_type : e.event_type}
                                {e.start_time && e.end_time ? ` · ${hhmm(e.start_time)}–${hhmm(e.end_time)}` : ''}
                                {e.end_date && e.end_date !== e.event_date ? ` · ${formatDateRange(e.event_date, e.end_date)}` : ''}
                              </span>
                            </button>
                          ))}
                        </section>
                      );
                    })}
                  </div>
                </div>
              )}
              {!calLoading && weekDays.every(d => eventsOn(keyOf(d)).length === 0) && (
                <p className="x-cs x-cal-none">{calFilter ? `No ${calFilter} events this week.` : 'No events this week.'}</p>
              )}
            </section>
          </>
        ) : (
          /* ---- TEMPORARY copy (CalendarTab.jsx:79-222): the classic month view ---- */
          <div className="cal-page">
              <div className="cal-layout">
                <div className="cal-main">
                  {calError && (
                    <div className="cal-load-error" role="alert">
                      <span>Unable to load Calendar.</span>
                      <Button variant="ghost" size="sm" onClick={fetchCalEvents}>Retry</Button>
                    </div>
                  )}
                  <div className="cal-toolbar">
                    <div className="cal-toolbar-group cal-toolbar-period">
                      <button className="cal-nav" type="button" aria-label="Previous month" onClick={prevMonth}>‹</button>
                      <span className="cal-title">{MONTHS[calMonth]} {calYear}</span>
                      <select className="cal-year-select" value={calYear} onChange={e => setCalYear(Number(e.target.value))} aria-label="Calendar year">
                        {[...Array(11)].map((_, i) => { const year = new Date().getFullYear() - 5 + i; return <option key={year} value={year}>{year}</option>; })}
                      </select>
                      <button className="cal-nav" type="button" aria-label="Next month" onClick={nextMonth}>›</button>
                    </div>
                    <div className="cal-toolbar-group cal-toolbar-actions">
                      <button className="btn btn-primary cal-add-event" onClick={beginCreate}>+ Add Event</button>
                      <select className="cal-filter-select" value={calFilter} onChange={e => setCalFilter(e.target.value)} aria-label="Filter events by type">
                        <option value="">Filter type</option>
                        {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
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
                              onClick={() => beginEdit(e)}
                              aria-label={`Edit ${e.title}`}
                              /* V2: the title said "Click to edit", which
                                 is the one thing a pointer already knows.
                                 It carries the full name now, for the
                                 chips the two-line clamp still cuts. */
                              title={e.title}
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
                    ) : agendaRows.length === 0 ? (
                      <div className="cal-agenda-empty">
                        {calFilter ? `No ${calFilter} events this month.` : 'No events this month.'}
                      </div>
                    ) : agendaRows.map(({ ds, day, events, todayOnly }) => {
                      const isToday = day === today.getDate()
                        && calMonth === today.getMonth() && calYear === today.getFullYear();
                      return (
                        <section className="cal-agenda-day" key={ds}>
                          <h3 className="cal-agenda-date">
                            {formatDateLong(ds)}
                            {isToday && <span className="cal-agenda-today"> · Today</span>}
                          </h3>
                          {todayOnly ? (
                            <p className="cal-agenda-today-empty">
                              {calFilter ? `No ${calFilter} events start today.` : 'No events start today.'}
                            </p>
                          ) : (
                            <ul className="cal-agenda-list">
                              {events.map((e, j) => (
                                <li key={j}>
                                  <button
                                    type="button"
                                    className={`ux-unbutton cal-agenda-item ${typeClass(e.event_type)}`}
                                    onClick={() => beginEdit(e)}
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
                          )}
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
                        {/* V5: this said "October 3, 2026" for an event
                            the agenda listed as "Oct 3 - 4, 2026". Same
                            event, two different answers to how long it
                            lasts. One formatter for both. */}
                        <div style={{ fontSize: 'var(--font-size-12)', color:'var(--text-muted)' }}>
                          {e.end_date && e.end_date !== e.event_date
                            ? formatDateRange(e.event_date, e.end_date)
                            : formatDateLong(e.event_date)}
                        </div>
                        <div style={{ display:'flex', gap: 'var(--space-8)', marginTop: 'var(--space-4)' }}>
                          <button className="news-action" style={{ fontSize: 'var(--font-size-12)' }} aria-label={`Edit ${e.title}`} onClick={() => beginEdit(e)}>Edit</button>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
          </div>
        )}
      </div>

      {/* ---- TEMPORARY copy (CalendarTab.jsx:226-282): EVENT MODAL ---- */}
      <Modal
        open={modal === 'event'}
        title={editEvent ? 'Edit Event' : 'Add Calendar Event'}
        onClose={closeModal}
        footer={(requestClose) => (
          <>
            {editEvent && <Button variant="danger" onClick={() => deleteEvent(editEvent.id)}>Delete</Button>}
            <Button variant="ghost" onClick={requestClose}>Cancel</Button>
            <Button onClick={submitEvent} busy={evSaving} busyLabel={editEvent ? 'Updating…' : 'Adding…'}>
              {editEvent ? 'Update' : 'Add Event'}
            </Button>
          </>
        )}
      >
          <div className="form-row">
            <label className="form-label" htmlFor="calendar-title">Title</label>
            <input id="calendar-title" className="form-input" value={evTitle} onChange={e => setEvTitle(e.target.value)} placeholder="Event title" aria-required="true" />
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="calendar-start-date">Start Date</label>
            <input id="calendar-start-date" className="form-input" type="date" value={evDate} onChange={e => { setEvDate(e.target.value); setRangeValidationShown(false); }} aria-required="true" />
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="calendar-end-date-optional">End Date (optional)</label>
            <input
              ref={endDateRef}
              id="calendar-end-date-optional"
              className="form-input"
              type="date"
              value={evEnd}
              onChange={e => { setEvEnd(e.target.value); setRangeValidationShown(false); }}
              aria-invalid={rangeValidationShown && rangeInvalid ? 'true' : undefined}
              aria-describedby={rangeValidationShown && rangeInvalid ? 'calendar-end-date-error' : undefined}
            />
            {rangeValidationShown && rangeInvalid && (
              <span id="calendar-end-date-error" className="field-error" role="alert">
                End Date cannot be earlier than Start Date.
              </span>
            )}
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
              <input id="calendar-custom-event-type" className="form-input" value={evCustomType} onChange={e => setEvCustomType(e.target.value)} placeholder="e.g. Foundation Day or Faculty Meeting" aria-required="true" />
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

export default ClarityAdminCalendarTab;
