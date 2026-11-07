import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { adminClient, requireAuth } from '../middleware/requireAuth.js';
import { generateDayTask } from '../lib/dayTaskGenerator.js';
import { requestWorksheetJsonFromGemini } from '../lib/worksheetGenerator.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_COLUMNS = 'id,teacher_id,status,title,objectives,subject,grade_level,subject_id,academic_year,ai_generated';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const BODY_KEYS = new Set(['lessonPlanId', 'day', 'taskType', 'itemCount', 'typeCounts']);
const QUIZ_TYPES = ['multiple_choice', 'true_false', 'identification', 'enumeration'];

// ponytail: in-memory, so per server instance. A shared store is needed if duplicates across instances matter.
const activeGenerations = new Set();

const generationFailures = {
  PROVIDER_NOT_CONFIGURED: [503, 'AI generation is not configured on the server.'],
  PROVIDER_RATE_LIMIT: [429, 'The AI generation service is busy. Nothing was saved. Try again later.'],
  PROVIDER_DAILY_QUOTA: [429, 'The AI provider reported a daily quota limit. Wait for the quota to reset before trying again.'],
  PROVIDER_OVERLOADED: [503, 'The AI provider reported temporary overload. Nothing was saved. Try again later.'],
  PROVIDER_INTERRUPTED: [503, 'The AI request was interrupted and its outcome is unknown. Nothing was saved.'],
  PROVIDER_UNAVAILABLE: [503, 'The AI generation service is unavailable. Nothing was saved. Try again later.'],
  PROVIDER_REJECTED: [502, 'The AI generation service rejected this request. Ask the administrator to check the backend configuration.'],
  PROVIDER_AUTH_FAILED: [503, 'The AI provider credentials are invalid. Check backend configuration.'],
  PROVIDER_ACCESS_DENIED: [503, 'The AI provider denied access. Check backend configuration.'],
  PROVIDER_NETWORK: [503, 'The backend could not reach the AI generation service. Check its connectivity before trying again.'],
  PROVIDER_TIMEOUT: [504, 'The AI generation request timed out. Nothing was saved.'],
  PROVIDER_TRUNCATED: [502, 'The AI response ended before the task was complete. Nothing was saved. Try fewer items.'],
  PROVIDER_INVALID_RESPONSE: [502, 'The AI service returned an unusable response. Nothing was saved.'],
  AI_RESPONSE_INVALID: [502, 'The generated task was incomplete or invalid. Nothing was saved. Review the lesson plan or try again later.'],
  GENERATION_CANCELLED: [499, 'Task generation was cancelled. Nothing was saved.'],
};

const fail = (res, status, code, error) => res.status(status).json({ code, retryable: false, error });
const inRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

function parseQuizCounts(body) {
  const hasCount = Object.hasOwn(body, 'itemCount');
  if (!Object.hasOwn(body, 'typeCounts')) {
    const itemCount = hasCount ? body.itemCount : 10;
    if (!inRange(itemCount, 10, 20)) return null;
    const true_false = Math.floor(itemCount * 3 / 10);
    const identification = Math.floor(itemCount * 2 / 10);
    return { itemCount, typeCounts: { multiple_choice: itemCount - true_false - identification,
      true_false, identification, enumeration: 0 } };
  }
  const { typeCounts } = body;
  if (!typeCounts || typeof typeCounts !== 'object' || Array.isArray(typeCounts)
    || Object.keys(typeCounts).some(type => !QUIZ_TYPES.includes(type))
    || Object.values(typeCounts).some(count => !inRange(count, 0, 20))) return null;
  const sum = Object.values(typeCounts).reduce((total, count) => total + count, 0);
  if (!inRange(sum, 10, 20) || (hasCount && body.itemCount !== sum)) return null;
  return { itemCount: sum, typeCounts: Object.fromEntries(QUIZ_TYPES.map(type => [type, typeCounts[type] || 0])) };
}

function parseBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !BODY_KEYS.has(key))) return null;
  const { lessonPlanId, day, taskType } = body;
  if (typeof lessonPlanId !== 'string' || !UUID.test(lessonPlanId) || !DAYS.includes(day)) return null;
  // Lowercased so a differently cased UUID cannot slip past the in-flight guard.
  const task = { lessonPlanId: lessonPlanId.toLowerCase(), day, taskType };
  if (taskType === 'quiz') {
    const counts = parseQuizCounts(body);
    return counts && { ...task, ...counts };
  }
  if (Object.hasOwn(body, 'typeCounts')) return null;
  if (taskType === 'activity') return Object.hasOwn(body, 'itemCount') ? null : task;
  if (taskType !== 'assignment') return null;
  const itemCount = Object.hasOwn(body, 'itemCount') ? body.itemCount : 3;
  return inRange(itemCount, 1, 5) ? { ...task, itemCount, typeCounts: { essay: itemCount } } : null;
}

const defaultLoadPlan = async (id, teacherId) => {
  const { data, error } = await adminClient().from('lesson_plans').select(SOURCE_COLUMNS)
    .eq('id', id).eq('teacher_id', teacherId).maybeSingle();
  if (error) throw error;
  return data;
};

// Lazy, like the weekly draft routers in app.js: the resolver pulls in jsdom and
// a frontend module that should not be able to affect API startup.
const defaultResolveSource = async plan => {
  const { resolveWeeklyDraftSourceDays } = await import('../lib/weeklyDraftSourceResolver.js');
  return resolveWeeklyDraftSourceDays(plan);
};

// Read-only: returns a draft and writes nothing. Lesson text comes only from the
// saved row owned by this Teacher, never from the request.
export async function dayTaskHandler(req, res, { loadPlan = defaultLoadPlan, requestJson = requestWorksheetJsonFromGemini,
  resolveSource = defaultResolveSource, log = console } = {}) {
  const task = parseBody(req.body);
  if (!task) return fail(res, 400, 'INVALID_REQUEST', 'Check the selected lesson plan, day, and task options.');

  const operationKey = `${req.user.id}:${task.lessonPlanId}:${task.day}:${task.taskType}`;
  if (activeGenerations.has(operationKey)) {
    return fail(res, 409, 'GENERATION_IN_PROGRESS', 'This task is already being generated.');
  }
  activeGenerations.add(operationKey);
  const controller = new AbortController();
  res.on?.('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    let plan;
    try { plan = await loadPlan(task.lessonPlanId, req.user.id); } catch {
      log.error('[day-tasks] stage=plan-read code=PLAN_READ_UNAVAILABLE');
      return fail(res, 503, 'PLAN_READ_UNAVAILABLE', 'The backend could not read the saved lesson plan. Try again later.');
    }
    if (!plan || plan.id !== task.lessonPlanId || plan.teacher_id !== req.user.id
      || !['draft', 'published'].includes(plan.status)) {
      return fail(res, 404, 'SOURCE_NOT_FOUND', 'This saved lesson plan is unavailable.');
    }
    let days;
    try { days = await resolveSource(plan); } catch (error) {
      if (error?.code !== 'invalid_weekly_source') throw error;
      return fail(res, 422, 'INVALID_WEEKLY_SOURCE', 'The saved lesson plan has no complete weekly source.');
    }
    const source = days.find(entry => entry.day === task.day);
    return res.json(await generateDayTask({ plan, source, task, requestJson, signal: controller.signal }));
  } catch (error) {
    const known = typeof error?.code === 'string' && Object.hasOwn(generationFailures, error.code);
    const code = known ? error.code : 'GENERATION_UNEXPECTED';
    const [status, message] = known ? generationFailures[code]
      : [500, 'The backend could not complete task generation. Nothing was saved.'];
    // Only values this codebase produces are logged, never error.message or provider text.
    const detail = code === 'AI_RESPONSE_INVALID' ? ` category=${error.validation?.category} path=${error.validation?.path}` : '';
    log.error(`[day-tasks] stage=generation code=${code} taskType=${task.taskType} day=${task.day}${detail}`);
    return fail(res, status, code, message);
  } finally {
    activeGenerations.delete(operationKey);
  }
}

export function createDayTaskRouter({ auth = requireAuth(['teacher']) } = {}) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
    keyGenerator: req => req.user?.id || req.ip,
    message: { code: 'RATE_LIMITED', retryable: false, error: 'You have generated many tasks this hour. Try again later.' } });
  router.post('/', auth, limiter, (req, res) => dayTaskHandler(req, res));
  return router;
}
