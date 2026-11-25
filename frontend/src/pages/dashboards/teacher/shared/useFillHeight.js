import { useLayoutEffect } from 'react';

// U-PDF-T: give a document region (the lesson plan body, a worksheet preview)
// the height that is left, so the page around it stops scrolling and its
// header stays in view. The region's own content then scrolls inside it.
//
// It works out the scrolling element (the closest ancestor that scrolls, or the
// page) and shrinks the region by exactly the amount that element overflows,
// which already counts the top bar, the header, anything below the region and
// the phone bottom bar's padding. Never below `min` px, so a very short window
// still shows a usable area (the page may then scroll a little).
const scrollerOf = (node) => {
  for (let el = node?.parentElement; el && el !== document.body; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return document.scrollingElement || document.documentElement;
};

// The height of a shell bar when it is on screen (the top bar, the phone bottom bar).
const barHeight = selector => {
  const bar = document.querySelector(selector);
  const box = bar?.getBoundingClientRect();
  return box && box.height > 0 && getComputedStyle(bar).display !== 'none' ? box.height : 0;
};

export function fitRegion(region, min = 240) {
  if (!region || typeof window === 'undefined') return;
  const scroller = scrollerOf(region);
  const overflow = scroller.scrollHeight - scroller.clientHeight;
  let next = Math.floor(region.getBoundingClientRect().height - overflow);
  // The header is taller than the window (phones, short windows): the page scrolls to the
  // document, which then fills the window between the top bar and the bottom bar.
  if (next < min && scroller === (document.scrollingElement || document.documentElement)) {
    next = Math.floor(window.innerHeight - barHeight('.x-top') - barHeight('.x-pnav') - 32);
  }
  region.style.setProperty('--t-doc-max', `${Math.max(min, next)}px`);
}

export default function useFillHeight(ref, { min = 240, enabled = true, deps = [] } = {}) {
  useLayoutEffect(() => {
    const region = ref.current;
    if (!enabled || !region || typeof window === 'undefined') return undefined;
    let frame = 0;
    // Measure from the uncapped layout so growing the window can grow the region again.
    const measure = () => { region.style.setProperty('--t-doc-max', '100000px'); fitRegion(region, min); };
    // Later changes are batched into one frame; the first fit runs now (no timer left behind).
    const fit = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('resize', fit);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    // Watch what sits above and below the region (its siblings), never the region itself.
    for (const sibling of region.parentElement?.children || []) if (sibling !== region) observer?.observe(sibling);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', fit); observer?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, min, ...deps]);
}
