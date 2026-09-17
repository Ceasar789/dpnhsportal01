// ============================================
// FILE: src/pages/dashboards/admin/tabs/SchedulesTab.jsx
// Ties a teacher, a subject, a section and a time together. This is the record
// the teacher dashboard reads to know what it is meant to show.
// ============================================

import React from 'react';
import { Trash2, Plus } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import { subjectsTeacherHolds } from '../../../../lib/academicRules';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const SchedulesTab = () => {
  const {
    schoolYear, teachers, subjects, sections, teachingLoad,
    schedules, schedulesLoading, schedulesError, fetchSchedules,
    scheduleModal, openCreateSchedule, closeScheduleModal, saveSchedule, deleteSchedule,
    schedTeacher, setSchedTeacher, schedSubject, setSchedSubject,
    schedSection, setSchedSection, schedDay, setSchedDay,
    schedStart, setSchedStart, schedEnd, setSchedEnd,
    schedRoom, setSchedRoom, schedSaving,
  } = useAdminContext();

  const nameOf = (list, id, field = 'name') => list.find(x => x.id === id)?.[field] || '—';
  const closeScheduleOverlay = (e) => { if (e.target === e.currentTarget) closeScheduleModal(); };

  // The subject picker offers only what this teacher holds, so an invalid
  // pairing cannot be chosen in the first place. saveSchedule still checks,
  // because the grade level of the chosen section matters too.
  const heldSubjectIds = schedTeacher
    ? subjectsTeacherHolds(teachingLoad.filter(l => l.teacher_id === schedTeacher), schoolYear)
    : [];

  return (
    <>
      <div>
        <div className="page-title">Schedules</div>
        <div className="page-sub">Who teaches what, to which section, and when — for {schoolYear}.</div>

        <div className="toolbar">
          <button className="btn btn-primary" onClick={openCreateSchedule}>
            <Plus size={15} style={{ marginRight: 6 }} />
            Add Schedule
          </button>
        </div>

        <div className="table-card"><table>
          <thead>
            <tr><th>Section</th><th>Subject</th><th>Teacher</th><th>Day</th><th>Time</th><th>Room</th><th style={{ width: 60 }}></th></tr>
          </thead>
          <tbody>
            {schedulesLoading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>Loading schedules…</td></tr>
            ) : schedulesError ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>
                Could not load schedules. Check your connection and try again.
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-ghost" onClick={() => fetchSchedules()}>Retry</button>
                </div>
              </td></tr>
            ) : schedules.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>No schedules for {schoolYear} yet.</td></tr>
            ) : schedules.map(s => (
              <tr key={s.id}>
                <td><strong>{nameOf(sections, s.section_id)}</strong></td>
                <td>{nameOf(subjects, s.subject_id, 'code')}</td>
                <td>{nameOf(teachers, s.teacher_id)}</td>
                <td>{s.day_of_week}</td>
                <td>{String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}</td>
                <td>{s.room_number || '—'}</td>
                <td><button className="icon-action" title="Delete" onClick={() => deleteSchedule(s.id)}><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      {scheduleModal && (
        <div className="modal-overlay open" onClick={closeScheduleOverlay}>
          <div className="modal">
            <div className="modal-title">Add Schedule</div>

            <div className="form-row">
              <label className="form-label">Teacher</label>
              <select className="form-input" value={schedTeacher} onChange={e => { setSchedTeacher(e.target.value); setSchedSubject(''); }}>
                <option value="">Select teacher…</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
              </select>
            </div>

            <div className="form-row">
              <label className="form-label">Subject</label>
              <select className="form-input" value={schedSubject} onChange={e => setSchedSubject(e.target.value)} disabled={!schedTeacher}>
                <option value="">
                  {!schedTeacher ? 'Pick a teacher first…'
                    : heldSubjectIds.length === 0 ? 'This teacher has no teaching load yet'
                    : 'Select subject…'}
                </option>
                {subjects.filter(s => heldSubjectIds.includes(s.id)).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <label className="form-label">Section</label>
              <select className="form-input" value={schedSection} onChange={e => setSchedSection(e.target.value)}>
                <option value="">Select section…</option>
                {sections.map(s => <option key={s.id} value={s.id}>{s.name} ({s.grade_level})</option>)}
              </select>
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
              <button className="btn btn-primary" onClick={saveSchedule} disabled={schedSaving}>Create</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SchedulesTab;
