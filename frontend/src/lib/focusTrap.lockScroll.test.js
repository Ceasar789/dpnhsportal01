// @vitest-environment jsdom
// V1: lockScroll holds the page still behind an overlay. The page scrollbar
// disappears with the lock, so the body is padded by its width (nothing
// behind the dialog shifts sideways), and everything comes back on the last
// release, whatever order nested overlays close in.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lockScroll } from './focusTrap';

const { body, documentElement } = document;
let clientWidth;
let pending = [];
const lock = () => { const release = lockScroll(); pending.push(release); return release; };
const styleOf = () => body.getAttribute('style') || '';

beforeEach(() => {
  body.removeAttribute('style');
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(120);
  clientWidth = vi.spyOn(documentElement, 'clientWidth', 'get').mockReturnValue(1272);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  pending.forEach(release => release());
  pending = [];
  vi.restoreAllMocks();
  body.removeAttribute('style');
});

describe('lockScroll', () => {
  it('locks the body where the page was', () => {
    lock();
    expect(body.style).toMatchObject({ overflow: 'hidden', position: 'fixed', top: '-120px', width: '100%' });
  });

  it('pads the body by the width of the scrollbar it removes', () => {
    lock();
    expect(body.style.paddingRight).toBe('8px');
  });

  it('adds no padding when the page has no scrollbar (phones, overlay scrollbars)', () => {
    clientWidth.mockReturnValue(1280);
    lock();
    expect(body.style.paddingRight).toBe('');
  });

  it('restores every style it changed, including a padding the page already had, and the scroll position', () => {
    body.style.paddingRight = '3px';
    body.style.overflow = 'auto';
    const release = lock();
    expect(body.style.paddingRight).toBe('8px');
    release();
    expect(body.style).toMatchObject({ paddingRight: '3px', overflow: 'auto', position: '', top: '', width: '' });
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 120);
  });

  it('nested, inner closes first: the page stays locked and padded until the outer one closes', () => {
    const outer = lock();
    // While locked the scrollbar is gone and the page reads as unscrolled.
    clientWidth.mockReturnValue(1280);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0);
    const inner = lock();
    expect(body.style).toMatchObject({ top: '-120px', paddingRight: '8px' });
    inner();
    expect(body.style).toMatchObject({ overflow: 'hidden', position: 'fixed', top: '-120px', paddingRight: '8px' });
    expect(window.scrollTo).not.toHaveBeenCalled();
    outer();
    expect(styleOf()).toBe('');
    expect(window.scrollTo).toHaveBeenCalledOnce();
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 120);
  });

  it('nested, outer released first (both unmount in one commit): the page is still restored', () => {
    const outer = lock();
    const inner = lock();
    outer();
    expect(body.style.position).toBe('fixed');
    inner();
    expect(styleOf()).toBe('');
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 120);
  });

  it('a release called twice counts once', () => {
    const outer = lock();
    const inner = lock();
    inner();
    inner();
    expect(body.style.position).toBe('fixed');
    outer();
    expect(styleOf()).toBe('');
  });
});
