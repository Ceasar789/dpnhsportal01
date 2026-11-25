// U-PDF-T (design p15): which lesson plans and days Generate worksheet offers.
import { extractWeeklyWorksheetSource, WEEKDAYS } from '../lessonPlans/weeklyWorksheetSource';
import { planState, savedPlanType } from '../lessonPlans/savedPlanType';
import { QUIZ_ITEM_TYPES } from './dayTaskOptions';

// Saved (or published) AI and Manual ILAW plans of this teacher. Drafts are not
// listed: the same rule the Lesson Plans status filter uses (planState).
export const generatablePlans = (plans, teacherId) => (plans || []).filter(plan =>
  plan && plan.teacher_id === teacherId && ['ai', 'manual'].includes(savedPlanType(plan))
  && ['saved', 'published'].includes(planState(plan)));

export const draftPlans = (plans, teacherId) => (plans || []).filter(plan =>
  plan && plan.teacher_id === teacherId && ['ai', 'manual'].includes(savedPlanType(plan)) && planState(plan) === 'draft');

// The Monday-to-Friday days the plan really has, each with its topic (the day's
// objective). A plan whose weekday columns cannot be read (every Manual ILAW,
// for one) offers all five days without a topic, exactly as Generate Task did.
export function planDays(plan) {
  let source = null;
  try { source = extractWeeklyWorksheetSource(plan?.objectives); } catch { /* No readable weekday table. */ }
  const days = WEEKDAYS.map(day => ({ day, topic: source?.days?.find(entry => entry?.day === day)?.objective || '' }));
  const withTopic = days.filter(entry => entry.topic);
  return withTopic.length ? withTopic : days;
}

// The points the server gives each generated quiz item (backend
// src/lib/dayTaskParser.js POINTS; pinned by a test). Shown read-only.
export const QUIZ_ITEM_POINTS = { multiple_choice: 1, true_false: 1, identification: 1, enumeration: 2 };

export const quizTotals = counts => QUIZ_ITEM_TYPES.reduce((total, type) => {
  const count = Number.isInteger(counts?.[type]) ? counts[type] : 0;
  return { items: total.items + count, points: total.points + count * QUIZ_ITEM_POINTS[type] };
}, { items: 0, points: 0 });
