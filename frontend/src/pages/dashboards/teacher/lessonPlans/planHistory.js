// U-PDF-T-FIX-A (design p16): the plan view's History and dates, from stored
// timestamps only (nothing guessed). Dates read in Manila time.
const SLACK_MS = 60 * 1000; // the same minute planSync.js allows for the save just before generating
const time = value => Date.parse(value || '');

export const planViewDate = value => (Number.isFinite(time(value))
  ? new Date(time(value)).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '');

// Newest first. "Edited" only when the plan changed after it was created.
export function planHistory(plan, worksheets = []) {
  if (!plan) return [];
  const events = [];
  const created = time(plan.created_at);
  const edited = time(plan.updated_at);
  if (Number.isFinite(created)) events.push({ key: 'created', label: 'Created', at: plan.created_at });
  if (Number.isFinite(edited) && (!Number.isFinite(created) || edited > created + SLACK_MS)) events.push({ key: 'edited', label: 'Edited', at: plan.updated_at });
  for (const sheet of worksheets) {
    if (Number.isFinite(time(sheet?.created_at))) events.push({ key: `sheet-${sheet.id}`, label: 'Worksheet generated', detail: sheet.title || '', at: sheet.created_at });
  }
  return events.sort((a, b) => time(b.at) - time(a.at));
}
