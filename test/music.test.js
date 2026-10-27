const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { groupAudioTracks, isAudioOnlyScene, sliderToMul, mulToSlider } = require('../public/playlist.js');

const audio = (file, sourceName = file) => ({ kind: 'audio', file, sourceName });

describe('groupAudioTracks', () => {
  it('groups per scene, scenes and tracks sorted A-Z', () => {
    const groups = groupAudioTracks([
      { sceneName: 'stingers', items: [audio('/m/zap.wav'), audio('/m/Boom.wav')] },
      { sceneName: 'Background music', items: [audio('/m/StandbyLiveMusic.mp3')] },
      { sceneName: 'playout', items: [{ kind: 'video', file: '/v/a.mp4' }] },
    ]);
    assert.deepEqual(groups.map((g) => g.scene), ['Background music', 'stingers']);
    assert.deepEqual(groups[1].tracks.map((t) => t.label), ['Boom.wav', 'zap.wav']);
  });
  it('labels a track by its file name and skips duplicates in one scene', () => {
    const [g] = groupAudioTracks([{ sceneName: 'a', items: [audio('/m/x/song.mp3', 's1'), audio('/m/x/song.mp3', 's2')] }]);
    assert.equal(g.tracks.length, 1);
    assert.equal(g.tracks[0].label, 'song.mp3');
  });
  it('a scene without audio files is not listed', () => {
    assert.deepEqual(groupAudioTracks([{ sceneName: 'a', items: [{ kind: 'other' }] }]), []);
  });
  it('sorts numbers naturally', () => {
    const [g] = groupAudioTracks([{ sceneName: 'a', items: [audio('/m/take10.mp3'), audio('/m/take2.mp3')] }]);
    assert.deepEqual(g.tracks.map((t) => t.label), ['take2.mp3', 'take10.mp3']);
  });
});

describe('isAudioOnlyScene', () => {
  it('is true only when every item is an audio file', () => {
    assert.equal(isAudioOnlyScene([{ kind: 'audio' }]), true);
    assert.equal(isAudioOnlyScene([{ kind: 'audio' }, { kind: 'video' }]), false);
    assert.equal(isAudioOnlyScene([]), false);
  });
});

describe('music volume slider', () => {
  it('0 is silent, 100 is 0 dB', () => {
    assert.equal(sliderToMul(0), 0);
    assert.ok(Math.abs(sliderToMul(100) - 1) < 1e-9);
  });
  it('maps back and forth', () => {
    for (const v of [1, 25, 50, 89, 100]) assert.equal(mulToSlider(sliderToMul(v)), v);
  });
  it('reads a source at -6.3 dB as about 89', () => {
    assert.equal(mulToSlider(0.4826492667198181), 89);
  });
  it('clamps', () => {
    assert.equal(mulToSlider(3), 100);
    assert.equal(mulToSlider(0), 0);
    assert.equal(sliderToMul(500), sliderToMul(100));
  });
});
