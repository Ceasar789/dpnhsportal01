// U-PDF-T-FIX-B: Learning Materials shared by CLASS, the client side of the
// class-materials SQL contract (no database): the share function's name and
// arguments (NULL = everyone, else the ticked ids), its six CM_ codes as
// friendly sentences (never the raw text), the owner-readable join table read,
// the new-material fields, and the real classes read as postToClass.js reads them.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../config/supabase', () => ({ supabase: {} }));

import {
  SHARE_MESSAGES, listMaterialClasses, loadClassList, loadTeacherSections, shareError, shareMaterialToClass,
} from './materialsApi';
import * as postToClass from '../../../../pages/dashboards/teacher/lessonPlans/postToClass';
import {
  PRIVATE_SECTION, classCell, classLabel, classesByGrade, createFields, emptyDraft, filterByClass, postedDate, rowFields, sharedWithLine, sharesOf,
} from './materialRules';

const CODES = ['CM_NOT_OWNER', 'CM_NOT_YOUR_CLASS', 'CM_GRADE_MISMATCH', 'CM_ALREADY_POSTED', 'CM_NO_STUDENTS', 'CM_NOT_IN_CLASS'];
const rpcClient = reply => {
  const calls = [];
  return { calls, rpc: (...a) => { calls.push(a); return typeof reply === 'function' ? reply() : Promise.resolve(reply); } };
};

describe('the share function (eduscribe_material_post_to_class)', () => {
  it('everyone: p_student_ids is null; some students: the ticked ids', async () => {
    const c = rpcClient({ data: 'x', error: null });
    expect(await shareMaterialToClass({ materialId: 'm1', sectionId: 's1', client: c })).toEqual({ ok: true });
    expect(await shareMaterialToClass({ materialId: 'm1', sectionId: 's2', studentIds: ['a', 'b'], client: c })).toEqual({ ok: true });
    expect(c.calls).toEqual([
      ['eduscribe_material_post_to_class', { p_material: 'm1', p_section: 's1', p_student_ids: null }],
      ['eduscribe_material_post_to_class', { p_material: 'm1', p_section: 's2', p_student_ids: ['a', 'b'] }],
    ]);
  });

  it('each CM_ code (RAISE EXCEPTION, sent as P0001) becomes its own sentence; the raw text never shows', async () => {
    expect(Object.keys(SHARE_MESSAGES)).toEqual(CODES);
    for (const code of CODES) {
      const c = rpcClient({ data: null, error: { code: 'P0001', message: `${code}`, details: 'internal detail', hint: null } });
      const result = await shareMaterialToClass({ materialId: 'm1', sectionId: 's1', client: c });
      expect(result).toEqual({ ok: false, error: SHARE_MESSAGES[code] });
      expect(result.error).not.toMatch(/CM_|P0001|internal/);
    }
  });

  it('any other failure, or a thrown error, is the generic share message', async () => {
    const other = await shareMaterialToClass({ materialId: 'm', sectionId: 's', client: rpcClient({ data: null, error: { code: '42501', message: 'permission denied for function x' } }) });
    expect(other.ok).toBe(false);
    expect(other.error).not.toMatch(/permission denied|42501/);
    const thrown = await shareMaterialToClass({ materialId: 'm', sectionId: 's', client: rpcClient(() => Promise.reject(new Error('fetch failed: secret'))) });
    expect(thrown.ok).toBe(false);
    expect(thrown.error).not.toMatch(/secret/);
    expect(shareError(null)).toBe('The material could not be shared. Check your connection and try again.');
  });
});

describe('reads', () => {
  it('the shares come from the owner-readable join table with each class name and grade', async () => {
    const ops = [];
    const client = { from: (t) => { ops.push(['from', t]); return { select: (s) => { ops.push(['select', s]); return Promise.resolve({ data: [{ material_id: 'm1' }], error: null }); } }; } };
    expect(await listMaterialClasses({ client, sleep: () => Promise.resolve() })).toEqual([{ material_id: 'm1' }]);
    expect(ops).toEqual([['from', 'learning_material_classes'], ['select', 'material_id, section_id, all_students, sections(id, name, grade_level)']]);
    const failing = { from: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'x' } }) }) };
    await expect(listMaterialClasses({ client: failing, sleep: () => Promise.resolve() })).rejects.toThrow('could not be loaded');
  });

  it('real classes and rosters are the very reads Distribute uses (postToClass.js)', () => {
    expect(loadTeacherSections).toBe(postToClass.loadTeacherSections);
    expect(loadClassList).toBe(postToClass.loadClassList);
  });
});

describe('rules', () => {
  const S7 = { id: 's7', name: 'Rizal', grade_level: 'Grade 7' };
  const S8 = { id: 's8', name: 'Mabini', grade_level: 'Grade 8' };
  const S8B = { id: 's8b', name: 'Bonifacio', grade_level: 'Grade 8' };
  const SHARES = [{ material_id: 'a', sections: S8 }, { material_id: 'a', sections: S8B }, { material_id: 'b', sections: S7 }];

  it('a new material: no subject; the class grade or none (Private)', () => {
    const draft = { ...emptyDraft(), title: ' T ', description: '' };
    expect(createFields(draft, S8)).toEqual({ title: 'T', description: null, subject_id: null, grade_level: 'Grade 8' });
    expect(createFields(draft, null)).toEqual({ title: 'T', description: null, subject_id: null, grade_level: null });
    expect(Object.keys(rowFields(draft))).toEqual(['title', 'description']);
  });

  it('class labels, the Class cell (+N) and Shared with', () => {
    expect(classLabel(S7)).toBe('Grade 7 — Rizal');
    expect(classCell(sharesOf(SHARES, 'a'))).toBe('Grade 8 — Bonifacio +1');
    expect(classCell(sharesOf(SHARES, 'b'))).toBe('Grade 7 — Rizal');
    expect(classCell(sharesOf(SHARES, 'c'))).toBe('Private (only me)');
    expect(sharedWithLine(sharesOf(SHARES, 'a'))).toBe('Grade 8 — Bonifacio, Grade 8 — Mabini');
    expect(sharedWithLine([])).toBe('Private (only me)');
  });

  it('classes grouped by grade, Grade 7 first, names A-Z; Grade 10 after Grade 9', () => {
    const S10 = { id: 's10', name: 'Luna', grade_level: 'Grade 10' };
    const S9 = { id: 's9', name: 'Aguinaldo', grade_level: 'Grade 9' };
    expect(classesByGrade([S10, S8, S9, S7, S8B]).map(([g, list]) => [g, list.map(s => s.name)]))
      .toEqual([['Grade 7', ['Rizal']], ['Grade 8', ['Bonifacio', 'Mabini']], ['Grade 9', ['Aguinaldo']], ['Grade 10', ['Luna']]]);
  });

  it('Grade and Section filters: no grade = All grades only; Private = no class', () => {
    const rows = [{ id: 'a', grade_level: 'Grade 8' }, { id: 'b', grade_level: 'Grade 7' }, { id: 'c', grade_level: null }];
    const ids = f => filterByClass(rows, SHARES, f).map(r => r.id);
    expect(ids({})).toEqual(['a', 'b', 'c']);
    expect(ids({ grade: 'Grade 8' })).toEqual(['a']);
    expect(ids({ sectionId: 's8b' })).toEqual(['a']);
    expect(ids({ sectionId: PRIVATE_SECTION })).toEqual(['c']);
    expect(ids({ grade: 'Grade 7', sectionId: 's8' })).toEqual([]);
  });

  it('Posted is a short Manila date', () => {
    expect(postedDate('2026-11-17T17:00:00Z')).toBe('Nov 18');
    expect(postedDate(null)).toBe('');
    expect(postedDate('nope')).toBe('');
  });
});
