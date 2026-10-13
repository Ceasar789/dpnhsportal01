// ============================================
// FILE: src/lib/supabaseRetry.js
// Shared retry wrapper for Supabase reads. The project runs on a small
// free-tier compute with a limited connection pool, which occasionally
// saturates for a few seconds and causes a read to fail even though the
// data is fine — this masks as "my data disappeared" until a retry a
// moment later succeeds. Wrap any fetch-on-mount query with this instead
// of calling supabase directly, so it self-heals instead of leaving the
// UI looking empty.
// ============================================

// Randomises the actual wait to somewhere in 50%-150% of `delayMs`. When a
// burst of parallel queries all fail together (exactly what pool saturation
// looks like), a fixed delay makes them all wake and retry at the same
// instant, reproducing the very burst that caused the failure. Jitter spreads
// the retries out over time instead.
function jitteredDelay(delayMs) {
  return delayMs * (0.5 + Math.random());
}

// UX-054. supabase-js reports an HTTP failure as { data, error } — which
// every caller in this project handles — but a NETWORK failure throws
// instead: a dropped connection, a blocked request, DNS gone. That
// rejection used to escape withRetry, escape the fetcher that called it,
// and leave the error flag unset, so the screen sat on its empty state
// with no message and no retry. The user is told there is no data when
// what is actually true is that there is no network.
//
// Normalising it to the same { data, error } shape means the retry loop
// treats both the same way — a thrown error is retried exactly as many
// times as a returned one — and every existing caller reports it without
// being changed.
//
// Not swallowed: the error is logged and handed back. The `offline` flag is
// there so a caller that wants to say "check your connection" rather than
// "something went wrong" can tell the two apart.
async function attempt_(queryFn, label) {
  try {
    return await queryFn();
  } catch (thrown) {
    const message = thrown?.message || String(thrown);
    console.warn(`${label} threw rather than returning an error:`, message);
    return {
      data: null,
      error: { message, offline: true, cause: thrown },
    };
  }
}

/**
 * Runs `queryFn` (a function returning a Supabase query promise that
 * resolves to `{ data, error }`), retrying once after a short pause if
 * the first attempt errors.
 *
 * @param {() => Promise<{data: any, error: any}>} queryFn
 * @param {{ retries?: number, delayMs?: number, label?: string, sleep?: (ms: number) => Promise<void> }} [opts]
 */
export async function withRetry(queryFn, opts = {}) {
  const {
    retries = 1,
    delayMs = 1500,
    label = 'Supabase query',
    sleep = (ms) => new Promise(r => setTimeout(r, ms)),
  } = opts;

  let result = await attempt_(queryFn, label);
  let attempt = 0;

  while (result.error && attempt < retries) {
    console.warn(`${label} failed, retrying (${attempt + 1}/${retries}):`, result.error.message);
    await sleep(jitteredDelay(delayMs));
    result = await attempt_(queryFn, label);
    attempt += 1;
  }

  return result;
}
