import { isDeepStrictEqual } from 'node:util';
import { finalizeWeeklyWorksheetDrafts, parseDailyBatch,
  validateSameDayBatchQuestions, validateWeeklySources } from './weeklyWorksheetGenerator.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalidCheckpoint = () => { throw Object.assign(new Error('Invalid weekly draft checkpoint.'),
  { code: 'INVALID_CHECKPOINT' }); };

function validatedBatch(checkpoint, plan, source, batchNumber, priorQuestions) {
  if (!object(checkpoint) || checkpoint.status !== 'generated-draft' || checkpoint.saved !== false
    || typeof checkpoint.title !== 'string' || !checkpoint.title.trim()
    || typeof checkpoint.instructions !== 'string' || !checkpoint.instructions.trim()
    || typeof checkpoint.distributionNote !== 'string'
    || !Array.isArray(checkpoint.questions) || checkpoint.questions.length !== 10
    || !Array.isArray(checkpoint.answerKey)) invalidCheckpoint();

  const expectedKeys = [];
  for (const [index, item] of checkpoint.questions.entries()) {
    if (!object(item) || item.localId !== `draft-${index + 1}`) invalidCheckpoint();
    if (item.item_type !== 'essay') expectedKeys.push(item.localId);
  }
  if (checkpoint.answerKey.length !== expectedKeys.length ||
    checkpoint.answerKey.some((key, index) => !object(key)
      || key.localId !== expectedKeys[index] || typeof key.correct_answer !== 'string'))
    invalidCheckpoint();

  const answers = new Map(checkpoint.answerKey.map(key => [key.localId, key.correct_answer]));
  const raw = { title: checkpoint.title, directions: checkpoint.instructions,
    coverageLimitation: checkpoint.distributionNote,
    questions: checkpoint.questions.map(item => ({ ...item,
      correct_answer: answers.get(item.localId) ?? '' })) };
  let reparsed;
  try { reparsed = parseDailyBatch(JSON.stringify(raw), plan, source, 10, batchNumber); }
  catch { invalidCheckpoint(); }
  if (!isDeepStrictEqual(reparsed, checkpoint)) invalidCheckpoint();
  validateSameDayBatchQuestions(checkpoint.questions, priorQuestions, source.day);
  return checkpoint;
}

export function createWeeklyDraftAssemblyService({ jobAdapter } = {}) {
  if (typeof jobAdapter?.readCheckpoints !== 'function'
    || typeof jobAdapter?.failFinalization !== 'function'
    || typeof jobAdapter?.complete !== 'function')
    throw new TypeError('Private checkpoint, failure, and completion operations are required.');

  return Object.freeze({
    async assemble(jobId) {
      const terminalize = async (category, error) => {
        if (await jobAdapter.failFinalization(jobId, category) !== true)
          return { status: 'not_completed' };
        throw error;
      };
      let receipt;
      try { receipt = await jobAdapter.readCheckpoints(jobId); }
      catch (error) {
        if (error?.code === 'source_changed') return terminalize('source_changed', error);
        if (error?.code === 'invalid_result') return terminalize('validation', error);
        throw error;
      }

      let collection;
      try {
        if (!object(receipt) || receipt.id !== jobId || !UUID.test(receipt.teacherId)
          || !UUID.test(receipt.sourceLessonPlanId) || !object(receipt.plan)
          || receipt.plan.id !== receipt.sourceLessonPlanId
          || typeof receipt.plan.title !== 'string' || !receipt.plan.title.trim()
          || ![20, 30, 40].includes(receipt.questionCount)
          || receipt.plannedCalls !== receipt.questionCount / 2
          || !Array.isArray(receipt.checkpoints)
          || receipt.checkpoints.length !== receipt.plannedCalls) invalidCheckpoint();

        let sources;
        try { sources = validateWeeklySources(receipt.sourceDays); }
        catch { invalidCheckpoint(); }
        if (sources.length !== DAYS.length || sources.some((source, index) => source.day !== DAYS[index]))
          invalidCheckpoint();

        const batchesPerDay = receipt.questionCount / 10;
        const completedDays = sources.map(() => ({ title: '', instructions: '', distributionNotes: [], batches: [] }));
        const priorByDay = sources.map(() => []);
        for (const [index, entry] of receipt.checkpoints.entries()) {
          if (!object(entry) || entry.batchIndex !== index) invalidCheckpoint();
          const dayIndex = Math.floor(index / batchesPerDay);
          const batchNumber = index % batchesPerDay + 1;
          const checkpoint = validatedBatch(entry.validatedResponse, receipt.plan, sources[dayIndex],
            batchNumber, priorByDay[dayIndex]);
          const day = completedDays[dayIndex];
          day.title ||= checkpoint.title;
          day.instructions ||= checkpoint.instructions;
          if (checkpoint.distributionNote) day.distributionNotes.push(checkpoint.distributionNote);
          day.batches.push(checkpoint);
          priorByDay[dayIndex].push(...checkpoint.questions.map(item => item.question));
        }

        const worksheets = finalizeWeeklyWorksheetDrafts(receipt.plan, sources, completedDays,
          receipt.questionCount);
        collection = { kind: 'weekly-worksheet-collection', status: 'local-draft', saved: false,
          teacherId: receipt.teacherId,
          sourceLessonPlan: { id: receipt.plan.id, title: receipt.plan.title }, worksheets };
        let bytes;
        try { bytes = Buffer.byteLength(JSON.stringify(collection), 'utf8'); }
        catch { invalidCheckpoint(); }
        if (bytes > 5242880) invalidCheckpoint();
      } catch (error) {
        if (error?.code === 'INVALID_CHECKPOINT' || error?.code === 'AI_RESPONSE_INVALID')
          return terminalize('validation', error);
        throw error;
      }

      try {
        const completed = await jobAdapter.complete(jobId, collection);
        return { status: completed === true ? 'completed' : 'not_completed' };
      } catch (error) {
        if (error?.code === 'source_changed') return terminalize('source_changed', error);
        throw error;
      }
    },
  });
}
