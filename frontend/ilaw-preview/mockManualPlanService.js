import { normalizeManualIlawV2, parseManualIlawV2, validateManualIlawSave } from '../src/pages/dashboards/teacher/ilaw/manualIlawV2';

export const MOCK_STORE_KEY = 'eduscribe-mps1b-synthetic-plans-v1';
const readRows = storage => {
  try {
    const rows = JSON.parse(storage.getItem(MOCK_STORE_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
};

// Used by isolated ILAW previews and the development-only Teacher QA adapter.
// The injected identity and assignment catalog simulate a trusted writer;
// they are not authorization.
export function createMockManualPlanService({ storage, teacher, assignments, delay = () => Promise.resolve() }) {
  let pending = false;
  let nextFailure = null;
  const listManualPlans = () => readRows(storage).filter(row => {
    if (row.teacher_id !== teacher.id || row.ai_generated !== false) return false;
    try { parseManualIlawV2(row.objectives, { teacherId: teacher.id, planId: row.id }); return true; }
    catch { return false; }
  });
  const failNext = kind => { nextFailure = kind; };

  async function saveManualPlan({ teacherId, planId, assignment, document, sourceDetails, intent, expectedRevision, version = 2 }) {
    if (pending) throw new Error('A mock save is already in progress.');
    pending = true;
    try {
      await delay();
      if (nextFailure === 'server') { nextFailure = null; throw new Error('Mock writer rejected the save.'); }
      if (!teacher.active || teacher.role !== 'teacher' || teacherId !== teacher.id) {
        throw new Error('This Teacher is not authorized for this mock save.');
      }
      if (version !== 2) throw new Error('Unsupported Manual ILAW payload version.');
      if (intent !== 'draft' && intent !== 'saved') throw new Error('Invalid Manual ILAW transition.');
      const official = assignments.find(item => item.subjectId === assignment?.subjectId &&
        item.gradeLevel === assignment?.gradeLevel && item.schoolYear === assignment?.schoolYear);
      if (!official || official.subjectName !== assignment.subjectName) {
        throw new Error('No matching official synthetic teaching assignment.');
      }
      const rows = readRows(storage);
      const previous = planId ? rows.find(row => row.id === planId) : null;
      if (planId && (!previous || previous.teacher_id !== teacher.id || previous.ai_generated !== false)) {
        throw new Error('This mock plan cannot be updated by this Teacher.');
      }
      if (previous && previous.revision !== expectedRevision) throw new Error('This mock plan changed since it was opened.');
      if (previous && parseManualIlawV2(previous.objectives).workflowState === 'saved' && intent === 'draft') {
        throw new Error('A Saved plan cannot silently become a Draft.');
      }
      const id = previous?.id || `synthetic-manual-${rows.length + 1}`;
      const payload = normalizeManualIlawV2({
        kind: 'eduscribe.manual-ilaw', version: 2, teacherId: teacher.id, planId: id,
        title: document?.info?.nameOfLesson ?? '', assignment: official,
        workflowState: intent, document, sourceDetails,
      });
      if (intent === 'saved' && Object.keys(validateManualIlawSave(payload)).length) {
        throw new Error('Complete the required lesson information before Save.');
      }
      const row = {
        id, teacher_id: teacher.id, title: payload.title, subject: official.subjectName,
        grade_level: official.gradeLevel, status: 'draft', ai_generated: false,
        objectives: JSON.stringify(payload), revision: (previous?.revision || 0) + 1,
      };
      const nextRows = previous ? rows.map(item => item.id === id ? row : item) : [...rows, row];
      storage.setItem(MOCK_STORE_KEY, JSON.stringify(nextRows));
      if (nextFailure === 'ambiguous') {
        nextFailure = null;
        throw new Error('Mock response lost after write; outcome is unknown. Reload the list before retrying.');
      }
      return { ...row };
    } finally { pending = false; }
  }

  async function loadManualPlan(id) {
    await delay();
    const row = listManualPlans().find(item => item.id === id);
    if (!row) throw new Error('Mock Manual ILAW plan was not found for this Teacher.');
    return { row: { ...row }, payload: parseManualIlawV2(row.objectives, { teacherId: teacher.id, planId: row.id }) };
  }

  return { saveManualPlan, loadManualPlan, listManualPlans, failNext };
}
