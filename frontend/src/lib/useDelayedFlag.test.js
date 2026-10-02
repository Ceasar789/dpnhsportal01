// @vitest-environment jsdom
// The 300ms rule, tested where it can actually be pinned down.
//
// The first attempt at this was an e2e check that sampled the page for a
// loading line and asserted it never appeared. Against a live Supabase that
// is not a test of the rule — it is a test of the network, and it failed
// because a real fetch routinely takes longer than 300ms. Whether the flag
// waits is logic, and logic belongs here with a fake clock.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDelayedFlag } from './useDelayedFlag';

afterEach(() => { vi.useRealTimers(); });

describe('useDelayedFlag', () => {
  it('stays false while nothing is loading', () => {
    const { result } = renderHook(() => useDelayedFlag(false));
    expect(result.current).toBe(false);
  });

  it('does not fire for a response that beats the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on, 300), {
      initialProps: { on: true },
    });

    // 290ms in — still nothing painted.
    act(() => { vi.advanceTimersByTime(290); });
    expect(result.current).toBe(false);

    // The response lands at 290ms. Nothing should ever have flashed.
    rerender({ on: false });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(false);
  });

  it('fires once the wait is long enough to notice', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDelayedFlag(true, 300));

    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current).toBe(false);

    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current).toBe(true);
  });

  it('drops the instant loading ends, with no minimum display time', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on, 300), {
      initialProps: { on: true },
    });

    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current).toBe(true);

    // A skeleton held open "so it doesn't flash" is the same flicker with
    // extra waiting attached.
    rerender({ on: false });
    expect(result.current).toBe(false);
  });

  it('restarts the clock when a second load begins', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on, 300), {
      initialProps: { on: true },
    });

    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current).toBe(true);

    rerender({ on: false });
    rerender({ on: true });
    expect(result.current).toBe(false);          // not carried over
    act(() => { vi.advanceTimersByTime(301); });
    expect(result.current).toBe(true);
  });
});
