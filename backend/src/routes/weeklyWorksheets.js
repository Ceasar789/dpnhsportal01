import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { requireAuth, adminClient } from '../middleware/requireAuth.js';
import { generateWeeklyWorksheetDrafts, validateWeeklySources, WEEKLY_QUESTION_COUNTS } from '../lib/weeklyWorksheetGenerator.js';

const router = Router();
const activeGenerations = new Set();
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-7',
  legacyHeaders: false, keyGenerator: req => req.user?.id || req.ip });

const sourceText = html => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&(?:amp|lt|gt|quot|nbsp|#39);/gi, entity => ({
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&nbsp;': ' ', '&#39;': "'",
  })[entity.toLowerCase()] || entity).replace(/\s+/g, ' ').trim().toLocaleLowerCase();
const compact = value => value.replace(/\s+/g, '').toLocaleLowerCase();

const generationFailures = {
  PROVIDER_NOT_CONFIGURED: [503, 'AI generation is not configured on the local backend.', false],
  PROVIDER_RATE_LIMIT: [429, 'The AI generation service is busy. Check backend status before starting another generation.', false],
  PROVIDER_DAILY_QUOTA: [429, 'The AI provider reported a daily quota limit. Wait for the provider quota to reset before starting another generation.', false],
  PROVIDER_OVERLOADED: [503, 'The AI provider reported temporary overload. Check backend status before starting another generation.', false],
  PROVIDER_INTERRUPTED: [503, 'The AI request was interrupted and its provider outcome is unknown. Check backend status before starting another generation.', false],
  PROVIDER_UNAVAILABLE: [503, 'The AI generation service is unavailable. Check backend status before starting another request.', false],
  PROVIDER_REJECTED: [502, 'The AI generation service rejected this request. Ask the administrator to check the backend configuration.', false],
  PROVIDER_AUTH_FAILED: [503, 'The selected AI provider credentials are invalid. Check backend configuration.', false],
  PROVIDER_ACCESS_DENIED: [503, 'The selected AI provider denied access. Check backend configuration.', false],
  PROVIDER_NETWORK: [503, 'The backend could not reach the AI generation service. Check backend connectivity before trying again.', false],
  PROVIDER_TIMEOUT: [504, 'The AI generation request timed out. Check backend logs before starting another request.', false],
  PROVIDER_TRUNCATED: [502, 'The AI response ended before five worksheets were complete. Review the source plan and try again later.', false],
  PROVIDER_INVALID_RESPONSE: [502, 'The AI service returned an unusable response. Nothing was saved.', false],
  AI_RESPONSE_INVALID: [502, 'A daily worksheet was incomplete or invalid. Nothing was saved. Review the source plan or choose fewer questions.', false],
  GENERATION_CANCELLED: [499, 'Worksheet generation was cancelled. Nothing was saved.', false],
};

// Read-only generation. The selected saved row and Teacher ownership come from
// the server; no worksheet or collection persistence is activated here.
export async function weeklyWorksheetHandler(req, res, { loadPlan = async (id, teacherId) => {
  const { data, error } = await adminClient().from('lesson_plans').select('*')
    .eq('id', id).eq('teacher_id', teacherId).maybeSingle();
  if (error) throw error;
  return data;
}, generate = generateWeeklyWorksheetDrafts, log = console } = {}) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.VERCEL_ENV) return res.status(503).json({
    code: 'GENERATION_WORKER_DISABLED', retryable: false,
    error: 'Durable Worksheet generation is not available yet. No Worksheets were saved.',
  });
  const operationId = randomUUID();
  const localClient = process.env.NODE_ENV === 'development' && !process.env.VERCEL && !process.env.VERCEL_ENV
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
  const { lessonPlanId, sourceHtml, days, questionCount = 30 } = req.body || {};
  if (!req.user?.id || typeof lessonPlanId !== 'string' || !lessonPlanId || typeof sourceHtml !== 'string') {
    return res.status(400).json({ code: 'SOURCE_INVALID', retryable: false, error: 'Select a saved AI lesson plan.' });
  }
  if (!WEEKLY_QUESTION_COUNTS.includes(questionCount)) return res.status(400).json({ code: 'QUESTION_COUNT_INVALID', retryable: false,
    error: 'Choose 20, 30, or 40 questions per day.' });
  let sources;
  try { sources = validateWeeklySources(days); }
  catch (error) { return res.status(422).json({ code: 'SOURCE_INCOMPLETE', retryable: false, error: error.message }); }
  let plan;
  try { plan = await loadPlan(lessonPlanId, req.user.id); }
  catch {
    log.error(`[weekly-worksheets] operation=${operationId} stage=plan-read code=PLAN_READ_UNAVAILABLE`);
    return res.status(503).json({ code: 'PLAN_READ_UNAVAILABLE', retryable: false,
      error: 'The backend could not read the saved lesson plan. Check its connection and try again later.' });
  }
  let providerCalls = 0;
  try {
    if (!plan) return res.status(404).json({ code: 'SOURCE_NOT_FOUND', retryable: false,
      error: 'This saved lesson plan is unavailable.' });
    if (plan.teacher_id !== req.user.id || plan.ai_generated !== true
      || plan.objectives !== sourceHtml || !plan.title?.trim()) {
      return res.status(409).json({ code: 'SOURCE_CHANGED', retryable: false,
        error: 'The saved AI lesson plan changed. Reopen it before generating worksheets.' });
    }
    const actualText = compact(sourceText(plan.objectives));
    if (sources.some(day => [day.objective, day.activity, day.assessment, day.competency].filter(Boolean)
      .some(value => !actualText.includes(compact(value))))) {
      return res.status(422).json({ code: 'SOURCE_MISMATCH', retryable: false,
        error: 'A daily objective, activity, or assessment is absent from the saved lesson plan.' });
    }
    const operationKey = `${req.user.id}:${plan.id}`;
    if (activeGenerations.has(operationKey)) return res.status(409).json({ code: 'GENERATION_IN_PROGRESS', retryable: false,
      error: 'Worksheet generation is already running for this plan.' });
    activeGenerations.add(operationKey);
    const controller = new AbortController();
    res.on?.('close', () => { if (!res.writableEnded) controller.abort(); });
    let worksheets;
    const plannedCalls = 5 * questionCount / 10;
    try { worksheets = await generate(plan, sources, { questionCount, signal: controller.signal,
      operationId, log, debugCapture: localClient,
      progress: ({ day, batch, completed, providerCalls: calls }) => {
        providerCalls = calls;
        log.info?.(`[weekly-worksheets] operation=${operationId} stage=generation day=${day} batch=${batch} progress=${completed ? 'completed' : 'started'} providerCalls=${calls} plannedCalls=${plannedCalls}`);
      } }); }
    catch (error) { error.providerCalls ??= providerCalls; throw error; }
    finally { activeGenerations.delete(operationKey); }
    if (!Array.isArray(worksheets) || worksheets.length !== 5 || worksheets.some((draft, index) =>
      draft?.day !== ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][index]
      || draft.questions?.length !== questionCount)) throw Object.assign(new Error('Incomplete daily output'), {
      code: 'AI_RESPONSE_INVALID', validation: { category: 'question_count', path: 'questions' },
    });
    return res.json({ status: 'generated-weekly-drafts', saved: false, questionCount, providerCalls,
      sourceLessonPlanId: plan.id, worksheets });
  } catch (error) {
    const code = Object.hasOwn(generationFailures, error?.code) ? error.code : 'GENERATION_UNEXPECTED';
    const [status, message, retryable] = generationFailures[code]
      || [500, 'The backend could not complete worksheet generation. Check backend logs before retrying.', false];
    const detail = error?.validation;
    const safeCategories = new Set(['syntax', 'incomplete_weekdays', 'missing_required', 'invalid_field',
      'unsupported_question_type', 'invalid_answer_key', 'invalid_essay', 'duplicate_question', 'question_count', 'content_coverage', 'type_distribution', 'pacing_deadline']);
    const safeCategory = safeCategories.has(detail?.category) ? detail.category : 'unknown';
    const safePath = typeof detail?.path === 'string' && /^(?:\$|title|directions|(?:questions|days\[[0-4]\]\.questions)(?:\[\d{1,2}\])?(?:\.(?:question|item_type|points|options|correct_answer|enumeration|essay))?)$/.test(detail.path)
      ? detail.path : 'unknown';
    const safeSubreason = (safeCategory === 'invalid_field' && /^questions\[\d{1,2}\]\.enumeration$/.test(safePath)
      && ['metadata_shape', 'alternatives_shape', 'order_sensitive_type', 'alternative_text',
        'alternative_answer_count'].includes(detail?.subreason))
      || (safeCategory === 'invalid_answer_key' && /^questions\[\d{1,2}\]\.correct_answer$/.test(safePath)
        && detail?.subreason === 'enumeration_answer_missing')
      || (safeCategory === 'duplicate_question'
        && ((/^questions\[\d{1,2}\]\.question$/.test(safePath) && detail?.subreason === 'duplicate_within_batch')
          || (safePath === 'questions' && ['duplicate_prior_batch', 'duplicate_cross_day'].includes(detail?.subreason))))
      ? detail.subreason : undefined;
    const safeDayValue = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(detail?.day) ? detail.day : undefined;
    const safeDay = safeDayValue ? ` day=${safeDayValue}` : '';
    const diagnostic = ` category=${safeCategory} path=${safePath}${safeDay}`
      + (Number.isInteger(detail?.requestedCount) ? ` requested=${detail.requestedCount}` : ` requested=${questionCount}`)
      + (Number.isInteger(detail?.actualDays) ? ` actualDays=${detail.actualDays}` : '');
    const safeFinishReason = ['MAX_TOKENS', 'LENGTH', 'SAFETY', 'RECITATION', 'OTHER', 'STOP'].includes(error?.finishReason)
      ? error.finishReason : undefined;
    const finish = safeFinishReason ? ` finishReason=${safeFinishReason}` : '';
    const safeBatch = Number.isInteger(detail?.batch) && detail.batch >= 1 && detail.batch <= 4 ? detail.batch : undefined;
    const batch = safeBatch ? ` batch=${safeBatch}` : '';
    const safeDuplicates = ['duplicate_within_batch', 'duplicate_prior_batch'].includes(safeSubreason)
      && Number.isInteger(detail?.duplicateCount) && detail.duplicateCount >= 1 && detail.duplicateCount <= 10
      && Array.isArray(detail?.duplicates) && detail.duplicates.length === detail.duplicateCount
      && detail.duplicates.every(item => ['multiple_choice', 'true_false', 'enumeration', 'essay'].includes(item?.item_type)
        && Number.isInteger(item.normalizedLength) && item.normalizedLength >= 1 && item.normalizedLength <= 2000
        && Number.isInteger(item.batchIndex) && item.batchIndex >= 0 && item.batchIndex < 10
        && Number.isInteger(item.priorIndex) && item.priorIndex >= 0
        && (safeSubreason === 'duplicate_within_batch' ? item.priorIndex < item.batchIndex
          : safeBatch && item.priorIndex < (safeBatch - 1) * 10))
      ? { duplicateCount: detail.duplicateCount,
        duplicates: detail.duplicates.map(item => ({ item_type: item.item_type,
          normalizedLength: item.normalizedLength, batchIndex: item.batchIndex, priorIndex: item.priorIndex })) }
      : undefined;
    const safeReceivedCount = Number.isInteger(detail?.receivedCount) && detail.receivedCount >= 0 && detail.receivedCount <= 40
      ? detail.receivedCount : undefined;
    const received = safeReceivedCount !== undefined ? ` received=${safeReceivedCount}` : '';
    const validated = Number.isInteger(detail?.validatedCount) && detail.validatedCount >= 0 && detail.validatedCount <= 40
      ? ` validated=${detail.validatedCount}` : '';
    const questionType = ['multiple_choice', 'true_false', 'enumeration', 'essay', 'identification'].includes(detail?.questionType)
      ? ` questionType=${detail.questionType}` : '';
    const truncated = code === 'PROVIDER_TRUNCATED' || detail?.appearsTruncated === true ? ' truncated=true' : ' truncated=false';
    providerCalls = Number.isInteger(error?.providerCalls) ? error.providerCalls : providerCalls;
    const retryAfterSeconds = Number.isInteger(error?.retryAfterSeconds) && error.retryAfterSeconds > 0
      && error.retryAfterSeconds <= 86400 ? error.retryAfterSeconds : undefined;
    log.error(`[weekly-worksheets] operation=${operationId} stage=generation code=${code}${diagnostic}${safeSubreason ? ` subreason=${safeSubreason}` : ''}${batch}${received}${validated}${questionType}${finish}${truncated} providerCalls=${providerCalls}`);
    if (retryAfterSeconds) res.set?.('Retry-After', String(retryAfterSeconds));
    return res.status(status).json({ code, retryable, ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
      providerCalls, error: code === 'AI_RESPONSE_INVALID' && safeDay
      ? `${detail.day}: ${detail.category === 'content_coverage'
        ? `The ILAW content did not support ${questionCount} distinct questions. Review this day or choose fewer questions. Nothing was saved.`
        : `Worksheet could not be completed because the generated questions failed validation${batch ? ` in batch ${detail.batch}` : ''}. Nothing was saved.`}` : message,
      questionCount, operationId,
      ...((code === 'AI_RESPONSE_INVALID' || (code === 'PROVIDER_TIMEOUT' && safeCategory === 'pacing_deadline'))
        && localClient
        ? { diagnostic: { ...(safeDayValue ? { day: safeDayValue } : {}),
          ...(safeBatch ? { batch: safeBatch } : {}), category: safeCategory, path: safePath,
          ...(safeSubreason ? { subreason: safeSubreason } : {}),
          ...(safeDuplicates || {}),
          ...(Number.isInteger(detail?.requestedCount) && detail.requestedCount >= 1 && detail.requestedCount <= 40
            ? { requestedCount: detail.requestedCount } : {}),
          ...(safeReceivedCount !== undefined ? { receivedCount: safeReceivedCount } : {}),
          ...(safeFinishReason ? { finishReason: safeFinishReason } : {}) } } : {}) });
  }
}

router.post('/weekly-worksheets', requireAuth(['teacher']), limiter, (req, res) => weeklyWorksheetHandler(req, res));

export default router;
