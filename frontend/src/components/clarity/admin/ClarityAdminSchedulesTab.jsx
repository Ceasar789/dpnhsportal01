// ============================================
// FILE: src/components/clarity/admin/ClarityAdminSchedulesTab.jsx
// The Admin Schedules tab in Clarity (final design): a section picker and a
// weekly timetable for the chosen section, built only from its real
// schedule rows (rows = its real time slots, columns = Mon-Fri plus a
// weekend day only when a period is really on it). Below it, the classic
// per-subject list (every active subject, so gaps stay visible) keeps the
// Add action for each subject.
//
// TEMPORARY word-for-word copies from pages/dashboards/admin/tabs/SchedulesTab.jsx
// (parity-tested in ClarityAdminSchedulesTab.test.jsx); after the defense the
// classic tab and this one should share them:
//   - DAYS, :50
//   - the state, eligibility, validation and helper logic, :69-224
//   - the Add Schedule dialog with its clash messages, :388-487 (the shared
//     Modal, unchanged: discard guard, focus return and stacking are the same)
// ============================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import { useDelayedFlag } from '../../../lib/useDelayedFlag';
import { useAdminContext } from '../../../pages/dashboards/admin/AdminContext';
import SchoolYearNotice from '../../../pages/dashboards/admin/shared/SchoolYearNotice';
import { coverageText, sortPeriods, subjectCoverage, teacherNamesFor } from '../../../pages/dashboards/admin/shared/classSetup';
import { GRADE_LEVELS, normalizeGradeLevel, canTeachSection } from '../../../lib/academicRules';
import { Skeleton, SkeletonGroup } from '../../ui/Skeleton';

// TEMPORARY copy (SchedulesTab.jsx:50).
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hhmm = value => String(value ?? '').slice(0, 5);
// Display only (the stored "HH:MM" stays the key): the final design prints
// 12-hour times with no leading zero and no AM/PM, e.g. "1:00"; the spoken
// text keeps AM/PM so a screen reader is never ambiguous, e.g. "1:00 PM".
// A value that is not "HH:MM" is shown as stored.
const clock = (value, spoken = false) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return value;
  const h = Number(m[1]);
  const text = `${h % 12 === 0 ? 12 : h % 12}:${m[2]}`;
  return spoken ? `${text} ${h < 12 ? 'AM' : 'PM'}` : text;
};
// A stable soft colour per subject: a style choice, not data.
const PALETTE = 5;
const colourFor = (key) => {
  let n = 0;
  for (const ch of String(key)) n = (n * 31 + ch.charCodeAt(0)) % 9973;
  return `c${(n % PALETTE) + 1}`;
};
// "Ramon Delgado" -> "R. Delgado"; a one-word name stays as it is.
const shortName = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length < 2 ? parts.join('') : `${parts[0][0]}. ${parts[parts.length - 1]}`;
};

// L2: the weekly timetable while it loads: the same table, bars for the times and classes.
const TimetableSkeleton = () => (
  <SkeletonGroup className="x-tw">
    <table className="x-sch-table">
      <thead>
        <tr>
          <th scope="col" className="x-sch-time" />
          {[0, 1, 2, 3, 4].map(d => <th scope="col" key={d}><Skeleton inline h="0.8em" w={28} /></th>)}
        </tr>
      </thead>
      <tbody>
        {[0, 1, 2, 3].map(r => (
          <tr key={r}>
            <th scope="row" className="x-sch-time"><Skeleton inline h="0.8em" w={72} /></th>
            {[0, 1, 2, 3, 4].map(d => <td key={d}><Skeleton h={44} /></td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </SkeletonGroup>
);

const ClarityAdminSchedulesTab = () => {
  const {
    schoolYear, settingsSchoolYear, schoolYearSource,
    // Defaults only for a context that has not provided these (the real one always does).
    teachers = [], teachersError, teachersLoading, fetchTeachers,
    subjects = [], subjectsError, subjectsLoading, fetchSubjects,
    sections = [], sectionsError, sectionsLoading, fetchSections,
    teachingLoad = [], teachingLoadError, teachingLoadLoading, fetchTeachingLoad,
    schedules = [], schedulesLoading, schedulesError, fetchSchedules,
    scheduleOpenSectionId, setScheduleOpenSectionId,
    scheduleModal, openCreateSchedule, closeScheduleModal, saveSchedule, deleteSchedule,
    schedTeacher, setSchedTeacher, schedSubject,
    schedSection, schedDay, setSchedDay,
    schedStart, setSchedStart, schedEnd, setSchedEnd,
    schedRoom, setSchedRoom, schedSaving,
    scheduleConflicts, scheduleCheckError,
  } = useAdminContext();

  // ---- TEMPORARY copy (SchedulesTab.jsx:69-224) ----
  // Rule: the skeleton only appears once the wait is long enough to notice.
  const slowSections = useDelayedFlag(sectionsLoading);
  const slowSchedules = useDelayedFlag(schedulesLoading);
  const slowSubjects = useDelayedFlag(subjectsLoading);

  // The open section lives in the academic state when it is there (so the
  // Sections tab can open one); otherwise, as before, in this tab.
  const sharedOpenSection = typeof setScheduleOpenSectionId === 'function';
  const [localOpenSectionId, setLocalOpenSectionId] = useState(null);
  const openSectionId = sharedOpenSection ? (scheduleOpenSectionId ?? null) : localOpenSectionId;
  const setOpenSectionId = sharedOpenSection ? setScheduleOpenSectionId : setLocalOpenSectionId;
  const gradeOfSection = (id) => normalizeGradeLevel(sections.find(s => s.id === id)?.grade_level);
  const [grade, setGrade] = useState(() => (openSectionId && gradeOfSection(openSectionId)) || GRADE_LEVELS[0]);
  // A section opened from elsewhere shows its own grade, once its row is
  // loaded. A grade the admin picks afterwards is left alone.
  const [gradeSyncedFor, setGradeSyncedFor] = useState(openSectionId && gradeOfSection(openSectionId) ? openSectionId : null);
  if (openSectionId && gradeSyncedFor !== openSectionId && gradeOfSection(openSectionId)) {
    setGradeSyncedFor(openSectionId);
    setGrade(gradeOfSection(openSectionId));
  }
  // Set by pressing Create. Nothing is marked red until then — a form that is
  // red before it has been touched reads as broken, not incomplete.
  const [tried, setTried] = useState(false);
  const pageHeadingRef = useRef(null);
  const subjectHeadingRefs = useRef(new Map());
  const addButtonRefs = useRef(new Map());
  // The clash message renders at the end of the form body. On a phone that
  // is below the fold, so tapping Create looked like it did nothing. Scroll
  // it into view when it appears; when and what it says are unchanged.
  const conflictRef = useRef(null);
  useEffect(() => {
    if (scheduleCheckError || scheduleConflicts?.length > 0) {
      conflictRef.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [scheduleCheckError, scheduleConflicts]);

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
    for (const [key, rows] of map) map.set(key, sortPeriods(rows));
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
  // ---- end of the copy ----

  // The timetable: the open section's real periods only.
  const sectionPeriods = openSection ? schedules.filter(row => row.section_id === openSection.id) : [];
  const slots = [...new Map(sectionPeriods.map(r => [`${hhmm(r.start_time)}|${hhmm(r.end_time)}`, [hhmm(r.start_time), hhmm(r.end_time)]])).values()]
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const days = WEEK.filter(day => DAYS.includes(day) || sectionPeriods.some(r => r.day_of_week === day));
  const subjectKey = row => row.subject_id || `unresolved:${row.id}`;
  const subjectLabel = row => subjects.find(s => s.id === row.subject_id)?.name || 'Subject reference unavailable';
  const gradesWithSections = GRADE_LEVELS.filter(g => sectionIdsByGrade[g].size > 0);
  // The first section of the picker (grade order, then list order). Opened
  // on load so the page never starts on an empty prompt when sections exist;
  // a section already open (from here or from Sections) is left alone.
  const firstSectionId = gradesWithSections.length
    ? sections.find(s => normalizeGradeLevel(s.grade_level) === gradesWithSections[0])?.id ?? null
    : null;
  const openIsKnown = !!openSectionId && sections.some(s => s.id === openSectionId);
  useEffect(() => {
    if (!sectionsLoading && !sectionsError && firstSectionId && !openIsKnown) setOpenSectionId(firstSectionId);
  }, [sectionsLoading, sectionsError, firstSectionId, openIsKnown, setOpenSectionId]);

  // "Add class" moves to the subject list, where each subject has its Add.
  const subjectsCardRef = useRef(null);
  const goToAdd = () => {
    const firstAdd = [...addButtonRefs.current.values()].find(button => !button.disabled);
    subjectsCardRef.current?.scrollIntoView?.({ block: 'start' });
    if (firstAdd) firstAdd.focus();
  };

  return (
    <>
      <div className="x-sch">
        <div className="x-head x-ov-head">
          <div style={{ minWidth: 0 }}>
            <h1 className="x-h1" ref={pageHeadingRef} tabIndex={-1}>Schedules</h1>
            <p className="x-sub">Weekly timetable by section.</p>
          </div>
          <div className="x-act">
            <label className="x-sr" htmlFor="x-sch-section">Section</label>
            <select id="x-sch-section" className="x-select x-sch-pick" value={openSectionId || ''}
              onChange={e => setOpenSectionId(e.target.value || null)}>
              <option value="">Choose a section…</option>
              {gradesWithSections.map(g => (
                <optgroup key={g} label={`${g} · ${countsByGrade[g]} scheduled ${countsByGrade[g] === 1 ? 'period' : 'periods'}`}>
                  {sections.filter(s => normalizeGradeLevel(s.grade_level) === g).map(s => (
                    <option key={s.id} value={s.id}>{`${s.name} — ${sectionSummary(s)}`}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {openSection && (
              <button type="button" className="x-btn pri" onClick={goToAdd}>
                <Plus size={16} aria-hidden="true" /> Add class
              </button>
            )}
          </div>
        </div>
        <SchoolYearNotice schoolYear={schoolYear} settingsSchoolYear={settingsSchoolYear} schoolYearSource={schoolYearSource} />

        {sectionsError ? (
          <div className="x-card x-empty">
            <p>Could not load sections. Check your connection and try again.</p>
            <button type="button" className="x-btn" style={{ marginTop: 12 }} onClick={() => fetchSections()}>Retry sections</button>
          </div>
        ) : schedulesError ? (
          <div className="x-card x-empty">
            <p>Could not load schedules. The sections below are fine; it is the timetable that did not arrive.</p>
            <button type="button" className="x-btn" style={{ marginTop: 12 }} onClick={() => fetchSchedules()}>Retry schedules</button>
          </div>
        ) : sectionsLoading ? (
          <>
            <p className="x-sr">{slowSections ? 'Loading sections…' : ''}</p>
            <div className="x-card x-sch-card" aria-hidden="true"><TimetableSkeleton /></div>
          </>
        ) : gradesWithSections.length === 0 ? (
          <p className="x-card x-empty">No sections for {schoolYear}. Create them in Sections first.</p>
        ) : !openSection ? (
          <p className="x-card x-empty">Pick a section above to set its schedule.</p>
        ) : (
          <>
            <section className="x-card x-sch-card" aria-label={`Weekly timetable for ${openSection.name}`}>
              {schedulesLoading ? (
                <>
                  <p className="x-sr">{slowSchedules ? 'Loading schedules…' : ''}</p>
                  <TimetableSkeleton />
                </>
              ) : slots.length === 0 ? (
                <p className="x-empty">No classes scheduled for {openSection.name} yet.</p>
              ) : (
                <div className="x-tw">
                  <table className="x-sch-table">
                    <caption className="x-sr">Weekly timetable for {openSection.name}</caption>
                    <thead>
                      <tr>
                        <th scope="col" className="x-sch-time"><span className="x-sr">Time</span></th>
                        {days.map(day => <th scope="col" key={day}><abbr title={day}>{day.slice(0, 3)}</abbr></th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {slots.map(([start, end]) => (
                        <tr key={`${start}|${end}`}>
                          <th scope="row" className="x-sch-time">
                            <span aria-hidden="true">{clock(start)} – {clock(end)}</span>
                            <span className="x-sr">{clock(start, true)} to {clock(end, true)}</span>
                          </th>
                          {days.map(day => (
                            <td key={day}>
                              {sectionPeriods
                                .filter(r => r.day_of_week === day && hhmm(r.start_time) === start && hhmm(r.end_time) === end)
                                .map(r => {
                                  const subject = subjectLabel(r);
                                  const teacher = nameOf(teachers, r.teacher_id);
                                  return (
                                    <div key={r.id} role="group" className={`x-sch-block ${colourFor(subjectKey(r))}`}
                                      aria-label={`${subject}, ${teacher}, ${day} ${clock(start, true)}–${clock(end, true)}${r.room_number ? `, ${r.room_number}` : ''}`}>
                                      <b>{subject}</b>
                                      <span>{shortName(teacher)}</span>
                                      {r.room_number && <span>{r.room_number}</span>}
                                      <button type="button" className="x-sch-del archive-action"
                                        aria-label={`Delete ${nameOf(teachers, r.teacher_id)}'s ${r.day_of_week} schedule`}
                                        title="Delete"
                                        onClick={() => deleteSchedule(r.id, () => focusSubject(subjectKey(r)))}><Trash2 size={14} aria-hidden="true" /></button>
                                    </div>
                                  );
                                })}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="x-card x-pad x-sch-setup" aria-label={`Class setup for ${openSection.name}`}>
              <p className="x-kl">Class setup</p>
              <p>
                {teachersLoading ? 'Adviser: loading…'
                  : teachersError ? 'Adviser could not be loaded'
                    : !openSection.adviser_id ? 'No adviser yet'
                      : `Adviser: ${teachers.find(t => t.id === openSection.adviser_id)?.name || 'a teacher not in the list'}`}
              </p>
              <p className="x-cs">
                {subjectsLoading || schedulesLoading ? 'Loading class setup…'
                  : subjectsError ? 'Subject coverage unavailable'
                    : coverageText(subjectCoverage(openSection.id, schedules, activeSubjects))}
              </p>
            </section>

            <section ref={subjectsCardRef} className="x-card x-pad x-sch-subjects" aria-labelledby="x-sch-subjects">
              <h2 id="x-sch-subjects" className="x-ct">Subjects for {openSection.name} — {grade}</h2>
              <p className="x-cs" style={{ marginBottom: 12 }}>Every active subject, scheduled or not. Use Add to schedule a class.</p>
              {subjectsError ? (
                <div className="x-empty">
                  <p>Could not load subjects. Existing subject identities cannot be verified.</p>
                  <button type="button" className="x-btn" style={{ marginTop: 12 }} onClick={() => fetchSubjects()}>Retry subjects</button>
                </div>
              ) : subjectsLoading ? (
                <>
                  <p className="x-sr">{slowSubjects ? 'Loading subjects…' : ''}</p>
                  <SkeletonGroup>
                    <ul className="x-rows">
                      {[0, 1, 2, 3].map(i => (
                        <li key={i}>
                          <div className="g">
                            <span className="t" style={{ display: 'block' }}><Skeleton inline h="0.8em" w="45%" /></span>
                            <span className="m" style={{ display: 'block' }}><Skeleton inline h="0.8em" w="70%" /></span>
                          </div>
                          <span className="x-btn gh"><Skeleton inline h="0.8em" w={36} /></span>
                        </li>
                      ))}
                    </ul>
                  </SkeletonGroup>
                </>
              ) : displaySubjects.length === 0 ? (
                <p className="x-empty">No active subjects yet — a timetable needs subjects to schedule. Add them in Subjects first.</p>
              ) : (
                <ul className="x-rows">
                  {displaySubjects.map(({ key, subject, scheduleRows: rows, legacy }) => {
                    const subjectName = subject?.name || 'Subject reference unavailable';
                    return (
                      <li key={key}>
                        <div className="g">
                          <span className="t" style={{ display: 'block' }} ref={(node) => {
                            if (node) subjectHeadingRefs.current.set(key, node);
                            else subjectHeadingRefs.current.delete(key);
                          }} tabIndex={legacy ? -1 : undefined}>{subjectName}</span>
                          <span className="m" style={{ display: 'block' }}>
                            {subject?.code || 'Saved schedule with an unresolved subject reference'}
                            {' · '}
                            {rows.length === 0 ? 'No teacher yet — nobody scheduled'
                              : `${teacherNamesFor(rows, teachers).length === 1 ? 'Teacher' : 'Teachers'}: ${teacherNamesFor(rows, teachers).join(', ')}`}
                          </span>
                          {legacy && <span className="x-badge">Inactive · existing periods only</span>}
                        </div>
                        {!legacy && (
                          <button type="button" className="x-btn gh"
                            ref={(node) => {
                              if (node) addButtonRefs.current.set(key, node);
                              else addButtonRefs.current.delete(key);
                            }}
                            aria-label={`Add ${subjectName} schedule`}
                            onClick={() => { setTried(false); openCreateSchedule({ sectionId: openSection.id, subjectId: subject.id }); }}>
                            <Plus size={14} aria-hidden="true" /> Add
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {/* ---- TEMPORARY copy (SchedulesTab.jsx:388-487) ---- */}
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
            <SchoolYearNotice schoolYear={schoolYear} settingsSchoolYear={settingsSchoolYear} schoolYearSource={schoolYearSource} />

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
            {/* Clash check from the last Create press. Nothing was saved. */}
            {scheduleCheckError && (
              <div id="schedules-conflict-error" ref={conflictRef} className="field-error" role="alert">{scheduleCheckError}</div>
            )}
            {scheduleConflicts?.length > 0 && (
              <div id="schedules-conflict-error" ref={conflictRef} className="field-error" role="alert">
                <p>Not saved. This period clashes with:</p>
                <ul style={{ paddingLeft: 'var(--space-16)', listStyle: 'disc', margin: 'var(--space-4) 0 0' }}>
                  {scheduleConflicts.map(message => <li key={message}>{message}</li>)}
                </ul>
              </div>
            )}

        </Modal>
      )}
    </>
  );
};

export default ClarityAdminSchedulesTab;
