import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, totals, verdict } from './results.mjs';
const requirement = [['unit', ['required assertion']]];
const suite = status => [{ id: 'unit', status: 'PASS', tests: [{ name: 'required assertion', status }] }];
test('acceptance requires executed passing assertions', () => assert.equal(classify(suite('passed'), requirement).status, 'PASS'));
test('acceptance rejects missing evidence', () => assert.equal(classify([], requirement).status, 'BLOCKED'));
test('acceptance never counts TODO or skipped assertions as passing', () => {
  for (const status of ['todo', 'skipped']) assert.equal(classify(suite(status), requirement).status, 'BLOCKED');
});
test('acceptance propagates failed assertions and nonzero suites', () => {
  assert.equal(classify(suite('failed'), requirement).status, 'FAIL');
  assert.equal(classify([{ ...suite('passed')[0], status: 'FAIL' }], requirement).status, 'FAIL');
});
test('required blocked checks prevent exit success', () => assert.equal(verdict([{ status: 'PASS' }], [{ status: 'BLOCKED' }]), 'BLOCKED'));
test('totals separate TODO from passes', () => assert.deepEqual(totals(suite('todo')[0].tests), { passed: 0, failed: 0, skipped: 0, todo: 1 }));
test('suite evidence requires actual passes even when all tests are skipped', () => {
  assert.equal(classify(suite('skipped'), [['unit', ['@suite']]]).status, 'BLOCKED');
  assert.equal(classify(suite('passed'), [['unit', ['@suite']]]).status, 'PASS');
});
