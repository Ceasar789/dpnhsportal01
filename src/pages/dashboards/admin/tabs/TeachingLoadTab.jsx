// ============================================
// FILE: src/pages/dashboards/admin/tabs/TeachingLoadTab.jsx
// Which teacher holds which subject, at which grade level, for a school year.
// Recorded separately from the schedule so a teacher can be established before
// any class exists, and so the schedule form can constrain its subject picker.
// ============================================

import React, { useState } from 'react';
import { Plus, X, Copy } from 'lucide-react';
import { useAdminContext } from '../AdminContext';
import { GRADE_LEVELS } from '../../../../lib/academicRules';

const TeachingLoadTab = () => {
  const {
    schoolYear, setSchoolYear, teachers, teachersError, subjects,
    teachingLoad, teachingLoadLoading, teachingLoadError, fetchTeachingLoad, fetchTeachers,
    addLoad, removeLoad, copyLoadFromYear,
  } = useAdminContext();

  const [rowTeacher, setRowTeacher] = useState('');
  const [rowSubject, setRowSubject] = useState('');
  const [rowGrade, setRowGrade] = useState('');

  const subjectName = (id) => subjects.find(s => s.id === id)?.code || '—';

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

  return (
    <div>
      <div className="page-header-bar">
        <div className="page-title">Teaching Load</div>
        <div className="page-sub">Which subjects each teacher holds, and at which grade level.</div>
      </div>

      <div className="toolbar">
        <label className="form-label" style={{ marginRight: 8 }}>School Year</label>
        <input className="form-input" style={{ width: 140 }} value={schoolYear}
          onChange={e => setSchoolYear(e.target.value)} placeholder="2025-2026" />
        {prevYear && (
          <button className="btn btn-ghost" onClick={() => copyLoadFromYear(prevYear)}>
            <Copy size={15} style={{ marginRight: 6 }} />
            Copy from {prevYear}
          </button>
        )}
      </div>

      <div className="form-row" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <select className="form-input" style={{ width: 220 }} value={rowTeacher} onChange={e => setRowTeacher(e.target.value)}>
          <option value="">Select teacher…</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
        </select>

        <select className="form-input" style={{ width: 180 }} value={rowSubject} onChange={e => setRowSubject(e.target.value)}>
          <option value="">Select subject…</option>
          {subjects.filter(s => s.is_active !== false).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select className="form-input" style={{ width: 140 }} value={rowGrade} onChange={e => setRowGrade(e.target.value)}>
          <option value="">Grade level…</option>
          {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <button className="btn btn-primary" onClick={async () => {
          await addLoad(rowTeacher, rowSubject, rowGrade);
          setRowSubject(''); setRowGrade('');
        }}>
          <Plus size={15} style={{ marginRight: 6 }} />
          Add
        </button>
      </div>

      <div className="table-card"><table>
        <thead><tr><th>Teacher</th><th>Holds</th></tr></thead>
        <tbody>
          {teachingLoadLoading ? (
            <tr><td colSpan={2} style={{ textAlign: 'center', padding: 24 }}>Loading teaching load…</td></tr>
          ) : teachersError || teachingLoadError ? (
            <tr><td colSpan={2} style={{ textAlign: 'center', padding: 24 }}>
              Could not load. Check your connection and try again.
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-ghost" onClick={() => { if (teachersError) fetchTeachers(); if (teachingLoadError) fetchTeachingLoad(); }}>Retry</button>
              </div>
            </td></tr>
          ) : teachers.length === 0 ? (
            <tr><td colSpan={2} style={{ textAlign: 'center', padding: 24 }}>No teachers yet. Create teacher accounts in User Management first.</td></tr>
          ) : teachers.map(t => {
            const rows = teachingLoad.filter(l => l.teacher_id === t.id);
            return (
              <tr key={t.id}>
                <td>{t.name || t.email}</td>
                <td>
                  {rows.length === 0
                    ? <span style={{ color: 'var(--text-muted)' }}>— not yet assigned —</span>
                    : rows.map(l => (
                      <span key={l.id} className="chip">
                        {subjectName(l.subject_id)} · {l.grade_level}
                        <button className="chip-x" title="Remove" onClick={() => removeLoad(l.id)}><X size={12} /></button>
                      </span>
                    ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </div>
  );
};

export default TeachingLoadTab;
