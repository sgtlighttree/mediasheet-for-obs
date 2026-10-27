const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { moveBefore, mergeOrder } = require('../public/playlist.js');

describe('moveBefore', () => {
  it('moves an item to just before the target', () => {
    assert.deepEqual(moveBefore(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c']);
    assert.deepEqual(moveBefore(['a', 'b', 'c', 'd'], 'a', 'c'), ['b', 'a', 'c', 'd']);
  });

  it('dropping onto itself, or an unknown target, changes nothing useful', () => {
    assert.deepEqual(moveBefore(['a', 'b', 'c'], 'b', 'b'), ['a', 'b', 'c']);
    assert.deepEqual(moveBefore(['a', 'b', 'c'], 'a', 'zzz'), ['b', 'c', 'a']);
  });

  it('does not mutate its input', () => {
    const input = ['a', 'b', 'c'];
    moveBefore(input, 'c', 'a');
    assert.deepEqual(input, ['a', 'b', 'c']);
  });
});

describe('mergeOrder', () => {
  it('keeps saved order for items that still exist', () => {
    assert.deepEqual(mergeOrder(['c', 'a', 'b'], ['a', 'b', 'c']), ['c', 'a', 'b']);
  });

  it('drops saved items that are gone and appends new ones in current order', () => {
    assert.deepEqual(mergeOrder(['c', 'gone', 'a'], ['a', 'b', 'c', 'd']), ['c', 'a', 'b', 'd']);
  });

  it('with nothing saved it is the current order', () => {
    assert.deepEqual(mergeOrder([], ['x', 'y']), ['x', 'y']);
    assert.deepEqual(mergeOrder(undefined, ['x', 'y']), ['x', 'y']);
  });

  it('ignores duplicates in the saved list', () => {
    assert.deepEqual(mergeOrder(['a', 'a', 'b'], ['a', 'b']), ['a', 'b']);
  });

  it('works on numeric ids (clip scene item ids)', () => {
    assert.deepEqual(mergeOrder([18, 16], [16, 17, 18]), [18, 16, 17]);
  });
});
