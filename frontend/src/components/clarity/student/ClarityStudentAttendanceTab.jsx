// ============================================
// FILE: src/components/clarity/student/ClarityStudentAttendanceTab.jsx
// Student "My Attendance" in Clarity (Student PDF p4): a month calendar with
// each recorded day's real status (label and colour), the attendance rate
// with its rule, the Present / Late / Absent / Excused counts, and the full
// record list (date, status, section, subject, notes) with Show more.
//
// TEMPORARY word-for-word copies from pages/dashboards/student/tabs/AttendanceTab.jsx
// (source-parity tested in ClarityStudentS2a.test.jsx); after the defense they
// should share them. No substitutions:
//   - PAGE_SIZE, :26
//   - the state, read, totals, filters and paging, :30-93
// Only real rows are drawn: a day without a row shows only its number; a
// missing subject or note is left empty, never "-".
// ============================================

import { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../config/supabase';
import { withRetry } from '../../../lib/supabaseRetry';
import { manilaDateToday } from '../../../lib/taskFormatting';
import { useToast } from '../../../pages/dashboards/student/hooks';
import StudentDataContext from '../../../pages/dashboards/student/StudentDataContext';
import {
  attendanceRate, attendanceTotals, currentManilaMonth, KNOWN_STATUSES,
  monthLabel, monthOf, monthOptions, RATE_RULE, statusKey,
} from '../../../pages/dashboards/student/attendanceView';
import ProgressRing from '../charts/ProgressRing';
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton';

// ---- TEMPORARY copy (AttendanceTab.jsx:26) ----
const PAGE_SIZE = 20;
// ---- end of the copy ----

// The classic tones as Clarity pills: Present green, Absent red, Late amber,
// Excused and anything else neutral. The label is always written out.
const TONE = { present: 'ok', absent: 'er', late: 'wa' };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// U-S4: in the calendar a pill also carries a one-letter code. On phones the
// day cells are too narrow for the word, so CSS shows the letter instead
// (the word stays in the text for screen readers, and as the tooltip).
const CODE = { present: 'P', late: 'L', absent: 'A', excused: 'E' };
const StatusPill = ({ row, coded = false, dot = false }) => {
  const known = KNOWN_STATUSES.includes(statusKey(row));
  const label = known ? row.status : `Other${row.status ? ` (${row.status})` : ''}`;
  const extra = coded ? { 'data-code': CODE[statusKey(row)] || '?', title: label } : {};
  return <span className={['x-badge', known && TONE[statusKey(row)]].filter(Boolean).join(' ')} {...extra}>{dot && <i aria-hidden="true" />}{label}</span>;
};

// U-PDF-S (design p11): "Fri, Nov 20" in the records; the year only when it is
// not this year (a record from another year must still say which).
const RECORD_DAY = new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
const RECORD_DAY_YEAR = new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const recordDay = (key, thisYear) => {
  const at = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return key || '';
  return (key.slice(0, 4) === thisYear ? RECORD_DAY : RECORD_DAY_YEAR).format(at);
};

// The weeks of a "YYYY-MM" month, Sunday first, with the neighbouring days that
// fill the first and last week (shown dimmed, never with records).
const monthWeeks = (key) => {
  const [y, m] = key.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const weeks = [];
  for (let d = new Date(start); weeks.length < 6; ) {
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      week.push({ key: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1 });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    weeks.push(week);
    if (d.getUTCMonth() !== m - 1) break;
  }
  return weeks;
};

const MonthCalendar = ({ month, rows, today }) => {
  const byDate = new Map();
  rows.forEach(r => { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); });
  return (
    <table className="x-sat-grid">
      <caption className="x-sr">Attendance in {monthLabel(month)}</caption>
      <thead><tr>{WEEKDAYS.map(d => <th key={d} scope="col">{d}</th>)}</tr></thead>
      <tbody>
        {monthWeeks(month).map(week => (
          <tr key={week[0].key}>
            {week.map(cell => (
              <td key={cell.key} className={cell.inMonth ? undefined : 'out'} aria-hidden={cell.inMonth ? undefined : 'true'}>
                <span className={`x-sat-d${cell.key === today ? ' today' : ''}`}>{cell.day}</span>
                {cell.key === today && <span className="x-sr"> (today)</span>}
                {cell.inMonth && (byDate.get(cell.key) || []).map((r, i) => <StatusPill key={r.id || i} row={r} coded />)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const ClarityStudentAttendanceTab = () => {
  // The classic file has these two findings too; disabled around the copy, not inside it.
  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  // ---- TEMPORARY copy (AttendanceTab.jsx:30-93) ----
  const { userData } = useAuth();
  const { showToast, Toast } = useToast();
  // Section names come from the shared graph (the student's own enrolments).
  // Read without the hook so the tab still renders outside the provider.
  const studentData = useContext(StudentDataContext);
  const enrolments = studentData?.graph?.enrolments;

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  // A dropped read used to leave stats at its all-zero initial value, so the
  // student saw "0 Present", "0%" and "No attendance records yet" — identical
  // to genuinely having no attendance. That is the failure this whole phase
  // set out to remove, so it gets its own state here too.
  const [loadError, setLoadError] = useState(false);
  const [month, setMonth] = useState(() => currentManilaMonth());
  const [section, setSection] = useState('all');
  const [paging, setPaging] = useState({ key: '', count: PAGE_SIZE });

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await withRetry(
        () => supabase
          .from('attendance')
          .select('*')
          .eq('student_id', userData?.uid)
          .order('date', { ascending: false }),
        { label: 'Attendance fetch' }
      );

      if (error) throw error;
      setRecords(data || []);
      setLoadError(false);
    } catch (err) {
      console.warn('Attendance fetch failed —', err?.message);
      setLoadError(true);
      showToast('Could not load your attendance. Check your connection.', 'error');
    }
    setLoading(false);
  }, [userData?.uid]);

  useEffect(() => {
    if (userData?.uid) fetchAttendance();
  }, [userData?.uid, fetchAttendance]);

  // Totals and the rate cover every row (the same rows and rule as the
  // Overview card); the month and section filters narrow the list only.
  const totals = useMemo(() => attendanceTotals(records), [records]);
  const rate = attendanceRate(totals);

  const sectionNames = useMemo(() => new Map((enrolments || [])
    .filter(e => e?.section_id && e.sections?.name).map(e => [e.section_id, e.sections.name])), [enrolments]);
  const sectionIds = useMemo(() => [...new Set(records.map(r => r.section_id).filter(Boolean))], [records]);
  const sectionName = id => sectionNames.get(id) || (id ? 'Other section' : '—');
  const months = useMemo(() => monthOptions(records), [records]);

  // Newest first, whatever order the rows arrived in.
  const filtered = useMemo(() => records
    .filter(r => month === 'all' || monthOf(r.date) === month)
    .filter(r => section === 'all' || r.section_id === section)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))), [records, month, section]);
  const filterKey = `${month}|${section}`;
  const shownCount = paging.key === filterKey ? paging.count : PAGE_SIZE;
  const shown = filtered.slice(0, shownCount);
  // ---- end of the copy ----
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  const today = manilaDateToday();
  // The PDF's three count cards; Excused is a line in the rate card (when > 0).
  const tiles = [['Present', totals.present], ['Late', totals.late], ['Absent', totals.absent]];

  return (
    <div className="x-sat">
      <Toast />
      <div className="x-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">My Attendance</h1>
          <p className="x-sub">Your attendance records</p>
        </div>
        <div className="x-act">
          <button type="button" className="x-iconbtn" onClick={fetchAttendance} aria-label="Refresh attendance">
            <RefreshCw size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* U-PDF-S (design p11): Present, Late, Absent and the rate ring on top. */}
      {loading ? (
        <>
          <p className="x-sr" role="status">Loading your attendance…</p>
          <SkeletonGroup className="x-sat-stats">
            <div className="x-sat-tiles">{[0, 1, 2].map(i => <div key={i} className="x-card"><p className="x-kl"><Skeleton inline h="0.8em" w="50%" /></p><p className="x-kv"><Skeleton inline h="0.8em" w="30%" /></p></div>)}</div>
            <div className="x-card x-sat-rate"><p className="x-kl"><Skeleton inline h="0.8em" w="60%" /></p><div className="x-sat-ring"><Skeleton w="100%" h="100%" className="sk-round" /></div></div>
          </SkeletonGroup>
        </>
      ) : loadError ? (
        <div className="x-card x-pad x-empty x-sat-error">
          <p role="alert" className="x-ct">Could not load your attendance.</p>
          <p className="x-cs">This is a loading problem, not an empty record. Check your connection and try again.</p>
          <button type="button" className="x-btn" onClick={fetchAttendance}>Retry</button>
        </div>
      ) : (
        <div className="x-sat-stats">
          {totals.total > 0 && (
            <section aria-label="Attendance totals" className="x-sat-tiles">
              {tiles.map(([label, value]) => <div key={label} className="x-card"><p className="x-kl">{label}</p><p className="x-kv">{value}</p></div>)}
            </section>
          )}
          <section className="x-card x-sat-rate" aria-label="Attendance rate" title={RATE_RULE}>
            {totals.total === 0 ? <p className="x-empty">No attendance recorded yet.</p> : <>
              <div className="x-sat-ratecopy">
                <h2 className="x-kl">Attendance rate</h2>
                <p className="x-cs">{totals.present} of {totals.total} days</p>
                {totals.excused > 0 && <p className="x-cs">{totals.excused} excused</p>}
                <p className="x-sr">{RATE_RULE}</p>
              </div>
              <div className="x-sat-ring"><ProgressRing value={rate} label="Attendance rate" detail={`${totals.total} total days recorded`} /></div>
            </>}
          </section>
        </div>
      )}
      {!loading && !loadError && totals.other > 0 && (
        <p className="x-cs">{totals.other} other {totals.other === 1 ? 'record' : 'records'} (not Present, Late, Absent or Excused).</p>
      )}

      {!loading && !loadError && records.length > 0 && (
        <section className="x-card x-sat-records" aria-labelledby="x-sat-records">
          <h2 id="x-sat-records" className="x-ct">Attendance records</h2>
          {filtered.length === 0 ? (
            <p className="x-empty">No attendance recorded {month === 'all' ? 'for this section' : `in ${monthLabel(month)}`}.</p>
          ) : <>
            <div className="x-tw">
              <table className="x-table">
                <thead><tr>{['Date', 'Status'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
                <tbody>
                  {shown.map((r, i) => {
                    // Section, subject and notes stay, as one muted line under the date.
                    const detail = [r.section_id ? sectionName(r.section_id) : '', r.subject || '', r.remarks || ''].filter(Boolean);
                    return (
                      <tr key={r.id || i}>
                        <td>
                          <span className="x-sat-day">{recordDay(r.date, today.slice(0, 4))}</span>
                          {detail.length > 0 && <span className="x-sat-detail">{detail.join(' · ')}</span>}
                        </td>
                        <td><StatusPill row={r} dot /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="x-sat-more">
              <p className="x-cs">Showing {shown.length} of {filtered.length}</p>
              {shown.length < filtered.length && (
                <button type="button" className="x-btn" onClick={() => setPaging({ key: filterKey, count: shownCount + PAGE_SIZE })}>Show more</button>
              )}
            </div>
          </>}
        </section>
      )}

      {/* Your Q1 answer: the month calendar and its Month/Section selectors stay, below the records. */}
      <section className="x-card x-pad x-sat-cal" aria-labelledby="x-sat-month">
          <div className="x-sat-calhead">
            <h2 id="x-sat-month" className="x-ct">{month === 'all' ? 'All months' : monthLabel(month)}</h2>
            {loading && (
              <SkeletonGroup className="x-sat-tools">
                <span className="x-label"><Skeleton inline h="0.8em" w={44} /><span className="x-select" style={{ display: 'block', width: 150 }} /></span>
              </SkeletonGroup>
            )}
            {!loading && !loadError && records.length > 0 && (
              <div className="x-sat-tools">
                <label className="x-label">Month
                  <select className="x-select" value={month} onChange={e => setMonth(e.target.value)}>
                    {months.map(key => <option key={key} value={key}>{monthLabel(key)}</option>)}
                    <option value="all">All</option>
                  </select>
                </label>
                {sectionIds.length > 1 && (
                  <label className="x-label">Section
                    <select className="x-select" value={section} onChange={e => setSection(e.target.value)}>
                      <option value="all">All</option>
                      {sectionIds.map(id => <option key={id} value={id}>{sectionName(id)}</option>)}
                    </select>
                  </label>
                )}
              </div>
            )}
          </div>
          {loading ? (
            <>
              <SkeletonGroup>
                <table className="x-sat-grid">
                  <thead><tr>{[0, 1, 2, 3, 4, 5, 6].map(d => <th key={d} scope="col"><Skeleton inline h="0.8em" w={24} /></th>)}</tr></thead>
                  <tbody>
                    {[0, 1, 2, 3, 4].map(w => (
                      <tr key={w}>{[0, 1, 2, 3, 4, 5, 6].map(d => <td key={d}><span className="x-sat-d"><Skeleton inline h="0.8em" w={14} /></span></td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </SkeletonGroup>
            </>
          )
            : loadError ? (
              <p className="x-empty">The calendar needs your attendance, which could not be loaded.</p>
            )
            : month === 'all' ? <p className="x-empty">Choose a month to see it on the calendar. Every record is listed above.</p>
            : <MonthCalendar month={month} rows={filtered} today={today} />}
        </section>
      <p className="x-cs x-sat-note">Attendance is recorded once a day by your adviser.</p>
    </div>
  );
};

export default ClarityStudentAttendanceTab;
