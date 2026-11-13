// @vitest-environment jsdom
// L2: the shared skeleton primitives are decoration only: aria-hidden groups,
// no text, sizes applied, and table rows that fit an existing <tbody>.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import {
  Skeleton, SkeletonCard, SkeletonCircle, SkeletonGroup, SkeletonRing, SkeletonRows, SkeletonStat, SkeletonTable, SkeletonText,
} from './Skeleton';

afterEach(cleanup);

describe('Skeleton primitives', () => {
  it('Skeleton: a block with the given size and radius; inline sits in a line of text', () => {
    const { container } = render(<><Skeleton w={120} h="0.8em" r={4} /><Skeleton inline w="50%" /></>);
    const [block, inline] = container.querySelectorAll('.sk-b');
    expect(block.style.width).toBe('120px');
    expect(block.style.height).toBe('0.8em');
    expect(block.style.getPropertyValue('--sk-r')).toBe('4px');
    expect(block.className).toBe('sk-b');
    expect(inline.className).toBe('sk-b sk-inline');
    expect(inline.style.width).toBe('50%');
  });

  it('SkeletonText: n lines, the last one shorter', () => {
    const { container } = render(<SkeletonText lines={3} last="40%" />);
    const lines = [...container.querySelectorAll('.sk-b')];
    expect(lines.map(l => l.style.width)).toEqual(['100%', '100%', '40%']);
  });

  it('SkeletonCircle and SkeletonRing: round, square', () => {
    const { container } = render(<><SkeletonCircle size={130} /><SkeletonRing size={40} /></>);
    const [a, b] = container.querySelectorAll('.sk-round');
    expect([a.style.width, a.style.height, b.style.width]).toEqual(['130px', '130px', '40px']);
  });

  it('SkeletonCard, SkeletonRows and SkeletonStat take the real classes and render only shapes', () => {
    const { container } = render(<>
      <SkeletonCard className="x-card x-pad" lines={2} media={80} actions={2} />
      <SkeletonRows count={3} trailing="pill" />
      <SkeletonStat className="x-card x-kpi" />
    </>);
    expect(container.querySelector('.sk-card').className).toBe('sk-card x-card x-pad');
    expect(container.querySelectorAll('.sk-card-act .sk-b')).toHaveLength(2);
    expect(container.querySelectorAll('.sk-row')).toHaveLength(3);
    expect(container.querySelectorAll('.sk-row .sk-round')).toHaveLength(3);
    expect(container.querySelector('.sk-stat').className).toBe('sk-stat x-card x-kpi');
    expect(container.textContent).toBe('');
  });

  it('SkeletonTable: rows x columns for an existing tbody, each row aria-hidden and marked', () => {
    const { container } = render(<table><tbody><SkeletonTable rows={4} cols={3} cell={c => (c === 2 ? <i data-c="custom" /> : undefined)} /></tbody></table>);
    const rows = [...container.querySelectorAll('tr')];
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.getAttribute('aria-hidden')).toBe('true');
      expect(r.hasAttribute('data-skeleton')).toBe(true);
      expect(r.className).toBe('sk-in');
      expect(r.children).toHaveLength(3);
      expect(r.querySelector('[data-c="custom"]')).toBeTruthy();
      expect(r.querySelectorAll('.sk-inline')).toHaveLength(2);
    }
  });

  it('SkeletonGroup: aria-hidden, data-skeleton, the delayed-reveal class, any element', () => {
    const { container } = render(<><SkeletonGroup className="x-grid3"><Skeleton /></SkeletonGroup><SkeletonGroup as="ul" /></>);
    const [div, ul] = container.querySelectorAll('[data-skeleton]');
    expect(div.tagName).toBe('DIV');
    expect(div.getAttribute('aria-hidden')).toBe('true');
    expect(div.className).toBe('sk-in x-grid3');
    expect(ul.tagName).toBe('UL');
    expect(container.textContent).toBe('');
  });
});
