const childProcess = require('child_process');

const OUTPUT_FLAG = 'coreaudio_default_audio_output_device';
const TTL_MS = 5000;

function parseDefaultOutput(profile) {
  const groups = Array.isArray(profile?.SPAudioDataType) ? profile.SPAudioDataType : [];
  for (const group of groups) {
    for (const item of group?._items ?? []) {
      if (item?.[OUTPUT_FLAG] === 'spaudio_yes' && typeof item._name === 'string') return item._name;
    }
  }
  return null;
}

function runExecFile(file, args, opts) {
  return new Promise((resolve, reject) => {
    childProcess.execFile(file, args, opts, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

// macOS only: reads the system default output device. Anything else, or any failure, is "unknown" (null), never an error.
function createAudioDeviceService({ execFile = runExecFile, now = Date.now, platform = process.platform } = {}) {
  let cached = null;
  let cachedAt = -Infinity;

  async function getDefaultOutput() {
    if (platform !== 'darwin') return null;
    if (now() - cachedAt < TTL_MS) return cached;
    try {
      const out = await execFile('/usr/sbin/system_profiler', ['SPAudioDataType', '-json'], { timeout: 4000, maxBuffer: 4 * 1024 * 1024 });
      cached = parseDefaultOutput(JSON.parse(out));
    } catch {
      cached = null;
    }
    cachedAt = now();
    return cached;
  }

  return { getDefaultOutput };
}

module.exports = { parseDefaultOutput, createAudioDeviceService };
