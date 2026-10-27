const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { planActivate } = require('../public/playlist.js');

const base = { sourceName: 'a.mp4', kind: 'video', muted: true, monitorType: 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT', streamOnlyChosen: false, monitorSwitchSafe: true };
const mute = { request: 'SetInputMute', data: { inputName: 'a.mp4', inputMuted: false } };

describe('planActivate with a pre-rolled clip', () => {
  it('a pre-rolled clip that is playing is not restarted (that restart is the black frame), but is still unmuted', () => {
    const reqs = planActivate({ ...base, prerolled: true, mediaState: 'OBS_MEDIA_STATE_PLAYING' });
    assert.deepEqual(reqs, [mute]);
  });

  it('a pre-rolled clip that is no longer playing is restarted as a fallback', () => {
    for (const s of ['PAUSED', 'ENDED', 'STOPPED']) {
      const reqs = planActivate({ ...base, prerolled: true, mediaState: 'OBS_MEDIA_STATE_' + s });
      assert.equal(reqs[0].data.mediaAction, 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART', s);
    }
  });

  it('without a pre-roll the clip is restarted even if playing', () => {
    const reqs = planActivate({ ...base, prerolled: false, mediaState: 'OBS_MEDIA_STATE_PLAYING' });
    assert.equal(reqs[0].data.mediaAction, 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART');
  });
});
