// ============================================
// FILE: src/pages/dashboards/admin/tabs/TeachingLoadTab.jsx
// Which teacher holds which subject, at which grade level, for a school year.
// Recorded separately from the schedule so a teacher can be established before
// any class exists, and so the schedule form can constrain its subject picker.
//
// ── The shape of this screen, and why ────────────────────────────────────
//
// Eight subjects across six grade levels is 48 entries before a single
// section exists. Writing one per click from three dropdowns was the whole
// problem, so the admin builds a LIST first and presses Assign once:
//
//   [ teacher ] [ grade ] [ subject ] → Add to list
//
//        Grade 7
//          Juan Dela Cruz ···· Mathematics   ×
//          Ana Cruz       ···· English       ×
//
//   → Assign 2 entries      (one write, one round trip)
//
// Nothing reaches the database until that last button. Everything above it
// is a draft the admin can see whole and correct before committing, which is
// the point — a mistake caught in the list costs a click, and the same
// mistake committed costs a delete.
//
// ── Two rules this screen enforces that the database does not ────────────
//
// 1. One teacher per subject per grade. If Juan Dela Cruz holds Mathematics
//    for Grade 7, he holds it for every Grade 7 section, so a second Grade 7
//    Mathematics teacher is not a thing. The UNIQUE constraint on
//    teacher_subjects is (teacher_id, subject_id, grade_level, school_year) —
//    it would happily accept a second teacher on the same subject and grade.
//    Only this screen stops it.
//
// 2. A teacher who has been picked leaves the list. Both while staged and
//    once actually assigned, so the roster shrinks toward the work that is
//    left instead of making the admin re-read names that are done. NOT
//    permanent: a teacher can legitimately hold a second subject, or the same
//    subject at another grade, so a toggle brings the assigned ones back.
//
// The saved list below is grouped BY GRADE LEVEL, because that is the
// question being answered while filling this in — "who has Grade 7 covered,
// and what is still missing". Teachers holding nothing keep their own group
// at the bottom rather than vanishing: they are the work that remains.
// ============================================

import React, { useMemo, useState } from 'react';
import { Plus, X, Copy, Search, ArrowRight } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import { GRADE_LEVELS } from '../../../../lib/academicRules';

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

const slotKey = (gradeLevel, subjectId) => `${gradeLevel}|${subjectId}`;

const TeachingLoadTab = () => {
  const {
    schoolYear, setSchoolYear, teachers, teachersError, subjects,
    teachingLoad, teachingLoadLoading, teachingLoadError, fetchTeachingLoad, fetchTeachers,
    addLoadEntries, removeLoad, copyLoadFromYear, showToast,
  } = useAdminContext();

  // ── Builder row ─────────────────────────────────────────────────────────
  const [pickQuery, setPickQuery] = useState('');
  const [pickedTeacher, setPickedTeacher] = useState('');   // one teacher id
  const [rowGrade, setRowGrade] = useState('');
  const [rowSubject, setRowSubject] = useState('');
  // Someone already holding a load for this year drops out of the picker.
  // Not permanent — see the header.
  const [hideAssigned, setHideAssigned] = useState(true);

  // ── The draft ───────────────────────────────────────────────────────────
  // [{ teacher_id, grade_level, subject_id }]. Nothing here has been written.
  const [staged, setStaged] = useState([]);
  const [saving, setSaving] = useState(false);

  // The saved list below has its own filter, independent of the picker's —
  // one chooses who to assign, the other finds what was assigned.
  const [listQuery, setListQuery] = useState('');

  const teacherById = useMemo(() => new Map(teachers.map(t => [t.id, t])), [teachers]);
  const subjectById = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects]);
  const subjectLabel = (id) => subjectById.get(id)?.name || '—';
  const subjectCode = (id) => subjectById.get(id)?.code || '—';
  const teacherLabel = (id) => {
    const t = teacherById.get(id);
    return t ? (t.name || t.email) : 'Unknown teacher';
  };

  // Everyone holding at least one entry for the school year on screen.
  // teachingLoad is already scoped to that year by fetchTeachingLoad, so this
  // never hides a teacher on the strength of last year's load.
  const assignedIds = useMemo(
    () => new Set(teachingLoad.map(r => r.teacher_id)), [teachingLoad]
  );
  const stagedTeacherIds = useMemo(
    () => new Set(staged.map(e => e.teacher_id)), [staged]
  );

  // Who is still choosable. A staged teacher always leaves the list — they
  // are spoken for in the draft, and letting them be picked twice is how a
  // duplicate gets built.
  const availableTeachers = useMemo(
    () => teachers
      .filter(t => !stagedTeacherIds.has(t.id))
      .filter(t => !hideAssigned || !assignedIds.has(t.id))
      .filter(t => matchesQuery(t, pickQuery)),
    [teachers, stagedTeacherIds, hideAssigned, assignedIds, pickQuery]
  );

  const assignedCount = useMemo(
    () => teachers.filter(t => assignedIds.has(t.id)).length, [teachers, assignedIds]
  );

  // Which (grade, subject) slots already have a holder — saved or staged.
  // This is rule 1 from the header, and it lives only here.
  const slotHolder = useMemo(() => {
    const map = new Map();
    for (const row of teachingLoad) {
      map.set(slotKey(row.grade_level, row.subject_id), {
        teacherId: row.teacher_id, saved: true,
      });
    }
    for (const e of staged) {
      map.set(slotKey(e.grade_level, e.subject_id), {
        teacherId: e.teacher_id, saved: false,
      });
    }
    return map;
  }, [teachingLoad, staged]);

  // A picked teacher who is no longer in the list — the search moved on, or
  // the hide toggle caught them — would otherwise be added invisibly. Cleared
  // rather than warned about, because this picker holds exactly one person
  // and there is no ambiguity about who is lost.
  const pickedTeacherVisible = pickedTeacher
    && availableTeachers.some(t => t.id === pickedTeacher);

  const activeSubjects = useMemo(
    () => subjects.filter(s => s.is_active !== false), [subjects]
  );

  const addToList = () => {
    if (!pickedTeacher || !rowGrade || !rowSubject) {
      return showToast('Pick a teacher, a grade level and a subject', 'error');
    }
    const held = slotHolder.get(slotKey(rowGrade, rowSubject));
    if (held) {
      return showToast(
        `${subjectLabel(rowSubject)} for ${rowGrade} is already `
        + `${held.saved ? 'assigned to' : 'in the list under'} ${teacherLabel(held.teacherId)}.`,
        'error'
      );
    }
    setStaged(prev => [...prev, {
      teacher_id: pickedTeacher, grade_level: rowGrade, subject_id: rowSubject,
    }]);
    // The grade stays: filling one grade's eight subjects in a row is the
    // whole reason this screen exists. The teacher and subject clear, since
    // both are used up by the entry just made.
    setPickedTeacher('');
    setRowSubject('');
  };

  const removeStaged = (index) => setStaged(prev => prev.filter((_, i) => i !== index));

  const assignAll = async () => {
    setSaving(true);
    const written = await addLoadEntries(staged);
    setSaving(false);
    // Cleared only on a write that actually happened. addLoadEntries returns
    // null on failure, and emptying the draft then would destroy work the
    // admin would have to rebuild before they could retry.
    if (written !== null) setStaged([]);
  };

  // Staged entries, grouped by grade level in GRADE_LEVELS order — never
  // alphabetical, where 'Grade 10' sorts before 'Grade 7'.
  const stagedByGrade = useMemo(() => GRADE_LEVELS
    .map(grade => ({
      grade,
      entries: staged
        .map((e, index) => ({ ...e, index }))
        .filter(e => e.grade_level === grade),
    }))
    .filter(g => g.entries.length > 0), [staged]);

  // Only a well-formed "YYYY-YYYY" year can be shifted back a year — anything
  // else (an in-progress edit, garbage input) would otherwise produce
  // "NaN-NaN" and a copy button that silently does nothing useful.
  const isValidSchoolYear = /^\d{4}-\d{4}$/.test(schoolYear);
  const prevYear = isValidSchoolYear
    ? (() => {
      const start = parseInt(schoolYear.split('-')[0], 10) - 1;
      return `${start}-${start + 1}`;
    })()
    : null;

  // ── The saved list ──────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const visible = (teacher) => matchesQuery(teacher, listQuery);

    const byGrade = GRADE_LEVELS.map(grade => {
      const entriesByTeacher = new Map();
      for (const row of teachingLoad) {
        if (row.grade_level !== grade) continue;
        const teacher = teacherById.get(row.teacher_id);
        // A load row whose teacher is missing from the roster — the account
        // was deleted, or the teachers read failed — is skipped rather than
        // rendered with a blank name, which would look like corrupt data.
        if (!teacher || !visible(teacher)) continue;
        if (!entriesByTeacher.has(teacher.id)) entriesByTeacher.set(teacher.id, { teacher, rows: [] });
        entriesByTeacher.get(teacher.id).rows.push(row);
      }
      const list = [...entriesByTeacher.values()]
        .sort((a, b) => (a.teacher.name || a.teacher.email || '')
          .localeCompare(b.teacher.name || b.teacher.email || ''));
      return { grade, list };
    }).filter(g => g.list.length > 0);

    const unassigned = teachers
      .filter(t => !assignedIds.has(t.id) && visible(t))
      .map(t => ({ teacher: t }));

    return { byGrade, unassigned };
  }, [teachingLoad, teachers, teacherById, assignedIds, listQuery]);

  const loadFailed = teachersError || teachingLoadError;
  const nothingMatchesFilter = !loadFailed && !teachingLoadLoading
    && teachers.length > 0
    && groups.byGrade.length === 0 && groups.unassigned.length === 0;

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

      {/* ── Builder ───────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="bulk-grid">
          {/* Teacher */}
          <div>
            <div className="bulk-label">
              Available teachers
              <span className="picker-dept" style={{ marginLeft: 8 }}>
                {availableTeachers.length} to choose from
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
              ) : availableTeachers.length === 0 ? (
                <div className="picker-empty">
                  {/* Four genuinely different situations. Collapsing them into
                      one "no teachers" would leave the admin staring at an
                      empty box with no idea which lever to pull. */}
                  {pickQuery
                    ? <>No available teacher matches “{pickQuery}”.</>
                    : staged.length > 0 && assignedCount > 0
                      ? <>Everyone is either in the list below or already assigned for {schoolYear}.</>
                      : staged.length > 0
                        ? <>Every teacher is already in the list below.</>
                        : <>Every teacher already holds a load for {schoolYear}. Untick “Hide already assigned” to add a second subject.</>}
                </div>
              ) : availableTeachers.map(t => (
                <label key={t.id} className={`picker-row${pickedTeacher === t.id ? ' selected' : ''}`}>
                  <input type="radio" name="teaching-load-teacher"
                    checked={pickedTeacher === t.id}
                    onChange={() => setPickedTeacher(t.id)} />
                  <span className="picker-name">{t.name || t.email}</span>
                  {/* Only reachable with hiding off. Marked so a second
                      subject is an informed choice rather than a duplicate
                      entered by mistake. */}
                  {assignedIds.has(t.id) && <span className="picker-tag">assigned</span>}
                  {t.department && <span className="picker-dept">{t.department}</span>}
                </label>
              ))}
            </div>

            <label className="picker-toggle">
              <input type="checkbox" checked={hideAssigned}
                onChange={() => setHideAssigned(!hideAssigned)} />
              Hide teachers already assigned for {schoolYear}
              {assignedCount > 0 && <span className="picker-dept"> ({assignedCount})</span>}
            </label>
          </div>

          {/* Grade + subject + Add to list */}
          <div>
            <div className="bulk-label">Grade level</div>
            <select className="form-input" value={rowGrade} onChange={e => setRowGrade(e.target.value)}>
              <option value="">Select grade level…</option>
              {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>

            <div className="bulk-label" style={{ marginTop: 16 }}>Subject</div>
            <select className="form-input" value={rowSubject} onChange={e => setRowSubject(e.target.value)}
              disabled={!rowGrade}>
              <option value="">{rowGrade ? 'Select subject…' : 'Pick a grade level first…'}</option>
              {rowGrade && activeSubjects.map(s => {
                // A subject whose slot at this grade is taken is shown, named
                // and disabled rather than quietly dropped — "where did
                // Mathematics go?" is a worse question than seeing who holds it.
                const held = slotHolder.get(slotKey(rowGrade, s.id));
                return (
                  <option key={s.id} value={s.id} disabled={!!held}>
                    {s.name}{held ? ` — ${teacherLabel(held.teacherId)}${held.saved ? '' : ' (in list)'}` : ''}
                  </option>
                );
              })}
            </select>

            <div className="bulk-submit">
              <button className="btn btn-primary" onClick={addToList}
                disabled={!pickedTeacher || !rowGrade || !rowSubject}>
                <Plus size={15} />
                Add to list
              </button>
              <span className="bulk-hint">
                {pickedTeacher && !pickedTeacherVisible
                  ? 'The teacher you picked is no longer shown — pick someone from the list.'
                  : pickedTeacher && rowGrade && rowSubject
                    ? <>{teacherLabel(pickedTeacher)} → {subjectLabel(rowSubject)}, {rowGrade}</>
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

          {stagedByGrade.map(({ grade, entries }) => (
            <div key={grade} className="draft-group">
              <div className="draft-grade">{grade}</div>
              {entries.map(e => (
                <div key={`${e.grade_level}-${e.subject_id}`} className="draft-line">
                  <span className="draft-teacher">{teacherLabel(e.teacher_id)}</span>
                  <span className="draft-dots" />
                  <span className="draft-subject">{subjectLabel(e.subject_id)}</span>
                  <button className="chip-x" title="Remove from list"
                    onClick={() => removeStaged(e.index)}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── The saved list, grouped by grade level ────────────────────── */}
      <div className="toolbar">
        <div className="picker-search" style={{ maxWidth: 320 }}>
          <Search size={14} />
          <input value={listQuery} onChange={e => setListQuery(e.target.value)}
            placeholder="Find a teacher in the list…" />
        </div>
      </div>

      <div className="table-card"><table>
        <thead><tr><th style={{ width: '32%' }}>Teacher</th><th>Holds</th></tr></thead>
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
          ) : teachers.length === 0 ? (
            <tr><td colSpan={2} style={{ textAlign: 'center', padding: 24 }}>
              No teachers yet. Create teacher accounts in User Management first.
            </td></tr>
          ) : nothingMatchesFilter ? (
            <tr><td colSpan={2} style={{ textAlign: 'center', padding: 24 }}>
              No teacher matches “{listQuery}”.
            </td></tr>
          ) : (
            <>
              {groups.byGrade.map(({ grade, list }) => (
                <React.Fragment key={grade}>
                  <tr className="group-row">
                    <td colSpan={2}>
                      <span className="group-title">{grade}</span>
                      <span className="group-count">
                        {list.length} teacher{list.length === 1 ? '' : 's'}
                      </span>
                    </td>
                  </tr>
                  {list.map(({ teacher, rows }) => (
                    <tr key={`${grade}-${teacher.id}`}>
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
                </React.Fragment>
              ))}

              {groups.unassigned.length > 0 && (
                <>
                  <tr className="group-row">
                    <td colSpan={2}>
                      <span className="group-title">Not yet assigned</span>
                      <span className="group-count">
                        {groups.unassigned.length} teacher{groups.unassigned.length === 1 ? '' : 's'}
                      </span>
                    </td>
                  </tr>
                  {groups.unassigned.map(({ teacher }) => (
                    <tr key={`none-${teacher.id}`}>
                      <td>
                        <div>{teacher.name || teacher.email}</div>
                        {teacher.department && <div className="row-sub">{teacher.department}</div>}
                      </td>
                      <td><span style={{ color: 'var(--text-muted)' }}>— nothing for {schoolYear} —</span></td>
                    </tr>
                  ))}
                </>
              )}
            </>
          )}
        </tbody>
      </table></div>
    </div>
  );
};

export default TeachingLoadTab;
