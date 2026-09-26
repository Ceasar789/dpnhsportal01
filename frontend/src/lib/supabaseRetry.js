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

  let result = await queryFn();
  let attempt = 0;

  while (result.error && attempt < retries) {
    console.warn(`${label} failed, retrying (${attempt + 1}/${retries}):`, result.error.message);
    await sleep(jitteredDelay(delayMs));
    result = await queryFn();
    attempt += 1;
  }

  return result;
}
