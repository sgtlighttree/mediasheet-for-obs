const fs = require('fs');
const os = require('os');
const path = require('path');

const SCENE_DUPLICATION_RE = /^\s*SceneDuplicationMode\s*=\s*(true|false)\s*$/m;

function parseSceneDuplication(iniText) {
  const match = SCENE_DUPLICATION_RE.exec(String(iniText ?? ''));
  return match ? match[1] : 'unknown';
}

async function readSceneDuplication({ home = os.homedir(), readFile = fs.promises.readFile } = {}) {
  try {
    const file = path.join(home, 'Library', 'Application Support', 'obs-studio', 'user.ini');
    const text = await readFile(file, 'utf8');
    return parseSceneDuplication(text);
  } catch {
    return 'unknown';
  }
}

module.exports = { parseSceneDuplication, readSceneDuplication };
