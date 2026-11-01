import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../../config/supabase';
import { withRetry } from '../../../../lib/supabaseRetry';

// Lesson Plans needs only this read. The Worksheet assessment hook also loads
// submissions and sections, so mounting it here would add unrelated requests.
export default function useQuickCreateAssignments(teacherId, schoolYear) {
  const [snapshot, setSnapshot] = useState({ teacherId: null, schoolYear: null, status: 'loading', rows: [] });
  const [retryCount, setRetryCount] = useState(0);
  const requestGeneration = useRef(0);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    let active = true;
    if (teacherId && schoolYear) {
      Promise.resolve().then(async () => {
        if (!active) return;
        setSnapshot({ teacherId, schoolYear, status: 'loading', rows: [] });
        const { data, error } = await withRetry(
          () => supabase.from('teacher_subjects')
            .select('subject_id, grade_level, subjects(id, name)')
            .eq('teacher_id', teacherId)
            .eq('school_year', schoolYear),
          { label: 'Lesson Plan teaching load fetch' }
        );
        if (!active || generation !== requestGeneration.current) return;
        setSnapshot({
          teacherId,
          schoolYear,
          status: error || !Array.isArray(data) ? 'error' : 'ready',
          rows: !error && Array.isArray(data) ? data : [],
        });
      });
    }
    return () => { active = false; };
  }, [teacherId, schoolYear, retryCount]);

  const retry = useCallback(() => {
    ++requestGeneration.current;
    setSnapshot({ teacherId, schoolYear, status: 'loading', rows: [] });
    setRetryCount(count => count + 1);
  }, [teacherId, schoolYear]);

  const current = snapshot.teacherId === teacherId && snapshot.schoolYear === schoolYear;
  const ready = current && snapshot.status === 'ready';
  return {
    assignmentRows: ready ? snapshot.rows : [],
    sourceTeacherId: ready ? snapshot.teacherId : null,
    sourceSchoolYear: ready ? snapshot.schoolYear : null,
    loadState: !teacherId || !schoolYear ? 'unavailable' : current ? snapshot.status : 'loading',
    retry,
  };
}
