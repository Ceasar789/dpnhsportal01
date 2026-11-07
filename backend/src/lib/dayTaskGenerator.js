import { buildDayTaskPrompt, DAY_TASK_SCHEMAS } from './dayTaskPrompts.js';
import { parseDayTask } from './dayTaskParser.js';

// Built here, not by the AI, so the text can only ever repeat validated fields.
export function renderActivityInstructions(activity) {
  const bullets = items => items.map(item => `- ${item}`);
  return [
    `Objective: ${activity.objective}`,
    `Grouping: ${activity.grouping}`,
    `Duration: ${activity.durationMinutes} minutes`,
    ...(activity.materials.length ? ['Materials:', ...bullets(activity.materials)] : []),
    'Procedure:',
    ...activity.procedure.map((step, index) => `${index + 1}. ${step.replace(/^\d+[.)]\s*/, '')}`),
    'Success criteria:',
    ...bullets(activity.successCriteria),
  ].join('\n');
}

// Exactly one provider call: no retry, no provider chain, no fallback.
export async function generateDayTask({ plan, source, task, requestJson, signal }) {
  const raw = await requestJson(buildDayTaskPrompt(task, plan, source), {
    responseSchema: DAY_TASK_SCHEMAS[task.taskType],
    maxOutputTokens: task.taskType === 'quiz' ? 16384 : 8192,
    signal,
  });
  const parsed = parseDayTask(raw, task);
  const { activity } = parsed;
  return {
    status: 'generated-day-task', saved: false, taskType: task.taskType, day: task.day,
    sourceLessonPlan: { id: plan.id, title: plan.title },
    title: activity ? activity.title : parsed.title,
    instructions: activity ? renderActivityInstructions(activity) : parsed.directions,
    questions: activity ? [] : parsed.questions,
    answerKey: activity ? [] : parsed.answerKey,
    activity: activity || null,
    providerCalls: 1,
  };
}
