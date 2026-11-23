import { useEffect, useState } from 'react';
import Field from '../../../../components/ui/form/Field';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';
import { isRetiredGradeLevel } from '../../../../lib/academicRules';
import useQuickCreateAssignments from './useQuickCreateAssignments';

const validYear = value => typeof value === 'string' && /^\d{4}-\d{4}$/.test(value)
  && Number(value.slice(5)) === Number(value.slice(0, 4)) + 1;
const keyOf = a => (a ? `${a.subjectId}|${a.gradeLevel}` : '');

// P4b: the teacher's own teaching load for the official year. The server
// re-checks it; this list only helps the teacher pick a valid one.
export default function ManualAssignmentField({ teacherId, value, error, onChange }) {
  const [year, setYear] = useState({ status: 'loading', value: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    withRetry(() => supabase.from('school_settings').select('school_year').eq('id', 1).single(),
      { label: 'Official academic year fetch' })
      .then(({ data, error: readError }) => {
        if (active) setYear(readError || !validYear(data?.school_year)
          ? { status: 'error', value: null } : { status: 'ready', value: data.school_year });
      }, () => { if (active) setYear({ status: 'error', value: null }); });
    return () => { active = false; };
  }, [attempt]);
  const loads = useQuickCreateAssignments(teacherId, year.value);
  const options = loads.assignmentRows
    .map(row => ({ subjectId: row.subject_id, subjectName: row.subjects?.name || '', gradeLevel: row.grade_level, schoolYear: year.value }))
    .filter(option => option.subjectId && option.subjectName && option.gradeLevel && !isRetiredGradeLevel(option.gradeLevel));
  const failed = year.status === 'error' || loads.loadState === 'error';
  const loading = !failed && (year.status === 'loading' || loads.loadState === 'loading');
  const retry = () => { if (year.status === 'error') setAttempt(n => n + 1); else loads.retry(); };

  const help = failed ? 'Your teaching load could not be loaded.'
    : loading ? 'Loading your teaching load…'
      : options.length ? `From your teaching load for S.Y. ${year.value}.`
        : 'No teaching load for this school year yet. Ask the admin to assign one.';
  return <div className="mb-4 max-w-md" data-ilaw-field="assignment">
    <Field label="Subject and grade" help={help} helpLive error={error} id="manual-assignment">
      <select value={keyOf(value)} disabled={loading || failed || !options.length}
        onChange={event => onChange(options.find(option => keyOf(option) === event.target.value) || null)}>
        <option value="">Choose a subject and grade</option>
        {options.map(option => <option key={keyOf(option)} value={keyOf(option)}>{option.subjectName} · {option.gradeLevel}</option>)}
      </select>
    </Field>
    {failed && <button type="button" onClick={retry} className="mt-2 min-h-[44px] px-3 rounded-lg text-sm font-medium"
      style={{ color: 'var(--text)', border: '1px solid var(--border)' }}>Retry</button>}
  </div>;
}
