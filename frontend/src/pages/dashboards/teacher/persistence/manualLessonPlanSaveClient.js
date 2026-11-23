import { supabase } from '../../../../config/supabase';
import { createEditorPersistence } from './editorPersistence';

// P4b: OFF unless set. Production also needs the backend flag and the migration.
export const manualLessonPlanSaveFlagEnabled = () => (import.meta.env.DEV
  && import.meta.env.VITE_MANUAL_LESSON_PLAN_SAVE_ENABLED === '1'
  && typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname))
  || (import.meta.env.PROD && import.meta.env.VITE_MANUAL_LESSON_PLAN_SAVE_PRODUCTION_ENABLED === '1');

// Resolves with the route's { ok, code } result. A network failure or an
// unreadable reply throws, which createEditorPersistence reports as
// outcome_unknown so the same request id is retried.
export function createManualLessonPlanInvoke(apiBase) {
  return async (operation, command) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, code: 'not_authenticated', durable: false };
    const response = await fetch(`${apiBase}/api/lesson-plans/manual/${encodeURIComponent(operation)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (response.status === 404) return { ok: false, code: 'integration_blocked', durable: false };
    const result = await response.json();
    if (result?.ok !== true && result?.ok !== false) throw new Error('unreadable save reply');
    return result;
  };
}

export const createManualLessonPlanPersistence = apiBase => createEditorPersistence(createManualLessonPlanInvoke(apiBase));

// Every sentence is written here; server text is never shown.
export const MANUAL_SAVE_MESSAGES = Object.freeze({
  assignment_denied: 'Choose a subject and grade from your teaching load for this school year.',
  revision_conflict: 'This plan was changed somewhere else. Reopen it before saving again.',
  idempotency_conflict: 'This plan was changed somewhere else. Reopen it before saving again.',
  invalid_transition: 'This plan was changed somewhere else. Reopen it before saving again.',
  historical_write_blocked: "Plans from a past school year can't be changed.",
  outcome_unknown: "We couldn't confirm the save. Your work is still open. Try again.",
  integration_blocked: "Saving isn't available right now. Your work is still open.",
  incomplete_lesson_plan: 'Complete the required information before saving this lesson plan.',
  invalid_document: 'Check the Learning Area and Grade/Section, then try again.',
  not_authenticated: 'Your session has ended. Sign in again, then save. Your work is still open.',
  inactive_teacher: "This account can't save lesson plans.",
  not_found: "This plan isn't available any more. Your work is still open.",
});
