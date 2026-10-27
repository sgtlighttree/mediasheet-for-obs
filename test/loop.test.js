const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyItem, detectPlaylist, planCue } = require('../public/playlist.js');

const video = (over = {}) => ({ inputKind: 'ffmpeg_source', localFile: '/v/clip.mp4', isLocalFile: true, ...over });

describe('classifyItem with Loop', () => {
  it('a looped video is a background, not a clip', () => {
    assert.equal(classifyItem(video({ looping: true })), 'loop');
  });
  it('looping unset or false stays a video', () => {
    assert.equal(classifyItem(video()), 'video');
    assert.equal(classifyItem(video({ looping: false })), 'video');
  });
  it('a looped image or audio file keeps its kind', () => {
    assert.equal(classifyItem(video({ localFile: '/v/a.png', looping: true })), 'image');
    assert.equal(classifyItem(video({ localFile: '/v/a.mp3', looping: true })), 'audio');
  });
});

describe('a looped background in a playlist scene', () => {
  it('does not count towards detecting a playlist', () => {
    const items = [{ kind: 'video' }, { kind: 'loop' }];
    assert.equal(detectPlaylist(items).auto, false);
    assert.equal(detectPlaylist([...items, { kind: 'video' }]).clips.length, 2);
  });

  it('stays enabled when a clip is cued', () => {
    const items = [
      { sceneItemId: 1, sourceName: 'bg', kind: 'loop', enabled: true },
      { sceneItemId: 2, sourceName: 'A', kind: 'video', enabled: true },
      { sceneItemId: 3, sourceName: 'B', kind: 'video', enabled: false },
    ];
    const reqs = planCue({ sceneName: 'playout', clip: items[2], items, active: new Set(), monitorType: 'OBS_MONITORING_TYPE_NONE', streamOnlyChosen: false });
    const disabled = reqs.filter((r) => r.request === 'SetSceneItemEnabled' && r.data.sceneItemEnabled === false).map((r) => r.data.sceneItemId);
    assert.deepEqual(disabled, [2]);
  });
});
