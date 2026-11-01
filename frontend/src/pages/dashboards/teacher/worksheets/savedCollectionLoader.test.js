import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildWeeklySavePayload } from '../../../../../../backend/src/persistence/aiWeeklyWorksheetSave.js';
import { loadSavedWeeklyCollection } from './savedCollectionLoader';

const uuid = number => `${number.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
const collectionId = uuid(1);
const teacherId = uuid(2);
const planId = uuid(3);
const subjectId = uuid(4);
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function fixture() {
  const worksheets = weekdays.map((day, index) => ({ id: uuid(100 + index),
    collection_id: collectionId, teacher_id: teacherId, source_lesson_plan_id: planId,
    day_of_week: index + 1, title: `${day} questions`, instructions: `Directions for ${day}`,
    checking_mode: 'manual', sections: [{ id: 'main', title: 'Main', directions: '' }],
    subject_id: subjectId, subject: 'Filipino', grade_level: 'Grade 7',
    created_at: '2030-01-01T00:00:00Z', updated_at: '2030-01-02T00:00:00Z' }));
  const types = ['multiple_choice', 'true_false', 'identification', 'enumeration', 'essay'];
  const items = types.map((type, index) => ({ id: uuid(200 + index),
    worksheet_id: worksheets[index].id, position: 1,
    question: `Synthetic ${type} question`, item_type: type,
    options: type === 'multiple_choice' ? ['Alpha', 'Beta', 'Gamma', 'Delta'] : null,
    points: type === 'essay' ? '5.00' : '2.00' }));
  const keys = items.slice(0, 4).map((item, index) => ({ item_id: item.id,
    correct_answer: ['Alpha', 'True', ['one', 'two'], ['first', 'second']][index] }));
  const privateRows = items.map((item, index) => ({ item_id: item.id, private: {
    sectionId: 'main',
    ...(index === 3 ? { enumeration: { alternatives: ['other first, other second'],
      orderSensitive: false } } : {}),
    ...(index === 4 ? { essay: { referenceAnswer: 'A synthetic explanation.',
      minWords: 80, maxWords: 150,
      rubric: [{ criterion: 'Explanation', points: 5 }] } } : {}),
  } }));
  return { worksheet_collections: [{ id: collectionId, teacher_id: teacherId,
    source_lesson_plan_id: planId, title: 'Filipino 7 Weekly Worksheets',
    revision: '2', archived_at: null }], worksheets,
  worksheet_items: items, worksheet_item_keys: keys, worksheet_item_private: privateRows };
}

function mockedClient(rows, { failTable } = {}) {
  const reads = [];
  const writes = [];
  const forbidden = new Set(['insert', 'update', 'delete', 'upsert', 'rpc']);
  const blocked = name => { writes.push(name); throw new Error('write forbidden in loader test'); };
  const client = new Proxy({
    from(table) {
      if (!Object.hasOwn(rows, table)) throw new Error('unexpected table');
      const state = { table, columns: '*', filters: [], ids: null, order: null };
      let query;
      query = new Proxy({
        select(columns) { state.columns = columns; return query; },
        eq(column, value) { state.filters.push([column, value]); return query; },
        in(column, ids) { state.ids = { column, ids: [...ids] }; return query; },
        order(column) { state.order = column; return query; },
        then(resolve, reject) {
          reads.push({ table, columns: state.columns,
            filters: [...state.filters], ids: state.ids, order: state.order });
          let data = rows[table].filter(row => state.filters.every(([column, value]) =>
            row[column] === value) && (!state.ids || state.ids.ids.includes(row[state.ids.column])));
          if (state.order) data = [...data].sort((a, b) =>
            a[state.order] < b[state.order] ? -1 : a[state.order] > b[state.order] ? 1 : 0);
          if (state.columns !== '*') {
            const selected = state.columns.split(',').map(value => value.trim());
            data = data.map(row => Object.fromEntries(selected.map(column => [column, row[column]])));
          }
          return Promise.resolve({ data: failTable === table ? null : data,
            error: failTable === table ? { message: 'secret database text' } : null }).then(resolve, reject);
        },
      }, { get(target, name) { return forbidden.has(name) ? () => blocked(name) : target[name]; } });
      return query;
    },
  }, { get(target, name) { return forbidden.has(name) ? () => blocked(name) : target[name]; } });
  return { client, reads, writes };
}

describe('saved weekly collection loader', () => {
  it('rebuilds five saved days and all item types in the local draft shape', async () => {
    const rows = fixture();
    rows.worksheets.reverse();
    const { client, reads } = mockedClient(rows);
    const result = await loadSavedWeeklyCollection(client, collectionId, teacherId);
    expect(result.ok).toBe(true);
    const collection = result.collection;
    expect(Object.keys(collection)).toEqual(['kind', 'version', 'collectionId', 'teacherId',
      'sourceLessonPlan', 'title', 'subjectId', 'subjectName', 'gradeLevel', 'academicYear',
      'sourceWeek', 'teachingDate', 'status', 'saved', 'createdAt', 'updatedAt',
      'revision', 'archivedAt', 'worksheets']);
    expect(collection).toMatchObject({ kind: 'weekly-worksheet-collection', version: 1,
      collectionId, teacherId, sourceLessonPlan: { id: planId, title: rows.worksheet_collections[0].title },
      title: rows.worksheet_collections[0].title, subjectId, subjectName: 'Filipino',
      gradeLevel: 'Grade 7', academicYear: '', sourceWeek: '', teachingDate: '',
      status: 'saved', saved: true, createdAt: '2030-01-01T00:00:00Z',
      updatedAt: '2030-01-02T00:00:00Z', revision: 2, archivedAt: null });
    expect(collection.worksheets.map(day => day.day)).toEqual(weekdays);
    expect(collection.worksheets.map(day => day.questions[0].item_type))
      .toEqual(['multiple_choice', 'true_false', 'identification', 'enumeration', 'essay']);
    expect(collection.worksheets[0]).toMatchObject({ draftId: rows.worksheets.find(row => row.day_of_week === 1).id,
      collectionId, day: 'Monday', version: 1, status: 'saved', saved: true,
      sourceType: 'ai', sourceLessonPlan: { id: planId, title: rows.worksheet_collections[0].title },
      assignmentVerified: false, checkingMode: 'manual',
      sections: [{ id: 'main', title: 'Main', directions: '' }] });
    expect(collection.worksheets[2].answerKey[0].correct_answer).toBe('one, two');
    expect(collection.worksheets[3].answerKey[0].correct_answer).toBe('first, second');
    expect(collection.worksheets[4].answerKey).toEqual([]);
    expect(collection.worksheets[4].questions[0].essay.rubric[0].points).toBe(5);
    expect(collection.worksheets.every(day => day.questions[0].points ===
      (day.day === 'Friday' ? 5 : 2))).toBe(true);
    expect(reads[0]).toMatchObject({ table: 'worksheet_collections', columns:
      'id,title,revision,archived_at,source_lesson_plan_id,teacher_id',
      filters: [['id', collectionId], ['teacher_id', teacherId]] });
    expect(reads.map(read => read.table)).toEqual(['worksheet_collections', 'worksheets',
      'worksheet_items', 'worksheet_item_keys', 'worksheet_item_private']);
  });

  it('returns incomplete_data for missing or malformed saved rows', async () => {
    const changes = [
      rows => { rows.worksheet_item_private.pop(); },
      rows => { rows.worksheet_item_keys.pop(); },
      rows => { rows.worksheets.pop(); },
      rows => { rows.worksheets[4].day_of_week = 1; },
      rows => { rows.worksheet_items[0].options = ['Alpha', 'Beta']; },
      rows => { rows.worksheet_items.shift(); },
      rows => { rows.worksheet_item_private[0].private.sectionId = 'missing'; },
      rows => { rows.worksheet_items[1].position = 1;
        rows.worksheet_items[1].worksheet_id = rows.worksheet_items[0].worksheet_id; },
    ];
    for (const change of changes) {
      const rows = fixture(); change(rows);
      expect(await loadSavedWeeklyCollection(mockedClient(rows).client, collectionId, teacherId))
        .toEqual({ ok: false, code: 'incomplete_data' });
    }
  });

  it('returns not_found for no matching collection', async () => {
    const rows = fixture(); rows.worksheet_collections = [];
    expect(await loadSavedWeeklyCollection(mockedClient(rows).client, collectionId, teacherId))
      .toEqual({ ok: false, code: 'not_found' });
    expect(await loadSavedWeeklyCollection(mockedClient(fixture()).client, collectionId, uuid(99)))
      .toEqual({ ok: false, code: 'not_found' });
    expect(await loadSavedWeeklyCollection(mockedClient(fixture()).client, 'bad-id', teacherId))
      .toEqual({ ok: false, code: 'invalid_id' });
  });

  it('returns load_failed without exposing errors from any query', async () => {
    for (const table of ['worksheet_collections', 'worksheets', 'worksheet_items',
      'worksheet_item_keys', 'worksheet_item_private']) {
      const result = await loadSavedWeeklyCollection(mockedClient(fixture(), {
        failTable: table }).client, collectionId, teacherId);
      expect(result).toEqual({ ok: false, code: 'load_failed' });
      expect(JSON.stringify(result)).not.toContain('secret database text');
    }
  });

  it('splits more than 50 item IDs into bounded reads and preserves all questions', async () => {
    const rows = fixture();
    for (let index = 0; index < 51; index++) {
      const id = uuid(1000 + index);
      rows.worksheet_items.push({ ...rows.worksheet_items[0], id,
        position: index + 2, question: `Extra synthetic question ${index}` });
      rows.worksheet_item_keys.push({ item_id: id, correct_answer: 'Alpha' });
      rows.worksheet_item_private.push({ item_id: id, private: { sectionId: 'main' } });
    }
    const { client, reads } = mockedClient(rows);
    const result = await loadSavedWeeklyCollection(client, collectionId, teacherId);
    expect(result.ok).toBe(true);
    expect(result.collection.worksheets.map(day => day.questions.length)).toEqual([52, 1, 1, 1, 1]);
    const chunked = reads.filter(read => read.ids);
    expect(chunked.every(read => read.ids.ids.length <= 50)).toBe(true);
    expect(chunked.filter(read => read.table === 'worksheet_item_keys')).toHaveLength(2);
    expect(chunked.filter(read => read.table === 'worksheet_item_private')).toHaveLength(2);
    expect(result.collection.worksheets[0].questions.at(-1).question).toBe('Extra synthetic question 50');
  });

  it('uses only select queries; a write-method proxy remains untouched', async () => {
    const { client, writes } = mockedClient(fixture());
    expect((await loadSavedWeeklyCollection(client, collectionId, teacherId)).ok).toBe(true);
    expect(writes).toEqual([]);
  });

  it('roundtrips through the backend weekly save payload builder', async () => {
    const rows = fixture();
    const result = await loadSavedWeeklyCollection(mockedClient(rows).client, collectionId, teacherId);
    expect(result.ok).toBe(true);
    const payload = await buildWeeklySavePayload(result.collection);
    expect(payload.sourceLessonPlanId).toBe(planId);
    expect(payload.title).toBe(rows.worksheet_collections[0].title);
    expect(payload.worksheets.map(day => day.day)).toEqual([1, 2, 3, 4, 5]);
    for (const [index, day] of payload.worksheets.entries()) {
      expect(day.title).toBe(rows.worksheets[index].title);
      expect(day.sections).toEqual(rows.worksheets[index].sections);
      expect(day.questions[0]).toMatchObject({ question: rows.worksheet_items[index].question,
        item_type: rows.worksheet_items[index].item_type,
        options: index === 0 ? ['Alpha', 'Beta', 'Gamma', 'Delta'] : null,
        points: index === 4 ? 5 : 2,
        correct_answer: ['Alpha', 'True', 'one, two', 'first, second', null][index] });
    }
  });

  it.skipIf(!process.env.SAVED_BACKUP_PATH)('loads an optional local backup without printing its content', async () => {
    const backupPath = process.env.SAVED_BACKUP_PATH;
    if (path.basename(backupPath).startsWith('.env')) {
      throw new Error('REAL_DATA_invalid_path days=0 questions=0');
    }
    let rows;
    try { rows = JSON.parse(await readFile(backupPath, 'utf8')); }
    catch { throw new Error('REAL_DATA_load_failed days=0 questions=0'); }
    let result;
    try { result = await loadSavedWeeklyCollection(mockedClient(rows).client,
      rows.worksheet_collections?.[0]?.id, rows.worksheet_collections?.[0]?.teacher_id); }
    catch { throw new Error('REAL_DATA_load_failed days=0 questions=0'); }
    const days = result.ok ? result.collection.worksheets.length : 0;
    const questions = result.ok ? result.collection.worksheets.reduce((sum, day) =>
      sum + day.questions.length, 0) : 0;
    if (!result.ok || days !== 5 || questions !== 100) {
      throw new Error(`REAL_DATA_${result.ok ? 'COUNT_MISMATCH' : result.code} days=${days} questions=${questions}`);
    }
  });
});
