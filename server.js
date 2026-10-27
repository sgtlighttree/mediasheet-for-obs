const express = require('express');
const path = require('path');
const { resolveFile } = require('./lib/resolve');
const { readSceneDuplication } = require('./lib/obsconfig');
const { createThumbService } = require('./lib/thumbs');
const { createAudioDeviceService } = require('./lib/audiodevices');

const app = express();
const PORT = process.env.PORT || 3001;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
function isLoopback(req) {
  return LOOPBACK.has(req.socket.remoteAddress);
}

const THUMB_CACHE_DIR = path.join(__dirname, 'cache', 'thumbs');
const thumbs = createThumbService({ cacheDir: THUMB_CACHE_DIR });
const audioDevices = createAudioDeviceService();
const THUMB_ERRORS = { 400: 'bad_path', 404: 'not_found', 415: 'unsupported_type', 503: 'unavailable' };

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/obs-config', async (req, res) => {
  if (!isLoopback(req)) return res.status(403).json({ error: 'forbidden' });
  res.json({ sceneDuplication: await readSceneDuplication() });
});

app.get('/api/audio-devices', async (req, res) => {
  if (!isLoopback(req)) return res.status(403).json({ error: 'forbidden' });
  res.json({ defaultOutput: await audioDevices.getDefaultOutput() });
});

app.get('/api/thumb', async (req, res) => {
  if (!isLoopback(req)) return res.status(403).json({ error: 'forbidden' });
  const result = await thumbs.getThumbnail(typeof req.query.path === 'string' ? req.query.path : '');
  if (result.status === 200) {
    return res.sendFile(result.file, { root: THUMB_CACHE_DIR, maxAge: 60 * 1000 });
  }
  res.status(result.status).json({ error: THUMB_ERRORS[result.status] });
});

app.post('/api/resolve', async (req, res) => {
  const { name, size, lastModified } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'bad_request', message: 'Missing file name' });
  }
  try {
    const result = await resolveFile(name, size, lastModified);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'search_failed', message: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MediaSheet server listening on http://0.0.0.0:${PORT}`);
});
