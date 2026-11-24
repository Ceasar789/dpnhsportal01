// R43 (4i, Q11): a worksheet is "out of sync" when its lesson plan was edited
// after the worksheet was made from it. Sync never edits that worksheet (it may
// already be distributed and answered): it opens Generate Task for the plan,
// which makes a NEW draft. No new column: the plan's updated_at is compared
// with the worksheet's created_at, with one minute of slack for the save that
// happens just before a worksheet is generated.
const SLACK_MS = 60 * 1000;

export function outOfSyncByPlan(plans, sheets) {
  const edited = new Map((plans || []).filter(plan => plan?.id && plan.updated_at)
    .map(plan => [plan.id, Date.parse(plan.updated_at)]));
  const result = new Map();
  for (const sheet of Array.isArray(sheets) ? sheets : []) {
    const planId = sheet?.source_lesson_plan_id;
    const planEdited = edited.get(planId);
    const made = Date.parse(sheet?.created_at);
    if (Number.isFinite(planEdited) && Number.isFinite(made) && planEdited > made + SLACK_MS) {
      result.set(planId, (result.get(planId) || 0) + 1);
    }
  }
  return result;
}
