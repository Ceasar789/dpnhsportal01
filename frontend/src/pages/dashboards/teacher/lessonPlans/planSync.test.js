// R43 (4i): out of sync = the plan was edited after the worksheet was made.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outOfSyncByPlan } from './planSync';

const plans = [{ id: 'p1', updated_at: '2026-11-20T10:00:00' }, { id: 'p2', updated_at: '2026-11-18T09:00:00' }, { id: 'p3' }];

describe('outOfSyncByPlan', () => {
  it('counts worksheets made before the plan was last edited', () => {
    const sheets = [
      { id: 'a', source_lesson_plan_id: 'p1', created_at: '2026-11-19T08:00:00' },
      { id: 'b', source_lesson_plan_id: 'p1', created_at: '2026-11-17T08:00:00' },
      { id: 'c', source_lesson_plan_id: 'p2', created_at: '2026-11-18T12:00:00' },
    ];
    expect([...outOfSyncByPlan(plans, sheets)]).toEqual([['p1', 2]]);
  });
  it('a worksheet made right after the save (within a minute) is in sync', () => {
    expect(outOfSyncByPlan(plans, [{ source_lesson_plan_id: 'p1', created_at: '2026-11-20T09:59:30' }]).size).toBe(0);
  });
  it('unknown plans, missing dates and odd rows never raise an alarm', () => {
    expect(outOfSyncByPlan(plans, [{ source_lesson_plan_id: 'p3', created_at: '2020-01-01T00:00:00' },
      { source_lesson_plan_id: 'zz', created_at: '2020-01-01T00:00:00' }, { id: 'x' }, null]).size).toBe(0);
    expect(outOfSyncByPlan(plans, undefined).size).toBe(0);
  });
});

describe('Sync makes a new draft and never edits a worksheet', () => {
  it('the Sync button only opens Generate Task for the plan', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const tab = readFileSync(resolve(here, '../tabs/LessonPlansTab.jsx'), 'utf8');
    const block = tab.slice(tab.indexOf('R43 (4i): out of sync'), tab.indexOf('R43 (4i): end'));
    expect(block).toContain('onClick={() => setDayTaskPlan(plan)}');
    expect(block).not.toMatch(/\.update\(|\.delete\(|\.upsert\(/);
  });
});
