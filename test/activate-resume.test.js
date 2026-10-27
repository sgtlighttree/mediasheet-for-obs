const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { planActivate } = require('../public/playlist.js');

const base = { sourceName: 'a.mp4', kind: 'video', muted: false, monitorType: 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT', streamOnlyChosen: false, monitorSwitchSafe: true };
const ACT = 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_';
const media = (mediaAction) => ({ request: 'TriggerMediaInputAction', data: { inputName: 'a.mp4', mediaAction: ACT + mediaAction } });

describe('planActivate resume', () => {
  it('a cued (paused) clip going live is resumed, first in the plan', () => {
    const reqs = planActivate({ ...base, muted: true, mediaState: 'OBS_MEDIA_STATE_PAUSED' });
    assert.deepEqual(reqs[0], media('PLAY'));
    assert.equal(reqs.length, 2);
  });

  it('an ended or stopped clip going live is restarted', () => {
    assert.deepEqual(planActivate({ ...base, mediaState: 'OBS_MEDIA_STATE_ENDED' }), [media('RESTART')]);
    assert.deepEqual(planActivate({ ...base, mediaState: 'OBS_MEDIA_STATE_STOPPED' }), [media('RESTART')]);
  });

  it('a clip that is already playing is left alone', () => {
    assert.deepEqual(planActivate({ ...base, mediaState: 'OBS_MEDIA_STATE_PLAYING' }), []);
  });

  it('no media state known: no media action (old behavior)', () => {
    assert.deepEqual(planActivate(base), []);
  });

  it('images never get a media action', () => {
    assert.deepEqual(planActivate({ ...base, kind: 'image', mediaState: 'OBS_MEDIA_STATE_PAUSED' }), []);
  });
});
