import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { buildBlock, currentBlock, SELFTEST } = require('../../../backend/database/scripts/genScoringVectors.cjs');

// If this fails, regenerate with:
//   node backend/database/scripts/genScoringVectors.cjs --write
describe('SQL selftest vectors stay in step with scoringVectors.json', () => {
  it('the generated block in auto-score-submission.selftest.sql matches the JSON', () => {
    const block = currentBlock(readFileSync(SELFTEST, 'utf8'));
    expect(block).not.toBeNull();
    expect(block).toBe(buildBlock());
  });

  it('the block is deterministic and lists every vector once', () => {
    const vectors = JSON.parse(readFileSync(new URL('./scoringVectors.json', import.meta.url), 'utf8'));
    expect(buildBlock(vectors)).toBe(buildBlock(vectors));
    const listed = buildBlock(vectors).split('\n').filter(line => line.startsWith('{'));
    expect(listed).toHaveLength(vectors.length);
  });

  it('a changed vector makes the blocks differ', () => {
    const vectors = JSON.parse(readFileSync(new URL('./scoringVectors.json', import.meta.url), 'utf8'));
    const changed = vectors.map((v, i) => (i === 0 ? { ...v, expected: { ...v.expected, points: 99 } } : v));
    expect(buildBlock(changed)).not.toBe(buildBlock(vectors));
  });
});
