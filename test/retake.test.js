const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { selectRetake } = require('../public/playlist.js');

const c = (over) => ({ sourceName: 'a', live: false, enabledInPreview: false, muted: false, mul: 0.3, level: 0.3, ...over });

describe('selectRetake', () => {
  it('a live clip that is the only thing enabled in Preview is re-taken', () => {
    const r = selectRetake([c({ sourceName: 'a', live: true, enabledInPreview: true }), c({ sourceName: 'b' })]);
    assert.deepEqual(r, [{ sourceName: 'a', mul: 0.3, level: 0.3 }]);
  });

  it('nothing to re-take when a different clip is cued', () => {
    const r = selectRetake([c({ sourceName: 'a', live: true }), c({ sourceName: 'b', enabledInPreview: true })]);
    assert.deepEqual(r, []);
  });

  it('a live clip still enabled next to a cued clip is a normal take, not a re-take', () => {
    const r = selectRetake([c({ sourceName: 'a', live: true, enabledInPreview: true }), c({ sourceName: 'b', enabledInPreview: true })]);
    assert.deepEqual(r, []);
  });

  it('nothing enabled in Preview: nothing to re-take', () => {
    assert.deepEqual(selectRetake([c({ live: true })]), []);
    assert.deepEqual(selectRetake([]), []);
  });
});
