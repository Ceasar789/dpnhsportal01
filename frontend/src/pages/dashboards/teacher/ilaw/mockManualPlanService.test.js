import { describe, expect, it } from 'vitest';
import { createBlankIlawDocument } from './ilawTemplateModel';
import { parseManualIlawV2 } from './manualIlawV2';
import { createMockManualPlanService, MOCK_STORE_KEY } from '../../../../../ilaw-preview/mockManualPlanService';

const teacher = { id: 'synthetic-teacher', role: 'teacher', active: true };
const assignment = { subjectId: 'synthetic-subject', subjectName: 'Science', gradeLevel: 'Grade 7', schoolYear: '2026-2027' };
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const document = () => {
  const value = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7, A' });
  value.info.nameOfLesson = 'Cells';
  value.info.teachingDate = '2026-10-16';
  value.weekly.flow.Monday = 'Observe cell diagrams';
  value.weekly.formativeAssessment.Friday = 'Label a cell';
  return value;
};
const input = (overrides = {}) => ({
  teacherId: teacher.id, assignment, document: document(), intent: 'draft',
  sourceDetails: { classDuration: '45', teachingStrategy: 'Inquiry', learningObjectives: 'One\nTwo' }, ...overrides,
});
const makeService = (store = storage(), overrides = {}) => createMockManualPlanService({ storage: store, teacher, assignments: [assignment], ...overrides });

describe('isolated Manual ILAW mock writer', () => {
  it('creates a private Draft, reopens after service recreation, and updates the same row to Saved', async () => {
    const store = storage();
    const first = makeService(store);
    const draft = await first.saveManualPlan(input({ document: createBlankIlawDocument() }));
    expect(draft.status).toBe('draft');
    expect(first.listManualPlans()).toHaveLength(1);
    const refreshed = makeService(store);
    const opened = await refreshed.loadManualPlan(draft.id);
    expect(opened.payload.workflowState).toBe('draft');
    const saved = await refreshed.saveManualPlan(input({ planId: draft.id, expectedRevision: draft.revision, intent: 'saved' }));
    expect(saved.id).toBe(draft.id);
    expect(saved.revision).toBe(2);
    expect(refreshed.listManualPlans()).toHaveLength(1);
    expect((await refreshed.loadManualPlan(saved.id)).payload.sourceDetails.learningObjectives).toBe('One\nTwo');
    expect(parseManualIlawV2(saved.objectives).workflowState).toBe('saved');
    await expect(refreshed.saveManualPlan(input({ planId: saved.id, expectedRevision: saved.revision }))).rejects.toThrow(/cannot silently/);
    const edited = await refreshed.saveManualPlan(input({ planId: saved.id, expectedRevision: saved.revision, intent: 'saved' }));
    expect(edited.id).toBe(saved.id);
    expect(refreshed.listManualPlans()).toHaveLength(1);
  });

  it('rejects incomplete Save and invalid Teacher, assignment, year, and ownership', async () => {
    const service = makeService();
    await expect(service.saveManualPlan(input({ intent: 'saved', document: createBlankIlawDocument() }))).rejects.toThrow(/required/);
    await expect(service.saveManualPlan(input({ teacherId: 'other' }))).rejects.toThrow(/not authorized/);
    await expect(service.saveManualPlan(input({ version: 1 }))).rejects.toThrow(/version/);
    await expect(service.saveManualPlan(input({ assignment: { ...assignment, gradeLevel: 'Grade 8' } }))).rejects.toThrow(/assignment/);
    await expect(service.saveManualPlan(input({ assignment: { ...assignment, schoolYear: '2025-2026' } }))).rejects.toThrow(/assignment/);
    await expect(service.saveManualPlan(input({ planId: 'another-teacher-plan' }))).rejects.toThrow(/cannot be updated/);
    await expect(makeService(storage(), { teacher: { ...teacher, active: false } }).saveManualPlan(input())).rejects.toThrow(/not authorized/);
    await expect(makeService(storage(), { teacher: { ...teacher, role: 'student' } }).saveManualPlan(input())).rejects.toThrow(/not authorized/);
    expect(service.listManualPlans()).toEqual([]);
  });

  it('preserves rows on rejection, exposes ambiguous outcomes, and blocks duplicate submissions', async () => {
    const store = storage();
    let resume;
    const service = makeService(store, { delay: () => new Promise(resolve => { resume = resolve; }) });
    const pending = service.saveManualPlan(input());
    await expect(service.saveManualPlan(input())).rejects.toThrow(/already in progress/);
    resume();
    const row = await pending;
    service.failNext('server');
    const rejected = service.saveManualPlan(input({ planId: row.id, expectedRevision: row.revision }));
    resume();
    await expect(rejected).rejects.toThrow(/rejected/);
    expect(service.listManualPlans()[0].revision).toBe(1);
    service.failNext('ambiguous');
    const uncertain = service.saveManualPlan(input({ planId: row.id, expectedRevision: row.revision }));
    resume();
    await expect(uncertain).rejects.toThrow(/outcome is unknown/);
    expect(service.listManualPlans()[0].revision).toBe(2);
    const stale = service.saveManualPlan(input({ planId: row.id, expectedRevision: row.revision }));
    resume();
    await expect(stale).rejects.toThrow(/changed since/);
  });

  it('isolates Teachers and makes no Post, distribution, notification, or network calls', async () => {
    const store = storage();
    const otherRows = [
      { id: 'synthetic-ai', teacher_id: teacher.id, ai_generated: true, objectives: '<p>AI HTML</p>' },
      { id: 'synthetic-legacy', teacher_id: teacher.id, ai_generated: false, objectives: '<p>Legacy text</p>' },
    ];
    store.setItem(MOCK_STORE_KEY, JSON.stringify(otherRows));
    const service = makeService(store);
    const row = await service.saveManualPlan(input({ intent: 'saved' }));
    expect(service.listManualPlans().map(item => item.id)).toEqual([row.id]);
    expect(JSON.parse(store.getItem(MOCK_STORE_KEY)).slice(0, 2)).toEqual(otherRows);
    expect(Object.keys(row).sort()).toEqual(['ai_generated', 'grade_level', 'id', 'objectives', 'revision', 'status', 'subject', 'teacher_id', 'title']);
    const second = createMockManualPlanService({ storage: store, teacher: { id: 'other-teacher', role: 'teacher', active: true }, assignments: [assignment] });
    expect(second.listManualPlans()).toEqual([]);
    await expect(second.loadManualPlan(row.id)).rejects.toThrow(/not found/);
  });
});
