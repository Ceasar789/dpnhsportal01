// Where a saved worksheet came from, for the Source filter and the card badge.
export const AI_GENERATED = 'AI-generated';
export const MANUAL = 'Manual';
export const SOURCE_FILTERS = ['All', AI_GENERATED, MANUAL];

export function worksheetSource(row) {
  if (row?.origin === 'ai_generated') return AI_GENERATED;
  // Generate Day Task saves origin 'manual' (so Questions and Delete stay available),
  // but its questions are AI-written from a lesson plan, and it has no collection.
  if (row?.source_lesson_plan_id && !row?.collection_id) return AI_GENERATED;
  return MANUAL;
}
