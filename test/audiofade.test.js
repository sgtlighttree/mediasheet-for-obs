const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { rampValue, fadeLevel, selectFadeTargets } = require('../public/playlist.js');

describe('rampValue', () => {
  it('starts at from, ends exactly at to, linear between', () => {
    assert.equal(rampValue(0.5, 0, 0), 0.5);
    assert.equal(rampValue(0.5, 0, 0.5), 0.25);
    assert.equal(rampValue(0.5, 0, 1), 0);
    assert.equal(rampValue(0, 0.3094093203544617, 1), 0.3094093203544617);
  });

  it('clamps t outside 0..1', () => {
    assert.equal(rampValue(1, 0, -3), 1);
    assert.equal(rampValue(1, 0, 7), 0);
  });
});

describe('fadeLevel', () => {
  it('uses the remembered level while the clip is parked below it', () => {
    assert.equal(fadeLevel(0.3, 0), 0.3);
    assert.equal(fadeLevel(0.3, 0.1), 0.3);
  });

  it('keeps a louder current volume the user set', () => {
    assert.equal(fadeLevel(0.3, 0.5), 0.5);
  });

  it('falls back to the current volume with no remembered level', () => {
    assert.equal(fadeLevel(undefined, 0.4), 0.4);
    assert.equal(fadeLevel(undefined, 0), 0);
  });
});

describe('selectFadeTargets', () => {
  const c = (over) => ({ sourceName: 'a', live: false, enabledInPreview: false, muted: false, mul: 0.3, level: 0.3, ...over });

  it('live clip not staying in Preview fades out', () => {
    const r = selectFadeTargets([c({ sourceName: 'a', live: true })]);
    assert.deepEqual(r.outgoing.map((x) => x.sourceName), ['a']);
    assert.deepEqual(r.incoming, []);
  });

  it('non-live clip enabled in Preview fades in', () => {
    const r = selectFadeTargets([c({ sourceName: 'b', enabledInPreview: true })]);
    assert.deepEqual(r.incoming.map((x) => x.sourceName), ['b']);
    assert.deepEqual(r.outgoing, []);
  });

  it('a clip that is live and stays enabled in Preview is neither', () => {
    const r = selectFadeTargets([c({ live: true, enabledInPreview: true })]);
    assert.deepEqual(r, { outgoing: [], incoming: [] });
  });

  it('muted or silent live clips are not faded out', () => {
    const r = selectFadeTargets([
      c({ sourceName: 'm', live: true, muted: true }),
      c({ sourceName: 's', live: true, mul: 0, level: 0 }),
    ]);
    assert.deepEqual(r.outgoing, []);
  });

  it('a parked incoming clip is faded in toward its remembered level', () => {
    const r = selectFadeTargets([c({ sourceName: 'p', enabledInPreview: true, mul: 0, level: 0.3 })]);
    assert.deepEqual(r.incoming, [{ sourceName: 'p', level: 0.3 }]);
  });

  it('a clip with no level at all is skipped', () => {
    const r = selectFadeTargets([c({ enabledInPreview: true, mul: 0, level: 0 })]);
    assert.deepEqual(r.incoming, []);
  });

  it('a muted incoming clip still fades in (activation unmutes it)', () => {
    const r = selectFadeTargets([c({ enabledInPreview: true, muted: true })]);
    assert.equal(r.incoming.length, 1);
  });

  it('outgoing entries carry the current volume and the level to restore', () => {
    const r = selectFadeTargets([c({ live: true, mul: 0.2, level: 0.3 })]);
    assert.deepEqual(r.outgoing, [{ sourceName: 'a', mul: 0.2, level: 0.3 }]);
  });
});
