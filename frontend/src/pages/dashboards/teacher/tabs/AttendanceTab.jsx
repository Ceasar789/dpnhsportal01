// ============================================
// FILE: src/pages/dashboards/teacher/tabs/AttendanceTab.jsx
// ATTENDANCE TAB — Full Supabase CRUD
// Split from the original monolithic TeacherDashboard.jsx (2,918 lines)
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import { philippineDateKey } from '../../../../lib/calendarRules';
import { Check, Loader2 } from 'lucide-react';
import { useToast } from '../hooks';
import { Card, Toast } from '../shared/ui';

const CARD_STYLE = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' };
const trustedAttendanceWritesAvailable = false;

const STATUSES = [
  { code: 'P', label: 'Present', color: 'var(--green)' },
  { code: 'A', label: 'Absent', color: 'var(--red)' },
  { code: 'L', label: 'Late', color: 'var(--yellow)' },
  { code: 'E', label: 'Excused', color: 'var(--accent)' },
];
const STATUS_TONES = {
  P: { color: 'var(--badge-green-fg)', bg: 'var(--badge-green-bg)' },
  A: { color: 'var(--badge-red-fg)', bg: 'var(--badge-red-bg)' },
  L: { color: 'var(--badge-yellow-fg)', bg: 'var(--badge-yellow-bg)' },
  E: { color: 'var(--badge-blue-fg)', bg: 'var(--badge-blue-bg)' },
};

const AttendanceTab = () => {
  const { userData } = useAuth();
  const { toast, showToast } = useToast();
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => philippineDateKey());
  const [pendingIds, setPendingIds] = useState([]);
  const pendingRef = useRef(new Set());
  const readRequestRef = useRef(0);
  const [failedMarks, setFailedMarks] = useState({});
  const [unverifiedSave, setUnverifiedSave] = useState('');
  const [hasSections, setHasSections] = useState(false);
  const [sections, setSections] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  // Without this, every failure lands in the catch below, shows one passing
  // toast, and leaves the roster empty — "No students found", which is what an
  // advisory section with no enrolments looks like. Worse on a refetch: the
  // previous roster stays while the attendance map is cleared, so a failed
  // read reads as "nobody is marked today."
  const [loadError, setLoadError] = useState(false);

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++readRequestRef.current;
    const isCurrent = () => requestId === readRequestRef.current;
    if (!silent) setLoading(true);
    setLoadError(false);
    if (!silent) setFailedMarks({});
    try {
      // Get sections where this teacher is the adviser
      const { data: sectionsData, error: sectionsError } = await withRetry(
        () => supabase
          .from('sections')
          .select('id, name, grade_level, school_year')
          .eq('adviser_id', userData?.uid),
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
      const currentSection = (sectionsData || []).find(section => section.school_year === settings?.school_year);
      setSelectedSectionId(previous => sectionIds.some(id => String(id) === String(previous))
        ? previous : String(currentSection?.id || sectionIds[0] || ''));
      setHasSections(sectionIds.length > 0);

      // A teacher who advises no section has nothing to mark. Returning here
      // rather than issuing `.in('section_id', [])`, which some PostgREST
      // versions reject outright — that would greet a brand-new teacher with
      // a red error on a page that is simply not theirs to use yet.
      if (sectionIds.length === 0) {
        if (!isCurrent()) return null;
        setStudents([]);
        setAttendance({});
        if (!silent) setUnverifiedSave('');
        return {};
      }

      // Get students from these sections
      // Three plain reads rather than one nested select. `students.id`
      // references auth.users, and there is no foreign key from `students` to
      // `profiles` — so PostgREST cannot resolve a `students(profiles(...))`
      // embed and fails the whole request with PGRST200. That aborted this
      // fetch, left the class list empty, and meant no teacher could mark
      // anybody: the reason attendance has never been recorded in this system.
      const { data: links, error: studentsError } = await withRetry(
        () => supabase
          .from('section_students')
          .select('student_id, section_id')
          .in('section_id', sectionIds)
          .eq('status', 'active'),
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

      // section_id is carried through so marking attendance writes the section
      // the student is actually enrolled in for this roster, rather than
      // looking it up again and guessing when they have more than one.
      const mappedStudents = (links || []).map(link => ({
        id: link.student_id,
        lrn: studentRows.find(s => s.id === link.student_id)?.lrn || null,
        name: profileRows.find(p => p.id === link.student_id)?.name || 'Unnamed student',
        sectionId: link.section_id,
      }));

      // Get attendance records for selected date from any section
      const { data: attendanceData, error: attendanceError } = await withRetry(
        () => supabase
          .from('attendance')
          .select('*')
          .in('section_id', sectionIds)
          .eq('date', selectedDate),
        { label: 'Attendance records fetch' }
      );

      if (attendanceError) throw attendanceError;
      if (!isCurrent()) return null;
      
      const attMap = {};
      attendanceData?.forEach(a => { 
        attMap[`${a.section_id}:${a.student_id}`] = a.status.charAt(0).toUpperCase();
      });
      setStudents(mappedStudents);
      setAttendance(attMap);
      if (!silent) setUnverifiedSave('');
      return attMap;
    } catch (error) {
      if (!isCurrent()) return null;
      console.warn('Teacher attendance load failed —', error?.message);
      setLoadError(true);
      setStudents([]);
      setAttendance({});
      setSections([]);
      setSelectedSectionId('');
      setHasSections(false);
      showToast('Could not load attendance. Check your connection and retry.', 'error');
      return null;
    } finally {
      if (!silent && isCurrent()) setLoading(false);
    }
  }, [userData?.uid, selectedDate, showToast]);

  useEffect(() => {
    fetchData();
    return () => { readRequestRef.current += 1; };
  }, [fetchData]);

  const handleMark = async (student, status) => {
    if (!trustedAttendanceWritesAvailable) {
      showToast('Attendance saving is unavailable until trusted Teacher authorization is connected. Nothing was saved.', 'error');
      return;
    }
    if (pendingRef.current.size > 0) return;
    pendingRef.current.add(student.id);
    setPendingIds([...pendingRef.current]);
    setFailedMarks(previous => {
      const next = { ...previous };
      delete next[student.id];
      return next;
    });
    try {
      // The section comes from the roster row this student was listed under,
      // not from a fresh lookup. The old `.single()` errored outright for a
      // student enrolled in two sections, and could otherwise return a section
      // this teacher neither advises nor handles — which attendance_staff_write
      // then rejects, with the teacher seeing only a raw policy error.
      const sectionId = student.sectionId;

      if (!sectionId) {
        throw new Error('Section unavailable');
      }

      // Map status code to full status name
      const statusMap = { 'P': 'Present', 'A': 'Absent', 'L': 'Late', 'E': 'Excused' };
      const fullStatus = statusMap[status];
      
      const existing = attendance[student.id];
      
      if (existing) {
        const { error, status: responseStatus } = await supabase
          .from('attendance')
          .update({ status: fullStatus, updated_at: new Date().toISOString() })
          .eq('student_id', student.id)
          .eq('date', selectedDate)
          .eq('section_id', sectionId);
        if (error) {
          error.safeToRetry = responseStatus >= 400 && responseStatus < 500;
          throw error;
        }
      } else {
        const { error, status: responseStatus } = await supabase.from('attendance').insert([{
          student_id: student.id,
          section_id: sectionId,
          date: selectedDate,
          status: fullStatus,
          recorded_by: userData?.uid,
          created_at: new Date().toISOString()
        }]);
        if (error) {
          error.safeToRetry = responseStatus >= 400 && responseStatus < 500;
          throw error;
        }
      }
      const verified = await fetchData({ silent: true });
      if (verified === null) {
        setUnverifiedSave(student.name);
        showToast('Save may have completed, but attendance could not be verified. Retry the read before marking again.', 'error');
      } else if (verified[student.id] === status) {
        setUnverifiedSave('');
        showToast(`${fullStatus} saved for ${student.name}.`);
      } else {
        setFailedMarks(previous => ({ ...previous, [student.id]: status }));
        showToast(`Could not confirm ${fullStatus} for ${student.name}. Retry the row.`, 'error');
      }
    } catch (error) {
      console.warn('Teacher attendance save failed —', error?.message);
      if (error?.safeToRetry) {
        setFailedMarks(previous => ({ ...previous, [student.id]: status }));
        showToast(`Could not save attendance for ${student.name}. Retry the row.`, 'error');
      } else {
        setUnverifiedSave(student.name);
        showToast(`Could not confirm attendance for ${student.name}. Refresh this date before retrying.`, 'error');
      }
    } finally {
      pendingRef.current.delete(student.id);
      setPendingIds([...pendingRef.current]);
    }
  };

  const visibleStudents = students.filter(student => String(student.sectionId) === selectedSectionId);
  const visibleAttendance = Object.fromEntries(Object.entries(attendance).filter(([key]) => key.startsWith(`${selectedSectionId}:`)));
  const stats = STATUSES.map(status => ({
    ...status,
    count: Object.values(visibleAttendance).filter(value => value === status.code).length,
  }));

  const savedStatus = (student) => {
    const status = STATUSES.find(item => item.code === attendance[`${student.sectionId}:${student.id}`]);
    return <span className="text-xs font-semibold" style={{ color: status ? 'var(--text)' : 'var(--text-muted)' }}>
      {status ? `Saved: ${status.label}` : 'Not marked'}
    </span>;
  };

  const rowActions = (student) => {
    const pending = pendingIds.includes(student.id);
    const failed = failedMarks[student.id];
    return (
      <div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Mark attendance for ${student.name}`} aria-busy={pending}>
          {STATUSES.map(status => (
            <button key={status.code} type="button" onClick={() => handleMark(student, status.code)}
              disabled={pendingIds.length > 0} aria-pressed={attendance[`${student.sectionId}:${student.id}`] === status.code}
              aria-label={`Mark ${student.name} ${status.label}`}
              className="min-h-11 px-3 rounded-lg text-xs font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                backgroundColor: attendance[`${student.sectionId}:${student.id}`] === status.code ? STATUS_TONES[status.code].bg : 'var(--card-bg)',
                color: attendance[`${student.sectionId}:${student.id}`] === status.code ? STATUS_TONES[status.code].color : 'var(--text)',
                border: attendance[`${student.sectionId}:${student.id}`] === status.code
                  ? `2px solid ${STATUS_TONES[status.code].color}` : '1px solid var(--border)',
              }}>
              {attendance[`${student.sectionId}:${student.id}`] === status.code && <Check size={13} aria-hidden="true" />}
              {status.label}
            </button>
          ))}
        </div>
        {pending && <p role="status" className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Saving {student.name}…</p>}
        {failed && !pending && (
          <p role="alert" className="text-xs mt-2" style={{ color: 'var(--red)' }}>
            {STATUSES.find(item => item.code === failed)?.label} was not saved.{' '}
            <button type="button" onClick={() => handleMark(student, failed)}
              className="font-semibold underline rounded" style={{ color: 'var(--red)' }}>
              Retry for {student.name}
            </button>
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 min-w-0">
      <Toast toast={toast} />
      {unverifiedSave && (
        <div role="alert" className="mb-4 rounded-lg px-4 py-3 text-sm flex flex-wrap items-center gap-3" style={{ color: 'var(--badge-yellow-fg)', backgroundColor: 'var(--badge-yellow-bg)', border: '1px solid var(--badge-yellow-border)' }}>
          <p className="flex-1 min-w-0">Attendance for {unverifiedSave} could not be verified. The save may have completed. Refresh this date before marking again.</p>
          <button type="button" onClick={() => fetchData()} disabled={loading || pendingIds.length > 0}
            className="min-h-11 px-3 rounded-lg text-sm font-semibold disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: 'var(--text)', backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)' }}>Refresh date</button>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Attendance</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Review attendance for your advisory sections. Saving is currently unavailable.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="teacher-attendance-section" className="text-sm font-medium" style={{ color: 'var(--text)' }}>Section</label>
          <select id="teacher-attendance-section" value={selectedSectionId} onChange={event => setSelectedSectionId(event.target.value)}
            className="h-11 px-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
            {sections.length === 0 && <option value="">No advisory section</option>}
            {sections.map(section => <option key={section.id} value={String(section.id)}>
              {[section.grade_level, section.name, section.school_year || 'Year unavailable'].filter(Boolean).join(' · ')}
            </option>)}
          </select>
          <label htmlFor="teacher-attendance-date" className="text-sm font-medium" style={{ color: 'var(--text)' }}>Date</label>
          <input id="teacher-attendance-date" type="date" value={selectedDate}
            onChange={event => setSelectedDate(event.target.value)} disabled={loading || pendingIds.length > 0}
            className="h-11 px-3 rounded-lg text-sm disabled:opacity-60"
            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text)' }} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" aria-label="Saved attendance totals">
        {stats.map(stat => (
          <Card key={stat.code} className="p-4" style={CARD_STYLE}>
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
            <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.count}</p>
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
            <button type="button" onClick={fetchData} className="mt-3 min-h-11 px-4 rounded-lg text-sm font-semibold"
              style={{ color: 'var(--accent)', border: '1px solid var(--border)' }}>Retry</button>
          </div>
        ) : visibleStudents.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            {hasSections ? 'No students are enrolled in this advisory section.' : 'You have no advisory section assigned yet.'}
          </p>
        ) : (
          <>
            <p className="px-4 pt-4 pb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              {visibleStudents.length} {visibleStudents.length === 1 ? 'student' : 'students'} · {selectedDate}
              {Object.keys(visibleAttendance).length === 0 && ' · No attendance marked for this date yet'}
            </p>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead style={{ backgroundColor: 'var(--card2)' }}><tr>
                  {['Student', 'Saved status', 'Mark attendance'].map(header => (
                    <th key={header} scope="col" className="px-5 py-3 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-muted)' }}>{header}</th>
                  ))}
                </tr></thead>
                <tbody>
                {visibleStudents.map(student => (
                  <tr key={`${student.sectionId}:${student.id}`} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-5 py-3.5 text-sm"><span className="font-medium break-words" style={{ color: 'var(--text)' }}>{student.name}</span>
                      {student.lrn && <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>LRN {student.lrn}</span>}</td>
                    <td className="px-5 py-3.5">{savedStatus(student)}</td>
                    <td className="px-5 py-3.5">{rowActions(student)}</td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y" style={{ borderColor: 'var(--border)' }} aria-label="Attendance roster">
              {visibleStudents.map(student => (
                <li key={`${student.sectionId}:${student.id}`} className="px-4 py-4 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm break-words" style={{ color: 'var(--text)' }}>{student.name}</p>
                      {student.lrn && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>LRN {student.lrn}</p>}
                    </div>
                    <span className="shrink-0">{savedStatus(student)}</span>
                  </div>
                  {rowActions(student)}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
        Export is unavailable. Attendance can be reviewed by date here.
      </p>
    </div>
  );
};

export default AttendanceTab;
