import { describe, expect, it } from 'vitest';
import { createMockManualPlanService, MOCK_STORE_KEY } from '../../../../../ilaw-preview/mockManualPlanService';
import { createBlankIlawDocument } from './ilawTemplateModel';
import { parseManualIlawV2 } from './manualIlawV2';

// Synthetic fixtures only. This suite exercises the MPS1-B mock contract; the
// pending cases require a disposable database and do not prove deployed RLS.
const teacher = { id: 'd0-teacher-a', role: 'teacher', active: true };
const assignment = {
  subjectId: 'd0-subject-a', subjectName: 'Science', gradeLevel: 'Grade 7', schoolYear: '2026-2027',
};
const createStorage = () => {
  const entries = new Map();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
};
const createInput = (overrides = {}) => {
  const document = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7' });
  document.info.nameOfLesson = 'Synthetic cells lesson';
  document.info.teachingDate = '2026-10-16';
  document.weekly.flow.Monday = 'Observe cell diagrams';
  document.weekly.formativeAssessment.Friday = 'Label a cell';
  return {
    teacherId: teacher.id, assignment, document, intent: 'draft',
    sourceDetails: {
      classDuration: '45', teachingStrategy: 'Inquiry', learningObjectives: 'Describe a cell',
    },
    ...overrides,
  };
};
const createService = (overrides = {}) => createMockManualPlanService({
  storage: createStorage(), teacher, assignments: [assignment], ...overrides,
});

describe('MPS1-D0 synthetic Manual ILAW write contract', () => {
  it('keeps Draft and Saved private, preserves Version 2 content, and updates the same ID', async () => {
    const service = createService();
    const draft = await service.saveManualPlan(createInput({ document: createBlankIlawDocument() }));
    const saved = await service.saveManualPlan(createInput({
      planId: draft.id, expectedRevision: draft.revision, intent: 'saved',
    }));
    const reopened = await service.loadManualPlan(saved.id);
    expect(saved.id).toBe(draft.id);
    expect(saved.status).toBe('draft'); // Database status remains private for both intents.
    expect(saved.ai_generated).toBe(false);
    expect(reopened.payload.workflowState).toBe('saved');
    expect(reopened.payload.sourceDetails).toEqual(createInput().sourceDetails);
    expect(service.listManualPlans()).toHaveLength(1);
    expect(Object.keys(saved)).not.toContain('published_at');
  });

  it.each([
    ['wrong Teacher', { teacherId: 'd0-teacher-b' }],
    ['wrong subject', { assignment: { ...assignment, subjectId: 'd0-subject-b' } }],
    ['wrong grade', { assignment: { ...assignment, gradeLevel: 'Grade 8' } }],
    ['wrong year', { assignment: { ...assignment, schoolYear: '2025-2026' } }],
    ['forged subject name', { assignment: { ...assignment, subjectName: 'Invented subject' } }],
    ['unsupported document version', { version: 3 }],
  ])('rejects %s without creating a row', async (_case, overrides) => {
    const service = createService();
    await expect(service.saveManualPlan(createInput(overrides))).rejects.toThrow();
    expect(service.listManualPlans()).toEqual([]);
  });

  it('denies inactive and adviser-only Teachers in the synthetic writer', async () => {
    await expect(createService({ teacher: { ...teacher, active: false } })
      .saveManualPlan(createInput())).rejects.toThrow(/not authorized/);
    const adviserOnly = createService({ assignments: [] });
    await expect(adviserOnly.saveManualPlan(createInput())).rejects.toThrow(/assignment/);
    expect(adviserOnly.listManualPlans()).toEqual([]);
  });

  it('leaves synthetic AI and legacy rows untouched', async () => {
    const storage = createStorage();
    const existing = [
      { id: 'd0-ai', teacher_id: teacher.id, ai_generated: true, objectives: '<p>AI plan</p>' },
      { id: 'd0-legacy', teacher_id: teacher.id, ai_generated: false, objectives: '<p>Legacy plan</p>' },
    ];
    storage.setItem(MOCK_STORE_KEY, JSON.stringify(existing));
    const service = createService({ storage });
    await service.saveManualPlan(createInput());
    expect(JSON.parse(storage.getItem(MOCK_STORE_KEY)).slice(0, 2)).toEqual(existing);
    const manual = service.listManualPlans()[0];
    expect(parseManualIlawV2(manual.objectives).kind).toBe('eduscribe.manual-ilaw');
  });
});

describe('MPS1-D0 disposable database contract — pending deployment design', () => {
  it.todo('deployed grants and effective RLS deny direct authenticated lesson_plans INSERT and UPDATE bypass');
  it.todo('authenticated database role invokes restricted SECURITY DEFINER Manual RPC with server-derived identity, assignment, and Manila year');
  it.todo('database Manual RPC rejects forged payloads and enforces private transitions under actual role privileges');
  it.todo('database AI/HTML RPC preserves AI Save, update, and legacy reopen without a client flag bypass');
  it.todo('database transactions serialize same-ID updates and durably reconcile duplicate or ambiguous requests');
  it.todo('database Manual Draft and Save make no Post, distribution, or notification writes');
});
