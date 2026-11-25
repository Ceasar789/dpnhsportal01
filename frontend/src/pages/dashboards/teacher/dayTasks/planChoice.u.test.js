// @vitest-environment jsdom
// U-PDF-T (design p15): which plans and days Generate worksheet offers, and the
// read-only quiz totals (points per item = the server's, pinned here).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftPlans, generatablePlans, planDays, QUIZ_ITEM_POINTS, quizTotals } from './planChoice';
import { createBlankIlawDocument } from '../ilaw/ilawTemplateModel';
import { serializeManualIlawV2 } from '../ilaw/manualIlawV2';

const T = 'teacher-1';
const ai = (id, extra = {}) => ({ id, teacher_id: T, ai_generated: true, status: 'draft', title: id, objectives: '<p>x</p>', ...extra });
const doc = title => { const document = createBlankIlawDocument({ subject: 'Science', grade: 'Grade 7' }); document.info.nameOfLesson = title; return document; };
const manual = (id, workflowState) => ({ id, teacher_id: T, ai_generated: false, status: 'draft', title: id,
  objectives: serializeManualIlawV2({ kind: 'eduscribe.manual-ilaw', version: 2, teacherId: T, planId: id, title: id, workflowState,
    document: doc(id),
    assignment: { subjectId: 's', subjectName: 'Science', gradeLevel: 'Grade 7', schoolYear: '2026-2027' },
    sourceDetails: { classDuration: '', teachingStrategy: '', learningObjectives: '' } }) });
const dayTable = days => `<div class="ilaw-I"><div class="ilaw-field"><span class="ilaw-label">Learning Objectives</span><table><tr>${
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => `<th>${d}</th>`).join('')}</tr><tr>${
  ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map(d => `<td>${days[d] || ''}</td>`).join('')}</tr></table></div></div>`;

describe('saved plans only', () => {
  it('lists saved AI and saved Manual plans of this teacher; drafts, archived, others and other teachers are left out', () => {
    const rows = [ai('a1'), ai('a2', { status: 'published' }), ai('a3', { status: 'archived' }), ai('x', { teacher_id: 'other' }),
      manual('m1', 'saved'), manual('m2', 'draft'), { id: 'o', teacher_id: T, ai_generated: false, status: 'draft', objectives: '<p>legacy</p>' }];
    expect(generatablePlans(rows, T).map(row => row.id)).toEqual(['a1', 'a2', 'm1']);
    expect(draftPlans(rows, T).map(row => row.id)).toEqual(['m2']);
  });
});

describe('days the plan really has', () => {
  it('only the weekdays with a topic, each with that topic', () => {
    expect(planDays({ objectives: dayTable({ Monday: 'Add fractions', Wednesday: 'Divide fractions' }) }))
      .toEqual([{ day: 'Monday', topic: 'Add fractions' }, { day: 'Wednesday', topic: 'Divide fractions' }]);
  });
  it('a plan without readable weekday columns offers the five days (as Generate Task did)', () => {
    expect(planDays({ objectives: '{"kind":"x"}' }).map(entry => entry.day)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  });
});

describe('quiz totals', () => {
  it('items and points from the counts', () => {
    expect(quizTotals({ multiple_choice: 5, true_false: 3, identification: 2, enumeration: 0 })).toEqual({ items: 10, points: 10 });
    expect(quizTotals({ multiple_choice: 6, true_false: 2, identification: 0, enumeration: 4 })).toEqual({ items: 12, points: 16 });
    expect(quizTotals({ multiple_choice: NaN })).toEqual({ items: 0, points: 0 });
  });
  it('points per item are exactly the server\'s (backend dayTaskParser POINTS)', () => {
    const file = ['../backend/src/lib/dayTaskParser.js', 'backend/src/lib/dayTaskParser.js'].find(p => existsSync(p));
    const line = readFileSync(join(file), 'utf8').match(/const POINTS = \{([^}]*)\}/)[1];
    const server = Object.fromEntries(line.split(',').map(part => part.split(':').map(v => v.trim())).filter(([k]) => k)
      .map(([k, v]) => [k, Number(v)]));
    for (const [type, points] of Object.entries(QUIZ_ITEM_POINTS)) expect(server[type]).toBe(points);
  });
});
