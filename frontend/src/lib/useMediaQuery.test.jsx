// @vitest-environment jsdom
// useMediaQuery renders once, and reports the width it is actually at.
//
// The useState + useEffect version re-read on mount to catch a resize
// that happened between the first render and the effect. That cost every
// consumer a second render, which is what react-hooks/set-state-in-effect
// was pointing at. useSyncExternalStore reads the snapshot each render,
// so there is nothing to catch up on.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

afterEach(cleanup);

// A matchMedia whose answer we control, so "the viewport changed" is a
// thing the test can actually do.
function stubMatchMedia(initial) {
  let matches = initial;
  const listeners = new Set();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() { return matches; },
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  }));
  return {
    set(next) {
      matches = next;
      act(() => { listeners.forEach((fn) => fn({ matches: next })); });
    },
    get listenerCount() { return listeners.size; },
  };
}

function Probe({ query, onRender }) {
  const matches = useMediaQuery(query);
  onRender();
  return <span data-testid="out">{String(matches)}</span>;
}

describe('useMediaQuery', () => {
  it('renders once on mount, not twice', () => {
    stubMatchMedia(true);
    const onRender = vi.fn();
    render(<Probe query="(max-width: 1023.98px)" onRender={onRender} />);

    expect(screen.getByTestId('out').textContent).toBe('true');
    expect(onRender, 'the hook re-rendered its consumer on mount')
      .toHaveBeenCalledTimes(1);
  });

  it('reports the value it had at first render, with no catch-up', () => {
    stubMatchMedia(false);
    const onRender = vi.fn();
    render(<Probe query="(max-width: 1023.98px)" onRender={onRender} />);
    expect(screen.getByTestId('out').textContent).toBe('false');
    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it('follows a change', () => {
    const mq = stubMatchMedia(false);
    render(<Probe query="(max-width: 1023.98px)" onRender={() => {}} />);
    expect(screen.getByTestId('out').textContent).toBe('false');
    mq.set(true);
    expect(screen.getByTestId('out').textContent).toBe('true');
  });

  it('unsubscribes when it goes away', () => {
    const mq = stubMatchMedia(true);
    const view = render(<Probe query="(max-width: 1023.98px)" onRender={() => {}} />);
    expect(mq.listenerCount).toBe(1);
    view.unmount();
    expect(mq.listenerCount, 'the listener outlived the component').toBe(0);
  });

  it('says no rather than throwing where matchMedia is missing', () => {
    window.matchMedia = undefined;
    render(<Probe query="(max-width: 1023.98px)" onRender={() => {}} />);
    expect(screen.getByTestId('out').textContent).toBe('false');
  });
});
