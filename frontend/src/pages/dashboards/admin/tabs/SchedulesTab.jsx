// ============================================
// FILE: src/pages/dashboards/admin/tabs/SchedulesTab.jsx
// Ties a teacher, a subject, a section and a time together. This is the record
// the teacher dashboard reads to know what it is meant to show, and the record
// the STUDENT dashboard builds its subject cards from.
//
// ── The shape of this screen ─────────────────────────────────────────────
//
//   Grade 7 │ Grade 8 │ …                   ← the grade
//   [ Madrid ] [ Rizal ] [ Bonifacio ]      ← its sections
//
//   Madrid — Grade 7
//     Mathematics    Ramon Delgado · Mon 08:00–09:00 · Room 201   ×
//                    + Add
//     English        — nobody scheduled —                          + Add
//     …all eight subjects, whether filled or not
//
// Every subject is listed whether or not it has a teacher, because the gap is
// the thing worth seeing. A screen that lists only what exists cannot answer
// "what is Madrid still missing", which is the question being asked while
// filling this in.
//
// ── Why this must come after Teaching Load ───────────────────────────────
//
// canTeachSection (src/lib/academicRules.js) refuses to schedule a teacher
// for a subject and grade they do not hold, so each subject's teacher list
// here is drawn from teacher_subjects. A grade with no teaching load shows
// eight subjects and no teachers to put in them — correct, and the message
// says where to go.
//
// ── The one thing to know about the student's subject cards ──────────────
//
// They come from schedules.subject_id, never from the task and never from
// teacher_subjects. A task distributed into a section whose schedule has no
// row for its subject lands on the student's "Other" card. That is this
// screen's job, and it is why an unfilled subject row matters.
// ============================================

import { useMemo, useRef, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import Modal from '../../../../components/ui/Modal';
import { useDelayedFlag } from '../../../../lib/useDelayedFlag';
import { useAdminContext } from '../AdminContext';
import { GRADE_LEVELS, normalizeGradeLevel, canTeachSection } from '../../../../lib/academicRules';
import GradeTabs from '../GradeTabs';
import Button from '../../../../components/ui/Button';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const SchedulesTab = () => {
  const {
    schoolYear,
    teachers, teachersError, teachersLoading, fetchTeachers,
    subjects, subjectsError, subjectsLoading, fetchSubjects,
    sections, sectionsError, sectionsLoading, fetchSections,
    teachingLoad, teachingLoadError, teachingLoadLoading, fetchTeachingLoad,
    schedules, schedulesLoading, schedulesError, fetchSchedules,
    scheduleModal, openCreateSchedule, closeScheduleModal, saveSchedule, deleteSchedule,
    schedTeacher, setSchedTeacher, schedSubject,
    schedSection, schedDay, setSchedDay,
    schedStart, setSchedStart, schedEnd, setSchedEnd,
    schedRoom, setSchedRoom, schedSaving,
  } = useAdminContext();

  // Rule: the skeleton only appears once the wait is long enough to notice.
  const slowSections = useDelayedFlag(sectionsLoading);
  const slowSchedules = useDelayedFlag(schedulesLoading);
  const slowSubjects = useDelayedFlag(subjectsLoading);

  const [grade, setGrade] = useState(GRADE_LEVELS[0]);
  const [openSectionId, setOpenSectionId] = useState(null);
  // Set by pressing Create. Nothing is marked red until then — a form that is
  // red before it has been touched reads as broken, not incomplete.
  const [tried, setTried] = useState(false);
  const pageHeadingRef = useRef(null);
  const subjectHeadingRefs = useRef(new Map());
  const addButtonRefs = useRef(new Map());

  const nameOf = (list, id, field = 'name') => list.find(x => x.id === id)?.[field] || '—';
  const dismiss = () => { setTried(false); closeScheduleModal(); };

  const badTime = schedEnd <= schedStart;
  const eligibilityLoading = teachersLoading || teachingLoadLoading;
  const eligibilityError = teachersError || teachingLoadError;
  const missingTeacher = tried && !schedTeacher && !eligibilityLoading && !eligibilityError;
  const missingTime = tried && badTime;

  // The Create button stays enabled while the form is incomplete, on purpose.
  // A disabled button cannot say what is missing, which was the whole
  // complaint. saveSchedule re-checks both of these — this is the message,
  // not the guard.
  const create = () => {
    setTried(true);
    if (eligibilityLoading || eligibilityError || !schedTeacher || badTime) return;
    saveSchedule();
    setTried(false);
  };

  // sections.grade_level is an unconstrained VARCHAR, so 'Grade 7', 'grade 7'
  // and '7' can all be in there. Compared through normalizeGradeLevel, the
  // same way canTeachSection does, or a section would silently belong to no
  // tab at all.
  const gradeSections = useMemo(
    () => sections.filter(s => normalizeGradeLevel(s.grade_level) === grade),
    [sections, grade]
  );

  const sectionIdsByGrade = useMemo(() => {
    const map = {};
    for (const g of GRADE_LEVELS) map[g] = new Set();
    for (const s of sections) {
      const g = normalizeGradeLevel(s.grade_level);
      if (map[g]) map[g].add(s.id);
    }
    return map;
  }, [sections]);

  // Scheduled entries per grade, so the tab strip shows where the work is.
  const countsByGrade = useMemo(() => {
    const counts = {};
    for (const g of GRADE_LEVELS) {
      counts[g] = schedules.filter(s => sectionIdsByGrade[g].has(s.section_id)).length;
    }
    return counts;
  }, [schedules, sectionIdsByGrade]);

  const openSection = gradeSections.find(s => s.id === openSectionId) || null;

  const activeSubjects = useMemo(
    () => subjects.filter(s => s.is_active !== false), [subjects]
  );

  // Rows already saved for the open section, bucketed by subject.
  const rowsBySubject = useMemo(() => {
    const map = new Map();
    if (!openSection) return map;
    for (const row of schedules) {
      if (row.section_id !== openSection.id) continue;
      const key = row.subject_id || `unresolved:${row.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return map;
  }, [schedules, openSection]);

  // Active subjects are the normal timetable rows. Saved periods for an
  // inactive or now-missing subject are authoritative records too, so append
  // them as read-only legacy rows rather than hiding them.
  const displaySubjects = useMemo(() => {
    const known = new Map(subjects.map(subject => [subject.id, subject]));
    const rows = activeSubjects.map(subject => ({
      key: subject.id,
      subject,
      scheduleRows: rowsBySubject.get(subject.id) || [],
      legacy: false,
    }));

    for (const [key, scheduleRows] of rowsBySubject) {
      const subject = known.get(key);
      if (subject && subject.is_active !== false) continue;
      rows.push({ key, subject: subject || null, scheduleRows, legacy: true });
    }
    return rows;
  }, [activeSubjects, rowsBySubject, subjects]);

  // Who may hold this subject in this section. The same rule saveSchedule
  // enforces, applied here so an impossible choice is never offered —
  // otherwise the admin picks a name and gets a rejection they cannot act on.
  const eligibleTeachers = useMemo(() => {
    if (!openSection || !schedSubject || eligibilityLoading || eligibilityError) return [];
    return teachers.filter(t => canTeachSection(
      teachingLoad.filter(l => l.teacher_id === t.id), schedSubject, openSection
    ).ok);
  }, [teachers, teachingLoad, schedSubject, openSection, eligibilityLoading, eligibilityError]);

  const sectionSummary = (section) => {
    if (subjectsLoading) return 'Loading subject coverage…';
    if (subjectsError) return 'Subject coverage unavailable';
    const sectionRows = schedules.filter(schedule => schedule.section_id === section.id);
    const activeIds = new Set(activeSubjects.map(subject => subject.id));
    const filled = new Set(sectionRows.filter(row => activeIds.has(row.subject_id)).map(row => row.subject_id)).size;
    const legacyPeriods = sectionRows.filter(row => !activeIds.has(row.subject_id)).length;
    return `${filled}/${activeSubjects.length} active subjects${legacyPeriods ? ` · ${legacyPeriods} legacy period${legacyPeriods === 1 ? '' : 's'}` : ''}`;
  };

  const focusSubject = (key) => {
    const add = addButtonRefs.current.get(key);
    if (add && !add.disabled) { add.focus(); return; }
    const heading = subjectHeadingRefs.current.get(key);
    if (heading) { heading.focus(); return; }
    pageHeadingRef.current?.focus();
  };

  const retryEligibility = () => {
    if (teachersError) fetchTeachers();
    if (teachingLoadError) fetchTeachingLoad();
  };

  return (
    <>
      <div>
        <div className="page-header-bar">
          <div className="page-title" ref={pageHeadingRef} tabIndex={-1}>Schedules</div>
          <div className="page-sub">Who teaches what, to which section, and when — for {schoolYear}.</div>
        </div>

        <div className="grade-tabs-caption">Numbers show scheduled periods per grade.</div>
        <GradeTabs value={grade} onChange={(g) => { setGrade(g); setOpenSectionId(null); }}
          counts={countsByGrade} unit="scheduled period" />

        {sectionsError ? (
          <div className="table-card" style={{ padding: 'var(--space-24)', textAlign: 'center' }}>
            Could not load sections. Check your connection and try again.
            <div style={{ marginTop: 'var(--space-12)' }}>
              <button className="btn btn-ghost" onClick={() => fetchSections()}>Retry sections</button>
            </div>
          </div>
        ) : schedulesError ? (
          <div className="table-card" style={{ padding: 'var(--space-24)', textAlign: 'center' }}>
            Could not load schedules. The sections below are fine; it is the
            timetable that did not arrive.
            <div style={{ marginTop: 'var(--space-12)' }}>
              <button className="btn btn-ghost" onClick={() => fetchSchedules()}>Retry schedules</button>
            </div>
          </div>
        ) : sectionsLoading ? (
          <div className="table-card" style={{ padding: 'var(--space-24)', textAlign: 'center', color: 'var(--text-muted)' }}>
            {slowSections ? 'Loading sections…' : ''}
          </div>
        ) : gradeSections.length === 0 ? (
          <div className="table-card" style={{ padding: 'var(--space-24)', textAlign: 'center' }}>
            No {grade} sections for {schoolYear}. Create them in Sections first.
          </div>
        ) : (
          <>
            {/* Sections of this grade. The count on each one is what makes a
                gap visible without opening it. */}
            <div className="section-picker">
              {gradeSections.map(s => (
                <button key={s.id} type="button"
                  className={`section-chip${openSectionId === s.id ? ' active' : ''}`}
                  aria-pressed={openSectionId === s.id}
                  onClick={() => setOpenSectionId(openSectionId === s.id ? null : s.id)}>
                  <span className="section-chip-name">{s.name}</span>
                  <span className="section-chip-count">{sectionSummary(s)}</span>
                </button>
              ))}
            </div>

            {!openSection ? (
              <div className="table-card" style={{ padding: 'var(--space-24)', textAlign: 'center', color: 'var(--text-muted)' }}>
                Pick a section above to set its schedule.
              </div>
            ) : (
              <div className="table-card schedule-table-card"><table>
                <thead>
                  <tr>
                    <th style={{ width: '26%' }}>{openSection.name} — {grade}</th>
                    <th>Teacher, day and time</th>
                    <th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {subjectsError ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: 'var(--space-24)' }}>
                      Could not load subjects. Existing subject identities cannot be verified.
                      <div style={{ marginTop: 'var(--space-12)' }}>
                        <button className="btn btn-ghost" onClick={() => fetchSubjects()}>Retry subjects</button>
                      </div>
                    </td></tr>
                  ) : subjectsLoading ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: 'var(--space-24)', color: 'var(--text-muted)' }}>
                      {slowSubjects ? 'Loading subjects…' : ''}
                    </td></tr>
                  ) : schedulesLoading ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: 'var(--space-24)' }}>
                      {slowSchedules ? 'Loading schedules…' : ''}
                    </td></tr>
                  ) : displaySubjects.length === 0 ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: 'var(--space-24)', color: 'var(--text-muted)' }}>
                      No active subjects yet — a timetable needs subjects to
                      schedule. Add them in Subjects first.
                    </td></tr>
                  ) : displaySubjects.map(({ key, subject, scheduleRows: rows, legacy }) => {
                    const subjectName = subject?.name || 'Subject reference unavailable';
                    return (
                      <tr key={key}>
                        <td data-cell="identity">
                          <div ref={(node) => {
                            if (node) subjectHeadingRefs.current.set(key, node);
                            else subjectHeadingRefs.current.delete(key);
                          }} tabIndex={legacy ? -1 : undefined}>{subjectName}</div>
                          <div className="row-sub">
                            {subject?.code || 'Saved schedule with an unresolved subject reference'}
                          </div>
                          {legacy && <span className="badge badge-archived">Inactive · existing periods only</span>}
                        </td>
                        <td data-cell="detail">
                          {rows.length === 0 ? (
                            <span style={{ color: 'var(--text-muted)' }}>— nobody scheduled —</span>
                          ) : rows.map(r => (
                            <div key={r.id} className="sched-line">
                              <span className="sched-teacher">{nameOf(teachers, r.teacher_id)}</span>
                              <span className="sched-when">
                                {r.day_of_week} · {String(r.start_time).slice(0, 5)}–{String(r.end_time).slice(0, 5)}
                                {r.room_number ? ` · ${r.room_number}` : ''}
                              </span>
                              <button className="icon-action archive-action"
                                aria-label={`Delete ${nameOf(teachers, r.teacher_id)}'s ${r.day_of_week} schedule`}
                                title="Delete"
                                onClick={() => deleteSchedule(r.id, () => focusSubject(key))}><Trash2 size={14} aria-hidden="true" /></button>
                            </div>
                          ))}
                        </td>
                        <td data-cell="actions">
                          {!legacy && (
                            <button className="btn btn-ghost btn-sm"
                              ref={(node) => {
                                if (node) addButtonRefs.current.set(key, node);
                                else addButtonRefs.current.delete(key);
                              }}
                              aria-label={`Add ${subjectName} schedule`}
                              onClick={() => { setTried(false); openCreateSchedule({ sectionId: openSection.id, subjectId: subject.id }); }}>
                              <Plus size={14} aria-hidden="true" /> Add
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
          </>
        )}
      </div>

      {scheduleModal && (
        <Modal
          open
          title={`${nameOf(subjects, schedSubject)} — ${nameOf(sections, schedSection)}`}
          onClose={dismiss}
          footer={(requestClose) => (
            <>
              <Button variant="ghost" onClick={requestClose}>Cancel</Button>
              <Button onClick={create} busy={schedSaving} busyLabel="Creating…">Create</Button>
            </>
          )}
        >

            <div className="form-row">
              <label className="form-label" htmlFor="schedules-teacher">Teacher</label>
              <select id="schedules-teacher" className={`form-input${missingTeacher || eligibilityError ? ' is-invalid' : ''}`}
                value={schedTeacher} onChange={e => setSchedTeacher(e.target.value)}
                required
                aria-invalid={(missingTeacher || eligibilityError) || undefined}
                aria-describedby={(missingTeacher || eligibilityLoading || eligibilityError || eligibleTeachers.length === 0) ? 'schedules-teacher-help' : undefined}>
                <option value="">
                  {eligibilityLoading
                    ? 'Loading eligible teachers…'
                    : eligibilityError
                      ? 'Teacher eligibility unavailable'
                      : eligibleTeachers.length === 0
                    ? 'No teacher holds this subject at this grade'
                    : 'Select teacher…'}
                </option>
                {eligibleTeachers.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
              </select>
              {missingTeacher && eligibleTeachers.length > 0 && (
                <div id="schedules-teacher-help" className="field-error">Select a teacher.</div>
              )}
              {eligibilityLoading && (
                <div id="schedules-teacher-help" className="row-sub" role="status" style={{ marginTop: 'var(--space-8)' }}>
                  Loading teachers and teaching-load assignments…
                </div>
              )}
              {eligibilityError && (
                <div id="schedules-teacher-help" className="field-error" role="alert">
                  Teacher eligibility could not be loaded.
                  <div style={{ marginTop: 'var(--space-8)' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={retryEligibility}>Retry eligibility</button>
                  </div>
                </div>
              )}
              {!eligibilityLoading && !eligibilityError && eligibleTeachers.length === 0 && (
                <div id="schedules-teacher-help" className="row-sub" style={{ marginTop: 'var(--space-8)' }}>
                  Assign someone this subject for {grade} in Teaching Load first.
                </div>
              )}
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="schedules-day">Day</label>
              <select id="schedules-day" className="form-input" value={schedDay} onChange={e => setSchedDay(e.target.value)} required>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="form-row" style={{ display: 'flex', gap: 'var(--space-8)' }}>
              <div style={{ flex: 1 }}>
                <label className="form-label" htmlFor="schedules-start">Start</label>
                <input id="schedules-start" className={`form-input${missingTime ? ' is-invalid' : ''}`}
                  aria-invalid={missingTime || undefined} aria-describedby={missingTime ? 'schedules-time-error' : undefined}
                  type="time" value={schedStart} onChange={e => setSchedStart(e.target.value)} required />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label" htmlFor="schedules-end">End</label>
                <input id="schedules-end" className={`form-input${missingTime ? ' is-invalid' : ''}`}
                  aria-invalid={missingTime || undefined} aria-describedby={missingTime ? 'schedules-time-error' : undefined}
                  type="time" value={schedEnd} onChange={e => setSchedEnd(e.target.value)} required />
              </div>
            </div>
            {missingTime && (
              <div id="schedules-time-error" className="field-error" role="alert" style={{ marginTop: -8, marginBottom: 'var(--space-12)' }}>
                End time must be after the start time.
              </div>
            )}

            <div className="form-row">
              <label className="form-label" htmlFor="schedules-room">Room</label>
              <input id="schedules-room" className="form-input" value={schedRoom} onChange={e => setSchedRoom(e.target.value)} placeholder="e.g. Room 201" />
            </div>

        </Modal>
      )}
    </>
  );
};

export default SchedulesTab;
