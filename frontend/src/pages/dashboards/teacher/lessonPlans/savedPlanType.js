import { parseManualIlawDraft } from '../ilaw/fullManualIlawModel';
import { parseManualIlawV2 } from '../ilaw/manualIlawV2';

// The existing objectives TEXT column can hold a future versioned document.
// No active Manual flow writes one today. A false ai_generated flag alone is
// never evidence that a legacy record is a structured Manual ILAW plan.
export function savedPlanType(plan) {
  if (plan?.ai_generated === true) return 'ai';
  if (typeof plan?.objectives !== 'string' || !plan.objectives.trimStart().startsWith('{')) return 'other';
  try {
    const payload = JSON.parse(plan.objectives);
    if (payload?.version === 2) parseManualIlawV2(plan.objectives, { teacherId: plan.teacher_id, planId: plan.id });
    else parseManualIlawDraft(plan.objectives, { teacherId: plan.teacher_id, planId: plan.id });
    return 'manual';
  } catch {
    return 'other';
  }
}

// 4c (R37 on the Overview): the state a teacher sees. The storage column
// `status` stays 'draft' for saved plans (P4b): a Manual ILAW plan keeps its
// real state in the objectives envelope (workflowState), and an AI plan is
// saved once stored. Same rule as the Lesson Plans status filter.
export const PLAN_STATE_LABEL = { draft: 'Draft', saved: 'Saved', published: 'Published', archived: 'Archived' };

export function planState(plan) {
  const status = String(plan?.status || 'draft').toLowerCase();
  const type = savedPlanType(plan);
  if (status === 'draft' && type === 'manual') {
    try {
      return parseManualIlawV2(plan.objectives, { teacherId: plan.teacher_id, planId: plan.id }).workflowState === 'saved' ? 'saved' : 'draft';
    } catch {
      return 'draft'; // an older local Manual draft has no saved state
    }
  }
  if (status === 'draft' && type === 'ai') return 'saved';
  return PLAN_STATE_LABEL[status] ? status : 'draft';
}

export const planStateLabel = plan => PLAN_STATE_LABEL[planState(plan)];

export const SAVED_PLAN_TYPE_LABEL = {
  ai: 'Powered by Gemini',
  manual: 'Manual ILAW',
  other: 'Other saved plan',
};
