export const hasExactDeletedIds = (rows, expectedIds) => {
  const expected = [...new Set((Array.isArray(expectedIds) ? expectedIds : [expectedIds]).filter(Boolean))];
  if (!Array.isArray(rows) || rows.length !== expected.length) return false;

  const returned = rows.map(row => row?.id);
  if (returned.some(id => !id)) return false;

  const returnedSet = new Set(returned);
  return returnedSet.size === expected.length && expected.every(id => returnedSet.has(id));
};
