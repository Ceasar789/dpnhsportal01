// R22 + R49 (4k): a saved worksheet as Word blocks, as the Student copy (no
// answers) or the Key to correction (answers from worksheet_item_keys, which
// only the owning teacher can read). Items and keys come from
// useWorksheetAssessment().loadItems, the same read the question editor uses.
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const LETTERS = 'ABCDEFGHIJ';
const TYPE_LABELS = { multiple_choice: 'Multiple choice', true_false: 'True or false', identification: 'Identification',
  enumeration: 'Enumeration', essay: 'Essay' };

const answerText = (value) => {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).join(', ');
  if (value && typeof value === 'object') return clean(JSON.stringify(value));
  return clean(value);
};

export function worksheetDocxBlocks(worksheet, items, keys, { withKey = false } = {}) {
  const blocks = [{ heading: 1, text: clean(worksheet?.title) || 'Worksheet' }];
  const line = [clean(worksheet?.subject), clean(worksheet?.grade_level)].filter(Boolean).join(' · ');
  if (line) blocks.push({ text: line });
  blocks.push({ text: withKey ? 'Key to correction (teacher copy)' : 'Name: ____________________   Section: __________   Date: __________', bold: withKey });
  if (clean(worksheet?.instructions)) blocks.push({ heading: 3, text: 'Directions' }, { text: clean(worksheet.instructions) });
  const ordered = [...(items || [])].sort((a, b) => Number(a.position) - Number(b.position));
  ordered.forEach((item, index) => {
    const points = Number(item.points);
    const pointsText = Number.isFinite(points) ? ` (${points} ${points === 1 ? 'point' : 'points'})` : '';
    blocks.push({ text: `${index + 1}. ${clean(item.question)}${pointsText}`, bold: true });
    const options = Array.isArray(item.options) ? item.options.map(clean).filter(Boolean) : [];
    options.forEach((option, i) => blocks.push({ text: `   ${LETTERS[i] || '-'}. ${option}` }));
    if (!options.length && item.item_type === 'true_false') blocks.push({ text: '   True / False' });
    if (!withKey && !options.length && item.item_type !== 'true_false') blocks.push({ text: '   ________________________________' });
    if (withKey) {
      const answer = answerText(keys?.[item.id]?.correct_answer);
      blocks.push({ text: `   Answer: ${answer || (item.item_type === 'essay' ? 'Checked by the teacher' : 'No key saved')}` });
      blocks.push({ text: `   Type: ${TYPE_LABELS[item.item_type] || clean(item.item_type)}` });
    }
  });
  return blocks;
}
