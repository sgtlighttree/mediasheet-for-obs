const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseDefaultOutput, createAudioDeviceService } = require('../lib/audiodevices');

const sample = {
  SPAudioDataType: [{
    _items: [
      { _name: 'MacBook Air Speakers', coreaudio_device_output: 2 },
      { _name: 'soundcore Space Q45', coreaudio_default_audio_input_device: 'spaudio_yes' },
      { _name: 'soundcore Space Q45', coreaudio_default_audio_output_device: 'spaudio_yes', coreaudio_device_output: 2 },
    ],
  }],
};

describe('parseDefaultOutput', () => {
  it('finds the default output device, not the default input', () => {
    assert.equal(parseDefaultOutput(sample), 'soundcore Space Q45');
    const inputOnly = { SPAudioDataType: [{ _items: [{ _name: 'Mic', coreaudio_default_audio_input_device: 'spaudio_yes' }] }] };
    assert.equal(parseDefaultOutput(inputOnly), null);
  });

  it('returns null for missing or malformed data', () => {
    assert.equal(parseDefaultOutput(null), null);
    assert.equal(parseDefaultOutput({}), null);
    assert.equal(parseDefaultOutput({ SPAudioDataType: [{}] }), null);
  });
});

describe('createAudioDeviceService', () => {
  it('caches for a few seconds, then asks again', async () => {
    let calls = 0; let t = 0;
    const svc = createAudioDeviceService({ platform: 'darwin', now: () => t, execFile: async () => { calls++; return JSON.stringify(sample); } });
    assert.equal(await svc.getDefaultOutput(), 'soundcore Space Q45');
    t = 1000; await svc.getDefaultOutput();
    assert.equal(calls, 1);
    t = 6000; await svc.getDefaultOutput();
    assert.equal(calls, 2);
  });

  it('is null off macOS and when the command fails or prints garbage', async () => {
    assert.equal(await createAudioDeviceService({ platform: 'linux' }).getDefaultOutput(), null);
    assert.equal(await createAudioDeviceService({ platform: 'darwin', execFile: async () => { throw new Error('x'); } }).getDefaultOutput(), null);
    assert.equal(await createAudioDeviceService({ platform: 'darwin', execFile: async () => 'not json' }).getDefaultOutput(), null);
  });
});
