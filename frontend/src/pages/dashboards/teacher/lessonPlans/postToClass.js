// R19 / R20 / R23 (4d, Q4): post (or repost) a saved lesson plan to one of the
// teacher's classes, for everyone, everyone except some students, or only
// ticked students. Posting is for the teacher's own organisation and for admin
// monitoring: students never read lesson plans or posts.
// Needs the proposed table public.lesson_plan_posts (autorun/sql/4d). Until it
// exists VITE_LESSON_PLAN_POSTING_ENABLED stays off and nothing here runs.
import { withRetry } from '../../../../lib/supabaseRetry';

export const lessonPlanPostingFlagEnabled = (env = import.meta.env) => env?.VITE_LESSON_PLAN_POSTING_ENABLED === '1';
export const AUDIENCES = ['all', 'except', 'only'];
export const AUDIENCE_LABELS = { all: 'Everyone in the class', except: 'Everyone except…', only: 'Only ticked students' };

// The classes the teacher handles (schedules) or advises, by name.
export async function loadTeacherSections(client, teacherId) {
  const sched = await withRetry(() => client.from('schedules').select('section_id').eq('teacher_id', teacherId),
    { label: 'Teacher schedules fetch' });
  if (sched.error) return null;
  const ids = [...new Set((sched.data || []).map(row => row.section_id).filter(Boolean))];
  const advised = await withRetry(() => client.from('sections').select('id, name, grade_level').eq('adviser_id', teacherId),
    { label: 'Advised sections fetch' });
  if (advised.error) return null;
  let scheduled = [];
  if (ids.length) {
    const named = await withRetry(() => client.from('sections').select('id, name, grade_level').in('id', ids),
      { label: 'Scheduled sections fetch' });
    if (named.error) return null;
    scheduled = named.data || [];
  }
  return [...new Map([...scheduled, ...(advised.data || [])].map(s => [s.id, s])).values()]
    .sort((a, b) => `${a.grade_level} ${a.name}`.localeCompare(`${b.grade_level} ${b.name}`));
}

// Active students of a section, by name; null when the read failed (never "empty").
export async function loadClassList(client, sectionId) {
  const rows = await withRetry(() => client.from('section_students').select('student_id')
    .eq('section_id', sectionId).eq('status', 'active'), { label: 'Class list fetch' });
  if (rows.error) return null;
  const ids = [...new Set((rows.data || []).map(r => r.student_id))];
  if (!ids.length) return [];
  const names = await withRetry(() => client.from('profiles').select('id, name').in('id', ids), { label: 'Class list names fetch' });
  if (names.error) return null;
  const byId = new Map((names.data || []).map(p => [p.id, p.name]));
  return ids.map(id => ({ id, name: byId.get(id) || 'Student' })).sort((a, b) => a.name.localeCompare(b.name));
}

// The row to write, or a sentence saying what to fix.
export function postRow({ planId, teacherId, sectionId, audience, ticked, roster }) {
  if (!planId || !teacherId) return { error: 'This lesson plan cannot be posted right now.' };
  if (!sectionId) return { error: 'Choose a class.' };
  if (!AUDIENCES.includes(audience)) return { error: 'Choose who the plan is for.' };
  const known = new Set((roster || []).map(s => s.id));
  const studentIds = audience === 'all' ? [] : [...new Set(ticked || [])].filter(id => known.has(id));
  if (audience !== 'all' && !studentIds.length) {
    return { error: audience === 'only' ? 'Tick at least one student.' : 'Tick the students to leave out.' };
  }
  return { row: { lesson_plan_id: planId, teacher_id: teacherId, section_id: sectionId, audience, student_ids: studentIds } };
}

// Repost = the same (plan, class) row updated, so a plan is never posted twice to one class.
export async function savePost(client, row, env = import.meta.env) {
  if (!lessonPlanPostingFlagEnabled(env)) return { ok: false, error: 'Posting lesson plans is not available yet.' };
  const { error } = await client.from('lesson_plan_posts')
    .upsert({ ...row, posted_at: new Date().toISOString() }, { onConflict: 'lesson_plan_id,section_id' });
  return error ? { ok: false, error: 'The lesson plan could not be posted. Check your connection and try again.' } : { ok: true };
}
