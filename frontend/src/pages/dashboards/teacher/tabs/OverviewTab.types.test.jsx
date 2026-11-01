// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createBlankIlawDocument } from '../ilaw/ilawTemplateModel';
import { serializeManualIlawDraft } from '../ilaw/fullManualIlawModel';
import { serializeManualIlawV2 } from '../ilaw/manualIlawV2';
import OverviewTab from './OverviewTab';

const fixture = vi.hoisted(() => ({ plans: [], typeReadFails: false, reads: [] }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => ({ userData: { uid: 'teacher-1' } }) }));
vi.mock('../../../../config/supabase', () => ({ supabase: {
  from(table) {
    fixture.reads.push(table);
    if (!['school_settings', 'lesson_plans', 'worksheets', 'schedules'].includes(table)) {
      throw new Error(`Unexpected ${table} read`);
    }
    const filters = { aiOnly: false, nonAi: false, offset: 0, limit: Infinity };
    const query = {
      select: () => query,
      eq(key, value) { if (key === 'ai_generated' && value === true) filters.aiOnly = true; return query; },
      or() { filters.nonAi = true; return query; },
      order: () => query,
      limit(value) { filters.limit = value; return query; },
      range(start, end) { filters.offset = start; filters.limit = end - start + 1; return query; },
      single: () => Promise.resolve({ data: { school_year: '2026-2027' }, error: null }),
      then(resolve, reject) {
        let rows = fixture.plans;
        if (filters.aiOnly) rows = rows.filter(row => row.ai_generated === true);
        if (filters.nonAi) rows = rows.filter(row => row.ai_generated !== true);
        const data = table === 'lesson_plans' ? rows.slice(filters.offset, filters.offset + filters.limit)
          : table === 'schedules' ? [] : null;
        return Promise.resolve({ data, count: table === 'lesson_plans' ? rows.length : 0,
          error: filters.nonAi && fixture.typeReadFails ? { message: 'Synthetic read failure' } : null }).then(resolve, reject);
      },
    };
    return query;
  },
} }));
vi.mock('../../../../lib/supabaseRetry', () => ({ withRetry: query => query() }));

const base = { teacher_id: 'teacher-1', created_at: '2026-10-12T00:00:00.000Z', status: 'draft' };
const row = (id, overrides = {}) => ({ ...base, id, title: id, ai_generated: false, ...overrides });

beforeEach(() => { fixture.plans = []; fixture.typeReadFails = false; fixture.reads.length = 0; });
afterEach(cleanup);

describe('Teacher Overview saved-plan counts', () => {
  it('separates AI, valid Manual V1/V2, legacy, and damaged records without overlap', async () => {
    const v1 = serializeManualIlawDraft({
      teacherId: 'teacher-1', planId: 'manual-v1',
      assignment: { subjectId: 'math', subjectName: 'Mathematics', gradeLevel: 'Grade 8' },
      document: createBlankIlawDocument(),
    });
    const document = createBlankIlawDocument();
    document.info.nameOfLesson = 'Manual V2';
    const v2 = serializeManualIlawV2({
      kind: 'eduscribe.manual-ilaw', version: 2, teacherId: 'teacher-1', planId: 'manual-v2',
      title: 'Manual V2', workflowState: 'draft', document,
      assignment: { subjectId: 'science', subjectName: 'Science', gradeLevel: 'Grade 7', schoolYear: '2026-2027' },
      sourceDetails: { classDuration: '45', teachingStrategy: 'Inquiry', learningObjectives: 'One' },
    });
    fixture.plans = [
      row('ai', { ai_generated: true, objectives: '<p>AI output</p>' }),
      row('manual-v1', { objectives: v1 }), row('manual-v2', { objectives: v2 }),
      row('legacy', { objectives: '<p>Old plan</p>' }),
      row('damaged', { objectives: '{"kind":"eduscribe.manual-ilaw"}' }),
      row('missing', { objectives: null, ai_generated: null }),
    ];
    render(<OverviewTab />);
    expect(await screen.findByText('1 AI · 2 Manual ILAW · 3 other')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Total Lesson Plans/ }).textContent).toContain('6');
    expect(screen.getByRole('button', { name: /AI-Generated Plans/ }).textContent).toContain('2 Manual ILAW · 3 other saved');
    expect(fixture.reads.every(table => ['school_settings', 'lesson_plans', 'worksheets', 'schedules'].includes(table))).toBe(true);
  });

  it.each([
    ['empty', [], '0 AI · 0 Manual ILAW · 0 other'],
    ['AI only', [row('ai', { ai_generated: true, objectives: '<p>AI</p>' })], '1 AI · 0 Manual ILAW · 0 other'],
  ])('handles %s saved-plan results', async (_, plans, expected) => {
    fixture.plans = plans;
    render(<OverviewTab />);
    expect(await screen.findByText(expected)).toBeTruthy();
  });

  it('shows an error instead of guessed counts when type classification cannot be read', async () => {
    fixture.plans = [row('legacy', { objectives: '<p>Old plan</p>' })];
    fixture.typeReadFails = true;
    render(<OverviewTab />);
    expect((await screen.findByRole('alert')).textContent).toContain('Dashboard data could not be loaded');
    expect(screen.queryByText('0 AI · 0 Manual ILAW · 1 other')).toBeNull();
  });
});
