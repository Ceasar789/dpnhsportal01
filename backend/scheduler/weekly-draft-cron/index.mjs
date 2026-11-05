// Proposed five-minute sweep: 288 nominal ticks per day, one GET per tick.
// Duplicate scheduled deliveries could exceed that count; DB claims stay authoritative.
// A submitted job waits for a tick; Cron does not promise an immediate start.
// To disable after deployment, set triggers.crons to [] and redeploy. Omitting
// the property leaves deployed triggers unchanged. Neither action is done here.
export const WORKER_URL = 'https://eduscribe-dnhs-portal.vercel.app/api/internal/weekly-draft-worker';
export const REQUEST_TIMEOUT_MS = 130_000; // Above Vercel's configured 120-second function maximum.
const MAX_RESPONSE_BYTES = 128;
const SAFE_STATUSES = new Set(['idle', 'no_claim', 'canceled', 'stale',
  'not_dispatched', 'checkpointed', 'completed', 'not_completed']);

class CronTickError extends Error {
  constructor(code) {
    super(`Weekly draft cron stopped: ${code}.`);
    this.name = 'CronTickError';
    this.code = code;
  }
}

function validateEndpoint(endpoint) {
  let url;
  try { url = new URL(endpoint); }
  catch { throw new CronTickError('configuration'); }
  if (typeof endpoint !== 'string' || endpoint !== WORKER_URL || url.href !== WORKER_URL
    || url.protocol !== 'https:' || url.hostname !== 'eduscribe-dnhs-portal.vercel.app'
    || url.port || url.username || url.password
    || url.pathname !== '/api/internal/weekly-draft-worker' || url.search || url.hash) {
    throw new CronTickError('configuration');
  }
  return url.href;
}

function validateSecret(env) {
  const secret = env?.WEEKLY_DRAFT_WORKER_SECRET;
  if (typeof secret !== 'string' || !secret || /\s/.test(secret)
    || new TextEncoder().encode(secret).byteLength > 1024) {
    throw new CronTickError('configuration');
  }
  return secret;
}

async function readBoundedStatus(response) {
  if (!response || response.redirected !== false || response.status !== 200)
    throw new CronTickError('http_error');
  const reader = response.body?.getReader?.();
  if (!reader) throw new CronTickError('malformed_response');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new CronTickError('malformed_response');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let payload;
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new CronTickError('malformed_response'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || Object.keys(payload).length !== 1 || typeof payload.status !== 'string')
    throw new CronTickError('malformed_response');
  if (payload.status === 'failed') throw new CronTickError('terminal_failed');
  if (!SAFE_STATUSES.has(payload.status)) throw new CronTickError('malformed_response');
  return payload.status;
}

export async function runWeeklyDraftCronTick({ env, endpoint = WORKER_URL,
  fetchImpl = globalThis.fetch, clock = globalThis } = {}) {
  const url = validateEndpoint(endpoint);
  const secret = validateSecret(env);
  if (typeof fetchImpl !== 'function' || typeof clock?.setTimeout !== 'function'
    || typeof clock?.clearTimeout !== 'function') throw new CronTickError('configuration');

  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = clock.setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new CronTickError('timeout'));
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    const request = (async () => {
      const response = await fetchImpl(url, {
        method: 'GET', redirect: 'manual', cache: 'no-store',
        headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
        signal: controller.signal,
      });
      return readBoundedStatus(response);
    })();
    return { status: await Promise.race([request, timeout]) };
  } catch (error) {
    if (timedOut) throw new CronTickError('timeout');
    if (error instanceof CronTickError) throw error;
    throw new CronTickError('transport_uncertain');
  } finally {
    clock.clearTimeout(timer);
  }
}

export function createWeeklyDraftCronHandler({ endpoint = WORKER_URL,
  fetchImpl = globalThis.fetch, clock = globalThis, logger = console } = {}) {
  validateEndpoint(endpoint); // Validate the fixed production target at construction.
  return Object.freeze({
    async scheduled(controller, env) {
      try {
        const result = await runWeeklyDraftCronTick({ env, endpoint, fetchImpl, clock });
        try { logger.info?.(`Weekly draft cron: ${result.status}.`); }
        catch { /* Diagnostics must not alter job processing. */ }
      } catch (error) {
        const code = error instanceof CronTickError ? error.code : 'unexpected';
        try { controller?.noRetry?.(); }
        catch { /* The database still decides whether later ticks can claim work. */ }
        try { logger.error?.(`Weekly draft cron stopped: ${code}.`); }
        catch { /* Preserve the fixed failure outcome. */ }
        throw new CronTickError(code);
      }
    },
  });
}

export default createWeeklyDraftCronHandler();
