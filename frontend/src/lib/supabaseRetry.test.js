import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './supabaseRetry';

const ok = (data) => ({ data, error: null });
const fail = (message = 'boom') => ({ data: null, error: { message } });

describe('withRetry', () => {
  it('returns the first result immediately on success, without sleeping', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const queryFn = vi.fn().mockResolvedValue(ok({ id: 1 }));

    const result = await withRetry(queryFn, { sleep });

    expect(result).toEqual(ok({ id: 1 }));
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries the configured number of times and returns the last result when exhausted', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const queryFn = vi.fn()
      .mockResolvedValueOnce(fail('first'))
      .mockResolvedValueOnce(fail('second'))
      .mockResolvedValueOnce(fail('third'));

    const result = await withRetry(queryFn, { retries: 2, sleep });

    expect(result).toEqual(fail('third'));
    expect(queryFn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('recovers on a later attempt without exhausting retries', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const queryFn = vi.fn()
      .mockResolvedValueOnce(fail('first'))
      .mockResolvedValueOnce(ok({ id: 2 }));

    const result = await withRetry(queryFn, { retries: 3, sleep });

    expect(result).toEqual(ok({ id: 2 }));
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('jitters the wait to within 50%-150% of delayMs, instead of firing every failed query at once', async () => {
    const waits = [];
    const sleep = vi.fn().mockImplementation(async (ms) => { waits.push(ms); });
    const delayMs = 1500;

    // Run many retrying calls so the jitter isn't a fluke of one sample.
    for (let i = 0; i < 50; i++) {
      const queryFn = vi.fn()
        .mockResolvedValueOnce(fail())
        .mockResolvedValueOnce(ok({}));
      await withRetry(queryFn, { delayMs, sleep });
    }

    expect(waits).toHaveLength(50);
    waits.forEach((ms) => {
      expect(ms).toBeGreaterThanOrEqual(delayMs * 0.5);
      expect(ms).toBeLessThanOrEqual(delayMs * 1.5);
    });

    // Not every wait is the same value (i.e. it really is randomised, not a
    // fixed delay in disguise).
    const distinctValues = new Set(waits);
    expect(distinctValues.size).toBeGreaterThan(1);
  });

  it('keeps the default retries and delayMs policy unchanged', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const queryFn = vi.fn()
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(fail());

    await withRetry(queryFn, { sleep });

    // Default retries is 1: one retry attempt, one sleep call.
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    const waitedMs = sleep.mock.calls[0][0];
    expect(waitedMs).toBeGreaterThanOrEqual(750);
    expect(waitedMs).toBeLessThanOrEqual(2250);
  });
});

// ── UX-054 ────────────────────────────────────────────────────────────────
// supabase-js returns { error } for an HTTP failure and THROWS for a network
// one. Before this, the throw escaped withRetry and the caller's error flag
// was never set: the screen sat on its empty state, telling the user there
// was no data when the truth was there was no network.
describe('withRetry when the query throws rather than returning an error', () => {
  const thrown = (message = 'Failed to fetch') => {
    const e = new TypeError(message);
    return vi.fn().mockRejectedValue(e);
  };

  it('turns a thrown error into the same { data, error } every caller reads', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const queryFn = thrown();

    const result = await withRetry(queryFn, { sleep, retries: 0 });

    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
    expect(result.error.message).toBe('Failed to fetch');
  });

  it('does not swallow it — the cause is handed back, not discarded', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const original = new TypeError('NetworkError when attempting to fetch resource.');
    const queryFn = vi.fn().mockRejectedValue(original);

    const result = await withRetry(queryFn, { sleep, retries: 0 });

    expect(result.error.cause).toBe(original);
    // So a caller can say "check your connection" rather than "server error".
    expect(result.error.offline).toBe(true);
  });

  it('retries a throw exactly as many times as a returned error', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const queryFn = thrown();

    await withRetry(queryFn, { sleep, retries: 3 });

    // One attempt plus three retries, same as the { error } path.
    expect(queryFn).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('recovers when the network comes back mid-retry', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const queryFn = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(ok({ id: 7 }));

    const result = await withRetry(queryFn, { sleep, retries: 2 });

    expect(result).toEqual(ok({ id: 7 }));
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('still rejects nothing — a throw never escapes to the caller', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const queryFn = thrown('boom');

    // The whole point: this must resolve, not reject.
    await expect(withRetry(queryFn, { sleep, retries: 1 })).resolves.toBeTruthy();
  });
});
