import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const WORKER_PATH = '/api/internal/weekly-draft-worker';
const MAX_ACTIONS = 23;
const WALL_BUDGET_MS = 40 * 60_000;
export const REQUEST_TIMEOUT_MS = 130_000;
const START_MARGIN_MS = 5_000;
const MAX_RESPONSE_BYTES = 128;
const STOP_STATUSES = new Set(['idle', 'completed', 'canceled', 'failed',
  'no_claim', 'stale', 'not_dispatched', 'not_completed']);

export class WorkerTickError extends Error {
  constructor(code) {
    super(`Weekly draft worker stopped: ${code}.`);
    this.name = 'WorkerTickError';
    this.code = code;
  }
}

export const workerTickExitCode = result => result?.status === 'failed' ? 1 : 0;

function validateConfiguration(endpoint, secret) {
  let url;
  if (typeof endpoint !== 'string') throw new WorkerTickError('configuration');
  try { url = new URL(endpoint); }
  catch { throw new WorkerTickError('configuration'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password
    || url.pathname !== WORKER_PATH || url.href.includes('?') || url.href.includes('#')
    || typeof secret !== 'string' || !secret || /\s/.test(secret)
    || Buffer.byteLength(secret, 'utf8') > 1024) {
    throw new WorkerTickError('configuration');
  }
  return url.href;
}

// The production transport never follows a redirect or buffers an unbounded body.
export async function fetchWorkerResponse(endpoint, options) {
  const response = await fetch(endpoint, options);
  if (response.status !== 200 || response.redirected) {
    void response.body?.cancel().catch(() => {});
    return { status: response.status, redirected: response.redirected, body: '' };
  }
  const reader = response.body?.getReader();
  if (!reader) throw new WorkerTickError('malformed_response');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new WorkerTickError('malformed_response');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let body;
  try { body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw new WorkerTickError('malformed_response'); }
  return { status: response.status, redirected: response.redirected, body };
}

export async function runWeeklyDraftWorkerTick({ endpoint, secret,
  request = fetchWorkerResponse,
  clock = { now: () => performance.now(), setTimeout, clearTimeout } } = {}) {
  const url = validateConfiguration(endpoint, secret);
  if (typeof request !== 'function' || typeof clock?.now !== 'function'
    || typeof clock?.setTimeout !== 'function' || typeof clock?.clearTimeout !== 'function') {
    throw new WorkerTickError('configuration');
  }

  const started = clock.now();
  let requests = 0;
  while (requests < MAX_ACTIONS) {
    if (WALL_BUDGET_MS - (clock.now() - started) < REQUEST_TIMEOUT_MS + START_MARGIN_MS) {
      return { status: 'time_cap', requests };
    }
    const controller = new AbortController();
    let timedOut = false;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = clock.setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new WorkerTickError('timeout'));
      }, REQUEST_TIMEOUT_MS);
    });
    let received;
    requests++;
    try {
      received = await Promise.race([request(url, {
        method: 'GET', redirect: 'manual', cache: 'no-store',
        headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
        signal: controller.signal,
      }), timeout]);
    } catch (error) {
      if (timedOut) throw new WorkerTickError('timeout');
      if (error instanceof WorkerTickError) throw error;
      throw new WorkerTickError('transport_uncertain');
    } finally {
      clock.clearTimeout(timer);
    }

    if (!received || received.redirected !== false || received.status !== 200) {
      throw new WorkerTickError('http_error');
    }
    if (typeof received.body !== 'string'
      || Buffer.byteLength(received.body, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new WorkerTickError('malformed_response');
    }
    let payload;
    try { payload = JSON.parse(received.body); }
    catch { throw new WorkerTickError('malformed_response'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || Object.keys(payload).length !== 1 || typeof payload.status !== 'string') {
      throw new WorkerTickError('malformed_response');
    }
    if (payload.status === 'checkpointed' || payload.status === 'retry_queued') continue;
    if (STOP_STATUSES.has(payload.status)) return { status: payload.status, requests };
    throw new WorkerTickError('malformed_response');
  }
  return { status: 'action_cap', requests };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await runWeeklyDraftWorkerTick({
      endpoint: process.env.WEEKLY_DRAFT_WORKER_URL,
      secret: process.env.WEEKLY_DRAFT_WORKER_SECRET,
    });
    console.log(`Weekly draft worker: ${result.status}; requests=${result.requests}.`);
    process.exitCode = workerTickExitCode(result);
  } catch (error) {
    console.error(error instanceof WorkerTickError ? error.message
      : 'Weekly draft worker stopped: unexpected.');
    process.exitCode = 1;
  }
}
