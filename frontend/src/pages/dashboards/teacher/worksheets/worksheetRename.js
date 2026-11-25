// U-T3: rename a saved worksheet. The owner already updates worksheets rows
// directly (checking_mode in useWorksheetAssessment) under the existing policy
// ws_worksheets_owner_all (teacher_id = auth.uid()), so no database change is
// needed. Not retried: a rename is a write. Zero rows back means the policy
// refused it (not the owner), which is reported, never treated as saved.
import { supabase } from '../../../../config/supabase';
import { friendlyError } from '../../../../lib/friendlyError';
import { MAX_TITLE } from './manualTaskSave';

// The same title limit as Create Worksheet.
export const TITLE_MAX = MAX_TITLE;

export const cleanTitle = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function titleProblem(value) {
  const title = cleanTitle(value);
  if (!title) return 'Enter a title.';
  if (title.length > TITLE_MAX) return `Use ${TITLE_MAX} characters or fewer.`;
  return '';
}

export async function renameWorksheet(id, value, client = supabase) {
  const problem = titleProblem(value);
  if (problem) return { ok: false, error: problem };
  const title = cleanTitle(value);
  const fallback = 'The worksheet could not be renamed. Please try again.';
  try {
    const { data, error } = await client.from('worksheets').update({ title }).eq('id', id).select('id, title');
    if (error) return { ok: false, error: friendlyError(error, { fallback }) };
    if (!Array.isArray(data) || data.length === 0) return { ok: false, error: 'Only the teacher who made this worksheet can rename it.' };
    return { ok: true, title: data[0].title ?? title };
  } catch (thrown) {
    return { ok: false, error: friendlyError(thrown, { fallback }) };
  }
}
