// ============================================
// FILE: src/components/clarity/teacher/ClarityTeacherAttendanceTab.jsx
// The Teacher Attendance tab in Clarity (final design, real data only). The
// same reads, local draft, save (the trusted attendance save client), guards
// and states as the classic AttendanceTab. A roster table with Present /
// Absent / Late / Excused per student, and a sticky summary card with the
// real counts for the date on screen, the share marked Present, and the
// classic save controls (unsaved count, Discard, Save attendance).
//
// TEMPORARY word-for-word copies from pages/dashboards/teacher/tabs/AttendanceTab.jsx
// (source-parity tested in ClarityTeacherT3Sources.test.js); after the defense
// the classic tab and this one should share them. No substitutions.
//   - TopToast, :23-33
//   - STATUSES, WEEKDAYS and the date helpers, :39-60
//   - the state, reads, guards, marking, save and derived values, :63-347
//   - showSaveBar, :389
// ============================================
/* eslint-disable react-hooks/set-state-in-effect -- the TEMPORARY copy below is the classic tab's own code, word for word, which the linter flags the same way in the classic file (AttendanceTab.jsx:215). */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../config/supabase';
import { withRetry } from '../../../lib/supabaseRetry';
import { philippineDateKey } from '../../../lib/calendarRules';
import { useToast } from '../../../pages/dashboards/teacher/hooks';
import { Toast } from '../../../pages/dashboards/teacher/shared/ui';
import useDialogSafety from '../../../pages/dashboards/teacher/worksheets/useDialogSafety';
import { saveAttendance } from '../../../pages/dashboards/teacher/tabs/attendanceSaveClient';
import { initials } from '../../../pages/dashboards/admin/shared/helpers';
import ProgressRing from '../charts/ProgressRing';

// ---- TEMPORARY copy (AttendanceTab.jsx:23-33) ----
const TopToast = ({ toast }) => {
  const message = toast && (
    <div data-attendance-toast="top" className={`fixed top-4 left-4 right-4 sm:left-auto px-4 py-3 rounded-lg text-white font-semibold shadow-lg ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`} style={{ zIndex: 60 }}>
      {toast.msg}
    </div>
  );
  return createPortal(<>
    <div role="status" aria-live="polite" data-modal-live-region="true">{toast?.type !== 'error' && message}</div>
    <div role="alert" aria-live="assertive" data-modal-live-region="true">{toast?.type === 'error' && message}</div>
  </>, document.body);
};
// ---- end of the copy ----

// ---- TEMPORARY copy (AttendanceTab.jsx:39-60) ----
const STATUSES = [
  { value: 'Present', color: 'var(--green)', tone: { color: 'var(--badge-green-fg)', bg: 'var(--badge-green-bg)' } },
  { value: 'Absent', color: 'var(--red)', tone: { color: 'var(--badge-red-fg)', bg: 'var(--badge-red-bg)' } },
  { value: 'Late', color: 'var(--yellow)', tone: { color: 'var(--badge-yellow-fg)', bg: 'var(--badge-yellow-bg)' } },
  { value: 'Excused', color: 'var(--accent)', tone: { color: 'var(--badge-blue-fg)', bg: 'var(--badge-blue-bg)' } },
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Manila YYYY-MM-DD strings only: the arithmetic is done in UTC on the string's
// own calendar date, so the browser's time zone never shifts the day.
const dateParts = key => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};
const weekdayOf = key => {
  const ms = dateParts(key);
  return ms === null ? null : WEEKDAYS[new Date(ms).getUTCDay()];
};
const shiftDate = (key, days) => {
  const ms = dateParts(key);
  return ms === null ? key : new Date(ms + days * 86400000).toISOString().slice(0, 10);
};
// ---- end of the copy ----

// The Clarity status button classes (.x-pst p / a / l / e).
const PST = { Present: 'p', Absent: 'a', Late: 'l', Excused: 'e' };
// "Thu, Nov 12, 2026" for the Manila date key on screen, read in UTC on its own date.
const DAY_LABEL = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const dayLabel = key => { const ms = dateParts(key); return ms === null ? key : DAY_LABEL.format(new Date(ms)); };

const ClarityTeacherAttendanceTab = () => {
  // ---- TEMPORARY copy (AttendanceTab.jsx:63-347) ----
  const { userData } = useAuth();
  const uid = userData?.uid;
  const { toast, showToast } = useToast();
  const today = philippineDateKey();
  const [students, setStudents] = useState([]);
  // `${sectionId}:${studentId}` -> saved daily status for the selected date.
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => philippineDateKey());
  const [sections, setSections] = useState([]);
  const [currentYear, setCurrentYear] = useState(null);
  const [hasSections, setHasSections] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  // studentId -> status | null, only for students whose draft differs from saved.
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [notMarkedOnly, setNotMarkedOnly] = useState(false);
  // { key, text }: shown only while key matches the section and date on screen.
  const [classNote, setClassNote] = useState({ key: '', text: '' });
  const [draftOwner, setDraftOwner] = useState(uid);
  const readRequestRef = useRef(0);
  const contextRef = useRef('');
  const aliveRef = useRef(true);
  const context = `${uid}|${selectedSectionId}|${selectedDate}`;
  const noteKey = `${selectedSectionId}|${selectedDate}`;

  // A different teacher never inherits another teacher's unsaved marks.
  if (draftOwner !== uid) {
    setDraftOwner(uid);
    setDraft({});
    setSaveError('');
    setSaveNotice('');
    setRefreshFailed(false);
  }

  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const changeCount = Object.keys(draft).length;
  const { requestClose, routeBlocker, busyNotice } = useDialogSafety({
    dirty: changeCount > 0, pending: saving, onClose: () => {},
    discardMessage: 'Discard unsaved changes?', leaveMessage: 'Discard unsaved changes?',
  });

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++readRequestRef.current;
    const isCurrent = () => requestId === readRequestRef.current;
    if (!silent) { setLoading(true); setLoadError(false); }
    try {
      const { data: sectionsData, error: sectionsError } = await withRetry(
        () => supabase.from('sections').select('id, name, grade_level, school_year').eq('adviser_id', uid),
        { label: 'Advisory sections fetch' }
      );
      if (sectionsError) throw sectionsError;

      const sectionIds = sectionsData?.map(s => s.id) || [];
      let settings = null;
      if (sectionIds.length > 0) {
        const result = await withRetry(
          () => supabase.from('school_settings').select('school_year').eq('id', 1).single(),
          { label: 'Attendance school year fetch' }
        );
        if (result.error) throw result.error;
        settings = result.data;
      }
      if (!isCurrent()) return null;
      setSections(sectionsData || []);
      setCurrentYear(settings?.school_year || null);
      const currentSection = (sectionsData || []).find(section => section.school_year === settings?.school_year);
      setSelectedSectionId(previous => sectionIds.some(id => String(id) === String(previous))
        ? previous : String(currentSection?.id || sectionIds[0] || ''));
      setHasSections(sectionIds.length > 0);

      // A teacher who advises no section has nothing to mark; no `.in()` with an empty list.
      if (sectionIds.length === 0) {
        setStudents([]);
        setAttendance({});
        return {};
      }

      // Three plain reads: students.id has no foreign key to profiles, so no embed.
      const { data: links, error: studentsError } = await withRetry(
        () => supabase.from('section_students').select('student_id, section_id')
          .in('section_id', sectionIds).eq('status', 'active'),
        { label: 'Section students fetch' }
      );
      if (studentsError) throw studentsError;

      const studentIds = [...new Set((links || []).map(l => l.student_id))];
      let studentRows = [];
      let profileRows = [];
      if (studentIds.length > 0) {
        const [studentResult, profileResult] = await Promise.all([
          withRetry(() => supabase.from('students').select('id, lrn').in('id', studentIds),
            { label: 'Student records fetch' }),
          withRetry(() => supabase.from('profiles').select('id, name').in('id', studentIds),
            { label: 'Student names fetch' }),
        ]);
        if (studentResult.error) throw studentResult.error;
        if (profileResult.error) throw profileResult.error;
        studentRows = studentResult.data || [];
        profileRows = profileResult.data || [];
      }
      const mappedStudents = (links || []).map(link => ({
        id: link.student_id,
        lrn: studentRows.find(s => s.id === link.student_id)?.lrn || null,
        name: profileRows.find(p => p.id === link.student_id)?.name || 'Unnamed student',
        sectionId: link.section_id,
      }));

      // Daily rows only: a row with a subject is not the homeroom mark.
      const { data: attendanceData, error: attendanceError } = await withRetry(
        () => supabase.from('attendance').select('student_id, section_id, status, subject')
          .in('section_id', sectionIds).eq('date', selectedDate).is('subject', null),
        { label: 'Attendance records fetch' }
      );
      if (attendanceError) throw attendanceError;
      if (!isCurrent()) return null;

      const attMap = {};
      (attendanceData || []).forEach(a => { attMap[`${a.section_id}:${a.student_id}`] = a.status; });
      setStudents(mappedStudents);
      setAttendance(attMap);
      return attMap;
    } catch (error) {
      if (!isCurrent()) return null;
      console.warn('Teacher attendance load failed —', error?.message);
      // A silent re-read after a save keeps what is on screen; only a full load clears it.
      if (!silent) {
        setLoadError(true);
        setStudents([]);
        setAttendance({});
        setSections([]);
        setSelectedSectionId('');
        setHasSections(false);
        showToast('Could not load attendance. Check your connection and retry.', 'error');
      }
      return null;
    } finally {
      if (!silent && isCurrent()) setLoading(false);
    }
  }, [uid, selectedDate, showToast]);

  useEffect(() => {
    fetchData();
    return () => { readRequestRef.current += 1; };
  }, [fetchData]);


  const selectedSection = sections.find(section => String(section.id) === selectedSectionId) || null;
  const readOnly = !selectedSection || !currentYear || selectedSection.school_year !== currentYear;
  const roster = students.filter(student => String(student.sectionId) === selectedSectionId);
  const savedOf = student => attendance[`${student.sectionId}:${student.id}`] || null;
  const effectiveOf = student => (Object.prototype.hasOwnProperty.call(draft, student.id) ? draft[student.id] : savedOf(student));

  // The class-today note: quiet, never blocks, and any failed or empty read shows nothing.
  useEffect(() => {
    if (!selectedSectionId || !weekdayOf(selectedDate)) return undefined;
    let active = true;
    const key = `${selectedSectionId}|${selectedDate}`;
    (async () => {
      const notes = [];
      try {
        const weekday = weekdayOf(selectedDate);
        const { data: rows, error } = await supabase.from('schedules').select('day_of_week')
          .eq('section_id', selectedSectionId);
        if (!error && Array.isArray(rows)) {
          const days = new Set(rows.map(row => String(row.day_of_week || '').trim().toLowerCase()));
          if (rows.length > 0 && !days.has(weekday.toLowerCase())) notes.push(`No classes are scheduled for this section on ${weekday}.`);
          if (rows.length === 0 && (weekday === 'Saturday' || weekday === 'Sunday')) notes.push(`${weekday}: no regular classes.`);
        }
      } catch { /* no note */ }
      try {
        const { data: events, error } = await supabase.from('calendar_events').select('title, event_date, end_date')
          .eq('event_type', 'Holiday').lte('event_date', selectedDate);
        if (!error && Array.isArray(events)) {
          events.filter(event => (event.end_date || event.event_date) >= selectedDate && event.title)
            .forEach(event => notes.push(`${event.title} (holiday)`));
        }
      } catch { /* no note */ }
      if (active) setClassNote({ key, text: notes.join(' ') });
    })();
    return () => { active = false; };
  }, [selectedSectionId, selectedDate]);
  const classNoteText = classNote.key === noteKey ? classNote.text : '';

  const resetForContext = () => { setDraft({}); setSaveError(''); setSaveNotice(''); setRefreshFailed(false); };
  const changeDate = value => {
    if (!value || value === selectedDate) return;
    requestClose(() => { resetForContext(); setSelectedDate(value); });
  };
  const changeSection = value => {
    if (value === selectedSectionId) return;
    requestClose(() => { resetForContext(); setSelectedSectionId(value); });
  };

  const mark = (student, status) => {
    if (readOnly || saving) return;
    setSaveError('');
    setSaveNotice('');
    const target = effectiveOf(student) === status ? null : status;
    setDraft(previous => {
      const next = { ...previous };
      if (target === savedOf(student)) delete next[student.id];
      else next[student.id] = target;
      return next;
    });
  };

  const unmarked = roster.filter(student => effectiveOf(student) === null);
  const markAllPresent = () => {
    if (readOnly || saving || unmarked.length === 0) return;
    setSaveError('');
    setDraft(previous => {
      const next = { ...previous };
      unmarked.forEach(student => {
        if (savedOf(student) === 'Present') delete next[student.id];
        else next[student.id] = 'Present';
      });
      return next;
    });
  };

  const save = async () => {
    if (readOnly || saving || changeCount === 0) return;
    const marks = roster.filter(student => Object.prototype.hasOwnProperty.call(draft, student.id))
      .map(student => ({ student_id: student.id, status: draft[student.id] }));
    if (marks.length === 0) return;
    const started = context;
    const sectionId = selectedSectionId;
    setSaving(true);
    setSaveError('');
    setSaveNotice('');
    setRefreshFailed(false);
    const result = await saveAttendance({ sectionId, date: selectedDate, marks });
    // A late answer for a section, date or teacher no longer on screen is ignored.
    if (!aliveRef.current) return;
    if (contextRef.current !== started) { setSaving(false); return; }
    if (!result.ok) {
      setSaving(false);
      setSaveError(result.message);
      showToast(result.message, 'error');
      return;
    }
    const verified = await fetchData({ silent: true });
    if (!aliveRef.current) return;
    if (contextRef.current !== started) { setSaving(false); return; }
    if (verified === null) {
      // The save happened: show what was sent, and say the list is not confirmed.
      setAttendance(previous => {
        const next = { ...previous };
        marks.forEach(item => {
          const key = `${sectionId}:${item.student_id}`;
          if (item.status === null) delete next[key];
          else next[key] = item.status;
        });
        return next;
      });
      setRefreshFailed(true);
    }
    setDraft({});
    setSaving(false);
    setSaveNotice('Attendance saved.');
    showToast('Attendance saved.');
  };

  const retryRefresh = async () => {
    const verified = await fetchData({ silent: true });
    if (verified !== null) setRefreshFailed(false);
  };

  const query = search.trim().toLowerCase();
  const visible = roster.filter(student => (!query || student.name.toLowerCase().includes(query)
      || String(student.lrn || '').toLowerCase().includes(query))
    && (!notMarkedOnly || effectiveOf(student) === null));
  const counts = STATUSES.map(status => ({ ...status, count: roster.filter(student => effectiveOf(student) === status.value).length }));
  const unsavedCount = roster.filter(student => Object.prototype.hasOwnProperty.call(draft, student.id)).length;
  // ---- end of the copy ----
  // ---- TEMPORARY copy (AttendanceTab.jsx:389) ----
  const showSaveBar = !readOnly && !loading && !loadError && roster.length > 0;
  // ---- end of the copy ----

  const present = counts.find(c => c.value === 'Present').count;
  const ready = !loading && !loadError && roster.length > 0;

  return (
    <div className="x-tat">
      {routeBlocker}
      {showSaveBar ? <TopToast toast={toast} /> : <Toast toast={toast} />}
      <div className="x-head x-ov-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Attendance</h1>
          <p className="x-sub">Take daily attendance for your advisory sections.</p>
        </div>
        <div className="x-tat-pick">
          <label htmlFor="teacher-attendance-section" className="x-label">
            Advisory section (daily attendance)
            <select id="teacher-attendance-section" className="x-select" value={selectedSectionId} onChange={event => changeSection(event.target.value)} disabled={saving}>
              {sections.length === 0 && <option value="">No advisory section</option>}
              {sections.map(section => <option key={section.id} value={String(section.id)}>
                {[section.grade_level, section.name, section.school_year || 'Year unavailable'].filter(Boolean).join(' · ')}
              </option>)}
            </select>
          </label>
          <label htmlFor="teacher-attendance-date" className="x-label">
            Date
            <input id="teacher-attendance-date" type="date" className="x-input" value={selectedDate} max={today}
              onChange={event => changeDate(event.target.value)} disabled={loading || saving} />
          </label>
          <div className="x-tat-days">
            <button type="button" className="x-btn" aria-label="Previous day" onClick={() => changeDate(shiftDate(selectedDate, -1))} disabled={loading || saving}><ChevronLeft size={16} aria-hidden="true" /></button>
            <button type="button" className="x-btn" onClick={() => changeDate(today)} disabled={loading || saving || selectedDate === today}>Today</button>
            <button type="button" className="x-btn" aria-label="Next day" onClick={() => changeDate(shiftDate(selectedDate, 1))} disabled={loading || saving || selectedDate >= today}><ChevronRight size={16} aria-hidden="true" /></button>
          </div>
        </div>
      </div>
      {busyNotice && <p role="status" className="x-cs">{busyNotice}</p>}

      {!loading && !loadError && !hasSections ? (
        <div className="x-card x-pad">
          <b>You have no advisory section assigned yet.</b>
          <p className="x-cs">
            Only a section&apos;s adviser takes its daily attendance. To see the sections you teach, open{' '}
            <Link to="/teacher-dashboard/students" className="x-link">Students</Link>.
          </p>
        </div>
      ) : <>
        {selectedSection && <div className="x-tat-section">
          <h2 className="x-ct">Daily attendance – {[selectedSection.grade_level, selectedSection.name].filter(Boolean).join(' ')} – Advisory</h2>
          {readOnly && <p role="note" className="x-cs">
            {currentYear ? 'This is a past school year. Attendance is view-only.' : 'The current school year is not set, so attendance is view-only.'}
          </p>}
          {classNoteText && <p role="note" className="x-cs">{classNoteText}</p>}
        </div>}

        <div className="x-tat-layout">
          <section className="x-card x-tat-list" aria-label="Attendance roster">
            {loading ? (
              <p className="x-empty" role="status">Loading attendance…</p>
            ) : loadError ? (
              <div className="x-empty">
                <p role="alert">Could not load attendance for this date.</p>
                <button type="button" className="x-btn" onClick={() => fetchData()}>Retry</button>
              </div>
            ) : roster.length === 0 ? (
              <p className="x-empty">No students are enrolled in this advisory section.</p>
            ) : <>
              <div className="x-tat-tools">
                <label className="x-search">
                  <Search size={16} aria-hidden="true" />
                  <input type="search" aria-label="Search students" placeholder="Search by name or LRN" value={search} onChange={event => setSearch(event.target.value)} />
                </label>
                <button type="button" className={`x-chip${notMarkedOnly ? ' on' : ''}`} aria-pressed={notMarkedOnly} onClick={() => setNotMarkedOnly(value => !value)}>Not marked only</button>
                {!readOnly && unmarked.length > 0 && <button type="button" className="x-btn" onClick={markAllPresent} disabled={saving}>Mark all present</button>}
              </div>
              <p className="x-cs x-tat-count">
                {visible.length} of {roster.length} {roster.length === 1 ? 'student' : 'students'} · {selectedDate}
                {weekdayOf(selectedDate) ? ` (${weekdayOf(selectedDate)})` : ''}
              </p>
              {visible.length === 0 ? (
                <div className="x-empty">
                  <p>No students match.</p>
                  <button type="button" className="x-btn" onClick={() => { setSearch(''); setNotMarkedOnly(false); }}>Clear</button>
                </div>
              ) : (
                <div className="x-tat-scroll">
                  <table className="x-table x-tat-table">
                    <thead><tr><th scope="col">Student</th><th scope="col">Attendance</th></tr></thead>
                    <tbody>
                      {visible.map(student => {
                        const effective = effectiveOf(student);
                        const saved = savedOf(student);
                        return (
                          <tr key={`${student.sectionId}:${student.id}`}>
                            <td>
                              <div className="nm">
                                <span className="x-avatar sm tint" aria-hidden="true">{initials(student.name)}</span>
                                <div style={{ minWidth: 0 }}>
                                  <b className="x-tat-name">{student.name}</b>
                                  {student.lrn && <span>LRN {student.lrn}</span>}
                                  <span>{saved ? `Saved: ${saved}` : 'Not marked'}{Object.prototype.hasOwnProperty.call(draft, student.id) && <> · <span className="x-badge wa">Unsaved</span></>}</span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <div className="x-pst" role="group" aria-label={`Mark attendance for ${student.name}`}>
                                {STATUSES.map(status => {
                                  const selected = effective === status.value;
                                  return (
                                    <button key={status.value} type="button" className={selected ? PST[status.value] : undefined}
                                      onClick={() => mark(student, status.value)} disabled={readOnly || saving}
                                      aria-pressed={selected} aria-label={`Mark ${student.name} ${status.value}`}>
                                      {selected && <Check size={13} aria-hidden="true" />}{status.value}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>}
          </section>

          <aside className="x-card x-pad x-tat-sum" aria-label="Attendance totals">
            <h2 className="x-ct">{selectedDate === today ? 'Today' : weekdayOf(selectedDate) || 'Date'} · {dayLabel(selectedDate)}</h2>
            {ready && (
              <div className="x-tat-ring">
                <ProgressRing value={(present / roster.length) * 100} label="Marked present" detail={`${present} of ${roster.length} students`} />
              </div>
            )}
            <dl className="x-tat-stats">
              {[...counts.map(stat => [stat.value, stat.count]), ['Not marked', unmarked.length]].map(([label, count]) => (
                <div key={label} className="x-card"><dt>{label}</dt><dd>{loading || loadError ? '' : count}</dd></div>
              ))}
            </dl>
            <p aria-live="polite" className="x-sr">{saveNotice}</p>
            {showSaveBar && (
              <div role="region" aria-label="Attendance save bar" className="x-tat-save">
                {saveError && <p role="alert" className="x-tat-err">{saveError}</p>}
                {refreshFailed && <p role="alert" className="x-cs x-tat-refresh">
                  Saved, but the list could not be refreshed. Retry.
                  <button type="button" className="x-btn" onClick={retryRefresh}>Retry</button>
                </p>}
                <p className="x-cs">{unsavedCount} unsaved {unsavedCount === 1 ? 'change' : 'changes'}</p>
                <div className="x-tat-saveact">
                  <button type="button" className="x-btn" onClick={() => { setDraft({}); setSaveError(''); }} disabled={unsavedCount === 0 || saving}>Discard</button>
                  <button type="button" className="x-btn pri" onClick={save} disabled={unsavedCount === 0 || saving} aria-busy={saving || undefined}>
                    {saving ? 'Saving…' : 'Save attendance'}
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
        <p className="x-cs x-tat-foot">Export is unavailable. Attendance can be reviewed by date here.</p>
      </>}
    </div>
  );
};

export default ClarityTeacherAttendanceTab;
