const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isFreshStart, selectStartupParks } = require('../public/playlist.js');

const PLAYING = 'OBS_MEDIA_STATE_PLAYING';
const clips = [
  { sourceName: 'A', kind: 'video', mediaState: PLAYING },
  { sourceName: 'B', kind: 'video', mediaState: 'OBS_MEDIA_STATE_PAUSED' },
  { sourceName: 'C', kind: 'video', mediaState: 'OBS_MEDIA_STATE_ENDED' },
  { sourceName: 'D', kind: 'image', mediaState: PLAYING },
  { sourceName: 'A', kind: 'video', mediaState: PLAYING },
];

describe('isFreshStart', () => {
  it('is true for a few seconds of rendered frames, false after hours', () => {
    assert.equal(isFreshStart(300, 30), true);
    assert.equal(isFreshStart(105171, 30), false);
  });
  it('uses a 3 minute window by default', () => {
    assert.equal(isFreshStart(30 * 179, 30), true);
    assert.equal(isFreshStart(30 * 181, 30), false);
  });
  it('is false when the frame rate is unknown', () => {
    assert.equal(isFreshStart(100, 0), false);
  });
});

describe('selectStartupParks', () => {
  it('parks only playing video clips, once each', () => {
    assert.deepEqual(selectStartupParks({ fresh: true, streaming: false, recording: false, clips }), ['A']);
  });
  it('does nothing unless OBS just started', () => {
    assert.deepEqual(selectStartupParks({ fresh: false, streaming: false, recording: false, clips }), []);
  });
  it('never touches clips while streaming or recording', () => {
    assert.deepEqual(selectStartupParks({ fresh: true, streaming: true, recording: false, clips }), []);
    assert.deepEqual(selectStartupParks({ fresh: true, streaming: false, recording: true, clips }), []);
  });
});
