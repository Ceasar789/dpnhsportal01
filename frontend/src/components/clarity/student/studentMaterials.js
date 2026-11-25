// 4e (Student #25, Q5): the switch and the read for Student Learning Materials.
// OFF until VITE_STUDENT_LEARNING_MATERIALS_ENABLED=1 (needs autorun/sql/4e: today only
// the owning teacher can read learning_materials and its files).
import { supabase } from '../../../config/supabase';
import { withRetry } from '../../../lib/supabaseRetry';

export const studentMaterialsFlagEnabled = (env = import.meta.env) => env?.VITE_STUDENT_LEARNING_MATERIALS_ENABLED === '1';
const COLUMNS = 'id, teacher_id, title, description, subject_id, grade_level, kind, file_path, file_name, link_url, created_at, subjects(id, name)';

export async function listStudentMaterials({ grade, subjectIds }, client = supabase) {
  if (!grade || !subjectIds.length) return [];
  const { data, error } = await withRetry(() => client.from('learning_materials').select(COLUMNS)
    .eq('grade_level', grade).in('subject_id', subjectIds).order('created_at', { ascending: false }),
  { label: 'Student learning materials fetch' });
  if (error || !Array.isArray(data)) throw new Error('Learning materials could not be loaded.');
  return data;
}

// U-S5: the names of the teachers whose materials this student may see, from
// the proposed function U-S5 (students cannot read teacher profiles directly).
// Missing function, no access or any error: an empty map, and the cards simply
// show no teacher name. Never a placeholder name.
export async function listMaterialTeachers(client = supabase) {
  try {
    if (typeof client?.rpc !== 'function') return new Map();
    const { data, error } = await client.rpc('eduscribe_student_material_teachers');
    if (error || !Array.isArray(data)) return new Map();
    return new Map(data.filter(r => r?.id && String(r.name ?? '').trim()).map(r => [r.id, String(r.name).trim()]));
  } catch {
    return new Map();
  }
}
