function createResolveFile({ execFile, fs, path } = {}) {
  return async function resolveFile(name, size, lastModified) {
    return { error: 'not_implemented', message: 'File resolution not yet implemented' };
  };
}

const resolveFile = createResolveFile({
  execFile: require('child_process').execFile,
  fs: require('fs'),
  path: require('path'),
});

module.exports = { resolveFile, createResolveFile };
