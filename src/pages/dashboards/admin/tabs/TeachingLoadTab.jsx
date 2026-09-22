// ============================================
// FILE: src/pages/dashboards/admin/tabs/TeachingLoadTab.jsx
// Which teacher holds which subject, at which grade level, for a school year.
// Recorded separately from the schedule so a teacher can be established before
// any class exists, and so the schedule form can constrain its subject picker.
//
// Built for volume. A school with eight subjects across six grade levels has
// 48 teaching-load entries before a single section exists, and the earlier
// form added exactly one per click from three dropdowns. So the teacher
// picker is a searchable checkbox list, the grade levels are multi-select,
// and one Add writes the cross product of the two.
//
// The list below is grouped BY GRADE LEVEL rather than by teacher, because
// that is the question being answered while filling it in — "who has Grade 7
// covered, and what is still missing" — and a flat list of chips per teacher
// cannot answer it. Teachers with nothing assigned keep their own group at
// the bottom rather than disappearing: they are the work that remains.
// ============================================

import React, { useMemo, useState } from 'react';
import { Plus, X, Copy, Search } from 'lucide-react';
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

const TeachingLoadTab = () => {
  const {
    schoolYear, setSchoolYear, teachers, teachersError, subjects,
    teachingLoad, teachingLoadLoading, teachingLoadError, fetchTeachingLoad, fetchTeachers,
    addLoadBulk, removeLoad, copyLoadFromYear,
  } = useAdminContext();

  // Add form
  const [pickQuery, setPickQuery] = useState('');
  const [pickedTeachers, setPickedTeachers] = useState([]);   // teacher ids
  const [rowSubject, setRowSubject] = useState('');
  const [pickedGrades, setPickedGrades] = useState([]);       // 'Grade 7' …
  const [saving, setSaving] = useState(false);
  // Someone already holding a load for this year drops out of the picker, so
  // the list shrinks to the work that is left. NOT permanent, and that is
  // deliberate: a teacher can legitimately hold a second subject, or the same
  // subject at another grade, and hiding them for good would make that
  // impossible to enter at all.
  const [hideAssigned, setHideAssigned] = useState(true);

  // The list below has its own filter, independent of the picker's — one is
  // for choosing who to assign, the other for finding what was assigned.
  const [listQuery, setListQuery] = useState('');

  const subjectName = (id) => subjects.find(s => s.id === id)?.code || '—';
  const teacherById = useMemo(
    () => new Map(teachers.map(t => [t.id, t])), [teachers]
  );

  // Everyone holding at least one entry for the school year on screen.
  // teachingLoad is already scoped to that year by fetchTeachingLoad, so this
  // never hides a teacher on the strength of last year's load.
  const assignedIds = useMemo(
    () => new Set(teachingLoad.map(r => r.teacher_id)), [teachingLoad]
  );

  const filteredTeachers = useMemo(
    () => teachers.filter(t => matchesQuery(t, pickQuery))
      .filter(t => !hideAssigned || !assignedIds.has(t.id)),
    [teachers, pickQuery, hideAssigned, assignedIds]
  );

  const assignedCount = useMemo(
    () => teachers.filter(t => assignedIds.has(t.id)).length, [teachers, assignedIds]
  );

  const toggle = (list, setList, value) => setList(
    list.includes(value) ? list.filter(v => v !== value) : [...list, value]
  );

  // Selecting all selects everything the FILTER currently shows, not every
  // teacher in the school — otherwise typing "math" and pressing Select all
  // would quietly assign the entire faculty.
  const selectAllFiltered = () => setPickedTeachers(
    [...new Set([...pickedTeachers, ...filteredTeachers.map(t => t.id)])]
  );

  const plannedRows = pickedTeachers.length * pickedGrades.length;
  const canAdd = pickedTeachers.length > 0 && !!rowSubject && pickedGrades.length > 0 && !saving;

  // A ticked teacher the search or the hide-assigned toggle has since scrolled
  // out of view is STILL going to be written. Counted so it can be said out
  // loud — a selection that acts on people the admin can no longer see, with
  // only a total to go by, is the kind of quiet mismatch this project keeps
  // paying for.
  const hiddenPickedCount = useMemo(() => {
    const visible = new Set(filteredTeachers.map(t => t.id));
    return pickedTeachers.filter(id => !visible.has(id)).length;
  }, [filteredTeachers, pickedTeachers]);

  const submit = async () => {
    setSaving(true);
    const written = await addLoadBulk(pickedTeachers, rowSubject, pickedGrades);
    setSaving(false);
    setRowSubject('');
    setPickedGrades([]);

    // With hiding on, everyone just assigned is about to leave the list, so
    // holding them selected would leave an invisible selection behind. With
    // hiding off they stay visible, and keeping them ticked is the point:
    // giving the same people a second subject is the usual next action, and
    // re-ticking six boxes to do it is the tedium this screen removes.
    //
    // Cleared only on a write that actually happened. A failed add returns
    // null, and dropping the selection then would make the admin rebuild it
    // before they could retry.
    if (hideAssigned && written !== null) setPickedTeachers([]);
  };

  // Only a well-formed "YYYY-YYYY" year can be shifted back a year — anything
  // else (an in-progress edit, garbage input) would otherwise produce
  // "NaN-NaN" and a copy button that silently does nothing useful.
  const isValidSchoolYear = /^\d{4}-\d{4}$/.test(schoolYear);
  const previousYear = () => {
    if (!isValidSchoolYear) return null;
    const start = parseInt(schoolYear.split('-')[0], 10) - 1;
    return `${start}-${start + 1}`;
  };
  const prevYear = previousYear();

  // ── The grouped list ────────────────────────────────────────────────────
  // One group per grade level that has any load, in GRADE_LEVELS order (never
  // alphabetical — 'Grade 10' sorts before 'Grade 7' as text), plus a final
  // group for teachers holding nothing at all.
  const groups = useMemo(() => {
    const visible = (teacher) => matchesQuery(teacher, listQuery);

    const byGrade = GRADE_LEVELS.map(grade => {
      const entriesByTeacher = new Map();
      for (const row of teachingLoad) {
        if (row.grade_level !== grade) continue;
        const teacher = teacherById.get(row.teacher_id);
        // A load row whose teacher is missing from the roster — the account
        // was deleted, or the teachers read failed — is skipped rather than
        // rendered as a blank name, which would look like a corrupt row.
        if (!teacher || !visible(teacher)) continue;
        if (!entriesByTeacher.has(teacher.id)) entriesByTeacher.set(teacher.id, { teacher, rows: [] });
        entriesByTeacher.get(teacher.id).rows.push(row);
      }
      const list = [...entriesByTeacher.values()]
        .sort((a, b) => (a.teacher.name || a.teacher.email || '')
          .localeCompare(b.teacher.name || b.teacher.email || ''));
      return { grade, list };
    }).filter(g => g.list.length > 0);

    const assignedIds = new Set(teachingLoad.map(r => r.teacher_id));
    const unassigned = teachers
      .filter(t => !assignedIds.has(t.id) && visible(t))
      .map(t => ({ teacher: t, rows: [] }));

    return { byGrade, unassigned };
  }, [teachingLoad, teachers, teacherById, listQuery]);

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

      {/* ── Add form ──────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div className="bulk-grid">
          {/* Teachers */}
          <div>
            <div className="bulk-label">
              Teachers
              {pickedTeachers.length > 0 && (
                <span className="badge badge-blue" style={{ marginLeft: 8 }}>
                  {pickedTeachers.length} selected
                </span>
              )}
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
              ) : filteredTeachers.length === 0 ? (
                <div className="picker-empty">
                  {/* Three genuinely different situations. Collapsing them into
                      one "no teachers" would leave the admin staring at an
                      empty box with no idea which lever to pull. */}
                  {pickQuery && hideAssigned && assignedCount > 0
                    ? <>No unassigned teacher matches “{pickQuery}”. Untick “Hide already assigned” to see the rest.</>
                    : pickQuery
                      ? <>No teacher matches “{pickQuery}”.</>
                      : <>Every teacher already holds a load for {schoolYear}. Untick “Hide already assigned” to add a second subject.</>}
                </div>
              ) : filteredTeachers.map(t => {
                const already = assignedIds.has(t.id);
                return (
                  <label key={t.id} className="picker-row">
                    <input type="checkbox" checked={pickedTeachers.includes(t.id)}
                      onChange={() => toggle(pickedTeachers, setPickedTeachers, t.id)} />
                    <span className="picker-name">{t.name || t.email}</span>
                    {/* Only reachable with hiding off. Marked so a second
                        subject is an informed choice rather than a duplicate
                        entered by mistake. */}
                    {already && <span className="picker-tag">assigned</span>}
                    {t.department && <span className="picker-dept">{t.department}</span>}
                  </label>
                );
              })}
            </div>

            <div className="picker-actions">
              <button className="btn btn-ghost btn-sm" onClick={selectAllFiltered}
                disabled={filteredTeachers.length === 0}>
                Select all {pickQuery || hideAssigned ? 'shown' : ''} ({filteredTeachers.length})
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPickedTeachers([])}
                disabled={pickedTeachers.length === 0}>
                Clear
              </button>
            </div>

            <label className="picker-toggle">
              <input type="checkbox" checked={hideAssigned}
                onChange={() => setHideAssigned(!hideAssigned)} />
              Hide teachers already assigned for {schoolYear}
              {assignedCount > 0 && <span className="picker-dept"> ({assignedCount})</span>}
            </label>

            {hiddenPickedCount > 0 && (
              <div className="picker-warning">
                {hiddenPickedCount} of your {pickedTeachers.length} selected
                {hiddenPickedCount === 1 ? ' teacher is' : ' teachers are'} not shown right now,
                and will still be assigned. Press Clear to drop them.
              </div>
            )}
          </div>

          {/* Subject + grades */}
          <div>
            <div className="bulk-label">Subject</div>
            <select className="form-input" value={rowSubject} onChange={e => setRowSubject(e.target.value)}>
              <option value="">Select subject…</option>
              {subjects.filter(s => s.is_active !== false)
                .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <div className="bulk-label" style={{ marginTop: 16 }}>
              Grade levels
              {pickedGrades.length > 0 && (
                <span className="badge badge-blue" style={{ marginLeft: 8 }}>
                  {pickedGrades.length} selected
                </span>
              )}
            </div>
            <div className="grade-picker">
              {GRADE_LEVELS.map(g => (
                <button key={g} type="button"
                  className={`grade-toggle${pickedGrades.includes(g) ? ' active' : ''}`}
                  onClick={() => toggle(pickedGrades, setPickedGrades, g)}>
                  {g.replace('Grade ', 'G')}
                </button>
              ))}
              <button type="button" className="btn btn-ghost btn-sm"
                onClick={() => setPickedGrades(
                  pickedGrades.length === GRADE_LEVELS.length ? [] : [...GRADE_LEVELS]
                )}>
                {pickedGrades.length === GRADE_LEVELS.length ? 'None' : 'All'}
              </button>
            </div>

            <div className="bulk-submit">
              <button className="btn btn-primary" onClick={submit} disabled={!canAdd}>
                <Plus size={15} />
                {saving ? 'Adding…' : 'Add'}
              </button>
              {/* Says exactly what the button is about to write, before it
                  writes it. Anything already assigned is skipped, so this is
                  an upper bound rather than a promise — worded to match. */}
              <span className="bulk-hint">
                {plannedRows > 0
                  ? `Up to ${plannedRows} entr${plannedRows === 1 ? 'y' : 'ies'} — `
                    + `${pickedTeachers.length} teacher${pickedTeachers.length === 1 ? '' : 's'} `
                    + `× ${pickedGrades.length} grade level${pickedGrades.length === 1 ? '' : 's'}. `
                    + 'Anything already assigned is skipped.'
                  : 'Pick teachers, a subject and grade levels.'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── The list, grouped by grade level ──────────────────────────── */}
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
                        {teacher.department && (
                          <div className="row-sub">{teacher.department}</div>
                        )}
                      </td>
                      <td>
                        {rows
                          .slice()
                          .sort((a, b) => subjectName(a.subject_id).localeCompare(subjectName(b.subject_id)))
                          .map(l => (
                            <span key={l.id} className="chip">
                              {subjectName(l.subject_id)}
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
                        {teacher.department && (
                          <div className="row-sub">{teacher.department}</div>
                        )}
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
