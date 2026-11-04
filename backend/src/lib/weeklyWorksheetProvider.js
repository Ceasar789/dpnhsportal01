import { randomUUID } from 'node:crypto';
import { requestWorksheetJsonFromGemini, retryAfterSeconds } from './worksheetGenerator.js';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_PROVIDER_TIMEOUT_MS = 90_000;
const OPENAI_COMPATIBLE_PROVIDERS = {
  groq: { name: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY',
    maxTokensField: 'max_completion_tokens', schemaMode: model => model === DEFAULT_GROQ_MODEL },
  mistral: { name: 'mistral', baseUrl: 'https://api.mistral.ai/v1', apiKeyEnv: 'MISTRAL_API_KEY',
    schemaMode: () => true },
  nvidia: { name: 'nvidia', baseUrl: 'https://integrate.api.nvidia.com/v1', apiKeyEnv: 'NVIDIA_API_KEY',
    extraBody: () => ({ stream: false,
      ...(['0', '1'].includes(process.env.NVIDIA_ENABLE_THINKING)
        ? { chat_template_kwargs: { enable_thinking: process.env.NVIDIA_ENABLE_THINKING === '1' } } : {}) }) },
  cloudflare: { name: 'cloudflare', baseUrl: accountId => `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
    apiKeyEnv: 'CLOUDFLARE_API_TOKEN', accountIdEnv: 'CLOUDFLARE_ACCOUNT_ID',
    responseFormat: false, maxTokensField: 'max_tokens' },
};
let invalidReasoningEffortWarned = false;
const providerError = (code, message, details = {}) => Object.assign(new Error(message), { code, ...details });
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const finishReason = value => ['stop', 'length', 'content_filter', 'tool_calls', 'function_call'].includes(value)
  ? value.toUpperCase() : 'UNKNOWN';
const tokenHeader = value => typeof value === 'string' && /^\d+$/.test(value.trim())
  ? nonnegativeInteger(Number(value.trim())) : undefined;
const safeErrorLabel = (value, prompt, apiKey, accountId) => typeof value === 'string'
  && /^[a-z][a-z0-9_.-]{0,63}$/i.test(value)
  && !prompt.toLowerCase().includes(value.toLowerCase().replace(/[_-]+/g, ' '))
  && !apiKey.toLowerCase().includes(value.toLowerCase())
  && (!accountId || !value.toLowerCase().includes(accountId.toLowerCase())) ? value : undefined;
const safeErrorReason = (value, prompt, apiKey) => {
  if (typeof value !== 'string' || /["'`<>{}\r\n]|\[|\]|\\|https?:\/\/|api.?key|authorization|bearer/i.test(value)) return undefined;
  const reason = value.trim().replace(/\s+/g, ' ').slice(0, 200);
  if (!reason || !/^[a-z0-9 .,;:!?()/_-]+$/i.test(reason) || /[a-z0-9_-]{24,}/i.test(reason)) return undefined;
  const requestWords = new Set(`${prompt} ${apiKey}`.toLowerCase().match(/[a-z0-9]{4,}/g) || []);
  return (reason.toLowerCase().match(/[a-z0-9]{4,}/g) || []).some(word => requestWords.has(word))
    ? undefined : reason;
};
const resetMilliseconds = value => {
  const text = typeof value === 'string' ? value.trim() : '';
  const millisecondsMatch = /^(\d+(?:\.\d+)?)ms$/.exec(text);
  const secondsMatch = /^(?:(\d+)m)?(\d+(?:\.\d+)?)s$/.exec(text);
  const milliseconds = millisecondsMatch ? Math.ceil(Number(millisecondsMatch[1]))
    : secondsMatch ? Math.ceil((Number(secondsMatch[1] || 0) * 60 + Number(secondsMatch[2])) * 1000) : undefined;
  return Number.isSafeInteger(milliseconds) && milliseconds > 0 ? milliseconds : undefined;
};
export const weeklyProviderTimeoutMs = () => {
  const value = process.env.WEEKLY_WORKSHEET_PROVIDER_TIMEOUT_MS;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return DEFAULT_PROVIDER_TIMEOUT_MS;
  const milliseconds = Number(value.trim());
  return Number.isSafeInteger(milliseconds) && milliseconds >= 1_000 && milliseconds <= 600_000
    ? milliseconds : DEFAULT_PROVIDER_TIMEOUT_MS;
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

export function parseWeeklyWorksheetProviders(value) {
  if (typeof value !== 'string' || !value.trim())
    throw providerError('PROVIDER_NOT_CONFIGURED', 'The weekly provider chain is invalid.');
  return value.split(',').map(part => {
    const entry = part.trim();
    const separator = entry.indexOf(':');
    const name = entry.slice(0, separator).toLowerCase();
    const model = entry.slice(separator + 1);
    if (separator < 1 || !/^[a-z][a-z0-9_-]*$/.test(name)
      || !/^[@a-z0-9._/-]+$/i.test(model)
      || !Object.hasOwn(OPENAI_COMPATIBLE_PROVIDERS, name) || /gemini/i.test(model))
      throw providerError('PROVIDER_NOT_CONFIGURED', 'The weekly provider chain is invalid.');
    return { name, model };
  });
}

export const weeklyProviderKeyEnv = name => Object.hasOwn(OPENAI_COMPATIBLE_PROVIDERS, name)
  ? OPENAI_COMPATIBLE_PROVIDERS[name].apiKeyEnv : undefined;
export const weeklyProviderAccountIdEnv = name => Object.hasOwn(OPENAI_COMPATIBLE_PROVIDERS, name)
  ? OPENAI_COMPATIBLE_PROVIDERS[name].accountIdEnv : undefined;

// Backend .env is loaded before this module; reject unsupported providers at startup.
if (process.env.WEEKLY_WORKSHEET_PROVIDERS !== undefined)
  parseWeeklyWorksheetProviders(process.env.WEEKLY_WORKSHEET_PROVIDERS);

export const configuredWeeklyWorksheetProviders = () => {
  if (process.env.WEEKLY_WORKSHEET_PROVIDERS === undefined) return null;
  return parseWeeklyWorksheetProviders(process.env.WEEKLY_WORKSHEET_PROVIDERS);
};

export async function requestOpenAICompatibleWorksheetJson(prompt, { provider, model, apiKey,
  accountId: suppliedAccountId,
  fetchImpl = fetch, maxOutputTokens = 4096, responseSchema, signal, onGroqUsage,
  onHttpStatus, onFinishReason, onRequestMetadata, operationId = randomUUID(), log = console } = {}) {
  const definition = Object.hasOwn(OPENAI_COMPATIBLE_PROVIDERS, provider)
    ? OPENAI_COMPATIBLE_PROVIDERS[provider] : undefined;
  if (!apiKey || !definition || !model || /gemini/i.test(model))
    throw providerError('PROVIDER_NOT_CONFIGURED', 'The weekly provider is unavailable.');
  const accountId = definition.accountIdEnv
    ? (suppliedAccountId ?? process.env[definition.accountIdEnv])?.trim() : undefined;
  if (definition.accountIdEnv && !/^[0-9a-f]{32}$/i.test(accountId || ''))
    throw providerError('PROVIDER_NOT_CONFIGURED', 'The weekly provider is unavailable.');
  const schemaMode = definition.schemaMode?.(model);
  const requestedEffort = provider === 'groq' && model === 'openai/gpt-oss-120b'
    ? process.env.GROQ_REASONING_EFFORT?.trim().toLowerCase() : undefined;
  const reasoningEffort = ['low', 'medium', 'high'].includes(requestedEffort) ? requestedEffort : undefined;
  if (requestedEffort && !reasoningEffort && !invalidReasoningEffortWarned) {
    invalidReasoningEffortWarned = true;
    log.warn?.(`[weekly-worksheets] operation=${operationId} code=invalid_groq_reasoning_effort`);
  }
  const responseFormat = schemaMode ? { type: 'json_schema', json_schema: {
    name: 'weekly_worksheet_batch', strict: true, schema: groqSchema(responseSchema),
  } } : { type: 'json_object' };
  const extraBody = definition.extraBody?.();
  let outputTokens = maxOutputTokens;
  if (provider === 'cloudflare') {
    outputTokens = 4096;
    const setting = process.env.CLOUDFLARE_MAX_TOKENS;
    if (setting !== undefined) {
      const parsed = /^\d+$/.test(setting) ? Number(setting) : NaN;
      if (Number.isSafeInteger(parsed) && parsed >= 512 && parsed <= 16384) outputTokens = parsed;
      else log.warn?.(`[weekly-worksheets] operation=${operationId} provider=cloudflare code=invalid_cloudflare_max_tokens`);
    }
  }
  if (provider === 'nvidia') onRequestMetadata?.({ thinking: extraBody?.chat_template_kwargs
    ? String(extraBody.chat_template_kwargs.enable_thinking) : 'unset' });
  let response;
  try {
    const baseUrl = typeof definition.baseUrl === 'function' ? definition.baseUrl(accountId) : definition.baseUrl;
    response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(weeklyProviderTimeoutMs())])
        : AbortSignal.timeout(weeklyProviderTimeoutMs()),
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }],
        ...(definition.maxTokensField === null ? {} : { [definition.maxTokensField || 'max_tokens']: outputTokens }),
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        ...(definition.responseFormat === false ? {} : { response_format: responseFormat }),
        ...extraBody }),
    });
  } catch (error) {
    if (signal?.aborted) throw providerError('GENERATION_CANCELLED', 'Worksheet generation was cancelled.');
    throw providerError(error?.name === 'TimeoutError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_INTERRUPTED',
      'The worksheet provider request was interrupted.');
  }
  onHttpStatus?.(response.status);
  if (!response.ok) {
    const code = response.status === 401 ? 'PROVIDER_AUTH_FAILED'
      : response.status === 403 ? 'PROVIDER_ACCESS_DENIED'
        : response.status === 429 ? 'PROVIDER_RATE_LIMIT'
          : response.status === 503 ? 'PROVIDER_OVERLOADED'
            : response.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_REJECTED';
    const retryAfter = retryAfterSeconds(response);
    let failure;
    try { failure = (await response.json())?.error; } catch { /* Never expose provider bodies. */ }
    const providerErrorCode = [...new Set([safeErrorLabel(failure?.code, prompt, apiKey, accountId),
      safeErrorLabel(failure?.type, prompt, apiKey, accountId)])].filter(Boolean).join('/') || undefined;
    const providerErrorReason = safeErrorReason(failure?.message, prompt, apiKey);
    const resetTokensMs = resetMilliseconds(response.headers?.get?.('x-ratelimit-reset-tokens'));
    const resetRequestsMs = resetMilliseconds(response.headers?.get?.('x-ratelimit-reset-requests'));
    throw providerError(code, 'The worksheet provider rejected a batch.', {
      httpStatus: response.status,
      ...(retryAfter ? { retryAfterSeconds: retryAfter } : {}),
      ...(resetTokensMs ? { resetTokensMs } : {}),
      ...(resetRequestsMs ? { resetRequestsMs } : {}),
      ...(providerErrorCode ? { providerErrorCode } : {}),
      ...(providerErrorReason ? { providerErrorReason } : {}),
    });
  }
  let data;
  try { data = await response.json(); }
  catch { throw providerError('PROVIDER_INVALID_RESPONSE', 'Worksheet provider returned unreadable JSON.'); }
  onGroqUsage?.({ remainingTokens: tokenHeader(response.headers?.get?.('x-ratelimit-remaining-tokens')),
    resetTokensMs: resetMilliseconds(response.headers?.get?.('x-ratelimit-reset-tokens')),
    promptTokens: nonnegativeInteger(data?.usage?.prompt_tokens),
    completionTokens: nonnegativeInteger(data?.usage?.completion_tokens),
    totalTokens: nonnegativeInteger(data?.usage?.total_tokens),
    reasoningTokens: nonnegativeInteger(data?.usage?.completion_tokens_details?.reasoning_tokens)
      ?? nonnegativeInteger(data?.usage?.reasoning_tokens) });
  const choice = data?.choices?.[0];
  onFinishReason?.(finishReason(choice?.finish_reason));
  if (choice?.finish_reason === 'length') throw providerError('PROVIDER_TRUNCATED',
    'Worksheet provider ran out of output space.', { finishReason: 'LENGTH' });
  if (choice?.finish_reason !== 'stop' || typeof choice?.message?.content !== 'string'
    || !choice.message.content.trim())
    throw providerError('PROVIDER_INVALID_RESPONSE', 'Worksheet provider did not finish a usable batch.');
  return choice.message.content;
}

export async function requestWorksheetJsonFromGroq(prompt, { fetchImpl = fetch, apiKey = process.env.GROQ_API_KEY,
  model = process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL, maxOutputTokens = 4096, responseSchema, signal,
  onGroqUsage, onFinishReason, operationId = randomUUID(), log = console } = {}) {
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
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(weeklyProviderTimeoutMs())])
        : AbortSignal.timeout(weeklyProviderTimeoutMs()),
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
    let failure;
    try { failure = (await response.json())?.error; } catch { /* Unreadable provider bodies are never logged. */ }
    const providerErrorCode = [...new Set([safeErrorLabel(failure?.code, prompt, apiKey),
      safeErrorLabel(failure?.type, prompt, apiKey)])]
      .filter(Boolean).join('/') || undefined;
    const providerErrorReason = safeErrorReason(failure?.message, prompt, apiKey);
    const resetTokensMs = resetMilliseconds(response.headers?.get?.('x-ratelimit-reset-tokens'));
    const resetRequestsMs = resetMilliseconds(response.headers?.get?.('x-ratelimit-reset-requests'));
    throw providerError(code, 'Groq could not complete worksheet generation.',
      { ...(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
        ? { httpStatus: response.status } : {}), ...(retryAfter ? { retryAfterSeconds: retryAfter } : {}),
      ...(resetTokensMs ? { resetTokensMs } : {}),
      ...(resetRequestsMs ? { resetRequestsMs } : {}),
      ...(providerErrorCode ? { providerErrorCode } : {}),
      ...(providerErrorReason ? { providerErrorReason } : {}) });
  }
  let data;
  try { data = await response.json(); }
  catch { throw providerError('PROVIDER_INVALID_RESPONSE', 'Groq returned an unreadable response.'); }
  const choice = data?.choices?.[0];
  onFinishReason?.(finishReason(choice?.finish_reason));
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
    reasoningTokens: nonnegativeInteger(data?.usage?.completion_tokens_details?.reasoning_tokens)
      ?? nonnegativeInteger(data?.usage?.reasoning_tokens) });
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
