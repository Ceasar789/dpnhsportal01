// ============================================
// FILE: src/pages/dashboards/teacher/tabs/StudentsTab.jsx
// STUDENTS TAB — view-only roster, split into Advisory vs Subjects Handled.
// Teachers have no authority to create/edit/delete student accounts — that
// belongs to the registrar's enrollment flow — so this is read-only.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import { Users, GraduationCap, Search, Loader2 } from 'lucide-react';
import { useToast } from '../hooks';
import { Card, Table, TR, TD, Toast, Badge } from '../shared/ui';

// Given a list of section ids, resolves their full student roster
// (section_students -> students -> profiles) as one flat array.
// students.id has no FK to profiles, so the profiles lookup is a
// separate query rather than a nested select embed.
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
const statusStyle = (status) => ({
  active: { color: 'var(--badge-green-fg)', bg: 'var(--badge-green-bg)' },
  inactive: { color: 'var(--text-muted)', bg: 'var(--card2)' },
  suspended: { color: 'var(--badge-red-fg)', bg: 'var(--badge-red-bg)' },
  archived: { color: 'var(--text-muted)', bg: 'var(--card2)' },
})[status] || { color: 'var(--text-muted)', bg: 'var(--card2)' };
const StatusBadge = ({ status }) => <Badge {...statusStyle(status)}>{statusLabel(status)}</Badge>;

const RosterTable = ({ students, emptyMessage }) => students.length === 0 ? (
  <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>{emptyMessage}</p>
) : (
  <>
    <div className="hidden md:block">
      <Table headers={['Name', 'LRN', 'Email', 'Account status']}>
        {students.map((student, index) => (
          <TR key={`${student.sectionId}-${student.id}`}>
            <TD><span className="font-medium" style={{ color: 'var(--text)' }}>{index + 1}. {student.name}</span></TD>
            <TD>{student.lrn}</TD>
            <TD><span className="break-all">{student.email}</span></TD>
            <TD><StatusBadge status={student.status} /></TD>
          </TR>
        ))}
      </Table>
    </div>
    <ul className="md:hidden divide-y" style={{ borderColor: 'var(--border)' }} aria-label="Students in this section">
      {students.map((student) => (
        <li key={`${student.sectionId}-${student.id}`} className="px-4 py-3 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm break-words min-w-0" style={{ color: 'var(--text)' }}>{student.name}</p>
            <span className="shrink-0"><StatusBadge status={student.status} /></span>
          </div>
          <p className="text-xs mt-1 break-all" style={{ color: 'var(--text-muted)' }}>
            LRN {student.lrn} · {student.email}
          </p>
        </li>
      ))}
    </ul>
  </>
);

const StudentsTab = () => {
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

  const mutedColor = 'var(--text-muted)';
  const textColor = 'var(--text)';
  const advisoryLabel = advisorySection.length
    ? advisorySection.map(s => [s.grade_level, s.name].filter(Boolean).join(' — ')).join(', ')
    : null;

  return (
    <div className="p-6">
      <Toast toast={toast} />

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: textColor }}>Students</h1>
          <p className="text-sm mt-0.5" style={{ color: mutedColor }}>Your advisory class and the sections you teach</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: mutedColor }} />
          <input type="search" aria-label="Search students by name or LRN" placeholder="Search by name or LRN..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-lg text-sm"
            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', color: textColor }} />
        </div>
      </div>

      {!loading && !loadError && (
        <p className="text-sm mb-4" role="status" aria-live="polite" style={{ color: 'var(--text-muted)' }}>
          {queryActive ? `${resultCount} matching roster ${resultCount === 1 ? 'entry' : 'entries'}` : `${resultCount} roster ${resultCount === 1 ? 'entry' : 'entries'}`} across your sections
        </p>
      )}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16" role="status" style={{ color: 'var(--text-muted)' }}><Loader2 className="animate-spin" aria-hidden="true" />Loading student rosters…</div>
      ) : loadError ? (
        <Card className="p-6 text-center">
          <p role="alert" className="text-sm font-medium" style={{ color: 'var(--text)' }}>Could not load student rosters.</p>
          <button type="button" onClick={fetchData} className="mt-3 min-h-11 px-4 rounded-lg text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ color: 'var(--accent)', border: '1px solid var(--border)' }}>Retry</button>
        </Card>
      ) : queryActive && resultCount === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>No students match your search.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Try a different name or LRN.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {/* MY ADVISORY */}
          <section>
            <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 mb-3" style={{ background: 'var(--banner-bg)', border: '1px solid var(--banner-border)' }}>
              <GraduationCap size={16} style={{ color: 'var(--banner-accent)' }} />
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--banner-text)' }}>My Advisory</h2>
              {advisoryLabel && (
                <span className="text-xs font-medium" style={{ color: 'var(--banner-subtext)' }}>— {advisoryLabel}</span>
              )}
            </div>
            <Card>
              {advisorySection.length === 0 ? (
                <div className="text-center py-10 px-6">
                  <p className="text-sm font-medium" style={{ color: textColor }}>You are not assigned as an adviser yet</p>
                  <p className="text-xs mt-1" style={{ color: mutedColor }}>This section appears once the registrar assigns you as a section adviser.</p>
                </div>
              ) : (
                <RosterTable students={filteredAdvisory} emptyMessage={queryActive ? 'No advisory students match your search.' : 'No students are enrolled in your advisory section yet.'} />
              )}
            </Card>
          </section>

          {/* SUBJECTS I HANDLE */}
          <section>
            <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 mb-3" style={{ background: 'var(--banner-bg)', border: '1px solid var(--banner-border)' }}>
              <Users size={16} style={{ color: 'var(--banner-accent)' }} />
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--banner-text)' }}>Subjects I Handle</h2>
            </div>
            {filteredHandledGroups.length === 0 ? (
              <Card>
                <div className="text-center py-10 px-6">
                  <p className="text-sm font-medium" style={{ color: textColor }}>No other sections assigned yet</p>
                  <p className="text-xs mt-1" style={{ color: mutedColor }}>This appears once your teaching schedule is set up by the registrar.</p>
                </div>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {filteredHandledGroups.map(group => (
                  <Card key={`${group.sectionId}-${group.subjectKey}`}>
                    <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold" style={{ color: textColor }}>{group.subject}</p>
                        <p className="text-xs mt-0.5" style={{ color: mutedColor }}>{group.sectionLabel}</p>
                      </div>
                      <span className="text-xs font-medium shrink-0" style={{ color: 'var(--text-muted)' }}>{group.students.length} {group.students.length === 1 ? 'student' : 'students'}</span>
                    </div>
                    <RosterTable students={group.students} emptyMessage={queryActive ? 'No students in this section match your search.' : 'No students are enrolled in this section yet.'} />
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default StudentsTab;
