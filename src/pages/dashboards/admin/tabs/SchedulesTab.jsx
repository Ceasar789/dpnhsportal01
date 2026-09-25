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

import React, { useMemo, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import { GRADE_LEVELS, normalizeGradeLevel, canTeachSection } from '../../../../lib/academicRules';
import GradeTabs from '../GradeTabs';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const SchedulesTab = () => {
  const {
    schoolYear, teachers, subjects, sections, sectionsError, teachingLoad,
    schedules, schedulesLoading, schedulesError, fetchSchedules,
    scheduleModal, openCreateSchedule, closeScheduleModal, saveSchedule, deleteSchedule,
    schedTeacher, setSchedTeacher, schedSubject,
    schedSection, schedDay, setSchedDay,
    schedStart, setSchedStart, schedEnd, setSchedEnd,
    schedRoom, setSchedRoom, schedSaving,
  } = useAdminContext();

  const [grade, setGrade] = useState(GRADE_LEVELS[0]);
  const [openSectionId, setOpenSectionId] = useState(null);

  const nameOf = (list, id, field = 'name') => list.find(x => x.id === id)?.[field] || '—';
  const closeScheduleOverlay = (e) => { if (e.target === e.currentTarget) closeScheduleModal(); };

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
      if (!map.has(row.subject_id)) map.set(row.subject_id, []);
      map.get(row.subject_id).push(row);
    }
    return map;
  }, [schedules, openSection]);

  // Who may hold this subject in this section. The same rule saveSchedule
  // enforces, applied here so an impossible choice is never offered —
  // otherwise the admin picks a name and gets a rejection they cannot act on.
  const eligibleTeachers = useMemo(() => {
    if (!openSection || !schedSubject) return [];
    return teachers.filter(t => canTeachSection(
      teachingLoad.filter(l => l.teacher_id === t.id), schedSubject, openSection
    ).ok);
  }, [teachers, teachingLoad, schedSubject, openSection]);

  const sectionSummary = (section) => {
    const filled = new Set(
      schedules.filter(s => s.section_id === section.id).map(s => s.subject_id)
    ).size;
    return `${filled}/${activeSubjects.length} subjects`;
  };

  return (
    <>
      <div>
        <div className="page-header-bar">
          <div className="page-title">Schedules</div>
          <div className="page-sub">Who teaches what, to which section, and when — for {schoolYear}.</div>
        </div>

        <GradeTabs value={grade} onChange={(g) => { setGrade(g); setOpenSectionId(null); }}
          counts={countsByGrade} />

        {schedulesError || sectionsError ? (
          <div className="table-card" style={{ padding: 24, textAlign: 'center' }}>
            Could not load. Check your connection and try again.
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-ghost" onClick={() => fetchSchedules()}>Retry</button>
            </div>
          </div>
        ) : gradeSections.length === 0 ? (
          <div className="table-card" style={{ padding: 24, textAlign: 'center' }}>
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
                  onClick={() => setOpenSectionId(openSectionId === s.id ? null : s.id)}>
                  <span className="section-chip-name">{s.name}</span>
                  <span className="section-chip-count">{sectionSummary(s)}</span>
                </button>
              ))}
            </div>

            {!openSection ? (
              <div className="table-card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                Pick a section above to set its schedule.
              </div>
            ) : (
              <div className="table-card"><table>
                <thead>
                  <tr>
                    <th style={{ width: '26%' }}>{openSection.name} — {grade}</th>
                    <th>Teacher, day and time</th>
                    <th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {schedulesLoading ? (
                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24 }}>Loading schedules…</td></tr>
                  ) : activeSubjects.map(subject => {
                    const rows = rowsBySubject.get(subject.id) || [];
                    return (
                      <tr key={subject.id}>
                        <td>
                          <div>{subject.name}</div>
                          <div className="row-sub">{subject.code}</div>
                        </td>
                        <td>
                          {rows.length === 0 ? (
                            <span style={{ color: 'var(--text-muted)' }}>— nobody scheduled —</span>
                          ) : rows.map(r => (
                            <div key={r.id} className="sched-line">
                              <span className="sched-teacher">{nameOf(teachers, r.teacher_id)}</span>
                              <span className="sched-when">
                                {r.day_of_week} · {String(r.start_time).slice(0, 5)}–{String(r.end_time).slice(0, 5)}
                                {r.room_number ? ` · ${r.room_number}` : ''}
                              </span>
                              <button className="icon-action archive-action" title="Delete"
                                onClick={() => deleteSchedule(r.id)}><Trash2 size={14} /></button>
                            </div>
                          ))}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => openCreateSchedule({ sectionId: openSection.id, subjectId: subject.id })}>
                            <Plus size={14} /> Add
                          </button>
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
        <div className="modal-overlay open" onClick={closeScheduleOverlay}>
          <div className="modal">
            <div className="modal-title">
              {nameOf(subjects, schedSubject)} — {nameOf(sections, schedSection)}
            </div>

            <div className="form-row">
              <label className="form-label">Teacher</label>
              <select className="form-input" value={schedTeacher} onChange={e => setSchedTeacher(e.target.value)}>
                <option value="">
                  {eligibleTeachers.length === 0
                    ? 'No teacher holds this subject at this grade'
                    : 'Select teacher…'}
                </option>
                {eligibleTeachers.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
              </select>
              {eligibleTeachers.length === 0 && (
                <div className="row-sub" style={{ marginTop: 6 }}>
                  Assign someone this subject for {grade} in Teaching Load first.
                </div>
              )}
            </div>

            <div className="form-row">
              <label className="form-label">Day</label>
              <select className="form-input" value={schedDay} onChange={e => setSchedDay(e.target.value)}>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="form-row" style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Start</label>
                <input className="form-input" type="time" value={schedStart} onChange={e => setSchedStart(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="form-label">End</label>
                <input className="form-input" type="time" value={schedEnd} onChange={e => setSchedEnd(e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <label className="form-label">Room</label>
              <input className="form-input" value={schedRoom} onChange={e => setSchedRoom(e.target.value)} placeholder="e.g. Room 201" />
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={closeScheduleModal}>Cancel</button>
              <button className="btn btn-primary" onClick={saveSchedule}
                disabled={schedSaving || !schedTeacher}>Create</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SchedulesTab;
