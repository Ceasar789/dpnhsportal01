import { supabase } from '../../../../config/supabase';

export const aiLessonPlanSaveFlagEnabled = () => (import.meta.env.DEV
  && import.meta.env.VITE_AI_LESSON_PLAN_SAVE_ENABLED === '1'
  && typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname))
  || (import.meta.env.PROD && import.meta.env.VITE_AI_LESSON_PLAN_SAVE_PRODUCTION_ENABLED === '1');

const UNCERTAIN_SAVE_MESSAGE = 'Could not confirm whether the lesson plan was saved. Your draft remains open. Check your saved plans before trying again.';
const AVAILABILITY_CHECK_MESSAGE = 'Could not check Save Plan availability. Your draft remains open.';

async function request(apiBase, method, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Your session has expired. Sign in again before saving.');
  const response = await fetch(`${apiBase}/api/lesson-plans/ai-save`, {
    method, headers: { Authorization: `Bearer ${session.access_token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).catch(() => { throw new Error(method === 'POST' ? UNCERTAIN_SAVE_MESSAGE : AVAILABILITY_CHECK_MESSAGE); });
  const result = await response.json().catch(() => null);
  if (!result) throw new Error(method === 'POST' ? UNCERTAIN_SAVE_MESSAGE
    : 'Permanent Save is unavailable. Your draft remains open.');
  if (!response.ok) throw new Error(result.error || 'Permanent Save is unavailable. Your draft remains open.');
  return result;
}

export const loadAiSaveAvailability = apiBase => request(apiBase, 'GET');
export const saveAiLessonPlan = (apiBase, command) => request(apiBase, 'POST', command);
