// ============================================
// FILE: src/pages/dashboards/admin/shared/StudentProfileSheet.jsx
// A student's profile for the admin: read-only, except LRN and student
// status. Opened from the Sections class list, so it is a dialog over that
// dialog; Modal lets only the top one answer Escape and Tab.
// ============================================

import { useCallback, useEffect, useState } from 'react';
import Modal from '../../../../components/ui/Modal';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import { useAdminContext } from '../AdminContext';
import { formatEnrollmentDate, membershipStatusLabel } from './sectionMembership';

// students.student_status CHECK (confirmed on the live database). Not set
// saves NULL: the CHECK rejects an empty string.
const STUDENT_STATUSES = ['Regular', 'Irregular', 'Transferee', 'Returnee'];
// Assumption, not a database rule: lrn is VARCHAR(50) with no format check.
// DepEd LRNs are 12 digits, as the seed data uses.
const LRN_PATTERN = /^\d{12}$/;

const NOT_SET = 'Not set';
const show = value => (value === null || value === undefined || String(value).trim() === '' ? NOT_SET : String(value));
const accountStatus = (status) => {
  const text = String(status || '').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : NOT_SET;
};
const membershipLabel = status => (!status || status === 'active' ? 'Active' : membershipStatusLabel(status));

// Newest school year first; within a year, the latest enrollment first.
const sortHistory = rows => [...rows].sort((a, b) =>
  String(b.section?.school_year ?? '').localeCompare(String(a.section?.school_year ?? ''))
  || String(b.enrollment_date ?? '').localeCompare(String(a.enrollment_date ?? ''))
  || String(a.section?.name ?? '').localeCompare(String(b.section?.name ?? '')));

const saveErrorMessage = (error) => {
  if (error?.code === '23505') return 'This LRN is already used by another student.';
  if (error?.code === '23514') return 'This status is not accepted by the database.';
  return "Could not save the student's details. Please try again.";
};

const Pair = ({ label, children }) => (
  <div className="row-sheet-pair"><dt>{label}</dt><dd>{children}</dd></div>
);

const sectionHeading = { fontSize: 'var(--font-size-14)', fontWeight: 600, color: 'var(--text)', margin: 'var(--space-16) 0 var(--space-8)' };
const listStyle = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-8)' };
const itemStyle = { border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-8) var(--space-12)', color: 'var(--text)' };
const mutedStyle = { color: 'var(--text-muted)', fontSize: 'var(--font-size-12)' };

export default function StudentProfileSheet({ student, onClose }) {
  const { schoolYear, showToast } = useAdminContext();
  const studentId = student.id;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [record, setRecord] = useState(null);
  const [detailsError, setDetailsError] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState(false);

  const [editing, setEditing] = useState(false);
  const [lrn, setLrn] = useState('');
  const [status, setStatus] = useState('');
  const [lrnError, setLrnError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [profileRead, studentRead, historyRead] = await Promise.all([
      withRetry(() => supabase.from('profiles').select('id, name, email, status').eq('id', studentId).maybeSingle()),
      withRetry(() => supabase.from('students')
        .select('id, lrn, student_number, student_status, year_level').eq('id', studentId).maybeSingle()),
      withRetry(() => supabase.from('section_students')
        .select('id, status, enrollment_date, section:sections(id, name, grade_level, school_year)')
        .eq('student_id', studentId)),
    ]);
    setDetailsError(Boolean(profileRead.error || studentRead.error));
    setProfile(profileRead.data || null);
    setRecord(studentRead.error ? null : studentRead.data || null);
    setHistoryError(Boolean(historyRead.error));
    setHistory(historyRead.error ? [] : sortHistory(historyRead.data || []));
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const startEdit = () => {
    setLrn(record?.lrn || '');
    setStatus(record?.student_status || '');
    setLrnError('');
    setEditing(true);
  };

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    const nextLrn = lrn.trim();
    if (nextLrn && !LRN_PATTERN.test(nextLrn)) {
      setLrnError('Enter exactly 12 digits, or leave the LRN empty.');
      return;
    }
    setLrnError('');
    setSaving(true);
    try {
      const { data, error } = await supabase.from('students')
        .update({ lrn: nextLrn || null, student_status: status || null })
        .eq('id', studentId)
        .select('id');
      if (error || data?.length !== 1) {
        showToast(saveErrorMessage(error), 'error');
        return;
      }
      showToast('Student details saved');
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const name = profile?.name || student.name || student.email || 'Student';
  const dirty = () => editing && (lrn !== (record?.lrn || '') || status !== (record?.student_status || ''));
  const current = history.filter(row => (!row.status || row.status === 'active') && row.section?.school_year === schoolYear);

  return (
    <Modal
      open
      title={`Student profile: ${name}`}
      onClose={onClose}
      isDirty={dirty}
      footer={requestClose => (
        <button type="button" className="btn btn-ghost" onClick={requestClose}>Close</button>
      )}
    >
      {loading ? (
        <p role="status">Loading profile…</p>
      ) : (
        <>
          {detailsError && (
            <div role="alert" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-8)', marginBottom: 'var(--space-12)' }}>
              <span>Could not load this student&apos;s details.</span>
              <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 44 }} onClick={load}>Retry</button>
            </div>
          )}

          <dl className="row-sheet">
            <Pair label="Name">{name}</Pair>
            <Pair label="Email">{show(profile?.email || student.email)}</Pair>
            <Pair label="Account status">{detailsError ? 'Unavailable' : accountStatus(profile?.status)}</Pair>
          </dl>

          {!detailsError && !record ? (
            <p style={{ marginTop: 'var(--space-16)', color: 'var(--text)' }}>Not enrolled in any section yet.</p>
          ) : !detailsError && (
            <>
              <h3 style={sectionHeading}>Personal details</h3>
              {editing ? (
                <form onSubmit={save} noValidate aria-label="Edit details">
                  <div className="form-group">
                    <label className="form-label" htmlFor="student-profile-lrn">LRN</label>
                    <input id="student-profile-lrn" name="lrn" className={`form-input${lrnError ? ' is-invalid' : ''}`}
                      inputMode="numeric" autoComplete="off" value={lrn}
                      onChange={event => { setLrn(event.target.value); setLrnError(''); }}
                      aria-invalid={lrnError ? true : undefined}
                      aria-describedby={`student-profile-lrn-help${lrnError ? ' student-profile-lrn-error' : ''}`} />
                    <div id="student-profile-lrn-help" className="form-hint">Exactly 12 digits. Leave empty to clear the LRN.</div>
                    {lrnError && <div id="student-profile-lrn-error" className="field-error">{lrnError}</div>}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="student-profile-status">Student status</label>
                    <select id="student-profile-status" name="student_status" className="form-input" style={{ minHeight: 44 }}
                      value={status} onChange={event => setStatus(event.target.value)}>
                      <option value="">Not set</option>
                      {STUDENT_STATUSES.map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-8)', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} disabled={saving}
                      onClick={() => { setEditing(false); setLrnError(''); }}>Cancel</button>
                    <button type="submit" className="btn btn-primary" style={{ minHeight: 44 }} disabled={saving} aria-busy={saving || undefined}>
                      {saving ? 'Saving…' : 'Save details'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <dl className="row-sheet">
                    <Pair label="LRN">{show(record.lrn)}</Pair>
                    <Pair label="Student number">{show(record.student_number)}</Pair>
                    <Pair label="Student status">{show(record.student_status)}</Pair>
                    {show(record.year_level) !== NOT_SET && <Pair label="Year level">{record.year_level}</Pair>}
                  </dl>
                  <button type="button" className="btn btn-ghost" style={{ minHeight: 44, marginTop: 'var(--space-8)' }} onClick={startEdit}>
                    Edit details
                  </button>
                </>
              )}
            </>
          )}

          {(historyError || history.length > 0 || record) && (
            <>
              <h3 style={sectionHeading}>Current section ({schoolYear})</h3>
              {historyError ? (
                <p style={mutedStyle}>Unavailable until the enrollment history loads.</p>
              ) : current.length === 0 ? (
                <p style={{ color: 'var(--text)' }}>No active section this school year.</p>
              ) : (
                <ul style={listStyle} aria-label="Current section">
                  {current.map(row => (
                    <li key={row.id} style={itemStyle}>{row.section?.name || 'Unknown section'} · {show(row.section?.grade_level)}</li>
                  ))}
                </ul>
              )}

              <h3 style={sectionHeading}>Enrollment history</h3>
              {historyError ? (
                <div role="alert" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-8)' }}>
                  <span>Could not load the enrollment history.</span>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 44 }} onClick={load}>Retry</button>
                </div>
              ) : history.length === 0 ? (
                <p style={{ color: 'var(--text)' }}>No enrollment history yet.</p>
              ) : (
                <ul style={listStyle} aria-label="Enrollment history">
                  {history.map(row => (
                    <li key={row.id} style={itemStyle}>
                      <div>{row.section?.name || 'Unknown section'} · {show(row.section?.grade_level)} · {show(row.section?.school_year)}</div>
                      <div style={mutedStyle}>{membershipLabel(row.status)} · Enrolled {formatEnrollmentDate(row.enrollment_date)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
