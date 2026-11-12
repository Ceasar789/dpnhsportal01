// @vitest-environment jsdom
// Donut's optional gap: 0 (the default) draws exactly as before; a positive
// gap leaves a thin space between segments; one segment never gets a gap.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import Donut from './Donut';

const roles = [{ label: 'Students', value: 6 }, { label: 'Teachers', value: 3 }, { label: 'Admins', value: 1 }];
const arcs = container => [...container.querySelectorAll('.x-seg-ring')].map(c => ({
  dash: c.getAttribute('stroke-dasharray'), offset: c.getAttribute('stroke-dashoffset'),
}));

afterEach(() => cleanup());

describe('Donut gap', () => {
  it('no gap prop and gap={0} render identical markup, with the original dash maths', () => {
    const plain = render(<Donut segments={roles} label="Roles" totalLabel="users" />).container.innerHTML;
    cleanup();
    const zero = render(<Donut segments={roles} label="Roles" totalLabel="users" gap={0} />);
    expect(zero.container.innerHTML).toBe(plain);
    expect(arcs(zero.container)).toEqual([
      { dash: '60 40', offset: '0' }, { dash: '30 70', offset: '-60' }, { dash: '10 90', offset: '-90' },
    ]);
  });

  it('a positive gap shortens each segment by the gap and centres it, so segments are separated', () => {
    const { container } = render(<Donut segments={roles} gap={1} />);
    expect(arcs(container)).toEqual([
      { dash: '59 41', offset: '-0.5' }, { dash: '29 71', offset: '-60.5' }, { dash: '9 91', offset: '-90.5' },
    ]);
    // Each segment ends 1 unit before the next one starts.
    const parsed = arcs(container).map(a => ({ start: -Number(a.offset), len: Number(a.dash.split(' ')[0]) }));
    for (let i = 0; i < parsed.length; i += 1) {
      const end = parsed[i].start + parsed[i].len;
      const nextStart = i + 1 < parsed.length ? parsed[i + 1].start : parsed[0].start + 100;
      expect(nextStart - end).toBeCloseTo(1, 6);
    }
  });

  it('a single visible segment draws a full ring with no gap', () => {
    const { container } = render(<Donut segments={[{ label: 'Students', value: 5 }, { label: 'Teachers', value: 0 }]} gap={1} />);
    expect(arcs(container)).toEqual([{ dash: '100 0', offset: '0' }]);
  });

  it('the text alternative and legend do not change with a gap', () => {
    const a = render(<Donut segments={roles} label="Roles" totalLabel="users" />);
    const label = a.container.querySelector('svg').getAttribute('aria-label');
    const legend = a.container.querySelector('.x-legend').textContent;
    cleanup();
    const b = render(<Donut segments={roles} label="Roles" totalLabel="users" gap={0.5} />);
    expect(b.container.querySelector('svg').getAttribute('aria-label')).toBe(label);
    expect(b.container.querySelector('.x-legend').textContent).toBe(legend);
  });
});
