const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const childProcess = require('child_process');
const { EXT } = require('../public/playlist');

const ALLOWED_EXT = new Set([...EXT.video, ...EXT.image]);
const MAX_CONCURRENT = 2;
const FFMPEG_TIMEOUT_MS = 10000;
const SEEK_SECONDS = ['0.5', '0'];

function isAllowedMediaPath(p) {
  if (typeof p !== 'string' || !p || !path.isAbsolute(p)) return false;
  if (p.split(/[\\/]/).includes('..')) return false;
  return ALLOWED_EXT.has(path.extname(p).slice(1).toLowerCase());
}

function cacheKeyFor(absPath) {
  return crypto.createHash('sha1').update(absPath).digest('hex');
}

function shapeIsValid(p) {
  return typeof p === 'string' && p !== '' && path.isAbsolute(p) && !p.split(/[\\/]/).includes('..');
}

function defaultFfmpegPath() {
  for (const candidate of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'ffmpeg';
}

function runExecFile(file, args, opts) {
  return new Promise((resolve, reject) => {
    childProcess.execFile(file, args, opts, (err) => (err ? reject(err) : resolve()));
  });
}

function createThumbService(deps) {
  const {
    cacheDir,
    ffmpegPath = defaultFfmpegPath(),
    execFile = runExecFile,
    stat = fsp.stat,
    realpath = fsp.realpath,
    mkdir = fsp.mkdir,
    readFile = fsp.readFile,
    writeFile = fsp.writeFile,
    rename = fsp.rename,
  } = deps;

  let running = 0;
  const waiting = [];
  function acquire() {
    if (running < MAX_CONCURRENT) {
      running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(resolve));
  }
  function release() {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }

  async function exists(p) {
    try {
      await stat(p);
      return true;
    } catch {
      return false;
    }
  }

  async function runFfmpeg(src, out, seek) {
    await acquire();
    try {
      await execFile(
        ffmpegPath,
        ['-hide_banner', '-loglevel', 'error', '-y', '-ss', seek, '-i', src,
          '-frames:v', '1', '-vf', 'scale=320:-1', '-q:v', '5', out],
        { timeout: FFMPEG_TIMEOUT_MS },
      );
    } finally {
      release();
    }
  }

  async function generate(src, key, sourceStat) {
    await mkdir(cacheDir, { recursive: true });
    const jpg = path.join(cacheDir, `${key}.jpg`);
    const sidecar = path.join(cacheDir, `${key}.json`);
    for (const seek of SEEK_SECONDS) {
      const tmp = path.join(cacheDir, `${key}.${crypto.randomBytes(6).toString('hex')}.tmp.jpg`);
      try {
        await runFfmpeg(src, tmp, seek);
      } catch (err) {
        if (err && err.code === 'ENOENT') throw err;
      }
      if (await exists(tmp)) {
        await rename(tmp, jpg);
        await writeFile(sidecar, JSON.stringify({ mtimeMs: sourceStat.mtimeMs, size: sourceStat.size }));
        return;
      }
    }
    throw new Error('thumb_not_produced');
  }

  const inflight = new Map();

  async function sidecarMatches(key, sourceStat) {
    try {
      const saved = JSON.parse(await readFile(path.join(cacheDir, `${key}.json`), 'utf8'));
      return saved.mtimeMs === sourceStat.mtimeMs && saved.size === sourceStat.size;
    } catch {
      return false;
    }
  }

  async function getThumbnail(absPath) {
    if (!shapeIsValid(absPath)) return { status: 400 };
    if (!ALLOWED_EXT.has(path.extname(absPath).slice(1).toLowerCase())) return { status: 415 };

    let real = absPath;
    try {
      real = await realpath(absPath);
    } catch {
      real = absPath;
    }
    if (!ALLOWED_EXT.has(path.extname(real).slice(1).toLowerCase())) return { status: 415 };

    const key = cacheKeyFor(absPath);
    const file = `${key}.jpg`;
    const jpg = path.join(cacheDir, file);

    let sourceStat;
    try {
      sourceStat = await stat(real);
    } catch {
      return (await exists(jpg)) ? { status: 200, file } : { status: 404 };
    }

    if ((await exists(jpg)) && (await sidecarMatches(key, sourceStat))) {
      return { status: 200, file };
    }

    if (!inflight.has(key)) {
      const job = generate(real, key, sourceStat).finally(() => inflight.delete(key));
      inflight.set(key, job);
    }
    try {
      await inflight.get(key);
      return { status: 200, file };
    } catch {
      return { status: 503 };
    }
  }

  return { getThumbnail };
}

module.exports = { isAllowedMediaPath, cacheKeyFor, createThumbService };
