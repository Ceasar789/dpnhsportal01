import { backendRequest } from '../../../../lib/backendApi';
import { buildRequestBody, ITEM_TYPE_LABELS } from './dayTaskOptions';

const UNEXPECTED = 'The server returned an unexpected response. Nothing was saved.';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string';

const validEssay = essay => isRecord(essay) && isText(essay.referenceAnswer)
  && Number.isInteger(essay.minWords) && Number.isInteger(essay.maxWords) && Array.isArray(essay.rubric)
  && essay.rubric.every(part => isRecord(part) && isText(part.criterion) && Number.isFinite(part.points));

const validQuestion = question => isRecord(question) && isText(question.localId) && isText(question.question)
  && isText(question.item_type) && Object.hasOwn(ITEM_TYPE_LABELS, question.item_type)
  && Array.isArray(question.options) && question.options.every(isText) && Number.isFinite(question.points)
  && (question.item_type !== 'essay' || validEssay(question.essay));

// The preview renders these fields directly, so a wrong shape must stop here
// rather than crash the dialog or show a question without its answer.
function validResponse(response, { taskType, day }) {
  if (!isRecord(response) || response.status !== 'generated-day-task' || response.saved !== false
    || response.taskType !== taskType || response.day !== day
    || !isText(response.title) || !isText(response.instructions)
    || !Array.isArray(response.questions) || !Array.isArray(response.answerKey)
    || !response.questions.every(validQuestion)
    || !response.answerKey.every(key => isRecord(key) && isText(key.localId) && isText(key.correct_answer))) return false;
  if (taskType === 'activity') return isRecord(response.activity);
  const keyed = new Set(response.answerKey.map(key => key.localId));
  return response.activity === null && response.questions.every(question =>
    question.item_type === 'essay' || keyed.has(question.localId));
}

export const isCancelError = error => error?.name === 'AbortError' || error?.cause?.name === 'AbortError';

export async function requestDayTask(params, { signal, request = backendRequest } = {}) {
  const response = await request('/api/ai/day-tasks', { method: 'POST',
    body: JSON.stringify(buildRequestBody(params)), signal });
  if (!validResponse(response, params)) throw new Error(UNEXPECTED);
  return response;
}
