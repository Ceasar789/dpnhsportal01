// ============================================
// FILE: src/pages/dashboards/teacher/tabs/AttendanceTab.jsx
// ATTENDANCE TAB — daily attendance for the teacher's advisory sections.
// Marks are a local draft until Save; Save goes through the trusted
// eduscribe_attendance_save_v1 function (attendanceSaveClient.js).
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import { philippineDateKey } from '../../../../lib/calendarRules';
import { Check, Loader2 } from 'lucide-react';
import { useToast } from '../hooks';
import { Badge, Btn, Card, Toast } from '../shared/ui';
import useDialogSafety from '../worksheets/useDialogSafety';
import { saveAttendance } from './attendanceSaveClient';

const CARD_STYLE = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' };
const FIELD_STYLE = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' };
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

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

const AttendanceTab = () => {
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

  const savedText = student => {
    const saved = savedOf(student);
    return <span className="text-xs" style={{ color: saved ? 'var(--text)' : 'var(--text-muted)' }}>{saved ? `Saved: ${saved}` : 'Not marked'}</span>;
  };

  const statusButtons = student => {
    const effective = effectiveOf(student);
    return (
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label={`Mark attendance for ${student.name}`}>
        {STATUSES.map(status => {
          const selected = effective === status.value;
          return (
            <button key={status.value} type="button" onClick={() => mark(student, status.value)}
              disabled={readOnly || saving} aria-pressed={selected} aria-label={`Mark ${student.name} ${status.value}`}
              className={`min-h-11 px-3 rounded-lg text-xs font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-1.5 ${FOCUS}`}
              style={{
                backgroundColor: selected ? status.tone.bg : 'var(--card-bg)',
                color: selected ? status.tone.color : 'var(--text)',
                border: selected ? `2px solid ${status.tone.color}` : '1px solid var(--border)',
              }}>
              {selected && <Check size={13} aria-hidden="true" />}
              {status.value}
            </button>
          );
        })}
      </div>
    );
  };

  const studentCell = student => (
    <div className="min-w-0">
      <p className="font-medium text-sm break-words" style={{ color: 'var(--text)' }}>{student.name}</p>
      {student.lrn && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>LRN {student.lrn}</p>}
      <p className="mt-1 flex flex-wrap items-center gap-2">
        {savedText(student)}
        {Object.prototype.hasOwnProperty.call(draft, student.id) && <Badge color="var(--badge-yellow-fg)" bg="var(--badge-yellow-bg)">Unsaved</Badge>}
      </p>
    </div>
  );

  const showSaveBar = !readOnly && !loading && !loadError && roster.length > 0;

  return (
    <div className={`p-6 min-w-0 ${showSaveBar ? 'pb-28' : ''}`}>
      {routeBlocker}
      <Toast toast={toast} />
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-4 gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Attendance</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Take daily attendance for your advisory sections.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="teacher-attendance-section" className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            Advisory section (daily attendance)
            <select id="teacher-attendance-section" value={selectedSectionId} onChange={event => changeSection(event.target.value)}
              disabled={saving} className={`block mt-1 h-11 px-3 rounded-lg text-sm ${FOCUS}`} style={FIELD_STYLE}>
              {sections.length === 0 && <option value="">No advisory section</option>}
              {sections.map(section => <option key={section.id} value={String(section.id)}>
                {[section.grade_level, section.name, section.school_year || 'Year unavailable'].filter(Boolean).join(' · ')}
              </option>)}
            </select>
          </label>
          <label htmlFor="teacher-attendance-date" className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            Date
            <input id="teacher-attendance-date" type="date" value={selectedDate} max={today}
              onChange={event => changeDate(event.target.value)} disabled={loading || saving}
              className={`block mt-1 h-11 px-3 rounded-lg text-sm disabled:opacity-60 ${FOCUS}`} style={FIELD_STYLE} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Btn variant="outline" className="min-h-11" onClick={() => changeDate(shiftDate(selectedDate, -1))} disabled={loading || saving}>Previous day</Btn>
            <Btn variant="outline" className="min-h-11" onClick={() => changeDate(today)} disabled={loading || saving || selectedDate === today}>Today</Btn>
            <Btn variant="outline" className="min-h-11" onClick={() => changeDate(shiftDate(selectedDate, 1))} disabled={loading || saving || selectedDate >= today}>Next day</Btn>
          </div>
        </div>
      </div>
      {busyNotice && <p role="status" className="text-sm mb-3">{busyNotice}</p>}

      {!loading && !loadError && !hasSections ? (
        <Card className="p-6" style={CARD_STYLE}>
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>You have no advisory section assigned yet.</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Only a section&apos;s adviser takes its daily attendance. To see the sections you teach, open{' '}
            <Link to="/teacher-dashboard/students" className="underline font-semibold" style={{ color: 'var(--accent)' }}>Students</Link>.
          </p>
        </Card>
      ) : <>
        {selectedSection && <div className="mb-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            Daily attendance – {[selectedSection.grade_level, selectedSection.name].filter(Boolean).join(' ')} – Advisory
          </h2>
          {readOnly && <p role="note" className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {currentYear ? 'This is a past school year. Attendance is view-only.' : 'The current school year is not set, so attendance is view-only.'}
          </p>}
          {classNoteText && <p role="note" className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{classNoteText}</p>}
        </div>}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4" aria-label="Attendance totals">
          {[...counts.map(stat => ({ label: stat.value, count: stat.count, color: stat.color })),
            { label: 'Not marked', count: unmarked.length, color: 'var(--text-muted)' }].map(stat => (
            <Card key={stat.label} className="p-4" style={CARD_STYLE}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: stat.color }}>{loading || loadError ? '—' : stat.count}</p>
            </Card>
          ))}
        </div>

        <Card style={CARD_STYLE}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm" role="status" style={{ color: 'var(--text-muted)' }}>
              <Loader2 className="animate-spin" aria-hidden="true" /> Loading attendance…
            </div>
          ) : loadError ? (
            <div className="p-6 text-center">
              <p role="alert" className="text-sm font-medium" style={{ color: 'var(--text)' }}>Could not load attendance for this date.</p>
              <button type="button" onClick={() => fetchData()} className={`mt-3 min-h-11 px-4 rounded-lg text-sm font-semibold ${FOCUS}`}
                style={{ color: 'var(--accent)', border: '1px solid var(--border)' }}>Retry</button>
            </div>
          ) : roster.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No students are enrolled in this advisory section.</p>
          ) : (
            <>
              <div className="px-4 pt-4 pb-3 flex flex-wrap items-center gap-2">
                <input type="search" aria-label="Search students" placeholder="Search by name or LRN" value={search}
                  onChange={event => setSearch(event.target.value)}
                  className={`flex-1 min-w-[12rem] h-11 px-3 rounded-lg text-sm ${FOCUS}`} style={FIELD_STYLE} />
                <button type="button" aria-pressed={notMarkedOnly} onClick={() => setNotMarkedOnly(value => !value)}
                  className={`min-h-11 px-3 rounded-lg text-sm font-semibold ${FOCUS}`}
                  style={notMarkedOnly ? { color: '#ffffff', backgroundColor: 'var(--accent)', border: '1px solid var(--accent)' }
                    : { color: 'var(--text)', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                  Not marked only
                </button>
                {!readOnly && unmarked.length > 0 && <Btn variant="outline" className="min-h-11" onClick={markAllPresent} disabled={saving}>Mark all present</Btn>}
              </div>
              <p className="px-4 pb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                {visible.length} of {roster.length} {roster.length === 1 ? 'student' : 'students'} · {selectedDate}
                {weekdayOf(selectedDate) ? ` (${weekdayOf(selectedDate)})` : ''}
              </p>
              {visible.length === 0 ? (
                <div className="px-4 pb-6 flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                  <p>No students match.</p>
                  <Btn variant="outline" className="min-h-11" onClick={() => { setSearch(''); setNotMarkedOnly(false); }}>Clear</Btn>
                </div>
              ) : <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left">
                    <thead style={{ backgroundColor: 'var(--card2)' }}><tr>
                      {['Student', 'Attendance'].map(header => (
                        <th key={header} scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--text-muted)' }}>{header}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {visible.map(student => (
                        <tr key={`${student.sectionId}:${student.id}`} style={{ borderTop: '1px solid var(--border)' }}>
                          <td className="px-5 py-3.5 align-top">{studentCell(student)}</td>
                          <td className="px-5 py-3.5">{statusButtons(student)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="md:hidden divide-y" style={{ borderColor: 'var(--border)' }} aria-label="Attendance roster">
                  {visible.map(student => (
                    <li key={`${student.sectionId}:${student.id}`} className="px-4 py-4 min-w-0 space-y-3">
                      {studentCell(student)}
                      {statusButtons(student)}
                    </li>
                  ))}
                </ul>
              </>}
            </>
          )}
        </Card>
        <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
          Export is unavailable. Attendance can be reviewed by date here.
        </p>
      </>}

      <p aria-live="polite" className="sr-only">{saveNotice}</p>
      {showSaveBar && (
        <div className="sticky bottom-0 z-10 mt-4 -mx-6 px-6 py-3 border-t flex flex-col gap-2"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--border)' }}>
          {saveError && <p role="alert" className="text-sm" style={{ color: 'var(--red)' }}>{saveError}</p>}
          {refreshFailed && <p role="alert" className="text-sm flex flex-wrap items-center gap-2" style={{ color: 'var(--text)' }}>
            Saved, but the list could not be refreshed. Retry.
            <Btn variant="outline" className="min-h-11" onClick={retryRefresh}>Retry</Btn>
          </p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm" style={{ color: 'var(--text)' }}>{unsavedCount} unsaved {unsavedCount === 1 ? 'change' : 'changes'}</p>
            <div className="flex flex-wrap gap-2">
              <Btn variant="outline" className="min-h-11" onClick={() => { setDraft({}); setSaveError(''); }} disabled={unsavedCount === 0 || saving}>Discard</Btn>
              <Btn variant="primary" className="min-h-11" onClick={save} disabled={unsavedCount === 0 || saving} busy={saving}>
                {saving ? 'Saving…' : 'Save attendance'}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceTab;
