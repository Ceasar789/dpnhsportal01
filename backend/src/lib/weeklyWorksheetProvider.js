import { randomUUID } from 'node:crypto';
import { requestWorksheetJsonFromGemini, retryAfterSeconds } from './worksheetGenerator.js';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
let invalidReasoningEffortWarned = false;
const providerError = (code, message, details = {}) => Object.assign(new Error(message), { code, ...details });
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const tokenHeader = value => typeof value === 'string' && /^\d+$/.test(value.trim())
  ? nonnegativeInteger(Number(value.trim())) : undefined;
const resetMilliseconds = value => {
  const text = typeof value === 'string' ? value.trim() : '';
  const millisecondsMatch = /^(\d+(?:\.\d+)?)ms$/.exec(text);
  const secondsMatch = /^(?:(\d+)m)?(\d+(?:\.\d+)?)s$/.exec(text);
  const milliseconds = millisecondsMatch ? Math.ceil(Number(millisecondsMatch[1]))
    : secondsMatch ? Math.ceil((Number(secondsMatch[1] || 0) * 60 + Number(secondsMatch[2])) * 1000) : undefined;
  return Number.isSafeInteger(milliseconds) && milliseconds > 0 ? milliseconds : undefined;
};

// Groq strict mode requires every object field and represents optional fields as nullable.
const groqSchema = (source, optional = false) => {
  let converted;
  if (source?.type === 'OBJECT') {
    const properties = Object.fromEntries(Object.entries(source.properties || {}).map(([name, field]) =>
      [name, groqSchema(field, !source.required?.includes(name))]));
    converted = { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
  } else if (source?.type === 'ARRAY' && source.items) {
    converted = { type: 'array', items: groqSchema(source.items) };
  } else {
    const type = { STRING: 'string', NUMBER: 'number', INTEGER: 'integer', BOOLEAN: 'boolean' }[source?.type];
    if (!type) throw providerError('PROVIDER_NOT_CONFIGURED', 'The Groq worksheet schema is unavailable.');
    converted = { type, ...(source.enum ? { enum: source.enum } : {}) };
  }
  return optional ? { anyOf: [converted, { type: 'null' }] } : converted;
};

export async function requestWorksheetJsonFromGroq(prompt, { fetchImpl = fetch, apiKey = process.env.GROQ_API_KEY,
  model = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL, maxOutputTokens = 4096, responseSchema, signal,
  onGroqUsage, operationId = randomUUID(), log = console } = {}) {
  if (!apiKey) throw providerError('PROVIDER_NOT_CONFIGURED', 'Groq is not configured on the backend.');
  const schema = groqSchema(responseSchema);
  const requestedEffort = process.env.GROQ_REASONING_EFFORT?.trim().toLowerCase();
  const reasoningEffort = ['low', 'medium', 'high'].includes(requestedEffort) ? requestedEffort : undefined;
  if (requestedEffort && !reasoningEffort && !invalidReasoningEffortWarned) {
    invalidReasoningEffortWarned = true;
    log.warn?.(`[weekly-worksheets] operation=${operationId} code=invalid_groq_reasoning_effort`);
  }
  let response;
  try {
    response = await fetchImpl(GROQ_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: maxOutputTokens,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        response_format: { type: 'json_schema', json_schema: {
          name: 'weekly_worksheet_batch', strict: true, schema,
        } },
      }),
    });
  } catch (error) {
    if (signal?.aborted) throw providerError('GENERATION_CANCELLED', 'Worksheet generation was cancelled.');
    throw providerError(error?.name === 'TimeoutError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_INTERRUPTED',
      'The Groq request was interrupted. Its provider outcome is unknown.');
  }
  if (!response.ok) {
    const code = response.status === 401 ? 'PROVIDER_AUTH_FAILED'
      : response.status === 403 ? 'PROVIDER_ACCESS_DENIED'
        : response.status === 429 ? 'PROVIDER_RATE_LIMIT'
          : response.status === 503 ? 'PROVIDER_OVERLOADED'
            : response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_REJECTED';
    const retryAfter = retryAfterSeconds(response);
    throw providerError(code, 'Groq could not complete worksheet generation.',
      retryAfter ? { retryAfterSeconds: retryAfter } : {});
  }
  let data;
  try { data = await response.json(); }
  catch { throw providerError('PROVIDER_INVALID_RESPONSE', 'Groq returned an unreadable response.'); }
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === 'length') throw providerError('PROVIDER_TRUNCATED',
    'Groq ran out of space while generating the worksheet.', { finishReason: 'LENGTH' });
  if (choice?.finish_reason !== 'stop' || typeof choice?.message?.content !== 'string') {
    throw providerError('PROVIDER_INVALID_RESPONSE', 'Groq did not finish a usable worksheet.');
  }
  onGroqUsage?.({ remainingTokens: tokenHeader(response.headers?.get?.('x-ratelimit-remaining-tokens')),
    resetTokensMs: resetMilliseconds(response.headers?.get?.('x-ratelimit-reset-tokens')),
    promptTokens: nonnegativeInteger(data?.usage?.prompt_tokens),
    completionTokens: nonnegativeInteger(data?.usage?.completion_tokens),
    totalTokens: nonnegativeInteger(data?.usage?.total_tokens),
    reasoningTokens: nonnegativeInteger(data?.usage?.completion_tokens_details?.reasoning_tokens) });
  return choice.message.content;
}

export const isLocalGroqProvider = () => process.env.WEEKLY_WORKSHEET_PROVIDER === 'groq'
  && process.env.NODE_ENV === 'development' && !process.env.VERCEL && !process.env.VERCEL_ENV;

export async function requestWeeklyWorksheetJson(prompt, options) {
  const provider = process.env.WEEKLY_WORKSHEET_PROVIDER || 'gemini';
  if (provider === 'gemini') return requestWorksheetJsonFromGemini(prompt, options);
  if (isLocalGroqProvider()) return requestWorksheetJsonFromGroq(prompt, options);
  throw providerError('PROVIDER_NOT_CONFIGURED', 'The selected worksheet provider is unavailable.');
}
