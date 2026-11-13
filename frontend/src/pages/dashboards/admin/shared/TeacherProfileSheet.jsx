// ============================================
// FILE: src/pages/dashboards/admin/shared/TeacherProfileSheet.jsx
// A teacher's profile for the admin, read-only, built only from what the
// academic tabs already load for the admin school year: no new queries.
// ============================================

import Modal from '../../../../components/ui/Modal';
import { GRADE_LEVELS } from '../../../../lib/academicRules';
import { useAdminContext } from '../AdminContext';
import { DAY_ORDER } from './classSetup';
import { SkeletonGroup, SkeletonText } from '../../../../components/ui/Skeleton';

const show = value => (String(value ?? '').trim() ? String(value) : 'Not set');
const accountStatus = (status) => {
  const text = String(status || '').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Not set';
};
const time = value => String(value ?? '').slice(0, 5);
const dayIndex = (day) => {
  const index = DAY_ORDER.indexOf(day);
  return index === -1 ? DAY_ORDER.length : index;
};
const gradeIndex = (grade) => {
  const index = GRADE_LEVELS.indexOf(grade);
  return index === -1 ? GRADE_LEVELS.length : index;
};

const sectionHeading = { fontSize: 'var(--font-size-14)', fontWeight: 600, color: 'var(--text)', margin: 'var(--space-16) 0 var(--space-8)' };
const listStyle = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-8)' };
const itemStyle = { border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-8) var(--space-12)', color: 'var(--text)' };
const mutedStyle = { color: 'var(--text-muted)', fontSize: 'var(--font-size-12)' };

// One state per block: an error is never shown as the empty text.
const Block = ({ error, loading, onRetry, errorText, empty, emptyText, children }) => {
  if (error) {
    return (
      <div role="alert" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-8)' }}>
        <span>{errorText}</span>
        <button type="button" className="btn btn-ghost btn-sm" style={{ minHeight: 44 }} onClick={onRetry}>Retry</button>
      </div>
    );
  }
  if (loading) {
    return (
      <>
        <p className="sr-only">Loading…</p>
        <SkeletonGroup><SkeletonText lines={2} /></SkeletonGroup>
      </>
    );
  }
  if (empty) return <p style={{ color: 'var(--text)' }}>{emptyText}</p>;
  return children;
};

export default function TeacherProfileSheet({ teacher, onClose }) {
  const {
    schoolYear, sections = [], sectionsLoading, sectionsError, fetchSections,
    teachingLoad = [], teachingLoadLoading, teachingLoadError, fetchTeachingLoad,
    schedules = [], schedulesLoading, schedulesError, fetchSchedules,
    subjects = [], subjectsLoading, subjectsError, fetchSubjects,
  } = useAdminContext();

  const sectionById = new Map(sections.map(section => [section.id, section]));
  const subjectName = id => subjects.find(subject => subject.id === id)?.name || 'Unknown subject';

  const advisory = sections
    .filter(section => section.adviser_id === teacher.id)
    .sort((a, b) => gradeIndex(a.grade_level) - gradeIndex(b.grade_level) || String(a.name).localeCompare(String(b.name)));

  const loadByGrade = GRADE_LEVELS
    .map(grade => ({
      grade,
      subjects: teachingLoad
        .filter(row => row.teacher_id === teacher.id && row.grade_level === grade)
        .map(row => subjectName(row.subject_id))
        .sort((a, b) => a.localeCompare(b)),
    }))
    .filter(group => group.subjects.length > 0);

  const classes = schedules
    .filter(row => row.teacher_id === teacher.id)
    .map(row => ({ ...row, sectionName: sectionById.get(row.section_id)?.name || 'Unknown section' }))
    .sort((a, b) => a.sectionName.localeCompare(b.sectionName)
      || dayIndex(a.day_of_week) - dayIndex(b.day_of_week)
      || String(a.start_time ?? '').localeCompare(String(b.start_time ?? '')));

  const name = teacher.name || teacher.email || 'Teacher';

  return (
    <Modal
      open
      title={`Teacher profile: ${name}`}
      onClose={onClose}
      isDirty={() => false}
      footer={requestClose => (
        <button type="button" className="btn btn-ghost" onClick={requestClose}>Close</button>
      )}
    >
      <dl className="row-sheet">
        <div className="row-sheet-pair"><dt>Name</dt><dd>{name}</dd></div>
        <div className="row-sheet-pair"><dt>Email</dt><dd>{show(teacher.email)}</dd></div>
        <div className="row-sheet-pair"><dt>Account status</dt><dd>{accountStatus(teacher.status)}</dd></div>
        <div className="row-sheet-pair"><dt>Department</dt><dd>{show(teacher.department)}</dd></div>
      </dl>

      <h3 style={sectionHeading}>Advisory ({schoolYear})</h3>
      <Block error={sectionsError} loading={sectionsLoading} onRetry={() => fetchSections?.()}
        errorText="Could not load sections." empty={advisory.length === 0} emptyText="No advisory section this school year.">
        <ul style={listStyle} aria-label="Advisory">
          {advisory.map(section => <li key={section.id} style={itemStyle}>{section.name} · {show(section.grade_level)}</li>)}
        </ul>
      </Block>

      <h3 style={sectionHeading}>Teaching load ({schoolYear})</h3>
      <Block error={teachingLoadError || subjectsError} loading={teachingLoadLoading || subjectsLoading}
        onRetry={() => { if (teachingLoadError) fetchTeachingLoad?.(); if (subjectsError) fetchSubjects?.(); }}
        errorText="Could not load the teaching load." empty={loadByGrade.length === 0} emptyText="No teaching load yet.">
        <p style={mutedStyle}>Saved assignments only.</p>
        <ul style={listStyle} aria-label="Teaching load">
          {loadByGrade.map(group => (
            <li key={group.grade} style={itemStyle}>
              <div style={{ fontWeight: 600 }}>{group.grade}</div>
              <div>{group.subjects.join(', ')}</div>
            </li>
          ))}
        </ul>
      </Block>

      <h3 style={sectionHeading}>Handled classes ({schoolYear})</h3>
      <Block error={schedulesError || sectionsError || subjectsError} loading={schedulesLoading || sectionsLoading || subjectsLoading}
        onRetry={() => { if (schedulesError) fetchSchedules?.(); if (sectionsError) fetchSections?.(); if (subjectsError) fetchSubjects?.(); }}
        errorText="Could not load the classes." empty={classes.length === 0} emptyText="No classes scheduled yet.">
        <ul style={listStyle} aria-label="Handled classes">
          {classes.map(row => (
            <li key={row.id} style={itemStyle}>
              <div>{row.sectionName} · {subjectName(row.subject_id)}</div>
              <div style={mutedStyle}>
                {row.day_of_week} · {time(row.start_time)}–{time(row.end_time)} · {row.room_number ? row.room_number : 'No room'}
              </div>
            </li>
          ))}
        </ul>
      </Block>
    </Modal>
  );
}
