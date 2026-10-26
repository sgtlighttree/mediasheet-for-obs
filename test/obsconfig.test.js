const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { parseSceneDuplication, readSceneDuplication } = require('../lib/obsconfig');

describe('parseSceneDuplication', () => {
  it('returns true when SceneDuplicationMode=true', () => {
    const ini = '[General]\nFirstRun=false\nSceneDuplicationMode=true\n';
    assert.equal(parseSceneDuplication(ini), 'true');
  });

  it('returns false when SceneDuplicationMode=false', () => {
    const ini = '[General]\nSceneDuplicationMode=false\n';
    assert.equal(parseSceneDuplication(ini), 'false');
  });

  it('returns unknown when the key is absent', () => {
    const ini = '[General]\nFirstRun=false\n';
    assert.equal(parseSceneDuplication(ini), 'unknown');
  });

  it('returns unknown for garbage or empty input', () => {
    assert.equal(parseSceneDuplication(''), 'unknown');
    assert.equal(parseSceneDuplication('not an ini file at all\n\x00\xff'), 'unknown');
    assert.equal(parseSceneDuplication('SceneDuplicationMode=maybe\n'), 'unknown');
  });

  it('finds the key inside a [BasicWindow] section among other keys', () => {
    const ini = [
      '[General]',
      'FirstRun=false',
      '',
      '[BasicWindow]',
      'PreviewProgramMode=true',
      'SceneDuplicationMode=true',
      'SnappingEnabled=true',
      '',
    ].join('\r\n');
    assert.equal(parseSceneDuplication(ini), 'true');
  });
});

describe('readSceneDuplication', () => {
  it('reads user.ini under the injected home and returns the parsed value', async () => {
    const calls = [];
    const readFile = async (file, enc) => {
      calls.push({ file, enc });
      return '[BasicWindow]\nSceneDuplicationMode=true\n';
    };
    const result = await readSceneDuplication({ home: '/Users/test', readFile });
    assert.equal(result, 'true');
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].file,
      path.join('/Users/test', 'Library', 'Application Support', 'obs-studio', 'user.ini'),
    );
    assert.equal(calls[0].enc, 'utf8');
  });

  it('returns unknown when readFile throws', async () => {
    const readFile = async () => {
      throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    };
    assert.equal(await readSceneDuplication({ home: '/Users/test', readFile }), 'unknown');
  });
});
