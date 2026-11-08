// Multiple choice and true/false hold the chosen option as a string, and typed
// answers hold text. Enumeration holds a list of lines.
export const hasStudentAnswer = value => (typeof value === 'string'
  ? value.trim().length > 0
  : Array.isArray(value) && value.some(line => typeof line === 'string' && line.trim().length > 0));

// An Activity: read-only directions with nothing to answer or submit. Anything
// unknown is not a handout, so a task with missing data behaves as a normal one.
export const isHandout = sheet => sheet?.task_type === 'worksheet' && sheet.items === 0
  && typeof sheet.instructions === 'string' && sheet.instructions.trim().length > 0;

// The toast after a submit, from the re-read row. A score is named only when the
// row is released; a missing row (the re-read failed) says just "Submitted."
export const submittedMessage = (state, scored, { auto = false, hasEssay = false } = {}) => {
  if (!state) return 'Submitted.';
  if (state.released === true) {
    return scored?.score != null && scored?.total_points != null
      ? `Submitted. Your score: ${scored.score}/${scored.total_points}.` : 'Submitted.';
  }
  return auto && hasEssay ? 'Submitted. Your teacher will check the essay questions.'
    : 'Submitted. Your teacher will check your answers.';
};
