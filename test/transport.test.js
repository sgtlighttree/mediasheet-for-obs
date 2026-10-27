const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { transportAction, formatClock, seekTarget } = require('../public/playlist.js');

const S = (n) => 'OBS_MEDIA_STATE_' + n;

describe('transportAction', () => {
  it('playing pauses, paused plays', () => {
    assert.equal(transportAction(S('PLAYING')), 'PAUSE');
    assert.equal(transportAction(S('PAUSED')), 'PLAY');
  });

  it('ended, stopped or unknown restart (PLAY on an ended clip freezes at frame 1 in OBS 32.2.2)', () => {
    for (const s of ['ENDED', 'STOPPED', 'NONE', 'OPENING', 'BUFFERING']) assert.equal(transportAction(S(s)), 'RESTART');
    assert.equal(transportAction(undefined), 'RESTART');
  });
});

describe('formatClock', () => {
  it('formats m:ss', () => {
    assert.equal(formatClock(0), '0:00');
    assert.equal(formatClock(7400), '0:07');
    assert.equal(formatClock(19997), '0:19');
    assert.equal(formatClock(61000), '1:01');
  });

  it('formats h:mm:ss over an hour', () => {
    assert.equal(formatClock(3725000), '1:02:05');
  });

  it('treats null, negative and non-numbers as 0:00', () => {
    assert.equal(formatClock(null), '0:00');
    assert.equal(formatClock(-5), '0:00');
    assert.equal(formatClock(NaN), '0:00');
  });
});

describe('seekTarget', () => {
  it('maps a 0..1000 slider position onto the duration', () => {
    assert.equal(seekTarget(500, 1000, 20000), 10000);
    assert.equal(seekTarget(0, 1000, 20000), 0);
    assert.equal(seekTarget(1000, 1000, 20000), 20000);
  });

  it('clamps and rounds', () => {
    assert.equal(seekTarget(1500, 1000, 20000), 20000);
    assert.equal(seekTarget(-3, 1000, 20000), 0);
    assert.equal(seekTarget(333, 1000, 20000), 6660);
  });

  it('returns null when the duration is unknown', () => {
    assert.equal(seekTarget(500, 1000, null), null);
    assert.equal(seekTarget(500, 1000, 0), null);
  });
});
