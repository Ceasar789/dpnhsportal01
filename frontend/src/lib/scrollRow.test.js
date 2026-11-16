// @vitest-environment jsdom
// V2a: the selected item of a sideways row is brought into view horizontally.
import { describe, expect, it } from 'vitest';
import { centerSelectedInRow } from './scrollRow';

const box = (left, width) => ({ left, width, right: left + width, top: 0, bottom: 40, height: 40 });
const row = ({ scrollWidth, clientWidth, rowBox, itemBox, selected = true }) => {
  const el = document.createElement('div');
  const item = document.createElement('button');
  if (selected) item.className = 'on';
  el.append(item);
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { value: clientWidth });
  el.getBoundingClientRect = () => rowBox;
  item.getBoundingClientRect = () => itemBox;
  el.scrollLeft = 0;
  return el;
};

describe('centerSelectedInRow', () => {
  it('centres a selected item cut off at the right edge', () => {
    const el = row({ scrollWidth: 500, clientWidth: 350, rowBox: box(20, 350), itemBox: box(320, 100) });
    centerSelectedInRow(el);
    // item centre 370, row centre 195: scroll 175px to the right.
    expect(el.scrollLeft).toBe(175);
  });

  it('does nothing when the row does not overflow, or nothing is selected', () => {
    const fits = row({ scrollWidth: 350, clientWidth: 350, rowBox: box(0, 350), itemBox: box(300, 100) });
    centerSelectedInRow(fits);
    expect(fits.scrollLeft).toBe(0);
    const none = row({ scrollWidth: 500, clientWidth: 350, rowBox: box(0, 350), itemBox: box(300, 100), selected: false });
    centerSelectedInRow(none);
    expect(none.scrollLeft).toBe(0);
    expect(() => centerSelectedInRow(null)).not.toThrow();
  });
});
