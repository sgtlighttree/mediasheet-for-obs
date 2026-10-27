const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

// Syntax checks cannot see a function that an edit deleted (cueClip once went missing and the dock never connected).
describe('public/index.html', () => {
  it('inline script parses', () => {
    assert.doesNotThrow(() => new Function(script));
  });

  it('declares every function the code calls by bare name', () => {
    const declared = new Set([...script.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
    for (const name of ['cueClip', 'primeFirstFrame', 'restartLive', 'normalizeScene', 'evaluateIdle', 'setManaged', 'findLive', 'fadeUp', 'prepare', 'fadeOut', 'restartOnTake']) {
      assert.ok(declared.has(name), `function ${name} is declared`);
    }
  });

  it('every bare call to a once-lost cue helper has a declaration', () => {
    for (const name of ['cueClip', 'primeFirstFrame', 'restartLive']) {
      const called = new RegExp(`(?<![.\\w])${name}\\(`).test(script);
      if (called) assert.match(script, new RegExp(`function\\s+${name}\\b`), `${name} is called, so it must be declared`);
    }
  });
});
