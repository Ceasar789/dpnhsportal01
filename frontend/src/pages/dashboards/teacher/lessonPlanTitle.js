export const validateLessonPlanTitle = value => {
  const title = String(value ?? '').trim();
  if (!title) return { title, error: 'Enter a lesson plan title.' };
  if ([...title].some(character => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)
      || codePoint === 0x2028 || codePoint === 0x2029;
  })) {
    return { title, error: 'Use a single line without control characters.' };
  }
  if ([...title].length > 255) return { title, error: 'Use 255 characters or fewer.' };
  return { title, error: '' };
};
