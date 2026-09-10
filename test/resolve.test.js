const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createResolveFile } = require('../lib/resolve');
const path = require('path');

function createResolver(execFileFn, statSyncFn) {
  return createResolveFile({ execFile: execFileFn, fs: { statSync: statSyncFn }, path });
}

describe('resolveFile', () => {
  describe('single match', () => {
    it('returns path when exactly one file matches name, size, and mtime', async () => {
      const execFileFn = (cmd, args, cb) => {
        cb(null, '/Users/matt/Videos/clip.mp4\n', '');
      };
      const statSyncFn = () => ({
        size: 1048576,
        mtimeMs: 1694300000000,
      });

      const resolve = createResolver(execFileFn, statSyncFn);
      const result = await resolve('clip.mp4', 1048576, 1694300000000);
      assert.deepEqual(result, { path: '/Users/matt/Videos/clip.mp4' });
    });
  });

  describe('multiple matches', () => {
    it('returns matches array when multiple files match', async () => {
      const execFileFn = (cmd, args, cb) => {
        cb(null, '/Users/matt/Videos/clip.mp4\n/Users/matt/Desktop/clip.mp4\n', '');
      };
      const statSyncFn = () => ({
        size: 1048576,
        mtimeMs: 1694300000000,
      });

      const resolve = createResolver(execFileFn, statSyncFn);
      const result = await resolve('clip.mp4', 1048576, 1694300000000);
      assert.ok(result.matches);
      assert.equal(result.matches.length, 2);
      assert.equal(result.matches[0].path, '/Users/matt/Videos/clip.mp4');
      assert.equal(result.matches[1].path, '/Users/matt/Desktop/clip.mp4');
    });
  });

  describe('no matches', () => {
    it('returns not_found error when mdfind returns no results', async () => {
      const execFileFn = (cmd, args, cb) => {
        cb(null, '', '');
      };
      const statSyncFn = mock.fn();

      const resolve = createResolver(execFileFn, statSyncFn);
      const result = await resolve('missing.mp4');
      assert.equal(result.error, 'not_found');
      assert.ok(result.message.includes('missing.mp4'));
    });
  });

  describe('mdfind error', () => {
    it('throws when mdfind process fails', async () => {
      const execFileFn = (cmd, args, cb) => {
        cb(new Error('mdfind: command not found'), '', '');
      };
      const statSyncFn = mock.fn();

      const resolve = createResolver(execFileFn, statSyncFn);
      await assert.rejects(() => resolve('clip.mp4'), { message: /mdfind/ });
    });
  });

  describe('size disambiguation', () => {
    it('filters out files with wrong size', async () => {
      const execFileFn = (cmd, args, cb) => {
        cb(null, '/path/a/clip.mp4\n/path/b/clip.mp4\n', '');
      };
      const statSyncFn = (p) => {
        if (p === '/path/a/clip.mp4') return { size: 1048576, mtimeMs: 1694300000000 };
        return { size: 999, mtimeMs: 1694300000000 };
      };

      const resolve = createResolver(execFileFn, statSyncFn);
      const result = await resolve('clip.mp4', 1048576, 1694300000000);
      assert.deepEqual(result, { path: '/path/a/clip.mp4' });
    });
  });

  describe('mtime disambiguation', () => {
    it('filters out files with mtime differing by more than 2 seconds', async () => {
      const execFileFn = (cmd, args, cb) => {
        cb(null, '/path/a/clip.mp4\n/path/b/clip.mp4\n', '');
      };
      const statSyncFn = (p) => {
        if (p === '/path/a/clip.mp4') return { size: 1048576, mtimeMs: 1694300000000 };
        return { size: 1048576, mtimeMs: 1694300010000 }; // 10s off
      };

      const resolve = createResolver(execFileFn, statSyncFn);
      const result = await resolve('clip.mp4', 1048576, 1694300000000);
      assert.deepEqual(result, { path: '/path/a/clip.mp4' });
    });
  });

  describe('no size/mtime provided', () => {
    it('returns all mdfind matches without filtering', async () => {
      const execFileFn = (cmd, args, cb) => {
        cb(null, '/path/a/clip.mp4\n/path/b/clip.mp4\n', '');
      };
      const statSyncFn = (p) => ({
        size: p === '/path/a/clip.mp4' ? 100 : 200,
        mtimeMs: 1694300000000,
      });

      const resolve = createResolver(execFileFn, statSyncFn);
      const result = await resolve('clip.mp4');
      assert.ok(result.matches);
      assert.equal(result.matches.length, 2);
    });
  });

  describe('stat error on one file', () => {
    it('skips files that fail to stat', async () => {
      const execFileFn = (cmd, args, cb) => {
        cb(null, '/path/a/clip.mp4\n/path/gone/clip.mp4\n', '');
      };
      const statSyncFn = (p) => {
        if (p === '/path/gone/clip.mp4') throw new Error('ENOENT');
        return { size: 1048576, mtimeMs: 1694300000000 };
      };

      const resolve = createResolver(execFileFn, statSyncFn);
      const result = await resolve('clip.mp4', 1048576, 1694300000000);
      assert.deepEqual(result, { path: '/path/a/clip.mp4' });
    });
  });

  describe('mdfind query format', () => {
    it('uses kMDItemFSName exact match query', async () => {
      let capturedArgs;
      const execFileFn = (cmd, args, cb) => {
        capturedArgs = args;
        cb(null, '', '');
      };
      const statSyncFn = mock.fn();

      const resolve = createResolver(execFileFn, statSyncFn);
      await resolve('my file (1).mp4');
      assert.ok(capturedArgs[0].includes('kMDItemFSName'));
      assert.ok(capturedArgs[0].includes('my file (1).mp4'));
    });
  });
});
