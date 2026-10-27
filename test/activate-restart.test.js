const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { planActivate } = require('../public/playlist.js');

const base = { sourceName: 'a.mp4', kind: 'video', muted: false, monitorType: 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT', streamOnlyChosen: false, monitorSwitchSafe: true };
const restart = { request: 'TriggerMediaInputAction', data: { inputName: 'a.mp4', mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' } };

// Replaces the earlier PLAY-on-activate tests: resuming a cued clip with PLAY held the old picture ~1 s while the audio ran (measured 2026-10-27), RESTART does not.
describe('planActivate restart', () => {
  it('a clip going live is restarted whatever state OBS reports, first in the plan', () => {
    for (const s of ['PAUSED', 'ENDED', 'STOPPED', 'PLAYING']) {
      const reqs = planActivate({ ...base, muted: true, mediaState: 'OBS_MEDIA_STATE_' + s });
      assert.deepEqual(reqs[0], restart, s);
      assert.equal(reqs.length, 2, s);
    }
  });

  it('never sends PLAY', () => {
    const reqs = planActivate({ ...base, mediaState: 'OBS_MEDIA_STATE_PAUSED' });
    assert.ok(!reqs.some((r) => r.data.mediaAction && r.data.mediaAction.endsWith('_PLAY')));
  });

  it('no media state known: no media action', () => {
    assert.deepEqual(planActivate(base), []);
  });

  it('images never get a media action', () => {
    assert.deepEqual(planActivate({ ...base, kind: 'image', mediaState: 'OBS_MEDIA_STATE_PAUSED' }), []);
  });
});
