const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { moveBefore, layoutSequence, dropSide, mergeOrder } = require('../public/playlist.js');

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

describe('moveBefore with after', () => {
  it('moves an item to just after the target', () => {
    assert.deepEqual(moveBefore(['a', 'b', 'c', 'd'], 'a', 'c', true), ['b', 'c', 'a', 'd']);
    assert.deepEqual(moveBefore(['a', 'b', 'c', 'd'], 'a', 'd', true), ['b', 'c', 'd', 'a']);
    assert.deepEqual(moveBefore(['a', 'b', 'c', 'd'], 'd', 'a', true), ['a', 'd', 'b', 'c']);
  });

  it('lets a tile go before the first one again', () => {
    assert.deepEqual(moveBefore(['a', 'b', 'c'], 'c', 'a', false), ['c', 'a', 'b']);
  });
});

describe('layoutSequence', () => {
  const names = (seq) => seq.map((s) => (s.type === 'box' ? `[${s.name}]` : s.name));
  it('puts a playlist box after the last tile of its row so later tiles fill the row beside it', () => {
    const seq = layoutSequence(['a', 'b', 'c', 'd', 'e'], (n) => n === 'b', 3);
    assert.deepEqual(names(seq), ['a', 'b', 'c', '[b]', 'd', 'e']);
  });
  it('a playlist that is last in its row keeps its box right after it', () => {
    assert.deepEqual(names(layoutSequence(['a', 'b', 'c', 'd'], (n) => n === 'c', 3)), ['a', 'b', 'c', '[c]', 'd']);
  });
  it('two boxes in one row stack in tile order and only the first is joined', () => {
    const seq = layoutSequence(['a', 'b', 'c', 'd'], (n) => n === 'a' || n === 'c', 3);
    assert.deepEqual(names(seq), ['a', 'b', 'c', '[a]', '[c]', 'd']);
    assert.deepEqual(seq.filter((s) => s.type === 'box').map((s) => s.joined), [true, false]);
  });
  it('one column puts every box right under its tile', () => {
    assert.deepEqual(names(layoutSequence(['a', 'b'], () => true, 1)), ['a', '[a]', 'b', '[b]']);
  });
  it('more columns than tiles is a single row', () => {
    assert.deepEqual(names(layoutSequence(['a', 'b'], (n) => n === 'a', 5)), ['a', 'b', '[a]']);
  });
  it('an unknown column count is treated as one', () => {
    assert.deepEqual(names(layoutSequence(['a', 'b'], (n) => n === 'a', 0)), ['a', '[a]', 'b']);
  });
});

describe('dropSide', () => {
  const rect = { left: 100, width: 200 };
  it('left half is before, right half is after', () => {
    assert.equal(dropSide(120, rect), 'before');
    assert.equal(dropSide(199, rect), 'before');
    assert.equal(dropSide(200, rect), 'after');
    assert.equal(dropSide(290, rect), 'after');
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
