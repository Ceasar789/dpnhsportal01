// ============================================
// FILE: src/components/clarity/teacher/ClarityTeacherStudentsTab.jsx
// The Teacher Students tab in Clarity (final design, real data only). The
// same view-only rosters as the classic StudentsTab, from the same reads:
// the advisory class and every subject/section the teacher handles, with the
// same name/LRN search. Accounts show the stored status only (the classic
// labels); there is no invitation data, so no "Pending invitations".
//
// TEMPORARY word-for-word copies from pages/dashboards/teacher/tabs/StudentsTab.jsx
// (source-parity tested in ClarityTeacherT2Sources.test.js); after the defense
// the classic tab and this one should share them:
//   - the roster read and the status labels, :20-60
//   - the state, the reads, the effect and the search, :102-208
//   - the advisory label, :212-214
// ============================================
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization -- the TEMPORARY copies below are the classic tab's own code, word for word, which the linter flags the same way in the classic file (StudentsTab.jsx:112 and :196). */

import { useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../config/supabase';
import { withRetry } from '../../../lib/supabaseRetry';
import { useToast } from '../../../pages/dashboards/teacher/hooks';
import { Toast } from '../../../pages/dashboards/teacher/shared/ui';
import { initials } from '../../../pages/dashboards/admin/shared/helpers';

// ---- TEMPORARY copy (StudentsTab.jsx:20-60) ----
const fetchRosterForSections = async (sectionIds) => {
  if (!sectionIds.length) return [];

  const { data: enrollments, error: enrollErr } = await withRetry(
    () => supabase
      .from('section_students')
      .select('student_id, section_id, status')
      .in('section_id', sectionIds)
      .eq('status', 'active')
      .order('enrollment_date', { ascending: false }),
    { label: 'Section enrollments fetch' }
  );
  if (enrollErr) throw enrollErr;
  if (!enrollments?.length) return [];

  const studentIds = [...new Set(enrollments.map(e => e.student_id))];

  const [{ data: students, error: studentsErr }, { data: profiles, error: profilesErr }] = await Promise.all([
    withRetry(() => supabase.from('students').select('id, lrn').in('id', studentIds), { label: 'Students fetch' }),
    withRetry(() => supabase.from('profiles').select('id, name, email, status').in('id', studentIds), { label: 'Profiles fetch' }),
  ]);
  if (studentsErr) throw studentsErr;
  if (profilesErr) throw profilesErr;

  const lrnById = new Map((students || []).map(s => [s.id, s.lrn]));
  const profileById = new Map((profiles || []).map(p => [p.id, p]));

  return enrollments.map(e => {
    const profile = profileById.get(e.student_id);
    return {
      id: e.student_id,
      sectionId: e.section_id,
      lrn: lrnById.get(e.student_id) || '—',
      name: profile?.name || '—',
      email: profile?.email || '—',
      status: profile?.status?.toLowerCase() || null,
    };
  });
};

const statusLabel = (status) => ({ active: 'Active', inactive: 'Inactive', suspended: 'Suspended', archived: 'Archived' })[status] || 'Status unavailable';
// ---- end of the copy ----

const STATUS_TONE = { active: 'ok', suspended: 'er' };

const Roster = ({ students, emptyMessage, label }) => students.length === 0 ? (
  <p className="x-empty">{emptyMessage}</p>
) : (
  <div className="x-tst-scroll">
    <table className="x-table x-tst-table" aria-label={label}>
      <thead><tr><th scope="col">Name</th><th scope="col">LRN</th><th scope="col">Email</th><th scope="col">Account</th></tr></thead>
      <tbody>
        {students.map(student => (
          <tr key={`${student.sectionId}-${student.id}`}>
            <td><span className="nm"><span className="x-avatar sm tint" aria-hidden="true">{initials(student.name === '—' ? '' : student.name)}</span>{student.name}</span></td>
            <td>{student.lrn}</td>
            <td>{student.email}</td>
            <td><span className={`x-badge ${STATUS_TONE[student.status] || ''}`}><i aria-hidden="true" />{statusLabel(student.status)}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ClarityTeacherStudentsTab = () => {
  // ---- TEMPORARY copy (StudentsTab.jsx:102-208) ----
  const { userData } = useAuth();
  const { toast, showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [advisorySection, setAdvisorySections] = useState([]); // sections this teacher advises
  const [advisoryStudents, setAdvisoryStudents] = useState([]);
  const [handledGroups, setHandledGroups] = useState([]); // [{ sectionId, sectionLabel, subject, students }]

  const fetchData = useCallback(async () => {
    if (!userData?.uid) return;
    setLoading(true);
    setLoadError(false);
    try {
      // ── Advisory sections (homeroom) ─────────────────────────────────
      const { data: advisorySections, error: advisoryErr } = await withRetry(
        () => supabase
          .from('sections')
          .select('id, name, grade_level')
          .eq('adviser_id', userData.uid),
        { label: 'Advisory sections fetch' }
      );
      if (advisoryErr) throw advisoryErr;

      const advisoryIds = (advisorySections || []).map(s => s.id);
      const advisoryRoster = await fetchRosterForSections(advisoryIds);

      // ── Subjects handled: sections taught via schedule but not advised ──
      // subject_id is the registry's source of truth; the legacy free-text
      // `subject` column is only read as a fallback for pre-registry rows
      // where subject_id is still null.
      const [{ data: schedules, error: schedErr }, { data: subjectRows, error: subjectsErr }] = await Promise.all([
        withRetry(
          () => supabase
            .from('schedules')
            .select('section_id, subject, subject_id, sections(name, grade_level)')
            .eq('teacher_id', userData.uid),
          { label: 'Teaching schedules fetch' }
        ),
        withRetry(
          () => supabase.from('subjects').select('id, name, code'),
          { label: 'Subjects registry fetch' }
        ),
      ]);
      if (schedErr) throw schedErr;
      if (subjectsErr) throw subjectsErr;

      const subjectById = new Map((subjectRows || []).map(s => [s.id, s]));
      const subjectLabel = (s) => {
        if (s.subject_id) return subjectById.get(s.subject_id)?.name || 'Untitled subject';
        return s.subject || 'Untitled subject';
      };

      const advisorySet = new Set(advisoryIds);
      const handledEntries = (schedules || []).filter(s => !advisorySet.has(s.section_id));

      // De-dupe by (section_id, subject_id) — a schedule can repeat across
      // days. Falls back to the legacy subject text only for older rows that
      // have no subject_id, so two different subjects in the same section
      // never collapse into one group.
      const uniqueByKey = new Map();
      handledEntries.forEach(s => {
        const key = `${s.section_id}::${s.subject_id || s.subject}`;
        if (!uniqueByKey.has(key)) uniqueByKey.set(key, s);
      });

      const handledSectionIds = [...new Set([...uniqueByKey.values()].map(s => s.section_id))];
      const handledRoster = await fetchRosterForSections(handledSectionIds);
      const rosterBySection = new Map();
      handledRoster.forEach(s => {
        if (!rosterBySection.has(s.sectionId)) rosterBySection.set(s.sectionId, []);
        rosterBySection.get(s.sectionId).push(s);
      });

      const groups = [...uniqueByKey.values()].map(s => ({
        sectionId: s.section_id,
        subjectKey: s.subject_id || s.subject,
        sectionLabel: [s.sections?.grade_level, s.sections?.name].filter(Boolean).join(' — ') || 'Unnamed section',
        subject: subjectLabel(s),
        students: rosterBySection.get(s.section_id) || [],
      }));
      setAdvisorySections(advisorySections || []);
      setAdvisoryStudents(advisoryRoster);
      setHandledGroups(groups);
    } catch {
      setLoadError(true);
      showToast('Could not load student rosters. Please retry.', 'error');
    } finally {
      setLoading(false);
    }
  }, [userData?.uid, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const matchesSearch = (s) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return s.name?.toLowerCase().includes(q) || s.lrn?.toLowerCase().includes(q);
  };

  const filteredAdvisory = advisoryStudents.filter(matchesSearch);
  const filteredHandledGroups = handledGroups.map(g => ({ ...g, students: g.students.filter(matchesSearch) }));
  const queryActive = Boolean(searchQuery.trim());
  const resultCount = filteredAdvisory.length + filteredHandledGroups.reduce((count, group) => count + group.students.length, 0);
  // ---- end of the copy ----
  // ---- TEMPORARY copy (StudentsTab.jsx:212-214) ----
  const advisoryLabel = advisorySection.length
    ? advisorySection.map(s => [s.grade_level, s.name].filter(Boolean).join(' — ')).join(', ')
    : null;
  // ---- end of the copy ----

  const sectionsTaught = new Set(handledGroups.map(g => g.sectionId)).size;

  return (
    <div className="x-tst">
      <Toast toast={toast} />
      <div className="x-head x-ov-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="x-h1">Students</h1>
          <p className="x-sub">Your advisory class and the sections you teach</p>
        </div>
        <label className="x-search x-tst-search">
          <Search size={16} aria-hidden="true" />
          <span className="x-sr">Search students by name or LRN</span>
          <input type="search" placeholder="Search by name or LRN..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </label>
      </div>

      {!loading && !loadError && (
        <section className="x-kpis" aria-label="Your classes">
          <div className="x-card x-kpi">
            <span className="x-kl">{advisoryLabel ? `Advisory · ${advisoryLabel}` : 'Advisory'}</span>
            <span className="x-kv">{advisorySection.length ? advisoryStudents.length : 'Not assigned'}</span>
            {advisorySection.length > 0 && <span className="x-kd">{advisoryStudents.length === 1 ? 'student' : 'students'}</span>}
          </div>
          <div className="x-card x-kpi">
            <span className="x-kl">Sections I teach</span>
            <span className="x-kv">{sectionsTaught}</span>
            <span className="x-kd">besides my advisory</span>
          </div>
        </section>
      )}

      {!loading && !loadError && (
        <p className="x-cs" role="status" aria-live="polite" style={{ marginBottom: 12 }}>
          {queryActive ? `${resultCount} matching roster ${resultCount === 1 ? 'entry' : 'entries'}` : `${resultCount} roster ${resultCount === 1 ? 'entry' : 'entries'}`} across your sections
        </p>
      )}

      {loading ? (
        <p className="x-empty" role="status">Loading student rosters…</p>
      ) : loadError ? (
        <div className="x-card x-pad x-rail">
          <span role="alert">Could not load student rosters.</span>
          <button type="button" className="x-btn" onClick={fetchData}>Retry</button>
        </div>
      ) : queryActive && resultCount === 0 ? (
        <div className="x-card x-pad x-tst-none">
          <b>No students match your search.</b>
          <span className="x-cs">Try a different name or LRN.</span>
        </div>
      ) : (
        <div className="x-cols">
          <div className="x-tst-main">
            <section className="x-card x-tst-card" aria-labelledby="x-tst-advisory">
              <div className="x-pad x-tst-head">
                <h2 className="x-ct" id="x-tst-advisory">My advisory</h2>
                {advisoryLabel && <span className="x-cs">{advisoryLabel}</span>}
              </div>
              {advisorySection.length === 0 ? (
                <div className="x-empty">
                  <b>You are not assigned as an adviser yet</b>
                  <p className="x-cs">This section appears once the admin assigns you as a section adviser.</p>
                </div>
              ) : (
                <Roster students={filteredAdvisory} label="My advisory students"
                  emptyMessage={queryActive ? 'No advisory students match your search.' : 'No students are enrolled in your advisory section yet.'} />
              )}
            </section>

            {filteredHandledGroups.map(group => (
              <section key={`${group.sectionId}-${group.subjectKey}`} className="x-card x-tst-card"
                id={`x-tst-g-${group.sectionId}-${group.subjectKey}`.replace(/[^\w-]+/g, '-')} aria-label={`${group.subject}, ${group.sectionLabel}`}>
                <div className="x-pad x-tst-head">
                  <h2 className="x-ct">{group.subject}</h2>
                  <span className="x-cs">{group.sectionLabel} · {group.students.length} {group.students.length === 1 ? 'student' : 'students'}</span>
                </div>
                <Roster students={group.students} label={`${group.subject}, ${group.sectionLabel} students`}
                  emptyMessage={queryActive ? 'No students in this section match your search.' : 'No students are enrolled in this section yet.'} />
              </section>
            ))}
          </div>

          <section className="x-card x-pad" aria-labelledby="x-tst-subjects">
            <h2 className="x-ct" id="x-tst-subjects">Subjects I handle</h2>
            {filteredHandledGroups.length === 0 ? (
              <div className="x-empty">
                <b>No other sections assigned yet</b>
                <p className="x-cs">This appears once your teaching schedule is set up by the admin.</p>
              </div>
            ) : (
              <ul className="x-rows">
                {filteredHandledGroups.map(group => (
                  <li key={`${group.sectionId}-${group.subjectKey}`}>
                    <a className="x-tst-jump" href={`#${`x-tst-g-${group.sectionId}-${group.subjectKey}`.replace(/[^\w-]+/g, '-')}`}>
                      <b>{group.subject} · {group.sectionLabel}</b>
                      <span className="x-cs">{group.students.length} {group.students.length === 1 ? 'student' : 'students'}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default ClarityTeacherStudentsTab;
