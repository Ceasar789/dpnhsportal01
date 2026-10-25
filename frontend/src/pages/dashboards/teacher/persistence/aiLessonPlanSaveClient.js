import { supabase } from '../../../../config/supabase';

export const aiLessonPlanSaveFlagEnabled = () => import.meta.env.DEV
  && import.meta.env.VITE_AI_LESSON_PLAN_SAVE_ENABLED === '1'
  && typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

async function request(apiBase, method, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Your session has expired. Sign in again before saving.');
  const response = await fetch(`${apiBase}/api/lesson-plans/ai-save`, {
    method, headers: { Authorization: `Bearer ${session.access_token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || 'Permanent Save is unavailable. Your draft remains open.');
  return result;
}

export const loadAiSaveAvailability = apiBase => request(apiBase, 'GET');
export const saveAiLessonPlan = (apiBase, command) => request(apiBase, 'POST', command);
