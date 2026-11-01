import { WEEKDAYS } from '../lessonPlans/weeklyWorksheetSource';
import { validateGeneratedWorksheet } from './generatedDraftModel';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK_SIZE = 50;
const fail = code => ({ ok: false, code });
const uuid = value => typeof value === 'string' && UUID.test(value);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const dateText = value => typeof value === 'string' ? value : '';

async function readChunks(client, table, columns, field, ids, order) {
  const rows = [];
  for (let index = 0; index < ids.length; index += CHUNK_SIZE) {
    let query = client.from(table).select(columns).in(field, ids.slice(index, index + CHUNK_SIZE));
    if (order) query = query.order(order);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return null;
    rows.push(...data);
  }
  return rows;
}

function rebuild(collectionRow, worksheetRows, itemRows, keyRows, privateRows) {
  try {
    if (!record(collectionRow) || !uuid(collectionRow.id) || !uuid(collectionRow.teacher_id)
      || typeof collectionRow.title !== 'string' || !collectionRow.title.trim()
      || !Number.isSafeInteger(Number(collectionRow.revision))
      || Number(collectionRow.revision) < 1
      || (collectionRow.archived_at !== null && collectionRow.archived_at !== undefined
        && typeof collectionRow.archived_at !== 'string')
      || worksheetRows.length !== WEEKDAYS.length) return null;

    const byDay = new Map();
    for (const row of worksheetRows) {
      if (!record(row) || !uuid(row.id) || !Number.isInteger(row.day_of_week)
        || row.day_of_week < 1 || row.day_of_week > WEEKDAYS.length
        || byDay.has(row.day_of_week) || row.collection_id !== collectionRow.id
        || row.teacher_id !== collectionRow.teacher_id) return null;
      byDay.set(row.day_of_week, row);
    }
    const orderedRows = WEEKDAYS.map((_, index) => byDay.get(index + 1));
    if (orderedRows.some(row => !row)) return null;
    const first = orderedRows[0];
    const sourceId = first.source_lesson_plan_id;
    if (!uuid(sourceId) || orderedRows.some(row => row.source_lesson_plan_id !== sourceId)) return null;

    const worksheetIds = new Set(orderedRows.map(row => row.id));
    const itemsByWorksheet = new Map(orderedRows.map(row => [row.id, []]));
    const itemIds = new Set();
    for (const item of itemRows) {
      if (!record(item) || !uuid(item.id) || !worksheetIds.has(item.worksheet_id)
        || itemIds.has(item.id)) return null;
      itemIds.add(item.id);
      itemsByWorksheet.get(item.worksheet_id).push(item);
    }
    const keys = new Map();
    for (const key of keyRows) {
      if (!record(key) || !itemIds.has(key.item_id) || keys.has(key.item_id)) return null;
      keys.set(key.item_id, key.correct_answer);
    }
    const privateByItem = new Map();
    for (const row of privateRows) {
      if (!record(row) || !itemIds.has(row.item_id) || privateByItem.has(row.item_id)
        || !record(row.private)) return null;
      privateByItem.set(row.item_id, row.private);
    }

    const sourceLessonPlan = { id: sourceId, title: collectionRow.title };
    const worksheets = [];
    for (const [index, row] of orderedRows.entries()) {
      if (!Array.isArray(row.sections) || !row.sections.length) return null;
      const sections = structuredClone(row.sections);
      const sectionIds = new Set(sections.map(section => section?.id));
      if (sectionIds.size !== sections.length || [...sectionIds].some(id =>
        typeof id !== 'string' || !id.trim())) return null;
      const items = itemsByWorksheet.get(row.id);
      if (!items.length) return null;
      items.sort((a, b) => a.position - b.position);
      const positions = new Set();
      const questions = [];
      const answerKey = [];
      for (const item of items) {
        if (!Number.isSafeInteger(item.position) || item.position < 1
          || positions.has(item.position)) return null;
        positions.add(item.position);
        const privateData = privateByItem.get(item.id);
        if (!privateData || typeof privateData.sectionId !== 'string'
          || !privateData.sectionId.trim() || !sectionIds.has(privateData.sectionId)) return null;
        const points = Number(item.points);
        if (!Number.isFinite(points) || points <= 0) return null;
        const multipleChoice = item.item_type === 'multiple_choice';
        if (multipleChoice && (!Array.isArray(item.options) || item.options.length !== 4
          || item.options.some(option => typeof option !== 'string' || !option.trim()))) return null;
        const question = { localId: item.id, sectionId: privateData.sectionId,
          question: item.question, item_type: item.item_type,
          options: multipleChoice ? [...item.options] : [], points };
        if (item.item_type === 'enumeration' && privateData.enumeration !== undefined) {
          question.enumeration = structuredClone(privateData.enumeration);
        }
        if (item.item_type === 'essay') {
          const essay = privateData.essay;
          if (!record(essay) || !Object.hasOwn(essay, 'referenceAnswer')
            || !Object.hasOwn(essay, 'minWords') || !Object.hasOwn(essay, 'maxWords')
            || !Object.hasOwn(essay, 'rubric') || keys.has(item.id)) return null;
          question.essay = structuredClone(essay);
        } else {
          if (!keys.has(item.id)) return null;
          let correctAnswer = keys.get(item.id);
          if (item.item_type === 'identification' || item.item_type === 'enumeration') {
            if (Array.isArray(correctAnswer)) {
              if (!correctAnswer.every(value => typeof value === 'string')) return null;
              correctAnswer = correctAnswer.join(', ');
            }
          }
          if (typeof correctAnswer !== 'string') return null;
          answerKey.push({ localId: item.id, correct_answer: correctAnswer });
        }
        questions.push(question);
      }
      const worksheet = { draftId: row.id, collectionId: collectionRow.id,
        day: WEEKDAYS[index], version: 1, title: row.title,
        instructions: typeof row.instructions === 'string' ? row.instructions : '',
        checkingMode: row.checking_mode, status: 'saved', saved: true,
        sourceType: 'ai', sourceLessonPlan: { ...sourceLessonPlan }, sections,
        assignmentVerified: false, questions, answerKey };
      if (validateGeneratedWorksheet(worksheet).length) return null;
      worksheets.push(worksheet);
    }

    return { kind: 'weekly-worksheet-collection', version: 1,
      collectionId: collectionRow.id, teacherId: collectionRow.teacher_id,
      sourceLessonPlan, title: collectionRow.title,
      subjectId: first.subject_id || '', subjectName: first.subject || '',
      gradeLevel: first.grade_level || '', academicYear: first.academic_year || '',
      sourceWeek: '', teachingDate: '', status: 'saved', saved: true,
      createdAt: dateText(first.created_at), updatedAt: dateText(first.updated_at),
      revision: Number(collectionRow.revision), archivedAt: collectionRow.archived_at ?? null,
      worksheets };
  } catch {
    return null;
  }
}

export async function loadSavedWeeklyCollection(client, collectionId, teacherId) {
  if (!uuid(collectionId) || (teacherId != null && !uuid(teacherId))) return fail('invalid_id');
  try {
    let query = client.from('worksheet_collections')
      .select('id,title,revision,archived_at,source_lesson_plan_id,teacher_id')
      .eq('id', collectionId);
    if (teacherId != null) query = query.eq('teacher_id', teacherId);
    const { data: collections, error: collectionError } = await query;
    if (collectionError || !Array.isArray(collections)) return fail('load_failed');
    if (!collections.length) return fail('not_found');
    if (collections.length !== 1) return fail('incomplete_data');

    const { data: worksheets, error: worksheetError } = await client.from('worksheets')
      .select('*').eq('collection_id', collectionId).order('day_of_week');
    if (worksheetError || !Array.isArray(worksheets)) return fail('load_failed');
    const worksheetIds = worksheets.map(row => row?.id);
    if (!worksheetIds.length) return fail('incomplete_data');
    const items = await readChunks(client, 'worksheet_items', '*', 'worksheet_id',
      worksheetIds, 'position');
    if (!items) return fail('load_failed');
    const itemIds = items.map(row => row?.id);
    if (!itemIds.length) return fail('incomplete_data');
    const keys = await readChunks(client, 'worksheet_item_keys', 'item_id,correct_answer',
      'item_id', itemIds);
    if (!keys) return fail('load_failed');
    const privateRows = await readChunks(client, 'worksheet_item_private', 'item_id,private',
      'item_id', itemIds);
    if (!privateRows) return fail('load_failed');
    const collection = rebuild(collections[0], worksheets, items, keys, privateRows);
    return collection ? { ok: true, collection } : fail('incomplete_data');
  } catch {
    return fail('load_failed');
  }
}
