import { buildDayTaskPrompt, DAY_TASK_SCHEMAS, quizResponseSchema } from './dayTaskPrompts.js';
import { parseDayTask } from './dayTaskParser.js';

const ACTIVITY_LABELS = {
  en: { objective: 'Objective', grouping: 'Grouping', duration: 'Duration', minutes: 'minutes',
    materials: 'Materials', procedure: 'Procedure', successCriteria: 'Success criteria' },
  fil: { objective: 'Layunin', grouping: 'Pagpapangkat', duration: 'Tagal', minutes: 'minuto',
    materials: 'Mga Kagamitan', procedure: 'Pamamaraan', successCriteria: 'Pamantayan sa Tagumpay' },
};

// Built here, not by the AI, so the text can only ever repeat validated fields.
export function renderActivityInstructions(activity) {
  const labels = ACTIVITY_LABELS[activity.language];
  const bullets = items => items.map(item => `- ${item}`);
  return [
    `${labels.objective}: ${activity.objective}`,
    `${labels.grouping}: ${activity.grouping}`,
    `${labels.duration}: ${activity.durationMinutes} ${labels.minutes}`,
    ...(activity.materials.length ? [`${labels.materials}:`, ...bullets(activity.materials)] : []),
    `${labels.procedure}:`,
    ...activity.procedure.map((step, index) => `${index + 1}. ${step.replace(/^\d+[.)]\s*/, '')}`),
    `${labels.successCriteria}:`,
    ...bullets(activity.successCriteria),
  ].join('\n');
}

// Exactly one provider call: no retry, no provider chain, no fallback.
export async function generateDayTask({ plan, source, task, requestJson, signal }) {
  const raw = await requestJson(buildDayTaskPrompt(task, plan, source), {
    responseSchema: task.taskType === 'quiz' ? quizResponseSchema(task.typeCounts) : DAY_TASK_SCHEMAS[task.taskType],
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
