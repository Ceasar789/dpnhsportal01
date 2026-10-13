import { describe, expect, it } from 'vitest';
import { hasExactDeletedIds } from './deleteVerification';

describe('hasExactDeletedIds', () => {
  it('accepts exactly the requested row or batch', () => {
    expect(hasExactDeletedIds([{ id: 'news-1' }], 'news-1')).toBe(true);
    expect(hasExactDeletedIds([{ id: 'load-2' }, { id: 'load-1' }], ['load-1', 'load-2'])).toBe(true);
  });

  it.each([
    [[], 'row-1'],
    [[{ id: 'wrong' }], 'row-1'],
    [[{ id: 'row-1' }, { id: 'extra' }], 'row-1'],
    [[{}], 'row-1'],
    [null, 'row-1'],
  ])('rejects an unverified delete result %#', (rows, expected) => {
    expect(hasExactDeletedIds(rows, expected)).toBe(false);
  });

  it('rejects partial and duplicate batch results', () => {
    expect(hasExactDeletedIds([{ id: 'load-1' }], ['load-1', 'load-2'])).toBe(false);
    expect(hasExactDeletedIds([{ id: 'load-1' }, { id: 'load-1' }], ['load-1', 'load-2'])).toBe(false);
  });
});
