const MTIME_TOLERANCE_MS = 2000;

function createResolveFile({ execFile, fs, path } = {}) {
  return function resolveFile(name, size, lastModified) {
    return new Promise((resolve, reject) => {
      const query = `kMDItemFSName == "${name}"`;
      execFile('mdfind', [query], (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(
            `File search failed — Spotlight returned an error. ` +
            `Is mdutil reporting indexing as enabled? Run \`mdutil -s /\` in Terminal to check. ` +
            `(${err.message})`
          ));
        }

        const paths = stdout.trim().split('\n').filter(Boolean);

        if (paths.length === 0) {
          return resolve({
            error: 'not_found',
            message:
              `Couldn't locate ${name} on this Mac. ` +
              `This usually means Spotlight hasn't indexed the drive it's on ` +
              `(external drives, network volumes). Try re-adding the file or ` +
              `check System Settings → Spotlight → Privacy to make sure the drive isn't excluded.`,
          });
        }

        let candidates = [];
        for (const p of paths) {
          try {
            const stat = fs.statSync(p);
            candidates.push({
              path: p,
              size: stat.size,
              modified: stat.mtimeMs,
            });
          } catch {
            // File vanished between mdfind and stat — skip
          }
        }

        if (candidates.length === 0) {
          return resolve({
            error: 'not_found',
            message:
              `Spotlight found entries for ${name} but none could be read. ` +
              `The files may have been moved or deleted.`,
          });
        }

        if (size != null) {
          const sizeFiltered = candidates.filter((c) => c.size === size);
          if (sizeFiltered.length > 0) candidates = sizeFiltered;
        }

        if (lastModified != null) {
          const mtimeFiltered = candidates.filter(
            (c) => Math.abs(c.modified - lastModified) <= MTIME_TOLERANCE_MS
          );
          if (mtimeFiltered.length > 0) candidates = mtimeFiltered;
        }

        if (candidates.length === 1) {
          return resolve({ path: candidates[0].path });
        }

        return resolve({ matches: candidates });
      });
    });
  };
}

const resolveFile = createResolveFile({
  execFile: require('child_process').execFile,
  fs: require('fs'),
  path: require('path'),
});

module.exports = { resolveFile, createResolveFile };
