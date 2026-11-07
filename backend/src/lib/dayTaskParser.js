// Strict, self-contained validation of one day task. AI output is untrusted:
// anything off-spec rejects the whole task instead of being repaired or padded.

const POINTS = { multiple_choice: 1, true_false: 1, identification: 1, enumeration: 2, essay: 5 };

// The message stays fixed so no AI text can reach a log or a response.
const invalid = (category, path) => {
  throw Object.assign(new Error('AI returned an invalid day task.'),
    { code: 'AI_RESPONSE_INVALID', validation: { category, path } });
};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const normalized = value => value.trim().toLowerCase().replace(/\s+/g, ' ');

const text = (value, max, path) => {
  if (typeof value !== 'string') invalid('invalid_field', path);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[<>]/.test(trimmed)) invalid('invalid_field', path);
  return trimmed;
};

const list = (value, min, max, itemMax, path) => {
  if (!Array.isArray(value) || value.length < min || value.length > max) invalid('invalid_field', path);
  return value.map((item, index) => text(item, itemMax, `${path}[${index}]`));
};

const answerParts = (value, path) => text(value, 2000, path).split(',').map(part => text(part, 300, path));

function parseMultipleChoice(item, path) {
  const options = list(item.options, 4, 4, 500, `${path}.options`);
  if (new Set(options.map(normalized)).size !== 4) invalid('invalid_field', `${path}.options`);
  const answer = normalized(text(item.correct_answer, 500, `${path}.correct_answer`));
  const match = options.find(option => normalized(option) === answer);
  if (!match) invalid('invalid_answer_key', `${path}.correct_answer`);
  return { options, answer: match };
}

function parseEnumerationConfig(config, count, path) {
  if (config === undefined || config === null) return { alternatives: [], orderSensitive: false };
  if (!record(config) || !Array.isArray(config.alternatives) || typeof config.orderSensitive !== 'boolean') {
    invalid('invalid_field', path);
  }
  const alternatives = config.alternatives.map(value => {
    const alternative = text(value, 500, path);
    if (answerParts(alternative, path).length !== count) invalid('invalid_field', path);
    return alternative;
  });
  return { alternatives, orderSensitive: config.orderSensitive };
}

function parseEssay(essay, path) {
  if (!record(essay)) invalid('invalid_essay', path);
  const referenceAnswer = text(essay.referenceAnswer, 2000, `${path}.referenceAnswer`);
  const { minWords, maxWords, rubric } = essay;
  if (!Number.isInteger(minWords) || !Number.isInteger(maxWords)
    || minWords < 1 || maxWords < minWords || maxWords > 300) invalid('invalid_essay', path);
  if (!Array.isArray(rubric) || rubric.length < 2 || rubric.length > 4) invalid('invalid_essay', path);
  const parts = rubric.map(part => {
    if (!record(part) || !Number.isFinite(part.points) || part.points <= 0) invalid('invalid_essay', path);
    return { criterion: text(part.criterion, 300, `${path}.rubric`), points: part.points };
  });
  if (Math.abs(parts.reduce((sum, part) => sum + part.points, 0) - POINTS.essay) > 0.001) invalid('invalid_essay', path);
  return { referenceAnswer, minWords, maxWords, rubric: parts };
}

function parseItem(item, index, seen) {
  const path = `questions[${index}]`;
  if (!record(item)) invalid('invalid_field', path);
  const question = text(item.question, 2000, `${path}.question`);
  if (seen.has(normalized(question))) invalid('duplicate_question', `${path}.question`);
  seen.add(normalized(question));

  const type = item.item_type;
  if (typeof type !== 'string' || !Object.hasOwn(POINTS, type)) invalid('unsupported_question_type', `${path}.item_type`);
  const parsed = { localId: `draft-${index + 1}`, question, item_type: type, options: [], points: POINTS[type] };
  if (type === 'multiple_choice') {
    const { options, answer } = parseMultipleChoice(item, path);
    parsed.options = options;
    return { parsed, answer };
  }
  if (!Array.isArray(item.options) || item.options.length) invalid('invalid_field', `${path}.options`);

  const answerPath = `${path}.correct_answer`;
  if (type === 'true_false') {
    if (typeof item.correct_answer !== 'string' || !/^(true|false)$/i.test(item.correct_answer.trim())) {
      invalid('invalid_answer_key', answerPath);
    }
    return { parsed, answer: /^true$/i.test(item.correct_answer.trim()) ? 'True' : 'False' };
  }
  if (type === 'identification') return { parsed, answer: answerParts(item.correct_answer, answerPath).join(', ') };
  if (type === 'enumeration') {
    const parts = answerParts(item.correct_answer, answerPath);
    // The checker credits a repeated answer once, so a repeated key item could never earn full marks.
    if (parts.length < 2 || new Set(parts.map(normalized)).size !== parts.length) invalid('invalid_answer_key', answerPath);
    parsed.enumeration = parseEnumerationConfig(item.enumeration, parts.length, `${path}.enumeration`);
    return { parsed, answer: parts.join(', ') };
  }
  if (item.correct_answer !== '') invalid('invalid_answer_key', answerPath);
  parsed.essay = parseEssay(item.essay, `${path}.essay`);
  return { parsed };
}

function parseActivity(entry) {
  const durationMinutes = entry.durationMinutes;
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 90) invalid('invalid_field', 'durationMinutes');
  return {
    title: text(entry.title, 300, 'title'),
    objective: text(entry.objective, 2000, 'objective'),
    materials: list(entry.materials, 0, 10, 300, 'materials'),
    procedure: list(entry.procedure, 3, 8, 500, 'procedure'),
    grouping: text(entry.grouping, 300, 'grouping'),
    durationMinutes,
    successCriteria: list(entry.successCriteria, 2, 4, 500, 'successCriteria'),
  };
}

export function parseDayTask(raw, { taskType, itemCount, typeCounts }) {
  let entry;
  try { entry = JSON.parse(raw); } catch { invalid('syntax', '$'); }
  if (!record(entry)) invalid('missing_required', '$');
  if (taskType === 'activity') return { activity: parseActivity(entry) };

  const title = text(entry.title, 300, 'title');
  const directions = text(entry.directions, 2000, 'directions');
  if (!Array.isArray(entry.questions) || entry.questions.length !== itemCount) invalid('question_count', 'questions');

  const seen = new Set();
  const items = entry.questions.map((item, index) => parseItem(item, index, seen));
  const actual = {};
  for (const { parsed } of items) actual[parsed.item_type] = (actual[parsed.item_type] || 0) + 1;
  for (const type of Object.keys(POINTS)) {
    if ((actual[type] || 0) !== (typeCounts[type] || 0)) invalid('type_distribution', 'questions');
  }
  return { title, directions, questions: items.map(({ parsed }) => parsed),
    answerKey: items.filter(({ parsed }) => parsed.item_type !== 'essay')
      .map(({ parsed, answer }) => ({ localId: parsed.localId, correct_answer: answer })) };
}
