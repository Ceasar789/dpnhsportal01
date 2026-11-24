// 4e (Student #25, Q5): the switch and the read for Student Learning Materials.
// OFF until VITE_STUDENT_LEARNING_MATERIALS_ENABLED=1 (needs autorun/sql/4e: today only
// the owning teacher can read learning_materials and its files).
import { supabase } from '../../../config/supabase';
import { withRetry } from '../../../lib/supabaseRetry';

export const studentMaterialsFlagEnabled = (env = import.meta.env) => env?.VITE_STUDENT_LEARNING_MATERIALS_ENABLED === '1';
const COLUMNS = 'id, title, description, subject_id, grade_level, kind, file_path, file_name, link_url, created_at, subjects(id, name)';

export async function listStudentMaterials({ grade, subjectIds }, client = supabase) {
  if (!grade || !subjectIds.length) return [];
  const { data, error } = await withRetry(() => client.from('learning_materials').select(COLUMNS)
    .eq('grade_level', grade).in('subject_id', subjectIds).order('created_at', { ascending: false }),
  { label: 'Student learning materials fetch' });
  if (error || !Array.isArray(data)) throw new Error('Learning materials could not be loaded.');
  return data;
}
