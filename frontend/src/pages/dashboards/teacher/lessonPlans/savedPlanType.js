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

export const SAVED_PLAN_TYPE_LABEL = {
  ai: 'AI-Generated',
  manual: 'Manual ILAW',
  other: 'Other saved plan',
};
