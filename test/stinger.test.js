const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { stingerPointMs, planStingerTiming, planActivate } = require('../public/playlist.js');

describe('stingerPointMs', () => {
  it('reads a time-based transition point as ms', () => {
    assert.equal(stingerPointMs({ path: '/a.mov', tp_type: 0, transition_point: 1000 }, 30), 1000);
    assert.equal(stingerPointMs({ path: '/a.mov', transition_point: 750 }, 30), 750);
  });
  it('converts a frame-based point with the frame rate', () => {
    assert.equal(stingerPointMs({ path: '/a.mov', tp_type: 1, transition_point: 30 }, 30), 1000);
    assert.equal(stingerPointMs({ path: '/a.mov', tp_type: 1, transition_point: 30 }, 60), 500);
  });
  it('is null when the stinger has no video file, and 0 when no point is set', () => {
    assert.equal(stingerPointMs({}, 30), null);
    assert.equal(stingerPointMs(null, 30), null);
    assert.equal(stingerPointMs({ path: '/a.mov' }, 30), 0);
  });
});

describe('planStingerTiming', () => {
  it('ends the outgoing fade at the cut point and restarts the incoming clip just before it', () => {
    assert.deepEqual(planStingerTiming({ pointMs: 1000, fadeMs: 400, restartLeadMs: 300 }), { outDelay: 600, restartDelay: 700, inAt: 1000 });
  });
  it('never schedules before the start', () => {
    assert.deepEqual(planStingerTiming({ pointMs: 200, fadeMs: 400, restartLeadMs: 300 }), { outDelay: 0, restartDelay: 0, inAt: 200 });
  });
  it('with audio fades off the outgoing delay is the cut point', () => {
    assert.equal(planStingerTiming({ pointMs: 1000, fadeMs: 0, restartLeadMs: 300 }).outDelay, 1000);
  });
});

describe('planActivate during a stinger', () => {
  const base = { sourceName: 'A', kind: 'video', muted: true, monitorType: 'OBS_MONITORING_TYPE_NONE', streamOnlyChosen: false, monitorSwitchSafe: true, mediaState: 'OBS_MEDIA_STATE_PAUSED', prerolled: false };
  it('skips the restart but still unmutes and routes the clip', () => {
    const reqs = planActivate({ ...base, skipRestart: true });
    assert.equal(reqs.some((r) => r.request === 'TriggerMediaInputAction'), false);
    assert.equal(reqs.some((r) => r.request === 'SetInputMute'), true);
    assert.equal(reqs.some((r) => r.request === 'SetInputAudioMonitorType'), true);
  });
  it('restarts as before without the flag', () => {
    assert.equal(planActivate(base).some((r) => r.request === 'TriggerMediaInputAction'), true);
  });
});
