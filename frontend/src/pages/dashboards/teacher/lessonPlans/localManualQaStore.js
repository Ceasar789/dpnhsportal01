import { createMockManualPlanService } from '../../../../../ilaw-preview/mockManualPlanService';
import { parseManualIlawV2 } from '../ilaw/manualIlawV2';

// In-memory only. This wraps the MPS1-B synthetic writer; it is neither a
// Supabase adapter nor an authorization check. Never use browser persistence.
export function createLocalManualQaStore() {
  const values = new Map();
  let nextFailure = null;
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const teacher = teacherId => ({ id: teacherId, role: 'teacher', active: true });
  const service = (teacherId, assignment) => createMockManualPlanService({
    storage, teacher: teacher(teacherId), assignments: assignment ? [assignment] : [],
  });
  const mockAssignment = document => ({
    subjectId: 'synthetic-local-qa',
    subjectName: document.info.learningArea.trim() || 'Unspecified synthetic subject',
    gradeLevel: document.info.gradeSection.trim() || 'Unspecified synthetic grade',
    schoolYear: 'synthetic-local-qa',
  });
  return {
    list: teacherId => service(teacherId).listManualPlans(),
    open: (teacherId, planId) => service(teacherId).loadManualPlan(planId),
    failNext: kind => { nextFailure = kind; },
    save: ({ teacherId, planId, revision, draft, intent }) => {
      if (!import.meta.env.DEV) throw new Error('Local Manual ILAW QA is unavailable outside development.');
      const assignment = mockAssignment(draft.document);
      const writer = service(teacherId, assignment);
      if (nextFailure) { writer.failNext(nextFailure); nextFailure = null; }
      return writer.saveManualPlan({
        teacherId, planId, assignment, document: draft.document,
        sourceDetails: draft.sourceDetails, intent, expectedRevision: revision,
      });
    },
    read: (teacherId, row) => parseManualIlawV2(row.objectives, { teacherId, planId: row.id }),
  };
}

let sessionStore;
export function getLocalManualQaStore() {
  sessionStore ??= createLocalManualQaStore();
  return sessionStore;
}
