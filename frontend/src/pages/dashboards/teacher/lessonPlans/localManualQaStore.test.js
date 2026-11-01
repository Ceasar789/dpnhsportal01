import { describe, expect, it } from 'vitest';
import { createTemporaryManualIlawDraft } from '../ilaw/fullManualIlawModel';
import { createLocalManualQaStore } from './localManualQaStore';

const teacherId = 'synthetic-mux2-teacher';
const blank = () => createTemporaryManualIlawDraft(teacherId, { name: 'Synthetic Teacher' });

describe('local Manual ILAW QA store', () => {
  it('keeps an incomplete Draft private, reopens every field, and updates the same ID', async () => {
    const store = createLocalManualQaStore();
    const draft = blank();
    draft.document.weekly.flow.Monday = 'Unfinished Monday activity';
    const first = await store.save({ teacherId, draft, intent: 'draft' });
    expect(first.status).toBe('draft');
    expect(store.read(teacherId, first).workflowState).toBe('draft');
    expect(store.list(teacherId)).toHaveLength(1);
    const opened = await store.open(teacherId, first.id);
    expect(opened.payload.document.weekly.flow.Monday).toBe('Unfinished Monday activity');
    draft.document.weekly.flow.Tuesday = 'Unfinished Tuesday activity';
    const second = await store.save({ teacherId, planId: first.id, revision: first.revision, draft, intent: 'draft' });
    expect(second.id).toBe(first.id);
    expect(store.list(teacherId)).toHaveLength(1);
    expect(store.read(teacherId, second).document.weekly.flow.Tuesday).toBe('Unfinished Tuesday activity');
    expect(store.list('another-teacher')).toEqual([]);
  });

  it('requires complete Saved content and preserves ID through Draft to Saved', async () => {
    const store = createLocalManualQaStore();
    const draft = blank();
    const first = await store.save({ teacherId, draft, intent: 'draft' });
    await expect(store.save({ teacherId, planId: first.id, revision: first.revision, draft, intent: 'saved' }))
      .rejects.toThrow(/required lesson information/);
    draft.document.info.nameOfLesson = 'Cells';
    draft.document.info.teachingDate = '2026-10-18';
    draft.document.info.learningArea = 'Science';
    draft.document.info.gradeSection = 'Grade 7';
    draft.document.weekly.learningObjectives.Monday = 'Identify plant cells';
    draft.document.weekly.flow.Tuesday = 'Observe cell diagrams';
    draft.document.weekly.formativeAssessment.Friday = 'Label a cell';
    const saved = await store.save({ teacherId, planId: first.id, revision: first.revision, draft, intent: 'saved' });
    expect(saved.id).toBe(first.id);
    expect(saved.status).toBe('draft');
    expect(store.read(teacherId, saved).workflowState).toBe('saved');
    expect(store.list(teacherId)).toHaveLength(1);
  });

  it('reports a rejected mock write without creating a false saved row', async () => {
    const store = createLocalManualQaStore();
    const draft = blank();
    draft.document.info.nameOfLesson = 'Keep these edits';
    store.failNext('server');
    await expect(store.save({ teacherId, draft, intent: 'draft' })).rejects.toThrow(/Mock writer rejected/);
    expect(store.list(teacherId)).toEqual([]);
    expect(draft.document.info.nameOfLesson).toBe('Keep these edits');
  });
});
