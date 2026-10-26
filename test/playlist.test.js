const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const playlist = require('../public/playlist.js');

const {
  EXT,
  classifyItem,
  detectPlaylist,
  routeToMonitorType,
  monitorTypeToRoute,
  planCue,
  planIdle,
  planLeave,
  planActivate,
  shouldIdleReset,
  shouldEvaluatePileup,
} = playlist;

const MON_NONE = 'OBS_MONITORING_TYPE_NONE';
const MON_ONLY = 'OBS_MONITORING_TYPE_MONITOR_ONLY';
const MON_BOTH = 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT';
const STOP = 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP';

describe('EXT', () => {
  it('exposes lowercase extension lists per media kind', () => {
    assert.ok(EXT.video.includes('mp4'));
    assert.ok(EXT.image.includes('png'));
    assert.ok(EXT.audio.includes('mp3'));
  });
});

describe('classifyItem', () => {
  it('classifies ffmpeg_source with .mp4 as video', () => {
    assert.equal(classifyItem({ inputKind: 'ffmpeg_source', localFile: '/a/clip.mp4', isLocalFile: true }), 'video');
  });

  it('classifies uppercase .MOV as video', () => {
    assert.equal(classifyItem({ inputKind: 'ffmpeg_source', localFile: '/a/CLIP.MOV' }), 'video');
  });

  it('treats ffmpeg_source with no or unknown extension as video', () => {
    assert.equal(classifyItem({ inputKind: 'ffmpeg_source', localFile: '/a/clip' }), 'video');
    assert.equal(classifyItem({ inputKind: 'ffmpeg_source', localFile: '/a/clip.xyz' }), 'video');
    assert.equal(classifyItem({ inputKind: 'ffmpeg_source', localFile: null }), 'video');
  });

  it('classifies ffmpeg_source with an image extension as image', () => {
    assert.equal(classifyItem({ inputKind: 'ffmpeg_source', localFile: '/a/still.png' }), 'image');
  });

  it('classifies ffmpeg_source with an audio extension as audio', () => {
    assert.equal(classifyItem({ inputKind: 'ffmpeg_source', localFile: '/a/song.mp3' }), 'audio');
  });

  it('classifies ffmpeg_source with isLocalFile:false as other', () => {
    assert.equal(classifyItem({ inputKind: 'ffmpeg_source', localFile: '/a/clip.mp4', isLocalFile: false }), 'other');
  });

  it('treats a missing isLocalFile as local', () => {
    const item = { inputKind: 'ffmpeg_source', localFile: '/a/clip.mp4' };
    assert.equal(classifyItem(item), 'video');
    assert.equal(classifyItem({ ...item, isLocalFile: undefined }), 'video');
  });

  it('classifies image_source as image', () => {
    assert.equal(classifyItem({ inputKind: 'image_source' }), 'image');
  });

  it('classifies slideshow_v2 and slideshow as image', () => {
    assert.equal(classifyItem({ inputKind: 'slideshow_v2' }), 'image');
    assert.equal(classifyItem({ inputKind: 'slideshow' }), 'image');
  });

  it('classifies other input kinds as other', () => {
    assert.equal(classifyItem({ inputKind: 'macos-avcapture' }), 'other');
  });
});

describe('detectPlaylist', () => {
  const v = (id) => ({ sceneItemId: id, sourceName: `v${id}`, kind: 'video' });
  const i = (id) => ({ sceneItemId: id, sourceName: `i${id}`, kind: 'image' });

  it('returns auto video playlist for 2 videos', () => {
    const items = [v(1), v(2)];
    assert.deepEqual(detectPlaylist(items), { auto: true, kind: 'video', clips: items });
  });

  it('returns auto image playlist for 2 images', () => {
    const items = [i(1), i(2)];
    assert.deepEqual(detectPlaylist(items), { auto: true, kind: 'image', clips: items });
  });

  it('is not auto for 1 video and 1 image', () => {
    assert.deepEqual(detectPlaylist([v(1), i(2)]), { auto: false, kind: null, clips: [] });
  });

  it('prefers video when a scene has 2 videos and 2 images', () => {
    const videos = [v(1), v(2)];
    assert.deepEqual(detectPlaylist([v(1), i(3), v(2), i(4)]), { auto: true, kind: 'video', clips: videos });
  });

  it('is not auto for a camera plus an overlay', () => {
    const items = [
      { sceneItemId: 1, sourceName: 'Cam', kind: 'other' },
      { sceneItemId: 2, sourceName: 'Logo', kind: 'image' },
    ];
    assert.deepEqual(detectPlaylist(items), { auto: false, kind: null, clips: [] });
  });

  it('returns an empty non-auto result for an empty scene', () => {
    assert.deepEqual(detectPlaylist([]), { auto: false, kind: null, clips: [] });
  });
});

describe('route mapping', () => {
  it('maps routes to OBS monitor types', () => {
    assert.equal(routeToMonitorType('both'), MON_BOTH);
    assert.equal(routeToMonitorType('room'), MON_ONLY);
    assert.equal(routeToMonitorType('stream'), MON_NONE);
  });

  it('round-trips all three routes', () => {
    for (const route of ['both', 'room', 'stream']) {
      assert.equal(monitorTypeToRoute(routeToMonitorType(route)), route);
    }
  });

  it('maps an unknown monitor type to stream', () => {
    assert.equal(monitorTypeToRoute('OBS_MONITORING_TYPE_SOMETHING_NEW'), 'stream');
  });
});

describe('planCue', () => {
  const S = 'Scene';
  const A = { sceneItemId: 1, sourceName: 'A', kind: 'video', enabled: true };
  const B = { sceneItemId: 2, sourceName: 'B', kind: 'video', enabled: true };
  const C = { sceneItemId: 3, sourceName: 'C', kind: 'video', enabled: false };
  const D = { sceneItemId: 4, sourceName: 'D', kind: 'video', enabled: false };
  const items = [A, B, C, D];

  const cue = (overrides = {}) => planCue({
    sceneName: S,
    clip: C,
    items,
    active: new Set(),
    monitorType: MON_NONE,
    streamOnlyChosen: false,
    ...overrides,
  });

  const enabledReq = (id, on) => ({ request: 'SetSceneItemEnabled', data: { sceneName: S, sceneItemId: id, sceneItemEnabled: on } });

  it('turns every other enabled item off before the target goes on', () => {
    const reqs = cue();
    const offA = reqs.findIndex((r) => r.request === 'SetSceneItemEnabled' && r.data.sceneItemId === 1 && r.data.sceneItemEnabled === false);
    const offB = reqs.findIndex((r) => r.request === 'SetSceneItemEnabled' && r.data.sceneItemId === 2 && r.data.sceneItemEnabled === false);
    const onC = reqs.findIndex((r) => r.request === 'SetSceneItemEnabled' && r.data.sceneItemId === 3 && r.data.sceneItemEnabled === true);
    assert.ok(offA >= 0 && offB >= 0 && onC >= 0);
    assert.ok(offA < onC);
    assert.ok(offB < onC);
  });

  it('raises the target to the top layer after enabling it', () => {
    const reqs = cue();
    const onC = reqs.findIndex((r) => r.request === 'SetSceneItemEnabled' && r.data.sceneItemId === 3);
    const index = reqs.findIndex((r) => r.request === 'SetSceneItemIndex');
    assert.deepEqual(reqs[index], { request: 'SetSceneItemIndex', data: { sceneName: S, sceneItemId: 3, sceneItemIndex: 3 } });
    assert.ok(onC < index);
  });

  it('unmutes and enforces Room + stream for an inactive video on Stream-only monitoring', () => {
    const reqs = cue();
    assert.ok(reqs.some((r) => r.request === 'SetInputMute' && r.data.inputName === 'C' && r.data.inputMuted === false));
    assert.ok(reqs.some((r) => r.request === 'SetInputAudioMonitorType' && r.data.inputName === 'C' && r.data.monitorType === MON_BOTH));
  });

  it('unmutes but leaves monitoring alone when Stream only was chosen', () => {
    const reqs = cue({ streamOnlyChosen: true });
    assert.ok(reqs.some((r) => r.request === 'SetInputMute' && r.data.inputMuted === false));
    assert.ok(!reqs.some((r) => r.request === 'SetInputAudioMonitorType'));
  });

  it('leaves an existing Room only route alone', () => {
    const reqs = cue({ monitorType: MON_ONLY });
    assert.ok(!reqs.some((r) => r.request === 'SetInputAudioMonitorType'));
  });

  it('touches no mute or monitor for an active clip', () => {
    const reqs = cue({ active: new Set(['C']) });
    assert.ok(!reqs.some((r) => r.request === 'SetInputMute'));
    assert.ok(!reqs.some((r) => r.request === 'SetInputAudioMonitorType'));
    assert.ok(reqs.some((r) => r.request === 'SetSceneItemIndex'));
  });

  it('turns off the eye of a live clip in Preview but sends it no input-level request', () => {
    const reqs = cue({ active: new Set(['A', 'C']) });
    assert.ok(reqs.some((r) => r.request === 'SetSceneItemEnabled' && r.data.sceneItemId === 1 && r.data.sceneItemEnabled === false));
    assert.ok(!reqs.some((r) => r.data.inputName === 'A'));
  });

  it('gives an image clip eye and index changes only', () => {
    const image = { sceneItemId: 3, sourceName: 'C', kind: 'image', enabled: false };
    const reqs = planCue({
      sceneName: S, clip: image, items: [A, B, image], active: new Set(),
      monitorType: MON_NONE, streamOnlyChosen: false,
    });
    assert.deepEqual(reqs.map((r) => r.request), [
      'SetSceneItemEnabled', 'SetSceneItemEnabled', 'SetSceneItemEnabled', 'SetSceneItemIndex',
    ]);
  });

  it('does not re-disable others that are already off', () => {
    const reqs = cue();
    assert.ok(!reqs.some((r) => r.request === 'SetSceneItemEnabled' && r.data.sceneItemId === 4));
  });

  it('emits requests in the pinned order', () => {
    assert.deepEqual(cue(), [
      { request: 'SetSceneItemEnabled', data: { sceneName: S, sceneItemId: 1, sceneItemEnabled: false } },
      { request: 'SetSceneItemEnabled', data: { sceneName: S, sceneItemId: 2, sceneItemEnabled: false } },
      { request: 'SetSceneItemEnabled', data: { sceneName: S, sceneItemId: 3, sceneItemEnabled: true } },
      { request: 'SetSceneItemIndex', data: { sceneName: S, sceneItemId: 3, sceneItemIndex: 3 } },
      { request: 'SetInputMute', data: { inputName: 'C', inputMuted: false } },
      { request: 'SetInputAudioMonitorType', data: { inputName: 'C', monitorType: MON_BOTH } },
    ]);
  });
});

describe('planIdle', () => {
  const S = 'Scene';

  it('stops inactive video clips and turns their eyes off', () => {
    const clips = [
      { sceneItemId: 1, sourceName: 'A', kind: 'video', enabled: true },
      { sceneItemId: 2, sourceName: 'B', kind: 'video', enabled: true },
    ];
    assert.deepEqual(planIdle({ sceneName: S, clips, active: new Set(['A']) }), [
      { request: 'SetSceneItemEnabled', data: { sceneName: S, sceneItemId: 2, sceneItemEnabled: false } },
      { request: 'TriggerMediaInputAction', data: { inputName: 'B', mediaAction: STOP } },
    ]);
  });

  it('never touches an active clip', () => {
    const clips = [{ sceneItemId: 1, sourceName: 'A', kind: 'video', enabled: true }];
    assert.deepEqual(planIdle({ sceneName: S, clips, active: new Set(['A']) }), []);
  });

  it('turns an image eye off without any media action', () => {
    const clips = [{ sceneItemId: 5, sourceName: 'I', kind: 'image', enabled: true }];
    assert.deepEqual(planIdle({ sceneName: S, clips, active: new Set() }), [
      { request: 'SetSceneItemEnabled', data: { sceneName: S, sceneItemId: 5, sceneItemEnabled: false } },
    ]);
  });

  it('skips the eye request for an already disabled clip but still stops it', () => {
    const clips = [{ sceneItemId: 1, sourceName: 'A', kind: 'video', enabled: false }];
    assert.deepEqual(planIdle({ sceneName: S, clips, active: new Set() }), [
      { request: 'TriggerMediaInputAction', data: { inputName: 'A', mediaAction: STOP } },
    ]);
  });

  it('returns nothing for an empty clip list', () => {
    assert.deepEqual(planIdle({ sceneName: S, clips: [], active: new Set() }), []);
  });
});

describe('planLeave', () => {
  it('mutes an inactive video that left Program', () => {
    assert.deepEqual(planLeave({ sourceName: 'A', kind: 'video', active: new Set() }), [
      { request: 'SetInputMute', data: { inputName: 'A', inputMuted: true } },
    ]);
  });

  it('does nothing while the clip is still active', () => {
    assert.deepEqual(planLeave({ sourceName: 'A', kind: 'video', active: new Set(['A']) }), []);
  });

  it('does nothing for non-video items', () => {
    assert.deepEqual(planLeave({ sourceName: 'I', kind: 'image', active: new Set() }), []);
  });
});

describe('planActivate', () => {
  const base = {
    sourceName: 'A',
    kind: 'video',
    muted: false,
    monitorType: MON_BOTH,
    streamOnlyChosen: false,
    monitorSwitchSafe: true,
  };

  it('only unmutes a muted video whose monitor type is already Room + stream', () => {
    assert.deepEqual(planActivate({ ...base, muted: true }), [
      { request: 'SetInputMute', data: { inputName: 'A', inputMuted: false } },
    ]);
  });

  it('unmutes a muted video and switches Stream only to Room + stream', () => {
    assert.deepEqual(planActivate({ ...base, muted: true, monitorType: MON_NONE }), [
      { request: 'SetInputMute', data: { inputName: 'A', inputMuted: false } },
      { request: 'SetInputAudioMonitorType', data: { inputName: 'A', monitorType: MON_BOTH } },
    ]);
  });

  it('switches only the monitor for an unmuted Stream only video', () => {
    assert.deepEqual(planActivate({ ...base, monitorType: MON_NONE }), [
      { request: 'SetInputAudioMonitorType', data: { inputName: 'A', monitorType: MON_BOTH } },
    ]);
  });

  it('does not switch monitoring when the switch is not safe', () => {
    assert.deepEqual(planActivate({ ...base, monitorType: MON_NONE, monitorSwitchSafe: false }), []);
  });

  it('does not switch monitoring when Stream only was chosen', () => {
    assert.deepEqual(planActivate({ ...base, monitorType: MON_NONE, streamOnlyChosen: true }), []);
  });

  it('leaves a Room only route alone', () => {
    assert.deepEqual(planActivate({ ...base, monitorType: MON_ONLY }), []);
  });

  it('returns nothing for an image', () => {
    assert.deepEqual(planActivate({ ...base, kind: 'image', muted: true, monitorType: MON_NONE }), []);
  });
});

describe('shouldIdleReset', () => {
  const base = { managed: true, isProgram: false, isPreview: false, enabledClipCount: 1, trigger: 'connect' };

  it('never resets an unmanaged scene', () => {
    assert.equal(shouldIdleReset({ ...base, managed: false }), false);
    assert.equal(shouldIdleReset({ ...base, managed: false, trigger: 'leftViews' }), false);
  });

  it('never resets on an other trigger', () => {
    assert.equal(shouldIdleReset({ ...base, trigger: 'other' }), false);
  });

  it('resets a managed scene that is off both views on connect', () => {
    assert.equal(shouldIdleReset(base), true);
  });

  it('resets a managed scene that left the views', () => {
    assert.equal(shouldIdleReset({ ...base, trigger: 'leftViews' }), true);
  });

  it('does not reset a Preview scene with exactly one enabled clip (that is a cue)', () => {
    assert.equal(shouldIdleReset({ ...base, isPreview: true, enabledClipCount: 1 }), false);
  });

  it('resets a Preview scene with two enabled clips', () => {
    assert.equal(shouldIdleReset({ ...base, isPreview: true, enabledClipCount: 2 }), true);
  });

  it('does not reset a Program only scene with one enabled clip', () => {
    assert.equal(shouldIdleReset({ ...base, isProgram: true, enabledClipCount: 1 }), false);
  });
});

describe('shouldEvaluatePileup', () => {
  it('never evaluates during a transition', () => {
    assert.equal(shouldEvaluatePileup({ transitioning: true, msSinceTransitionEnd: null, liveClips: 2 }), false);
  });

  it('waits 1.5 s after a transition ends', () => {
    assert.equal(shouldEvaluatePileup({ transitioning: false, msSinceTransitionEnd: 1000, liveClips: 2 }), false);
    assert.equal(shouldEvaluatePileup({ transitioning: false, msSinceTransitionEnd: 1500, liveClips: 2 }), true);
  });

  it('needs at least two live clips', () => {
    assert.equal(shouldEvaluatePileup({ transitioning: false, msSinceTransitionEnd: 1500, liveClips: 1 }), false);
  });

  it('evaluates with two live clips when no transition has happened', () => {
    assert.equal(shouldEvaluatePileup({ transitioning: false, msSinceTransitionEnd: null, liveClips: 2 }), true);
  });
});
