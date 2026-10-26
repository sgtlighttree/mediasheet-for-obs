const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const crypto = require('crypto');
const { isAllowedMediaPath, cacheKeyFor, createThumbService } = require('../lib/thumbs');

const CACHE = '/cache/thumbs';
const SRC = '/Volumes/MATT 3/clips/a.mp4';
const KEY = cacheKeyFor(SRC);
const JPG = path.join(CACHE, `${KEY}.jpg`);
const SIDE = path.join(CACHE, `${KEY}.json`);

function notFound(p) {
  return Object.assign(new Error(`ENOENT ${p}`), { code: 'ENOENT' });
}

function makeFs(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    stat: async (p) => {
      const e = entries.get(p);
      if (!e || !e.stat) throw notFound(p);
      return { mtimeMs: e.stat.mtimeMs, size: e.stat.size };
    },
    realpath: async (p) => {
      const e = entries.get(p);
      return e && e.target ? e.target : p;
    },
    readFile: async (p) => {
      const e = entries.get(p);
      if (!e || e.text === undefined) throw notFound(p);
      return e.text;
    },
    writeFile: async (p, text) => {
      entries.set(p, { ...(entries.get(p) || {}), text });
    },
    mkdir: async () => {},
    rename: async (from, to) => {
      const e = entries.get(from);
      if (!e) throw notFound(from);
      entries.delete(from);
      entries.set(to, e);
    },
  };
}

function ffmpegStub(fsx, behave) {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const execFile = async (file, args, opts) => {
    const n = calls.length;
    calls.push({ file, args, opts });
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      if (behave) await behave(args, n);
      const out = args[args.length - 1];
      fsx.entries.set(out, { stat: { mtimeMs: 1, size: 1 } });
    } finally {
      active--;
    }
  };
  return { calls, execFile, maxActive: () => maxActive };
}

function service(fsx, ffm, extra = {}) {
  return createThumbService({
    cacheDir: CACHE,
    ffmpegPath: 'ffmpeg',
    execFile: ffm.execFile,
    stat: fsx.stat,
    realpath: fsx.realpath,
    mkdir: fsx.mkdir,
    readFile: fsx.readFile,
    writeFile: fsx.writeFile,
    rename: fsx.rename,
    ...extra,
  });
}

const sourceEntry = (mtimeMs = 100, size = 500) => ({ stat: { mtimeMs, size } });

describe('isAllowedMediaPath', () => {
  it('accepts absolute video and image paths case-insensitively', () => {
    assert.equal(isAllowedMediaPath('/a/b.MP4'), true);
    assert.equal(isAllowedMediaPath('/a/b.png'), true);
  });

  it('rejects relative paths, parent segments, empty input and non-media extensions', () => {
    assert.equal(isAllowedMediaPath('a.mp4'), false);
    assert.equal(isAllowedMediaPath('/a/../b.mp4'), false);
    assert.equal(isAllowedMediaPath(''), false);
    assert.equal(isAllowedMediaPath('/a/b.txt'), false);
    assert.equal(isAllowedMediaPath('/a/b.mp3'), false);
  });
});

describe('cacheKeyFor', () => {
  it('is the 40-hex sha1 of the path string', () => {
    const expected = crypto.createHash('sha1').update(SRC).digest('hex');
    assert.equal(cacheKeyFor(SRC), expected);
    assert.match(cacheKeyFor(SRC), /^[0-9a-f]{40}$/);
  });
});

describe('getThumbnail status rules', () => {
  it('returns 400 for a relative path without running ffmpeg', async () => {
    const fsx = makeFs();
    const ffm = ffmpegStub(fsx);
    const r = await service(fsx, ffm).getThumbnail('clips/a.mp4');
    assert.deepEqual(r, { status: 400 });
    assert.equal(ffm.calls.length, 0);
  });

  it('returns 400 for a path with a .. segment', async () => {
    const fsx = makeFs({ '/m/b.mp4': { stat: { mtimeMs: 1, size: 1 } } });
    const ffm = ffmpegStub(fsx);
    const r = await service(fsx, ffm).getThumbnail('/m/../m/b.mp4');
    assert.deepEqual(r, { status: 400 });
    assert.equal(ffm.calls.length, 0);
  });

  it('returns 415 for a .txt file', async () => {
    const fsx = makeFs({ '/m/notes.txt': sourceEntry() });
    const ffm = ffmpegStub(fsx);
    const r = await service(fsx, ffm).getThumbnail('/m/notes.txt');
    assert.deepEqual(r, { status: 415 });
    assert.equal(ffm.calls.length, 0);
  });

  it('returns 415 when a symlink resolves to a .txt file', async () => {
    const fsx = makeFs({
      '/m/link.mp4': { target: '/m/secret.txt' },
      '/m/secret.txt': sourceEntry(),
    });
    const ffm = ffmpegStub(fsx);
    const r = await service(fsx, ffm).getThumbnail('/m/link.mp4');
    assert.deepEqual(r, { status: 415 });
    assert.equal(ffm.calls.length, 0);
  });

  it('returns 404 when the file is missing and nothing is cached', async () => {
    const fsx = makeFs();
    const ffm = ffmpegStub(fsx);
    const r = await service(fsx, ffm).getThumbnail(SRC);
    assert.deepEqual(r, { status: 404 });
    assert.equal(ffm.calls.length, 0);
  });

  it('serves a matching cache entry without running ffmpeg', async () => {
    const fsx = makeFs({
      [SRC]: sourceEntry(100, 500),
      [JPG]: { stat: { mtimeMs: 1, size: 1 } },
      [SIDE]: { text: JSON.stringify({ mtimeMs: 100, size: 500 }) },
    });
    const ffm = ffmpegStub(fsx);
    const r = await service(fsx, ffm).getThumbnail(SRC);
    assert.deepEqual(r, { status: 200, file: `${KEY}.jpg` });
    assert.equal(ffm.calls.length, 0);
  });

  it('regenerates and rewrites the sidecar when the mtime changed', async () => {
    const fsx = makeFs({
      [SRC]: sourceEntry(200, 500),
      [JPG]: { stat: { mtimeMs: 1, size: 1 } },
      [SIDE]: { text: JSON.stringify({ mtimeMs: 100, size: 500 }) },
    });
    const ffm = ffmpegStub(fsx);
    const r = await service(fsx, ffm).getThumbnail(SRC);
    assert.deepEqual(r, { status: 200, file: `${KEY}.jpg` });
    assert.equal(ffm.calls.length, 1);
    assert.deepEqual(JSON.parse(fsx.entries.get(SIDE).text), { mtimeMs: 200, size: 500 });
  });

  it('serves the stale cached thumbnail when stat fails (drive ejected)', async () => {
    const fsx = makeFs({
      [JPG]: { stat: { mtimeMs: 1, size: 1 } },
      [SIDE]: { text: JSON.stringify({ mtimeMs: 100, size: 500 }) },
    });
    const ffm = ffmpegStub(fsx);
    const r = await service(fsx, ffm).getThumbnail(SRC);
    assert.deepEqual(r, { status: 200, file: `${KEY}.jpg` });
    assert.equal(ffm.calls.length, 0);
  });

  it('returns 503 when ffmpeg is missing (ENOENT) and does not retry', async () => {
    const fsx = makeFs({ [SRC]: sourceEntry() });
    const ffm = ffmpegStub(fsx, () => {
      throw Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' });
    });
    const r = await service(fsx, ffm).getThumbnail(SRC);
    assert.deepEqual(r, { status: 503 });
    assert.equal(ffm.calls.length, 1);
  });

  it('returns 503 when ffmpeg times out', async () => {
    const fsx = makeFs({ [SRC]: sourceEntry() });
    const ffm = ffmpegStub(fsx, () => {
      throw Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' });
    });
    const r = await service(fsx, ffm).getThumbnail(SRC);
    assert.deepEqual(r, { status: 503 });
    assert.equal(ffm.calls[0].opts.timeout, 10000);
  });

  it('retries once with -ss 0 when the first attempt produces no file', async () => {
    const fsx = makeFs({ [SRC]: sourceEntry() });
    const ffm = ffmpegStub(fsx, (args, n) => {
      if (n === 0) {
        const out = args[args.length - 1];
        fsx.entries.delete(out);
        throw new Error('no frame');
      }
    });
    const r = await service(fsx, ffm).getThumbnail(SRC);
    assert.deepEqual(r, { status: 200, file: `${KEY}.jpg` });
    assert.equal(ffm.calls.length, 2);
    const second = ffm.calls[1].args;
    assert.equal(second[second.indexOf('-ss') + 1], '0');
  });

  it('shares one ffmpeg run between identical in-flight requests', async () => {
    const fsx = makeFs({ [SRC]: sourceEntry() });
    const ffm = ffmpegStub(fsx, () => new Promise((r) => setTimeout(r, 20)));
    const svcs = service(fsx, ffm);
    const [a, b] = await Promise.all([svcs.getThumbnail(SRC), svcs.getThumbnail(SRC)]);
    assert.deepEqual(a, { status: 200, file: `${KEY}.jpg` });
    assert.deepEqual(b, a);
    assert.equal(ffm.calls.length, 1);
  });

  it('never runs more than 2 ffmpeg processes at once', async () => {
    const paths = [1, 2, 3, 4, 5].map((i) => `/m/clip${i}.mp4`);
    const fsx = makeFs(Object.fromEntries(paths.map((p) => [p, sourceEntry()])));
    const ffm = ffmpegStub(fsx, () => new Promise((r) => setTimeout(r, 30)));
    const svcs = service(fsx, ffm);
    const results = await Promise.all(paths.map((p) => svcs.getThumbnail(p)));
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(ffm.calls.length, 5);
    assert.equal(ffm.maxActive(), 2);
  });

  it('passes the documented ffmpeg argv with the path as its own element', async () => {
    const fsx = makeFs({ [SRC]: sourceEntry() });
    const ffm = ffmpegStub(fsx);
    await service(fsx, ffm).getThumbnail(SRC);
    const { file, args } = ffm.calls[0];
    assert.equal(file, 'ffmpeg');
    assert.equal(args[args.indexOf('-ss') + 1], '0.5');
    assert.equal(args[args.indexOf('-frames:v') + 1], '1');
    assert.ok(args.includes('scale=320:-1'));
    assert.equal(args[args.indexOf('-i') + 1], SRC);
    assert.equal(path.dirname(args[args.length - 1]), CACHE);
    assert.ok(args[args.length - 1].endsWith('.jpg'));
  });
});
