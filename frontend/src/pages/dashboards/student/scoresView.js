// Pure helpers for the student Scores tab. Only RELEASED scores are used: the
// shared graph reads them with released = true in the query (releasedScores),
// and nothing here touches answer keys or provisional marks.
import { TASK_TYPE_LABELS } from '../../../lib/taskFormatting';
import { isHandout } from './tabs/studentAnswers';

// The Overview "Worksheet Performance" rule, shared so the two never differ:
// a released row counts when it has a score and a total above zero; the
// average is the mean of each row's percentage, rounded.
export const usableScore = row => Boolean(row) && row.score !== null && row.score !== undefined
  && Number(row.total_points) > 0;
const percentOf = row => (Number(row.score) / Number(row.total_points)) * 100;
export const averagePercent = rows => (rows.length
  ? Math.round(rows.reduce((sum, row) => sum + percentOf(row), 0) / rows.length) : null);

export const overallScores = graph => {
  const usable = (graph?.releasedScores || []).filter(usableScore);
  return { percent: averagePercent(usable), count: usable.length };
};

const AWAITING = new Set(['submitted', 'checked']);

// One entry per subject, alphabetical: assigned (not Activities), the released
// items with their scores, how many are awaiting results, and the average.
export const scoresBySubject = graph => {
  if (!graph) return [];
  const subjects = new Map();
  const seen = new Set();
  (graph.assignees || []).forEach(assignee => {
    const sheet = graph.sheetById.get(assignee.task_id);
    if (!sheet || isHandout(sheet) || seen.has(sheet.id)) return;
    seen.add(sheet.id);
    const name = (sheet.subject_id && graph.subjectsById.get(sheet.subject_id)) || sheet.subject || 'No subject';
    const key = sheet.subject_id || `name:${name}`;
    if (!subjects.has(key)) subjects.set(key, { key, name, assigned: 0, awaiting: 0, items: [] });
    const entry = subjects.get(key);
    entry.assigned += 1;
    const state = graph.submissionStates.find(s => s.worksheet_id === sheet.id) || null;
    const released = graph.releasedScores.find(s => s.worksheet_id === sheet.id) || null;
    if (usableScore(released)) {
      entry.items.push({
        id: sheet.id, title: sheet.title, type: TASK_TYPE_LABELS[sheet.task_type] || 'Task',
        score: released.score, total: released.total_points,
        percent: Math.round(percentOf(released)), submittedAt: state?.submitted_at || null, row: released,
      });
    } else if (state && state.released !== true && AWAITING.has(state.status)) {
      entry.awaiting += 1;
    }
  });
  return [...subjects.values()]
    .map(entry => ({
      ...entry,
      percent: averagePercent(entry.items.map(item => item.row)),
      items: [...entry.items].sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''))),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};
