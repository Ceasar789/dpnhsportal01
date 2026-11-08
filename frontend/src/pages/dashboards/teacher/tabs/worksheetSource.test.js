import { describe, expect, it } from 'vitest';
import { worksheetSource } from './worksheetSource';

describe('worksheetSource', () => {
  it.each([
    ['origin ai_generated', { origin: 'ai_generated' }, 'AI-generated'],
    ['a weekly collection day', { origin: 'ai_generated', source_lesson_plan_id: 'p1', collection_id: 'c1', day_of_week: 1 }, 'AI-generated'],
    ['a day task (manual origin, lesson plan, no collection)', { origin: 'manual', source_lesson_plan_id: 'p1', collection_id: null }, 'AI-generated'],
    ['a Create Worksheet row', { origin: 'manual', source_lesson_plan_id: null, collection_id: null, task_type: 'quiz' }, 'Manual'],
    ['a plain manual row with no source fields', { origin: 'manual' }, 'Manual'],
    ['a manual row in a collection', { origin: 'manual', source_lesson_plan_id: 'p1', collection_id: 'c1' }, 'Manual'],
    ['an old row with every source field missing', { id: 'x', title: 'Old upload' }, 'Manual'],
    ['every source field null', { origin: null, source_lesson_plan_id: null, collection_id: null }, 'Manual'],
    ['an empty lesson plan id', { origin: 'manual', source_lesson_plan_id: '' }, 'Manual'],
  ])('%s', (_name, row, expected) => {
    expect(worksheetSource(row)).toBe(expected);
  });

  it('never crashes on a missing row', () => {
    expect(worksheetSource(null)).toBe('Manual');
    expect(worksheetSource(undefined)).toBe('Manual');
  });
});
