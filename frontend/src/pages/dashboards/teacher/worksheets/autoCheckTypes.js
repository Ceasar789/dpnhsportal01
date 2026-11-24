// 4f (R46): the question types Auto-check may score, and the OFF-by-default
// switch for choosing them per worksheet. Turning the flag on requires the
// proposed migration autorun/sql/4f (column worksheets.auto_check_types and the
// scorer that skips unticked types). Without it nothing here writes anything.
export const AUTO_CHECK_TYPES = ['multiple_choice', 'identification', 'true_false'];

export const autoCheckTypesFlagEnabled = (env = import.meta.env) => env?.VITE_AUTO_CHECK_TYPES_ENABLED === '1';

export const normalizeAutoCheckTypes = (value) => {
  const list = Array.isArray(value) ? value : AUTO_CHECK_TYPES;
  return AUTO_CHECK_TYPES.filter(type => list.includes(type));
};

// Returns true when nothing had to be written (flag off) or the write worked.
export async function saveAutoCheckTypes(client, worksheetId, types, env = import.meta.env) {
  if (!autoCheckTypesFlagEnabled(env)) return true;
  const { error } = await client.from('worksheets')
    .update({ auto_check_types: normalizeAutoCheckTypes(types) }).eq('id', worksheetId);
  return !error;
}
