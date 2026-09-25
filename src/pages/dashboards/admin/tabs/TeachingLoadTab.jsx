// ============================================
// FILE: src/pages/dashboards/admin/tabs/TeachingLoadTab.jsx
// Which teacher holds which subject, at which grade level, for a school year.
// Recorded separately from the schedule so a teacher can be established before
// any class exists, and so the schedule form can constrain its subject picker.
//
// ── The shape of this screen, and why ────────────────────────────────────
//
// One grade level at a time. The grade tab IS the grade selector — it
// replaced a dropdown rather than being added next to one — so everything
// below it, the picker and the saved list both, is about that grade and
// nothing else.
//
// Within a grade the admin builds a LIST first and presses Assign once:
//
//   Grade 7 │ Grade 8 │ …            ← the grade, chosen once
//   [ teacher ] [ subject ] → Add to list
//
//        Ana Cruz        ···· English     ×
//        Ramon Delgado   ···· Mathematics ×
//
//   → Assign 2 entries      (one write, one round trip)
//
// Nothing reaches the database until that last button. Eight subjects across
// six grade levels is 48 entries, and writing one per click was the whole
// problem.
//
// ── Two rules this screen enforces that the database does not ────────────
//
// 1. One teacher per subject per grade. If Ramon Delgado holds Mathematics
//    for Grade 7, he holds it for every Grade 7 section. The UNIQUE
//    constraint on teacher_subjects is (teacher_id, subject_id, grade_level,
//    school_year) — it would accept a second teacher on the same subject and
//    grade happily. Only this screen stops it.
//
// 2. A teacher already holding something at this grade cannot be picked
//    again. Shown, labelled and disabled rather than hidden, so the admin can
//    see who is done without switching anything. Chosen deliberately by the
//    user, and it does mean a teacher cannot hold two subjects at the same
//    grade through this screen — Mathematics and Science for Grade 7 would
//    have to be entered at different grades or by hand.
// ============================================

import React, { useMemo, useState } from 'react';
import { Plus, X, Copy, Search, ArrowRight } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import { GRADE_LEVELS } from '../../../../lib/academicRules';
import GradeTabs from '../GradeTabs';

// Case-insensitive match across every field an admin might type: the name,
// the email (which for the seeded accounts encodes subject and grade) and
// the department.
const matchesQuery = (teacher, query) => {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [teacher.name, teacher.email, teacher.department]
    .some(field => String(field || '').toLowerCase().includes(q));
};

const TeachingLoadTab = () => {
  const {
    schoolYear, setSchoolYear, teachers, teachersError, subjects,
    teachingLoad, teachingLoadLoading, teachingLoadError, fetchTeachingLoad, fetchTeachers,
    addLoadEntries, removeLoad, copyLoadFromYear, showToast,
  } = useAdminContext();

  const [grade, setGrade] = useState(GRADE_LEVELS[0]);
  const [pickQuery, setPickQuery] = useState('');
  const [pickedTeacher, setPickedTeacher] = useState('');
  const [rowSubject, setRowSubject] = useState('');
  // [{ teacher_id, grade_level, subject_id }]. Nothing here has been written.
  const [staged, setStaged] = useState([]);
  const [saving, setSaving] = useState(false);

  const teacherById = useMemo(() => new Map(teachers.map(t => [t.id, t])), [teachers]);
  const subjectById = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects]);
  const subjectLabel = (id) => subjectById.get(id)?.name || '—';
  const subjectCode = (id) => subjectById.get(id)?.code || '—';
  const teacherLabel = (id) => {
    const t = teacherById.get(id);
    return t ? (t.name || t.email) : 'Unknown teacher';
  };

  // Everything scoped to the grade on screen. teachingLoad is already scoped
  // to the school year by fetchTeachingLoad, so nothing here can be confused
  // by last year's load.
  const gradeLoad = useMemo(
    () => teachingLoad.filter(r => r.grade_level === grade), [teachingLoad, grade]
  );
  const gradeStaged = useMemo(
    () => staged.filter(e => e.grade_level === grade), [staged, grade]
  );

  // Taken at THIS grade, saved or staged. Drives both the disabled teachers
  // and the disabled subjects.
  const takenTeachers = useMemo(() => {
    const m = new Map();
    for (const r of gradeLoad) m.set(r.teacher_id, { subjectId: r.subject_id, saved: true });
    for (const e of gradeStaged) m.set(e.teacher_id, { subjectId: e.subject_id, saved: false });
    return m;
  }, [gradeLoad, gradeStaged]);

  const takenSubjects = useMemo(() => {
    const m = new Map();
    for (const r of gradeLoad) m.set(r.subject_id, { teacherId: r.teacher_id, saved: true });
    for (const e of gradeStaged) m.set(e.subject_id, { teacherId: e.teacher_id, saved: false });
    return m;
  }, [gradeLoad, gradeStaged]);

  // One badge per tab, so the whole year stays readable while only one grade
  // is on screen. Counts saved entries only — a draft is not progress yet.
  const countsByGrade = useMemo(() => {
    const counts = Object.fromEntries(GRADE_LEVELS.map(g => [g, 0]));
    for (const r of teachingLoad) {
      if (counts[r.grade_level] !== undefined) counts[r.grade_level] += 1;
    }
    return counts;
  }, [teachingLoad]);

  const shownTeachers = useMemo(
    () => teachers.filter(t => matchesQuery(t, pickQuery)), [teachers, pickQuery]
  );

  const activeSubjects = useMemo(
    () => subjects.filter(s => s.is_active !== false), [subjects]
  );

  const addToList = () => {
    if (!pickedTeacher || !rowSubject) {
      return showToast('Pick a teacher and a subject', 'error');
    }
    const heldSubject = takenSubjects.get(rowSubject);
    if (heldSubject) {
      return showToast(
        `${subjectLabel(rowSubject)} for ${grade} is already `
        + `${heldSubject.saved ? 'assigned to' : 'in the list under'} ${teacherLabel(heldSubject.teacherId)}.`,
        'error'
      );
    }
    setStaged(prev => [...prev, {
      teacher_id: pickedTeacher, grade_level: grade, subject_id: rowSubject,
    }]);
    setPickedTeacher('');
    setRowSubject('');
  };

  const assignAll = async () => {
    setSaving(true);
    const written = await addLoadEntries(staged);
    setSaving(false);
    // Cleared only on a write that actually happened. addLoadEntries returns
    // null on failure, and emptying the draft then would destroy work the
    // admin would have to rebuild before they could retry.
    if (written !== null) setStaged([]);
  };

  // Only a well-formed "YYYY-YYYY" year can be shifted back a year — anything
  // else (an in-progress edit, garbage input) would otherwise produce
  // "NaN-NaN" and a copy button that silently does nothing useful.
  const prevYear = /^\d{4}-\d{4}$/.test(schoolYear)
    ? (() => {
      const start = parseInt(schoolYear.split('-')[0], 10) - 1;
      return `${start}-${start + 1}`;
    })()
    : null;

  // The saved list for this grade, one row per teacher.
  const savedRows = useMemo(() => {
    const byTeacher = new Map();
    for (const row of gradeLoad) {
      const teacher = teacherById.get(row.teacher_id);
      // A load row whose teacher is missing from the roster — the account was
      // deleted, or the teachers read failed — is skipped rather than rendered
      // with a blank name, which would look like corrupt data.
      if (!teacher) continue;
      if (!byTeacher.has(teacher.id)) byTeacher.set(teacher.id, { teacher, rows: [] });
      byTeacher.get(teacher.id).rows.push(row);
    }
    return [...byTeacher.values()].sort((a, b) =>
      (a.teacher.name || a.teacher.email || '').localeCompare(b.teacher.name || b.teacher.email || ''));
  }, [gradeLoad, teacherById]);

  const loadFailed = teachersError || teachingLoadError;

  return (
    <div>
      <div className="page-header-bar">
        <div className="page-title">Teaching Load</div>
        <div className="page-sub">Which subjects each teacher holds, and at which grade level.</div>
      </div>

      <div className="toolbar">
        <label className="form-label" style={{ marginRight: 8 }}>School Year</label>
        <input className="form-input" style={{ width: 140, flex: 'none' }} value={schoolYear}
          onChange={e => setSchoolYear(e.target.value)} placeholder="2025-2026" />
        {prevYear && (
          <button className="btn btn-ghost" onClick={() => copyLoadFromYear(prevYear)}>
            <Copy size={15} style={{ marginRight: 6 }} />
            Copy from {prevYear}
          </button>
        )}
      </div>

      <GradeTabs value={grade} onChange={setGrade} counts={countsByGrade} />

      {/* ── Builder ───────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="bulk-grid">
          <div>
            <div className="bulk-label">
              Teachers
              <span className="picker-dept" style={{ marginLeft: 8 }}>
                {takenTeachers.size} of {teachers.length} already hold {grade}
              </span>
            </div>

            <div className="picker-search">
              <Search size={14} />
              <input value={pickQuery} onChange={e => setPickQuery(e.target.value)}
                placeholder="Search by name, email or department…" />
            </div>

            <div className="picker-panel">
              {teachersError ? (
                <div className="picker-empty">Could not load teachers.</div>
              ) : teachers.length === 0 ? (
                <div className="picker-empty">No teachers yet. Create them in User Management first.</div>
              ) : shownTeachers.length === 0 ? (
                <div className="picker-empty">No teacher matches “{pickQuery}”.</div>
              ) : shownTeachers.map(t => {
                const taken = takenTeachers.get(t.id);
                return (
                  <label key={t.id}
                    className={`picker-row${pickedTeacher === t.id ? ' selected' : ''}${taken ? ' disabled' : ''}`}>
                    <input type="radio" name="teaching-load-teacher"
                      checked={pickedTeacher === t.id}
                      disabled={!!taken}
                      onChange={() => setPickedTeacher(t.id)} />
                    <span className="picker-name">{t.name || t.email}</span>
                    {/* Named, not just greyed. "Why can't I click this?" is a
                        worse question than seeing what they already hold. */}
                    {taken && (
                      <span className="picker-tag">
                        {subjectCode(taken.subjectId)}{taken.saved ? '' : ' · in list'}
                      </span>
                    )}
                    {!taken && t.department && <span className="picker-dept">{t.department}</span>}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <div className="bulk-label">Subject for {grade}</div>
            <select className="form-input" value={rowSubject} onChange={e => setRowSubject(e.target.value)}>
              <option value="">Select subject…</option>
              {activeSubjects.map(s => {
                const held = takenSubjects.get(s.id);
                return (
                  <option key={s.id} value={s.id} disabled={!!held}>
                    {s.name}{held ? ` — ${teacherLabel(held.teacherId)}${held.saved ? '' : ' (in list)'}` : ''}
                  </option>
                );
              })}
            </select>

            <div className="bulk-submit">
              <button className="btn btn-primary" onClick={addToList}
                disabled={!pickedTeacher || !rowSubject}>
                <Plus size={15} />
                Add to list
              </button>
              <span className="bulk-hint">
                {pickedTeacher && rowSubject
                  ? <>{teacherLabel(pickedTeacher)} → {subjectLabel(rowSubject)}, {grade}</>
                  : 'Nothing is saved until you press Assign below.'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── The draft ─────────────────────────────────────────────────── */}
      {staged.length > 0 && (
        <div className="card draft-card">
          <div className="draft-head">
            <div>
              <div className="draft-title">To be assigned</div>
              <div className="draft-sub">
                {staged.length} entr{staged.length === 1 ? 'y' : 'ies'} · not saved yet
                {/* The draft deliberately survives a grade switch, so it can
                    hold more than the grade on screen. Said out loud rather
                    than letting Assign write rows the admin forgot about. */}
                {gradeStaged.length !== staged.length
                  && ` · ${gradeStaged.length} for ${grade}, the rest for other grades`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setStaged([])} disabled={saving}>
                Discard
              </button>
              <button className="btn btn-primary" onClick={assignAll} disabled={saving}>
                <ArrowRight size={15} />
                {saving ? 'Assigning…' : `Assign ${staged.length} entr${staged.length === 1 ? 'y' : 'ies'}`}
              </button>
            </div>
          </div>

          {GRADE_LEVELS.map(g => {
            const entries = staged
              .map((e, index) => ({ ...e, index }))
              .filter(e => e.grade_level === g);
            if (entries.length === 0) return null;
            return (
              <div key={g} className="draft-group">
                <div className="draft-grade">{g}</div>
                {entries.map(e => (
                  <div key={`${e.grade_level}-${e.subject_id}`} className="draft-line">
                    <span className="draft-teacher">{teacherLabel(e.teacher_id)}</span>
                    <span className="draft-dots" />
                    <span className="draft-subject">{subjectLabel(e.subject_id)}</span>
                    <button className="chip-x" title="Remove from list"
                      onClick={() => setStaged(prev => prev.filter((_, i) => i !== e.index))}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── The saved list for this grade ─────────────────────────────── */}
      <div className="table-card"><table>
        <thead><tr><th style={{ width: '40%' }}>Teacher</th><th>Holds for {grade}</th></tr></thead>
        <tbody>
          {teachingLoadLoading ? (
            <tr><td colSpan={2} style={{ textAlign: 'center', padding: 24 }}>Loading teaching load…</td></tr>
          ) : loadFailed ? (
            <tr><td colSpan={2} style={{ textAlign: 'center', padding: 24 }}>
              Could not load. Check your connection and try again.
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-ghost" onClick={() => {
                  if (teachersError) fetchTeachers();
                  if (teachingLoadError) fetchTeachingLoad();
                }}>Retry</button>
              </div>
            </td></tr>
          ) : savedRows.length === 0 ? (
            <tr><td colSpan={2} style={{ textAlign: 'center', padding: 24 }}>
              Nothing assigned for {grade} yet.
            </td></tr>
          ) : savedRows.map(({ teacher, rows }) => (
            <tr key={teacher.id}>
              <td>
                <div>{teacher.name || teacher.email}</div>
                {teacher.department && <div className="row-sub">{teacher.department}</div>}
              </td>
              <td>
                {rows
                  .slice()
                  .sort((a, b) => subjectCode(a.subject_id).localeCompare(subjectCode(b.subject_id)))
                  .map(l => (
                    <span key={l.id} className="chip">
                      {subjectCode(l.subject_id)}
                      <button className="chip-x" title="Remove" onClick={() => removeLoad(l.id)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
};

export default TeachingLoadTab;
