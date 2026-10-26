import createDOMPurify from 'dompurify';

const MAX_BYTES = 2_097_152;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TYPES = new Set(['multiple_choice', 'true_false', 'identification', 'enumeration', 'essay']);
const DB_CODES = new Set(['not_authenticated', 'inactive_teacher', 'invalid_document',
  'source_plan_denied', 'idempotency_conflict', 'invalid_state']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MARKUP = /<[A-Za-z/!?]/;
let purifierPromise;

const fail = code => ({ ok: false, code, durable: false });
const reject = code => { throw Object.assign(new Error(code), { code }); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const chars = value => Array.from(value).length; // PostgreSQL char_length counts Unicode characters, not UTF-8 bytes.
const uuid = value => typeof value === 'string' && UUID.test(value);

async function getPurifier() {
  purifierPromise ??= import('jsdom').then(({ JSDOM }) => createDOMPurify(new JSDOM('').window));
  return purifierPromise;
}

export async function sanitizeWeeklyText(value) {
  if (typeof value !== 'string') reject('invalid_document');
  if (MARKUP.test(value)) reject('unsafe_markup');
  const purifier = await getPurifier();
  const clean = purifier.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [],
    RETURN_DOM_FRAGMENT: true }).textContent.trim();
  if (MARKUP.test(clean)) reject('unsafe_markup');
  return clean;
}

async function text(value, max, allowEmpty = false) {
  const clean = await sanitizeWeeklyText(value);
  if ((!allowEmpty && !clean) || chars(clean) > max) reject('invalid_document');
  return clean;
}

function decimal(value, maxPlaces = Infinity) {
  const source = typeof value === 'number' && Number.isFinite(value) ? String(value)
    : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(?:\.\d+)?$/.test(source)) reject('invalid_document');
  const fraction = source.split('.')[1] || '';
  if (fraction.length > maxPlaces) reject('invalid_document');
  const numeric = Number(source);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 100) reject('invalid_document');
  const sent = String(numeric);
  if (!/^\d+(?:\.\d+)?$/.test(sent)) reject('invalid_document');
  const [sentWhole, sentFraction = ''] = sent.split('.');
  return { number: numeric, whole: sentWhole, fraction: sentFraction };
}

function exactRubricSum(points, rubric) {
  const parts = [points, ...rubric.map(part => part.points)];
  const scale = Math.max(...parts.map(part => part.fraction.length));
  const scaled = part => BigInt(part.whole) * 10n ** BigInt(scale)
    + BigInt(part.fraction.padEnd(scale, '0') || '0');
  return rubric.reduce((sum, part) => sum + scaled(part.points), 0n) === scaled(points);
}

async function mapQuestion(item, position, keys, sectionIds, checkingMode) {
  if (!record(item) || typeof item.localId !== 'string' || !item.localId
    || !sectionIds.has(item.sectionId) || !TYPES.has(item.item_type)) reject('invalid_document');
  const points = decimal(item.points, 2);
  const mapped = { position, sectionId: item.sectionId, question: await text(item.question, 4000),
    item_type: item.item_type, options: null, points: points.number, correct_answer: null };
  if (item.item_type !== 'essay') {
    if (!keys.has(item.localId)) reject('invalid_document');
    mapped.correct_answer = await text(keys.get(item.localId),
      item.item_type === 'multiple_choice' ? 500 : 2000);
  }
  if (item.item_type === 'multiple_choice') {
    if (!Array.isArray(item.options) || item.options.length !== 4) reject('invalid_document');
    mapped.options = await Promise.all(item.options.map(option => text(option, 500)));
    // Intentionally stricter than the RPC: four choices must remain distinct after sanitizing.
    if (new Set(mapped.options.map(option => option.toLowerCase())).size !== 4) {
      reject('mcq_options_not_distinct');
    }
    if (!mapped.options.includes(mapped.correct_answer)) reject('invalid_document');
  } else if (item.item_type === 'true_false') {
    if (!['True', 'False'].includes(mapped.correct_answer)) reject('invalid_document');
  } else if (item.item_type === 'identification' || item.item_type === 'enumeration') {
    const parts = mapped.correct_answer.split(',').map(part => part.trim()).filter(Boolean);
    if (parts.length < 1 || parts.length > 30) reject('invalid_document');
    if (item.item_type === 'enumeration' && item.enumeration != null) {
      const config = item.enumeration;
      if (!record(config) || !Array.isArray(config.alternatives)
        || config.alternatives.length > 10 || typeof config.orderSensitive !== 'boolean') {
        reject('invalid_document');
      }
      const alternatives = await Promise.all(config.alternatives.map(value => text(value, 2000)));
      if (alternatives.some(value => {
        const pieces = value.split(',');
        return pieces.length !== parts.length || pieces.some(piece => !piece.trim());
      })) reject('invalid_document');
      mapped.enumeration = { alternatives, orderSensitive: config.orderSensitive };
      if (checkingMode === 'auto' && (config.orderSensitive || alternatives.length)) reject('invalid_document');
    }
  } else {
    const essay = item.essay;
    if (!record(essay) || !Number.isInteger(essay.minWords) || !Number.isInteger(essay.maxWords)
      || essay.minWords < 1 || essay.maxWords < essay.minWords || essay.maxWords > 3000
      || !Array.isArray(essay.rubric) || essay.rubric.length < 1 || essay.rubric.length > 20) {
      reject('invalid_document');
    }
    const rubric = await Promise.all(essay.rubric.map(async part => {
      if (!record(part)) reject('invalid_document');
      const score = decimal(part.points);
      return { criterion: await text(part.criterion, 500), points: score };
    }));
    if (!exactRubricSum(points, rubric)) reject('invalid_document');
    mapped.essay = { referenceAnswer: await text(essay.referenceAnswer, 8000),
      minWords: essay.minWords, maxWords: essay.maxWords,
      rubric: rubric.map(part => ({ criterion: part.criterion, points: part.points.number })) };
  }
  return mapped;
}

export async function buildWeeklySavePayload(collection) {
  if (!record(collection) || !uuid(collection.sourceLessonPlan?.id)
    || !Array.isArray(collection.worksheets) || collection.worksheets.length < 1
    || collection.worksheets.length > 5) reject('invalid_document');
  const seenDays = new Set();
  const worksheets = [];
  for (const draft of collection.worksheets) {
    if (!record(draft) || !DAYS.includes(draft.day) || seenDays.has(draft.day)
      || !['auto', 'manual'].includes(draft.checkingMode)
      || !Array.isArray(draft.sections) || draft.sections.length < 1 || draft.sections.length > 12
      || !Array.isArray(draft.questions) || draft.questions.length < 1 || draft.questions.length > 60
      || !Array.isArray(draft.answerKey)) reject('invalid_document');
    seenDays.add(draft.day);
    const sections = await Promise.all(draft.sections.map(async section => {
      if (!record(section) || typeof section.id !== 'string' || chars(section.id) < 1
        || chars(section.id) > 128) reject('invalid_document');
      const title = await sanitizeWeeklyText(section.title);
      return { id: section.id, title: await text(title || 'Questions', 120),
        directions: await text(section.directions, 2000, true) };
    }));
    const sectionIds = new Set(sections.map(section => section.id));
    if (sectionIds.size !== sections.length) reject('invalid_document');
    const keys = new Map();
    for (const key of draft.answerKey) {
      if (!record(key) || typeof key.localId !== 'string' || !key.localId
        || keys.has(key.localId)) reject('invalid_document');
      keys.set(key.localId, key.correct_answer);
    }
    const seenQuestions = new Set();
    const questions = [];
    for (const [index, item] of draft.questions.entries()) {
      if (seenQuestions.has(item?.localId)) reject('invalid_document');
      seenQuestions.add(item?.localId);
      questions.push(await mapQuestion(item, index + 1, keys, sectionIds, draft.checkingMode));
    }
    worksheets.push({ day: DAYS.indexOf(draft.day) + 1, title: await text(draft.title, 255),
      instructions: await text(draft.instructions, 2000, true), sections,
      checkingMode: draft.checkingMode, questions });
  }
  const payload = { sourceLessonPlanId: collection.sourceLessonPlan.id,
    title: await text(collection.title, 255), worksheets };
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_BYTES) reject('payload_too_large');
  return payload;
}

export function createAiWeeklyWorksheetSave({ invokeRpc } = {}) {
  return {
    async save(credential, command) {
      if (!invokeRpc) return fail('integration_blocked');
      try {
        if (typeof credential !== 'string' || !credential) reject('not_authenticated');
        if (!record(command) || !uuid(command.requestId)
          || command.requestId !== command.collection?.collectionId) reject('invalid_document');
        const payload = await buildWeeklySavePayload(command.collection);
        const { data, error } = await invokeRpc('eduscribe_ai_weekly_worksheets_save_v1',
          { p_request_id: command.requestId, p_payload: payload }, credential);
        if (error) return fail(DB_CODES.has(error.message) ? error.message : 'persistence_failed');
        const expected = new Map(payload.worksheets.map(day => [day.day, day.questions.length]));
        if (data?.ok !== true || data.durable !== true || !uuid(data.collectionId)
          || !Array.isArray(data.worksheets) || data.worksheets.length !== payload.worksheets.length
          || new Set(data.worksheets.map(item => item?.day)).size !== data.worksheets.length
          || data.worksheets.some(item => !expected.has(item?.day)
            || !uuid(item.id) || item.items !== expected.get(item.day))) {
          return fail('persistence_failed');
        }
        return { ok: true, durable: true, collectionId: data.collectionId,
          worksheets: data.worksheets.map(item => ({ day: item.day, id: item.id, items: item.items })) };
      } catch (error) {
        return fail(['invalid_document', 'payload_too_large', 'not_authenticated',
          'mcq_options_not_distinct', 'unsafe_markup', 'integration_blocked'].includes(error?.code)
          ? error.code : 'persistence_failed');
      }
    },
  };
}
